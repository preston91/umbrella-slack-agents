// src/services/claude.js

const Anthropic = require("@anthropic-ai/sdk");

let client = null;

function initClaude(apiKey) {
  client = new Anthropic({ apiKey });
}

// Web search tool definition
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
};

async function askClaude(systemPrompt, userTextOrMessages, options = {}) {
  if (!client) {
    throw new Error("Claude client not initialized. Call initClaude() first.");
  }

  const {
    model = "claude-sonnet-4-5-20250929",
    maxTokens = 2048,
    enableWebSearch = false,
  } = options;

  // Support both single string and messages array
  let messages;
  if (typeof userTextOrMessages === "string") {
    messages = [{ role: "user", content: userTextOrMessages }];
  } else if (Array.isArray(userTextOrMessages)) {
    messages = userTextOrMessages;
  } else {
    messages = [{ role: "user", content: String(userTextOrMessages) }];
  }

  // Filter out any messages with empty content to avoid API errors
  messages = messages.filter((msg) => {
    if (!msg.content) return false;
    if (typeof msg.content === "string") return msg.content.trim().length > 0;
    if (Array.isArray(msg.content)) return msg.content.length > 0;
    return true;
  });

  // If no valid messages remain, return an error
  if (messages.length === 0) {
    return {
      success: false,
      text: null,
      error: "No valid message content to send",
      model,
    };
  }

  try {
    const requestParams = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    };

    // Add web search tool if enabled
    if (enableWebSearch) {
      requestParams.tools = [WEB_SEARCH_TOOL];
    }

    const response = await client.messages.create(requestParams);

    // Extract text from response, handling tool use responses
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += block.text;
      } else if (block.type === "web_search_tool_result") {
        // Web search was used - the model will incorporate results
        // Just log that search was performed
        console.log("Web search performed during response");
      }
    }

    return {
      success: true,
      text: responseText,
      model,
      usedWebSearch: response.content.some(
        (b) => b.type === "tool_use" && b.name === "web_search"
      ),
    };
  } catch (error) {
    console.error("Claude API error:", error.message);

    return {
      success: false,
      text: null,
      error: error.message,
      model,
    };
  }
}

// Convenience function for web search enabled queries
async function askClaudeWithSearch(systemPrompt, userTextOrMessages, options = {}) {
  return askClaude(systemPrompt, userTextOrMessages, {
    ...options,
    enableWebSearch: true,
  });
}

module.exports = { initClaude, askClaude, askClaudeWithSearch };
