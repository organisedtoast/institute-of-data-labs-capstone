// Load environment variables before anything reads process.env.
require('dotenv').config(); 
const express = require('express');
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require('./config/db');
// The stock lookup routes are the read-only live market-data boundary.
// They do not create MongoDB records; they only validate input and proxy the
// normalized ROIC lookup responses used by search and preview flows.
const stockLookupRoutes = require("./routes/stockLookupRoutes");
const watchlistRoutes = require("./routes/watchlistRoutes");
const investmentCategoryCardsRoutes = require("./routes/investmentCategoryCardsRoutes");
const errorHandler = require("./middleware/errorHandler");
const { ensureDefaultLenses } = require("./services/lensService");
const { migrateInvestmentCategoryNames } = require("./services/investmentCategoryMigrationService");

const app = express();

// JSON + URL-encoded body parsing for API payloads and simple form posts.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Simple root route so visiting http://localhost:3000/ shows a friendly
// confirmation message instead of Express's default "Cannot GET /" response.
app.get("/", (req, res) => {
  res.send("API is running");
});

// Mount live stock lookup routes directly under /api.
// Keeping them separate from watchlist routes makes the "lookup vs persist"
// boundary much easier to understand for a new developer.
app.use("/api", stockLookupRoutes);
 
app.use("/api/watchlist", watchlistRoutes);

app.use("/api/homepage/investment-category-cards", investmentCategoryCardsRoutes);
 
// Register the error handler last so route errors reach it.
app.use(errorHandler);

let activeServer = null;
let databaseStartupError = null;

// Tests and scripts reuse this helper so the app can boot once per process.
async function startServer() {
  // If the server is already running, return the same listener.
  // This makes the helper predictable for tests that may accidentally call
  // startServer() more than once.
  if (activeServer && activeServer.listening) {
    return activeServer;
  }

  const PORT = process.env.PORT || 3000;
  databaseStartupError = null;

  try {
    await connectDB();
  } catch (error) {
    databaseStartupError = error;
    console.error(`Server startup warning: database unavailable (${error.message})`);
  }

  // Some fast route tests intentionally stub the DB connection so they can
  // focus on HTTP behavior without spinning up MongoDB. We only seed default
  // lenses after Mongoose reports a real connected state.
  if (mongoose.connection.readyState === 1) {
    try {
      await migrateInvestmentCategoryNames();
      await ensureDefaultLenses();
    } catch (error) {
      console.error(`Server startup warning: unable to prepare investment categories (${error.message})`);
    }
  }

  // app.listen() is callback-based, so we wrap it for await-friendly startup.
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
  // Copy the current listener first so repeated cleanup stays safe.
  const serverToClose = activeServer;
  activeServer = null;
  databaseStartupError = null;

  if (serverToClose) {
    await new Promise((resolve, reject) => {
      serverToClose.close((error) => {
        if (error) {
          if (error.code === "ERR_SERVER_NOT_RUNNING") {
            resolve();
            return;
          }
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

module.exports = { app, startServer, stopServer, getDatabaseStartupError: () => databaseStartupError };
