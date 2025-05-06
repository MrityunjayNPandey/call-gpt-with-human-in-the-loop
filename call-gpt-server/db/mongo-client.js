const { default: mongoose } = require("mongoose");
require("dotenv").config();

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/call-gpt";
let connection;

async function connectToDatabase() {
  try {
    connection = await mongoose.connect(uri);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

process.on("SIGINT", async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.close(); // Use mongoose.connection.close()
      console.log("MongoDB connection closed successfully");
      process.exit(0);
    } catch (error) {
      console.error("Error closing MongoDB connection:", error);
      process.exit(1);
    }
  } else {
    process.exit(0); // Exit if not connected
  }
});

module.exports = { connectToDatabase };
