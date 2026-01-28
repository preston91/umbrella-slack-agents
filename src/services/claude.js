// src/services/claude.js

const Anthropic = require("@anthropic-ai/sdk");

let client = null;

function initClaude(apiKey) {
  client = new Anthropic({ apiKey });
}

async function askClaude(systemPrompt, userTextOrMessages, options = {}) {
  if (!client) {
    throw new Error("Claude client not initialized. Call initClaude() first.");
  }

  const {
    model = "claude-sonnet-4-5-20250929",
    maxTokens = 1200,
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

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    return {
      success: true,
      text: response.content[0].text,
      model,
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

module.exports = { initClaude, askClaude };
