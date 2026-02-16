// src/handlers/mentions.js

const { AGENTS } = require("../config/agents");
const { CHANNEL_AGENT_MAP } = require("../config/channels");
const { askClaude } = require("../services/claude");
const { askGemini, isGeminiAvailable } = require("../services/gemini");
const { askConsensus } = require("../services/consensus");
const { logEvent, getConversation, appendMessage } = require("../services/memory");
const { processFiles } = require("../services/files");
const { handleAgentRouting } = require("./routing");
const { processEmailQuery, isEmailQuery } = require("../services/email-query");

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
  const { hasFiles = false, emailContext = null } = options;
  const provider = agent.provider || "claude";

  // Build system prompt - inject email context if available
  let systemPrompt = agent.systemPrompt;
  if (emailContext && emailContext.context) {
    // Prepend email context to system prompt for this query
    systemPrompt = `${emailContext.context}\n\n---\n\n*USER'S EMAIL QUESTION:*\nThe user is asking about their email. Use the email context above to provide a helpful, specific answer. Reference actual emails, names, dates, and details from the context.\n\n---\n\n${systemPrompt}`;
    console.log(`[${agent.name}] Injected email context (${emailContext.intent})`);
  }

  // If there are files (images/PDFs), use Gemini directly - it handles multimodal better
  // and avoids the complexity of consensus synthesis with file content
  if (hasFiles || hasMultimodalContent(messages)) {
    console.log(`[${agent.name}] Files detected - routing directly to Gemini`);
    // Add image analysis priority to system prompt when files are present
    const imageSystemAddition = `\n\nIMAGE ANALYSIS PRIORITY: When the user shares an image, you must carefully analyze the actual visual content of the image and base your response on what you see. Do NOT rely on conversation history or prior context to describe image content - look at the actual image. If the image shows a document, email, or screenshot, read and describe the actual content shown in the image.`;
    const fileAwarePrompt = systemPrompt + imageSystemAddition;
    if (isGeminiAvailable()) {
      return askGemini(fileAwarePrompt, messages);
    }
    console.log(`[${agent.name}] Gemini unavailable, falling back to Claude`);
    return askClaude(fileAwarePrompt, messages);
  }

  switch (provider) {
    case "consensus":
      return askConsensus(systemPrompt, messages);
    case "gemini":
      if (isGeminiAvailable()) {
        return askGemini(systemPrompt, messages);
      }
      console.log(`[${agent.name}] Gemini unavailable, falling back to Claude`);
      return askClaude(systemPrompt, messages);
    case "claude":
    default:
      return askClaude(systemPrompt, messages);
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

    // Check if this is an email-related query and fetch context on-demand
    let emailContext = null;
    if (isEmailQuery(text)) {
      console.log(`[${agentKey}] Email query detected, fetching context...`);
      emailContext = await processEmailQuery(text);
      if (emailContext) {
        console.log(`[${agentKey}] Email context fetched: ${emailContext.intent}, ${emailContext.emailCount || 0} emails`);
      }
    }

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
      // Multi-modal content with images for Claude/Gemini vision
      // Add explicit instruction to prioritize image analysis over conversation context
      const imageInstruction = `IMPORTANT: The user has shared ${fileData.images.length === 1 ? "an image" : `${fileData.images.length} images`}. You MUST carefully analyze the actual content shown in the image(s) before responding. Base your response on what you see IN THE IMAGE, not on previous conversation context or assumptions. If the image shows an email, read and describe the actual email content from the image.`;
      const textWithInstruction = fullText
        ? `${imageInstruction}\n\nUser's message: ${fullText}`
        : imageInstruction;
      currentContent = [
        { type: "text", text: textWithInstruction },
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
    // Pass emailContext to inject email data for email queries
    const hasFiles = fileData && (fileData.images.length > 0 || fileData.texts.length > 0);
    const result = await getAIResponse(agent, messages, { hasFiles, emailContext });

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

/**
 * Register handler for direct messages to the bot
 * DMs are routed to the COS agent by default
 */
function registerDMHandler(app) {
  app.event("message", async ({ event, say, client }) => {
    // Only handle direct messages (IMs)
    if (event.channel_type !== "im") return;

    // Ignore bot messages and message edits
    if (event.bot_id || event.subtype) return;

    const text = event.text || "";
    const agent = AGENTS.cos; // DMs go to COS agent

    console.log(`[DM] Received: ${text.substring(0, 100)}...`);

    // Show thinking indicator
    const thinkingMsg = await say(`_${agent.name} is thinking..._`);

    // Check if this is an email-related query and fetch context on-demand
    let emailContext = null;
    if (isEmailQuery(text)) {
      console.log(`[DM] Email query detected, fetching context...`);
      emailContext = await processEmailQuery(text);
      if (emailContext) {
        console.log(`[DM] Email context fetched: ${emailContext.intent}, ${emailContext.emailCount || 0} emails`);
      }
    }

    // Build messages array with the user's message
    const messages = [{ role: "user", content: text }];

    // Get AI response with email context if applicable
    const result = await getAIResponse(agent, messages, { emailContext });

    // Delete thinking message
    try {
      await client.chat.delete({
        channel: event.channel,
        ts: thinkingMsg.ts,
      });
    } catch (e) {
      // Ignore if we can't delete
    }

    if (result.success) {
      const consensusTag = result.consensus ? " [consensus]" : "";
      await say(`*${agent.name}*${consensusTag}\n_${agent.role}_\n\n${result.text}`);
    } else {
      await say(`*${agent.name}* encountered an error: ${result.error}`);
    }
  });
}

module.exports = { registerMentionHandler, registerDMHandler };
