const HelpRequest = require("../db/models/HelpRequest");

const askSupervisor = async function (call) {
  try {
    const helpRequest = new HelpRequest({
      question: call.text,
      callSid: call.callSid,
    });

    await helpRequest.save();
    console.log(
      `Created help request: ${helpRequest._id} for question: ${call.text}`
    );

    // Simulate texting the supervisor
    console.log(
      `[SUPERVISOR NOTIFICATION] Hey, I need help answering: ${call.text}`
    );

    // Poll for answer
    const maxAttempts = 12;
    let attempt = 0;
    let answer = null;
    const waitTime = 5000;

    while (attempt < maxAttempts) {
      // Wait for the polling interval
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Check if the help request has been answered
      const updatedRequest = await HelpRequest.findById(helpRequest._id);

      if (!updatedRequest) {
        throw new Error("Help request not found");
      }

      if (updatedRequest && updatedRequest.status === "resolved") {
        answer = updatedRequest.supervisorResponse;
        console.log(`Help request answered: ${answer}`);
        break;
      }

      console.log(`Polling for answer, attempt ${attempt + 1}/${maxAttempts}`);
      attempt++;
    }

    await HelpRequest.findByIdAndUpdate(helpRequest._id, {
      $set: { status: "unresolved" },
    });

    if (answer) {
      return `The supervisor says: ${answer}`;
    } else {
      return "I'm sorry, but I couldn't get an answer from my supervisor at this time. Is there anything else I can help you with?";
    }
  } catch (error) {
    console.error("Error handling help request:", error);
    return "I'm sorry, but there was an error contacting my supervisor. Is there anything else I can help you with?";
  }
};

module.exports = askSupervisor;
