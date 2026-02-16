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

  // If there are files (images/PDFs), use Claude directly - it has better vision capabilities
  // and is less likely to hallucinate content from conversation history
  if (hasFiles || hasMultimodalContent(messages)) {
    console.log(`[${agent.name}] Files detected - routing to Claude for vision (better at reading images)`);
    // Add image analysis priority to system prompt when files are present
    const imageSystemAddition = `\n\nCRITICAL IMAGE RULES:\n1. READ THE ACTUAL IMAGE - do not guess or make up content based on conversation context\n2. QUOTE the actual text you see - do not paraphrase or invent\n3. If you see an email, read the ACTUAL sender, subject, and body text from the image\n4. Do NOT use conversation history to fill in what you think the image says\n5. If the image contradicts prior context, trust the IMAGE not the context\n6. Be specific: "The email says [exact quote]" not "I think it says..."`;
    const fileAwarePrompt = systemPrompt + imageSystemAddition;
    // Claude is primary for vision - better at reading text in screenshots and less hallucination
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
    console.log("[DEBUG] Files structure:", JSON.stringify(files, null, 2));
    const fileData = await processFiles(files, botToken);
    console.log("[DEBUG] processFiles result:", JSON.stringify(fileData, null, 2));

    // Temporary debug: show what files were detected
    if (files && files.length > 0) {
      const fileNames = files.map(f => `${f.name} (${f.mimetype})`).join(", ");
      console.log(`[DEBUG] Detected files: ${fileNames}`);
      if (!fileData || fileData.images.length === 0) {
        console.log("[DEBUG] WARNING: Files detected but no images processed!");
      }
    } else {
      console.log("[DEBUG] No files detected in event or message history");
    }

    // Build text content (include extracted file text)
    let fullText = text;
    if (fileData && fileData.texts.length > 0) {
      fullText = text + "\n\n" + fileData.texts.join("\n\n");
      console.log(`[DEBUG] fullText with file content (${fullText.length} chars):`);
      console.log(`[DEBUG] First 1000 chars: ${fullText.substring(0, 1000)}`);
    }

    // Log user message to conversation history (only if non-empty)
    if (fullText && fullText.trim()) {
      await appendMessage(channelName, "user", fullText, null);
    }
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

    // When images are shared, severely limit history to prevent hallucination from context
    // The image should be the PRIMARY context - prior conversation can cause the model to
    // "fill in" what it thinks the image says based on context instead of reading it
    const hasImages = fileData && fileData.images.length > 0;
    const historyLimit = hasImages ? 2 : 20; // Minimal history when analyzing images

    // Filter out any messages with empty content to avoid Claude API errors
    const messages = history
      .slice(-historyLimit)
      .filter((msg) => msg.content && (typeof msg.content === "string" ? msg.content.trim() : true))
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      }));

    if (hasImages) {
      console.log(`[DEBUG] Image detected - limited history to ${historyLimit} messages to prioritize image analysis`);
    }

    console.log(`[DEBUG] Messages being sent to AI: ${messages.length}`);

    // Build current message content (may include images for vision)
    let currentContent;
    if (fileData && fileData.images.length > 0) {
      // Multi-modal content with images for Claude/Gemini vision
      // Add explicit instruction to prioritize image analysis over conversation context
      const imageInstruction = `READ AND QUOTE THE ACTUAL TEXT IN THIS IMAGE. Do not guess based on conversation history. For emails: quote the actual sender name, recipient, subject line, and key sentences from the body. Use direct quotes like "The email says: [exact text]". Trust ONLY what you see in the image.`;
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
    // When we have images, ALWAYS replace the last message with multimodal content
    // (the text-only version was already added to history, but we need the image version for Claude)
    if (hasImages && messages.length > 0 && messages[messages.length - 1].content === fullText) {
      // Replace the text-only message with multimodal content
      messages[messages.length - 1].content = currentContent;
      console.log("[DEBUG] Replaced last message with multimodal content");
    } else if (messages.length === 0 || messages[messages.length - 1].content !== fullText) {
      messages.push({ role: "user", content: currentContent });
    }

    // Debug: Log what we're actually sending
    if (hasImages) {
      const lastMsg = messages[messages.length - 1];
      if (Array.isArray(lastMsg.content)) {
        console.log(`[DEBUG] Multimodal message structure: ${lastMsg.content.length} parts`);
        lastMsg.content.forEach((part, i) => {
          if (part.type === "text") {
            console.log(`[DEBUG] Part ${i}: text (${part.text.length} chars)`);
          } else if (part.type === "image") {
            console.log(`[DEBUG] Part ${i}: image (${part.source?.media_type}, ${part.source?.data?.length || 0} base64 chars)`);
          }
        });
      }
    }

    // Get AI response with full conversation context
    // Pass hasFiles flag to route file requests directly to Gemini
    // Pass emailContext to inject email data for email queries
    const hasFiles = fileData && (fileData.images.length > 0 || fileData.texts.length > 0);
    if (hasFiles) {
      console.log(`[DEBUG] Sending to AI with ${fileData.images.length} images, ${fileData.texts.length} text files`);
      console.log(`[DEBUG] Image instruction included in message`);
      // Log image details for debugging
      if (fileData.images.length > 0) {
        for (let i = 0; i < fileData.images.length; i++) {
          const img = fileData.images[i];
          const dataLen = img.source?.data?.length || 0;
          console.log(`[DEBUG] Image ${i + 1}: type=${img.source?.media_type}, base64_length=${dataLen}`);
        }
      }
    }
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
