require("colors");
const EventEmitter = require("events");
const OpenAI = require("openai");
const tools = require("../functions/function-manifest");
const KnowledgeBase = require("../db/models/KnowledgeBase");

// Static knowledge base that will be loaded once
let globalKnowledgeBase = [];

// Load knowledge base once at server startup
async function loadGlobalKnowledgeBase() {
  try {
    globalKnowledgeBase = await KnowledgeBase.find({}).lean();
    console.log(
      `Loaded ${globalKnowledgeBase.length} items from knowledge base`
    );
  } catch (error) {
    console.error("Error loading knowledge base:", error);
  }
}

// Import all functions included in function manifest
// Note: the function name and file name must be the same
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}.js`);
});

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    });
    (this.userContext = [
      {
        role: "system",
        content: `You are an outbound sales representative selling Apple AirPods with a youthful, friendly personality. Your goal is to assist customers in finding the right AirPods model while keeping conversations engaging but concise. Follow these guidelines:\n\n1. CONVERSATION FLOW: When a customer confirms interest in AirPods, ask about their preferences (in-ear vs over-ear, noise cancellation needs) before proceeding to specific models.\n\n2. KNOWLEDGE BOUNDARIES: The product information should only be inferred from this and this context only, don't make assumptions. Use the askSupervisor tool if and only if the product information is not in the context. Do NOT use it for basic conversation flow or preference questions.\n\n3. TOOLS USAGE: Use tools decisively only when needed:\n   - checkInventory: When discussing specific models\n   - checkPrice: When a customer asks about pricing\n   - askSupervisor: ONLY for specific product details you don't know\n   - placeOrder: After confirming model and quantity. Make sure that you don't call a function again and again.\n\n4. SALES APPROACH: Guide customers through: headphone type → specific model → quantity → order placement.\n\nRemember, your first response after customer confirms interest should ALWAYS be to ask about their preferences between in-ear and over-ear models. For additional context, here are the questions and answers from the knowledge base: ${globalKnowledgeBase
          .map(
            (item, index) =>
              `${index}: Question: ${item.question} | Answer: ${item.answer}`
          )
          .join("\n")}`,
      },
      {
        role: "assistant",
        content:
          "Hello! I understand you're looking for a pair of AirPods, is that correct?",
      },
    ]),
      (this.partialResponseIndex = 0);
  }

  // Add the callSid to the chat context in case
  // ChatGPT decides to transfer the call.
  setCallSid(callSid) {
    this.userContext.push({ role: "system", content: `callSid: ${callSid}` });
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log(
        "Warning: Double function arguments returned by OpenAI:",
        args
      );
      // Seeing an error where sometimes we have two sets of args
      if (args.indexOf("{") != args.lastIndexOf("{")) {
        return JSON.parse(
          args.substring(args.indexOf(""), args.indexOf("}") + 1)
        );
      }
    }
  }

  updateUserContext(name, role, text) {
    if (name !== "user") {
      this.userContext.push({ role: role, name: name, content: text });
    } else {
      this.userContext.push({ role: role, content: text });
    }
  }

  async completion(text, interactionCount, role = "user", name = "user") {
    this.updateUserContext(name, role, text);

    // Step 1: Send user transcription to Chat GPT
    const stream = await this.openai.chat.completions.create({
      model: "qwen-qwq-32b",
      messages: this.userContext,
      tools: tools,
      stream: true,
    });

    let completeResponse = "";
    let partialResponse = "";
    let functionName = "";
    let functionArgs = "";
    let finishReason = "";

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || "";
      if (name != "") {
        functionName = name;
      }
      let args = deltas.tool_calls[0]?.function?.arguments || "";
      if (args != "") {
        // args are streamed as JSON string so we need to concatenate all chunks
        functionArgs += args;
      }
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || "";
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      // Step 2: check if GPT wanted to call a function
      if (deltas.tool_calls) {
        // Step 3: Collect the tokens containing function data
        collectToolInformation(deltas);
      }

      // need to call function on behalf of Chat GPT with the arguments it parsed from the conversation
      if (finishReason === "tool_calls" && role !== "function") {
        // parse JSON string of args into JSON object

        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);

        // Say a pre-configured message from the function manifest
        // before running the function.
        const toolData = tools.find(
          (tool) => tool.function.name === functionName
        );
        const say = toolData.function.say;

        this.emit(
          "gptreply",
          {
            partialResponseIndex: null,
            partialResponse: say,
          },
          interactionCount
        );

        let functionResponse = await functionToCall(validatedArgs);

        // call the completion function again but pass in the function response to have OpenAI generate a new assistant response
        await this.completion(
          functionResponse,
          interactionCount,
          "function",
          functionName
        );
      } else {
        // We use completeResponse for userContext
        completeResponse += content;
        // We use partialResponse to provide a chunk for TTS
        partialResponse += content;
        // Emit last partial response and add complete response to userContext
        if (content.trim().slice(-1) === "•" || finishReason === "stop") {
          const gptReply = {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse,
          };

          this.emit("gptreply", gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = "";
        }
      }
    }
    this.userContext.push({ role: "assistant", content: completeResponse });
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService, loadGlobalKnowledgeBase, globalKnowledgeBase };
