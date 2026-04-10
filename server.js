// Load .env variables first
require('dotenv').config(); 

// Set up the Express server
const express = require('express');

// Connect to the database using the connection function defined in config/db.js
const { connectDB, disconnectDB } = require('./config/db');

// Import routes and middleware
const watchlistRoutes = require("./routes/watchlistRoutes");
const errorHandler = require("./middleware/errorHandler");

// Create an Express application instance
const app = express();

// Use middleware to parse JSON bodies from incoming requests. (so req.body works)
app.use(express.json());

// Use middleware to parse URL-encoded bodies (for form submissions - is this needed?).
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Simple root route so visiting http://localhost:3000/ shows a friendly
// confirmation message instead of Express's default "Cannot GET /" response.
app.get("/", (req, res) => {
  res.send("API is running");
});
 
// Mount watchlist routes under /api/watchlist
app.use("/api/watchlist", watchlistRoutes);
 
// Central error handler (must be registered LAST)
app.use(errorHandler);

let activeServer = null;

// Start the server programmatically so tests or scripts can reuse the same app
// instance without forcing a second copy of the server to boot automatically.
async function startServer() {
  // If the server is already running, return the same listener.
  // This makes the helper predictable for tests that may accidentally call
  // startServer() more than once.
  if (activeServer && activeServer.listening) {
    return activeServer;
  }

  const PORT = process.env.PORT || 3000;
  await connectDB();

  // app.listen() uses a callback-based API, so we wrap it in a Promise
  // to make startup easy to `await` from tests and harness scripts.
  activeServer = await new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      resolve(server);
    });

    server.on("error", reject);
  });

  return activeServer;
}

async function stopServer() {
  // We copy the current listener into a local variable first so this function
  // can safely run even if cleanup is triggered more than once.
  const serverToClose = activeServer;
  activeServer = null;

  // Closing the HTTP server stops Express from accepting new requests.
  // If no server is running, we simply skip this step.
  if (serverToClose) {
    await new Promise((resolve, reject) => {
      serverToClose.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  // The HTTP listener is only one open handle.
  // Mongoose also keeps a database connection open in the background,
  // and that open connection can make a test harness appear to "hang"
  // even after the HTTP route already returned the expected response.
  await disconnectDB();
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { app, startServer, stopServer };
