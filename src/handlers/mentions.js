// src/handlers/mentions.js

const { AGENTS } = require("../config/agents");
const { CHANNEL_AGENT_MAP } = require("../config/channels");
const { askClaude } = require("../services/claude");
const { askGemini, isGeminiAvailable } = require("../services/gemini");
const { logEvent } = require("../services/memory");
const { handleCOSRouting } = require("./routing");

function cleanText(text) {
  return text.replace(/<@.*?>/g, "").trim();
}

// Default to Claude, but can switch per-agent or per-request
async function getAIResponse(agent, userText, provider = "claude") {
  if (provider === "gemini" && isGeminiAvailable()) {
    return askGemini(agent.systemPrompt, userText);
  }
  return askClaude(agent.systemPrompt, userText);
}

function registerMentionHandler(app) {
  app.event("app_mention", async ({ event, say, client }) => {
    let channelName = "unknown";

    try {
      const channelInfo = await client.conversations.info({
        channel: event.channel,
      });
      channelName = channelInfo.channel.name;
    } catch (error) {
      console.error("Failed to get channel info:", error.message);
    }

    const agentKey = CHANNEL_AGENT_MAP[channelName] || "cos";
    const agent = AGENTS[agentKey];
    const text = cleanText(event.text);

    logEvent(channelName, agentKey, text);
    console.log(`[${agentKey}] #${channelName}: ${text}`);

    // COS routing for "assign X: task" commands
    if (agentKey === "cos") {
      const routed = await handleCOSRouting(text, client, say);
      if (routed) return;
    }

    // Get AI response
    const result = await getAIResponse(agent, text);

    if (result.success) {
      await say(`*${agent.name}*\n_${agent.role}_\n\n${result.text}`);
    } else {
      await say(`*${agent.name}* encountered an error: ${result.error}`);
    }
  });
}

module.exports = { registerMentionHandler };
