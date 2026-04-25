// Central Express error handler.
// Keep request-shaped errors friendly while still surfacing unexpected failures
// with enough detail for local debugging.

function errorHandler(err, req, res, _next) {
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

  // Some services intentionally throw friendly request errors with an explicit
  // status code, such as "unknown investment category". Preserve that status
  // instead of collapsing everything into a generic 500 response.
  if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600) {
    return res.status(err.statusCode).json({
      error: err.message || "Request failed.",
      details: err.details || err.message,
    });
  }
 
  // Everything else
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
}
 
module.exports = errorHandler;
