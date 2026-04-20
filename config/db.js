// This module handles the connection between our app and MongoDB.
// We use Mongoose, which is a library that provides a structured
// way to interact with MongoDB from JavaScript.

const mongoose = require("mongoose");

// We keep track of an in-flight connection attempt so repeated calls to
// connectDB() all share the same promise instead of opening multiple
// connections at the same time.
let connectionPromise = null;

async function connectDB() {
  try {
    // readyState is Mongoose's built-in connection status flag.
    // 1 means "already connected", so we can safely reuse the existing
    // connection instead of trying to connect again.
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    // 2 means "currently connecting". In that case we wait for the
    // original connection attempt to finish instead of starting another one.
    if (mongoose.connection.readyState === 2 && connectionPromise) {
      return connectionPromise;
    }

    // mongoose.connect() opens the database connection.
    // The MONGO_URI comes from our .env file so sensitive connection
    // details are not hard-coded in source code.
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

// Export both lifecycle helpers so the server can connect on startup and
// disconnect on shutdown.
module.exports = { connectDB, disconnectDB };
