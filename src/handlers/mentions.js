// src/handlers/mentions.js

const { AGENTS } = require("../config/agents");
const { CHANNEL_AGENT_MAP } = require("../config/channels");
const { askClaude } = require("../services/claude");
const { askGemini, isGeminiAvailable } = require("../services/gemini");
const { askConsensus } = require("../services/consensus");
const { logEvent, getConversation, appendMessage } = require("../services/memory");
const { processFiles } = require("../services/files");
const { handleAgentRouting } = require("./routing");

function cleanText(text) {
  return text.replace(/<@.*?>/g, "").trim();
}

// Check if messages contain multimodal content (images)
function hasMultimodalContent(messages) {
  return messages.some((msg) => Array.isArray(msg.content));
}

// Route to appropriate provider based on agent config
// For file/image requests, bypass consensus and use Gemini directly
async function getAIResponse(agent, messages, options = {}) {
  const { hasFiles = false } = options;
  const provider = agent.provider || "claude";

  // If there are files (images/PDFs), use Gemini directly - it handles multimodal better
  // and avoids the complexity of consensus synthesis with file content
  if (hasFiles || hasMultimodalContent(messages)) {
    console.log(`[${agent.name}] Files detected - routing directly to Gemini`);
    if (isGeminiAvailable()) {
      return askGemini(agent.systemPrompt, messages);
    }
    console.log(`[${agent.name}] Gemini unavailable, falling back to Claude`);
    return askClaude(agent.systemPrompt, messages);
  }

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

    // Debug: Log event structure
    console.log("[DEBUG] app_mention event.files:", event.files);
    console.log("[DEBUG] event keys:", Object.keys(event));

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

    // Process any attached files (images, PDFs, etc.)
    const botToken = process.env.SLACK_BOT_TOKEN;

    // Files might be in event.files OR we need to fetch the message
    let files = event.files;

    // If no files in event, try fetching the full message
    if (!files || files.length === 0) {
      try {
        console.log("[DEBUG] No files in event, checking message...");
        const result = await client.conversations.history({
          channel: event.channel,
          latest: event.ts,
          inclusive: true,
          limit: 1,
        });
        if (result.messages && result.messages[0]) {
          const msg = result.messages[0];
          console.log("[DEBUG] Message from history:", JSON.stringify(msg, null, 2));
          if (msg.files) {
            files = msg.files;
            console.log("[DEBUG] Found files in message:", files.length);
          }
        }
      } catch (e) {
        console.log("[DEBUG] Could not fetch message:", e.message);
      }
    }

    console.log("[DEBUG] Final files array:", files);
    const fileData = await processFiles(files, botToken);
    console.log("[DEBUG] processFiles result:", JSON.stringify(fileData, null, 2));

    // Build text content (include extracted file text)
    let fullText = text;
    if (fileData && fileData.texts.length > 0) {
      fullText = text + "\n\n" + fileData.texts.join("\n\n");
      console.log(`[DEBUG] fullText with file content (${fullText.length} chars):`);
      console.log(`[DEBUG] First 1000 chars: ${fullText.substring(0, 1000)}`);
    }

    // Log user message to conversation history
    await appendMessage(channelName, "user", fullText, null);
    console.log(`[${agentKey}] #${channelName}: ${text}${files && files.length > 0 ? ` (+${files.length} files)` : ""}`);

    // Inter-agent routing - ALL agents can route to each other
    // Patterns: "assign X: task", "@X: task", "route to X: task", "handoff to X: task"
    const routed = await handleAgentRouting(text, agentKey, client, say);
    if (routed) return;

    // Show thinking indicator
    const thinkingMsg = await say(`_${agent.name} is thinking..._`);

    // Fetch conversation history and build messages array
    const history = await getConversation(channelName);
    console.log(`[DEBUG] Conversation history: ${history.length} messages`);

    const messages = history.slice(-20).map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    console.log(`[DEBUG] Messages being sent to AI: ${messages.length}`);

    // Build current message content (may include images for vision)
    let currentContent;
    if (fileData && fileData.images.length > 0) {
      // Multi-modal content with images for Claude vision
      currentContent = [
        { type: "text", text: fullText || "Please analyze these images:" },
        ...fileData.images,
      ];
    } else {
      currentContent = fullText;
    }

    // Make sure the current message is included
    if (messages.length === 0 || messages[messages.length - 1].content !== fullText) {
      messages.push({ role: "user", content: currentContent });
    }

    // Get AI response with full conversation context
    // Pass hasFiles flag to route file requests directly to Gemini
    const hasFiles = fileData && (fileData.images.length > 0 || fileData.texts.length > 0);
    const result = await getAIResponse(agent, messages, { hasFiles });

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
