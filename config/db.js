const mongoose = require("mongoose");

// We keep track of an in-flight connection attempt so repeated calls to
// connectDB() all share the same promise instead of opening multiple
// connections at the same time.
let connectionPromise = null;

async function connectDB() {
  try {
    // Reuse an existing live connection instead of reconnecting.
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    // Reuse the in-flight promise if another caller already started connecting.
    if (mongoose.connection.readyState === 2 && connectionPromise) {
      return connectionPromise;
    }

    connectionPromise = mongoose.connect(process.env.MONGO_URI);

    const conn = await connectionPromise;
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    // If the connection fails, we clear the saved promise so a future retry
    // can try again instead of being stuck with the failed attempt.
    connectionPromise = null;

    // We rethrow the error instead of calling process.exit() here.
    // That gives the caller more control, which is especially important for
    // tests and small local harness scripts that want to handle failures cleanly.
    console.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }
}

async function disconnectDB() {
  // A MongoDB connection is a live network handle.
  // Even after an HTTP request has finished, Node.js may keep running while
  // that database handle is still open.
  // That is why route harnesses and tests need explicit cleanup.
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  connectionPromise = null;
  console.log("MongoDB disconnected");
}

module.exports = { connectDB, disconnectDB };
