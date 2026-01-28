// src/index.js

require("dotenv").config();

const { App } = require("@slack/bolt");
const { validateEnv } = require("./utils/env");
const { initClaude, askClaude } = require("./services/claude");
const { initGemini } = require("./services/gemini");
const { initSupabase } = require("./services/supabase");
const { getSummaryData, clearAll } = require("./services/memory");
const { registerMentionHandler } = require("./handlers/mentions");

// Validate environment and get config
const env = validateEnv();

// Initialize AI clients
initClaude(env.anthropic.apiKey);
initGemini(env.gemini.apiKey);

// Initialize Supabase (optional - falls back to in-memory)
initSupabase(env.supabase.url, env.supabase.serviceKey);

// Initialize Slack app
const app = new App({
  token: env.slack.botToken,
  signingSecret: env.slack.signingSecret,
  socketMode: true,
  appToken: env.slack.appToken,
});

// Register handlers
registerMentionHandler(app);

// Daily COS summary (every 24 hours)
const DAILY_MS = 1000 * 60 * 60 * 24;

setInterval(async () => {
  const { events, tasks } = await getSummaryData();

  if (events.length === 0 && tasks.length === 0) {
    return; // Nothing to summarize
  }

  const summaryPrompt = `Summarize the last 24 hours.

Events:
${events.map((e) => `- ${e.channel}: ${e.text}`).join("\n") || "None"}

Tasks:
${tasks.map((t) => `- ${t.assigned_to}: ${t.description} [${t.status}]`).join("\n") || "None"}`;

  const result = await askClaude(
    "You are the Chief of Staff. Provide a concise daily summary.",
    summaryPrompt
  );

  if (result.success) {
    try {
      await app.client.chat.postMessage({
        channel: "#cos-command",
        text: `*Daily COS Summary*\n\n${result.text}`,
      });
    } catch (error) {
      console.error("Failed to post daily summary:", error.message);
    }
  }

  clearAll();
}, DAILY_MS);

// Start
(async () => {
  await app.start();
  console.log("Umbrella agents online");
})();
