const fs = require("node:fs");
const path = require("node:path");

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readJsonFile(filePath, fallbackValue = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getPayloadBytes(rawText = "") {
  return Buffer.byteLength(String(rawText), "utf8");
}

module.exports = {
  ensureDirectory,
  getPayloadBytes,
  readJsonFile,
  writeJsonFile,
};
