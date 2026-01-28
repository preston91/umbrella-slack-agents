// src/handlers/mentions.js

const { AGENTS } = require("../config/agents");
const { CHANNEL_AGENT_MAP } = require("../config/channels");
const { askClaude } = require("../services/claude");
const { askGemini, isGeminiAvailable } = require("../services/gemini");
const { askConsensus } = require("../services/consensus");
const { logEvent } = require("../services/memory");
const { handleCOSRouting } = require("./routing");

function cleanText(text) {
  return text.replace(/<@.*?>/g, "").trim();
}

// Route to appropriate provider based on agent config
async function getAIResponse(agent, userText) {
  const provider = agent.provider || "claude";

  switch (provider) {
    case "consensus":
      return askConsensus(agent.systemPrompt, userText);
    case "gemini":
      if (isGeminiAvailable()) {
        return askGemini(agent.systemPrompt, userText);
      }
      console.log(`[${agent.name}] Gemini unavailable, falling back to Claude`);
      return askClaude(agent.systemPrompt, userText);
    case "claude":
    default:
      return askClaude(agent.systemPrompt, userText);
  }
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
      const consensusTag = result.consensus ? " [consensus]" : "";
      await say(`*${agent.name}*${consensusTag}\n_${agent.role}_\n\n${result.text}`);
    } else {
      await say(`*${agent.name}* encountered an error: ${result.error}`);
    }
  });
}

module.exports = { registerMentionHandler };
