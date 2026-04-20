const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

process.env.ROIC_API_KEY = process.env.ROIC_API_KEY || "test-roic-key";

const roicService = require("../services/roicService");

test("annual ROIC fetches use the default uncapped limit when years is not provided", async () => {
  const originalGet = axios.get;
  const calls = [];

  axios.get = async (url, config) => {
    calls.push({ url, config });
    return { data: [] };
  };

  try {
    await roicService.fetchAnnualPerShare("AAPL");
  } finally {
    axios.get = originalGet;
  }

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/fundamental\/per-share\/AAPL$/);
  assert.equal(calls[0].config.params.period, "annual");
  assert.equal(calls[0].config.params.order, "DESC");
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
    await roicService.fetchAnnualPerShare("AAPL", { years: 5 });
  } finally {
    axios.get = originalGet;
  }

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/fundamental\/per-share\/AAPL$/);
  assert.equal(calls[0].config.params.limit, 5);
});
