const HelpRequest = require("../db/models/HelpRequest");
const KnowledgeBase = require("../db/models/KnowledgeBase");
const { globalKnowledgeBase } = require("../services/gpt-service");

const getHelpRequests = async (status) => {
  const helpRequests = await HelpRequest.find({
    status: status,
  }).sort({ createdAt: -1 });

  return helpRequests;
};

const respondToHelpRequest = async (requestId, response) => {
  const updatedRequest = await HelpRequest.findByIdAndUpdate(
    requestId,
    {
      supervisorResponse: response,
      status: "resolved",
      resolvedAt: new Date(),
    },
    { new: true }
  );

  if (!updatedRequest) {
    throw new Error("Help request not found");
  }

  await KnowledgeBase.create({
    question: updatedRequest.question,
    answer: updatedRequest.supervisorResponse,
  });

  globalKnowledgeBase.push({
    question: updatedRequest.question,
    answer: updatedRequest.supervisorResponse,
  });

  return updatedRequest;
};

const deleteHelpRequest = async (requestId) => {
  await HelpRequest.findByIdAndDelete(requestId);

  return true;
};

module.exports = {
  respondToHelpRequest,
  getHelpRequests,
  deleteHelpRequest,
};
