const KnowledgeBase = require("../db/models/KnowledgeBase");
const { globalKnowledgeBase } = require("../services/gpt-service");

const getKnowledgeBases = async (status) => {
  const KnowledgeBases = await KnowledgeBase.find({}).sort({ updatedAt: -1 });

  return KnowledgeBases;
};

const addKnowledgeBase = async (question, answer) => {
  const updatedKnowledgeBase = await KnowledgeBase.create({
    question: question,
    answer: answer,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return updatedKnowledgeBase;
};

const updateKnowledgeBase = async (knowledgeBaseId, question, answer) => {
  const updatedKnowledgeBase = await KnowledgeBase.findByIdAndUpdate(
    knowledgeBaseId,
    {
      question: question,
      answer: answer,
      updatedAt: new Date(),
    },
    { new: true }
  );

  if (!updatedKnowledgeBase) {
    throw new Error("Help request not found");
  }

  return updatedKnowledgeBase;
};

const deleteKnowledgeBase = async (knowledgeBaseId) => {
  await KnowledgeBase.findByIdAndDelete(knowledgeBaseId);

  return true;
};

module.exports = {
  updateKnowledgeBase,
  getKnowledgeBases,
  deleteKnowledgeBase,
  addKnowledgeBase,
};
