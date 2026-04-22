// Purpose of this test file:
// These tests verify that the ROIC service sends the correct request options
// for annual-history endpoints. In particular, they protect the rule that
// omitted `years` should use the shared default uncapped limit, while an
// explicit `years` value should be forwarded upstream as the request `limit`.

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

// The ROIC service refuses to build requests when the API key is missing.
// For this test we are not calling the real API, but we still need a dummy key
// so the service can build its request config normally.
process.env.ROIC_API_KEY = process.env.ROIC_API_KEY || "test-roic-key";

const roicService = require("../services/roicService");

test("annual ROIC fetches use the default uncapped limit when years is not provided", async () => {
  // Save the real axios.get so we can put it back after the test finishes.
  // This is important because other tests may rely on axios behaving normally.
  const originalGet = axios.get;
  const calls = [];

  // Replace axios.get with a tiny fake function.
  // Instead of making a real network request, we capture the URL and config
  // that the service tried to send upstream.
  axios.get = async (url, config) => {
    calls.push({ url, config });
    return { data: [] };
  };

  try {
    // Call the real service code without passing `years`.
    // That should make the service fall back to its default annual-history limit.
    await roicService.fetchAnnualPerShare("AAPL");
  } finally {
    // Always restore the original function, even if an assertion later fails.
    axios.get = originalGet;
  }

  // We expect exactly one upstream request to be attempted.
  assert.equal(calls.length, 1);

  // The service should hit the annual per-share endpoint for the ticker we asked for.
  assert.match(calls[0].url, /\/fundamental\/per-share\/AAPL$/);

  // These parameters define the standard annual ROIC fetch contract used by the app.
  assert.equal(calls[0].config.params.period, "annual");
  assert.equal(calls[0].config.params.order, "DESC");

  // Because we did not pass `years`, the service should use its shared default
  // "uncapped" limit rather than leaving limit undefined.
  assert.equal(calls[0].config.params.limit, roicService.DEFAULT_UNCAPPED_ANNUAL_LIMIT);
});

test("annual ROIC fetches forward explicit year caps as the upstream limit", async () => {
  const originalGet = axios.get;
  const calls = [];

  axios.get = async (url, config) => {
    calls.push({ url, config });
    return { data: [] };
  };

  try {
    // This time we pass an explicit year cap.
    // The service should forward that exact number to ROIC as the `limit` value.
    await roicService.fetchAnnualPerShare("AAPL", { years: 5 });
  } finally {
    axios.get = originalGet;
  }

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/fundamental\/per-share\/AAPL$/);

  // The key behavior under test: explicit `years` should override the default limit.
  assert.equal(calls[0].config.params.limit, 5);
});
