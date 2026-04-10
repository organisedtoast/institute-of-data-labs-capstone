// This middleware file is a central error handler. 

// It catches errors thrown in routes and sends appropriate responses to the client.

// It handles:
// - Mongoose validation errors (400 Bad Request)
// - Duplicate key errors (409 Conflict)
// - Any other unexpected errors (500 Internal Server Error)

// To use this middleware, simply add it to your Express app after all your routes:
// const errorHandler = require('./middleware/errorHandler');
// app.use(errorHandler);

function errorHandler(err, req, res, next) {
  console.error("Error:", err.message);
 
  // Mongoose validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: err.message,
    });
  }
 
  // Duplicate key (e.g. importing the same ticker twice)
  if (err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate entry",
      details: "A document with this key already exists.",
    });
  }
 
  // Everything else
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
}
 
module.exports = errorHandler;