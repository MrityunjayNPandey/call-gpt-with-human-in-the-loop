const mongoose = require("mongoose");

const HelpRequestSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  callSid: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "resolved", "unresolved"],
    default: "pending",
  },
  supervisorResponse: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  resolvedAt: {
    type: Date,
  },
});

module.exports = mongoose.model("HelpRequest", HelpRequestSchema);
