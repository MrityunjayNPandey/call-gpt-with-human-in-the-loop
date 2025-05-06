require("dotenv").config();
require("colors");

const express = require("express");
const ExpressWs = require("express-ws");
const cors = require("cors"); // Import the cors middleware

const {
  GptService,
  loadGlobalKnowledgeBase,
} = require("./services/gpt-service");
const { StreamService } = require("./services/stream-service");
const { TranscriptionService } = require("./services/transcription-service");
const { TextToSpeechService } = require("./services/tts-service");
const { recordingService } = require("./services/recording-service");
const { connectToDatabase } = require("./db/mongo-client");
const {
  getHelpRequests,
  respondToHelpRequest,
  deleteHelpRequest,
} = require("./functions/helpRequests");
const {
  getKnowledgeBases,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  addKnowledgeBase,
} = require("./functions/knowledgeBase");

const VoiceResponse = require("twilio").twiml.VoiceResponse;

const app = express();
ExpressWs(app);

// Use CORS middleware
// This will allow all origins. For production, you might want to configure it
// to allow only specific origins, e.g., cors({ origin: 'http://your-frontend-domain.com' })
app.use(cors());

// Ensure Express can parse JSON request bodies, if not already done explicitly
// (though app.post for /respondToHelpRequest implies it might be handled,
// it's good practice to have it explicitly if you're using req.body)
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // If you also handle form data

const PORT = process.env.PORT || 3000;

app.get("/helpRequests", async (req, res) => {
  try {
    const status = req.query.status; // 'pending', 'resolved', or 'unresolved'

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const helpRequests = await getHelpRequests(status);

    res.json(helpRequests);
  } catch (error) {
    console.error("Error fetching help requests:", error);
    res.status(500).json({ error: "Failed to fetch help requests" });
  }
});

app.post("/respondToHelpRequest", async (req, res) => {
  try {
    const { requestId, response } = req.body;

    if (!requestId || !response) {
      return res
        .status(400)
        .json({ error: "Request ID and response are required" });
    }

    const updatedRequest = await respondToHelpRequest(requestId, response);

    res.json({
      success: true,
      message: "Help request updated successfully",
      updatedRequest,
    });
  } catch (error) {
    console.error("Error responding to help request:", error);
    res.status(500).json({ error: "Failed to respond to help request" });
  }
});

app.delete("/helpRequest", async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: "Request ID is required" });
    }

    await deleteHelpRequest(requestId);

    res.json({});
  } catch (error) {
    console.error("Error fetching help requests:", error);
    res.status(500).json({ error: "Failed to fetch help requests" });
  }
});

app.get("/knowledgeBases", async (req, res) => {
  try {
    const knowledgeBases = await getKnowledgeBases();

    res.json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching Knowledge Bases:", error);
    res.status(500).json({ error: "Failed to fetch Knowledge Bases" });
  }
});

app.post("/addKnowledgeBase", async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "input is invalid" });
    }

    const knowledgeBases = await addKnowledgeBase(question, answer);

    res.json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching Knowledge Bases:", error);
    res.status(500).json({ error: "Failed to fetch Knowledge Bases" });
  }
});

app.post("/updateKnowledgeBase", async (req, res) => {
  try {
    const { knowledgeBaseId, question, answer } = req.body;

    if (!knowledgeBaseId || !question || !answer) {
      return res.status(400).json({ error: "input is invalid" });
    }

    const knowledgeBases = await updateKnowledgeBase(
      knowledgeBaseId,
      question,
      answer
    );

    res.json(knowledgeBases);
  } catch (error) {
    console.error("Error fetching Knowledge Bases:", error);
    res.status(500).json({ error: "Failed to fetch Knowledge Bases" });
  }
});

app.delete("/deleteKnowledgeBase", async (req, res) => {
  try {
    const { knowledgeBaseId } = req.body;
    if (!knowledgeBaseId) {
      return res.status(400).json({ error: "knowledgeBaseId is required" });
    }

    await deleteKnowledgeBase(knowledgeBaseId);

    res.json({});
  } catch (error) {
    console.error("Error fetching help requests:", error);
    res.status(500).json({ error: "Failed to fetch help requests" });
  }
});

app.post("/incoming", (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });

    res.type("text/xml");
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

app.ws("/connection", (ws) => {
  try {
    ws.on("error", console.error);
    // Filled in from start message
    let streamSid;
    let callSid;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});

    let marks = [];
    let interactionCount = 0;

    // Incoming from MediaStream
    ws.on("message", function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === "start") {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;

        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          console.log(
            `Twilio -> Starting Media Stream for ${streamSid}`.underline.red
          );
          ttsService.generate(
            {
              partialResponseIndex: null,
              partialResponse:
                "Hello! I understand you're looking for a pair of AirPods, is that correct?",
            },
            0
          );
        });
      } else if (msg.event === "media") {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === "mark") {
        const label = msg.mark.name;
        console.log(
          `Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red
        );
        marks = marks.filter((m) => m !== msg.mark.name);
      } else if (msg.event === "stop") {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });

    transcriptionService.on("utterance", async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if (marks.length > 0 && text?.length > 5) {
        console.log("Twilio -> Interruption, Clearing stream".red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: "clear",
          })
        );
      }
    });

    transcriptionService.on("transcription", async (text) => {
      if (!text) {
        return;
      }
      console.log(
        `Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow
      );
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    gptService.on("gptreply", async (gptReply, icount) => {
      console.log(
        `Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green
      );
      ttsService.generate(gptReply, icount);
    });

    ttsService.on("speech", (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);

      streamService.buffer(responseIndex, audio);
    });

    streamService.on("audiosent", (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

connectToDatabase().then(() => {
  app.listen(PORT);
  console.log(`Server running on port ${PORT}`);
  loadGlobalKnowledgeBase();
});
