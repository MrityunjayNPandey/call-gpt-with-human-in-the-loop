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
  availableFunctions[functionName] = require(`../functions/${functionName}`);
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
        content:
          "You are an outbound sales representative selling Apple Airpods. You have a youthful and cheery personality. Keep your responses as brief as possible but make every attempt to keep the caller on the phone without being rude. Don't reply more than once at a time. Don't make assumptions about what values to plug into functions. Your knowledge should be strictly from this and only this chat context only. Ask for clarification if a user request is ambiguous, but once a choice like headphone type (in-ear vs over-ear) or a specific model (like AirPods Pro Max) is clearly stated by the user, accept that information and move on to the next step. Speak out all prices to include the currency. Initially, help them decide between models by asking about preferences like 'in-ear or over-ear' or 'noise canceling'. However, once they express a clear preference for a specific model (e.g., 'AirPods Pro Max') or have answered those initial clarifying questions, your priority is to confirm the quantity and then use the 'placeOrder' tool. You have tools available to check inventory, check prices, place orders, transfer calls, and ask your supervisor for help; use these tools decisively once you have the necessary information. For example, if you have clarified with the user and still you're unsure, you MUST use the 'askSupervisor' tool.",
      },
      ...globalKnowledgeBase.map((item) => ({
        role: "system",
        content: `Question: ${item.question}\nAnswer: ${item.answer}`,
      })),
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
      model: "deepseek-r1-distill-llama-70b",
      messages: this.userContext,
      tools: tools,
      stream: true,
    });

    let completeResponse = "";
    let partialResponse = "";
    let functionName = "";
    let functionArgs = "";
    let finishReason = "";
    let isThinking = false; // flag to track if we're inside a thinking block

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

      // Check for thinking tags
      if (content.includes("<think>")) {
        isThinking = true;
        content = content.replace("<think>", ""); // Remove the tag
      }
      if (content.includes("</think>")) {
        isThinking = false;
        content = content.replace("</think>", ""); // Remove the tag
        continue; // Skip this chunk as it contains the closing tag
      }

      // Skip adding content to partialResponse if we're in thinking mode
      if (isThinking) {
        completeResponse += content; // Still add to complete response for context
        continue; // Skip the rest of the loop
      }

      // Step 2: check if GPT wanted to call a function
      if (deltas.tool_calls) {
        // Step 3: Collect the tokens containing function data
        collectToolInformation(deltas);
      }

      // need to call function on behalf of Chat GPT with the arguments it parsed from the conversation
      if (finishReason === "tool_calls") {
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

        // Step 4: send the info on the function call and function response to GPT
        this.updateUserContext(functionName, "function", functionResponse);

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
        // Only add to partialResponse if not in thinking mode
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
