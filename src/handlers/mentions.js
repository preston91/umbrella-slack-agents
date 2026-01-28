// src/handlers/mentions.js

const { AGENTS } = require("../config/agents");
const { CHANNEL_AGENT_MAP } = require("../config/channels");
const { askClaude } = require("../services/claude");
const { askGemini, isGeminiAvailable } = require("../services/gemini");
const { askConsensus } = require("../services/consensus");
const { logEvent, getConversation, appendMessage } = require("../services/memory");
const { handleCOSRouting } = require("./routing");

function cleanText(text) {
  return text.replace(/<@.*?>/g, "").trim();
}

// Route to appropriate provider based on agent config
async function getAIResponse(agent, messages) {
  const provider = agent.provider || "claude";

  switch (provider) {
    case "consensus":
      return askConsensus(agent.systemPrompt, messages);
    case "gemini":
      if (isGeminiAvailable()) {
        return askGemini(agent.systemPrompt, messages);
      }
      console.log(`[${agent.name}] Gemini unavailable, falling back to Claude`);
      return askClaude(agent.systemPrompt, messages);
    case "claude":
    default:
      return askClaude(agent.systemPrompt, messages);
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

    // Log user message to conversation history
    await appendMessage(channelName, "user", text, null);
    console.log(`[${agentKey}] #${channelName}: ${text}`);

    // COS routing for "assign X: task" commands
    if (agentKey === "cos") {
      const routed = await handleCOSRouting(text, client, say);
      if (routed) return;
    }

    // Show thinking indicator
    const thinkingMsg = await say(`_${agent.name} is thinking..._`);

    // Fetch conversation history and build messages array
    const history = await getConversation(channelName);
    const messages = history.slice(-20).map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // Make sure the current message is included (in case logging was slow)
    if (messages.length === 0 || messages[messages.length - 1].content !== text) {
      messages.push({ role: "user", content: text });
    }

    // Get AI response with full conversation context
    const result = await getAIResponse(agent, messages);

    // Delete thinking message
    try {
      await client.chat.delete({
        channel: event.channel,
        ts: thinkingMsg.ts,
      });
    } catch (e) {
      // Ignore if we can't delete (missing permissions)
    }

    if (result.success) {
      // Log bot response to conversation history
      await appendMessage(channelName, "assistant", result.text, agentKey);

      const consensusTag = result.consensus ? " [consensus]" : "";
      await say(`*${agent.name}*${consensusTag}\n_${agent.role}_\n\n${result.text}`);
    } else {
      await say(`*${agent.name}* encountered an error: ${result.error}`);
    }
  });
}

module.exports = { registerMentionHandler };
