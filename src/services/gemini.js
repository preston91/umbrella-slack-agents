// src/services/gemini.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

let client = null;

function initGemini(apiKey) {
  if (!apiKey) {
    console.warn("Gemini API key not provided. Gemini will be unavailable.");
    return;
  }
  client = new GoogleGenerativeAI(apiKey);
}

function isGeminiAvailable() {
  return client !== null;
}

async function askGemini(systemPrompt, userTextOrMessages, options = {}) {
  if (!client) {
    throw new Error("Gemini client not initialized or API key not provided.");
  }

  const {
    model = "gemini-2.0-flash",
  } = options;

  // Convert content to Gemini parts format
  function contentToParts(content) {
    // Simple string
    if (typeof content === "string") {
      return [{ text: content }];
    }

    // Multimodal array (Claude format) - convert to Gemini format
    if (Array.isArray(content)) {
      return content.map((item) => {
        if (item.type === "text") {
          return { text: item.text };
        }
        if (item.type === "image" && item.source) {
          // Claude image format -> Gemini inline_data format
          return {
            inline_data: {
              mime_type: item.source.media_type,
              data: item.source.data,
            },
          };
        }
        // Fallback: stringify unknown types
        return { text: JSON.stringify(item) };
      });
    }

    // Fallback
    return [{ text: String(content) }];
  }

  // Convert to Gemini format
  let contents;
  if (typeof userTextOrMessages === "string") {
    contents = [{ role: "user", parts: [{ text: userTextOrMessages }] }];
  } else if (Array.isArray(userTextOrMessages)) {
    // Filter out messages with empty content before converting
    const filteredMessages = userTextOrMessages.filter((msg) => {
      if (!msg.content) return false;
      if (typeof msg.content === "string") return msg.content.trim().length > 0;
      if (Array.isArray(msg.content)) return msg.content.length > 0;
      return true;
    });

    // Convert from Claude format {role, content} to Gemini format {role, parts}
    contents = filteredMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: contentToParts(msg.content),
    }));
  } else {
    contents = [{ role: "user", parts: [{ text: String(userTextOrMessages) }] }];
  }

  // If no valid messages remain, return an error
  if (contents.length === 0) {
    return {
      success: false,
      text: null,
      error: "No valid message content to send",
      model,
    };
  }

  try {
    const genModel = client.getGenerativeModel({ model });

    const result = await genModel.generateContent({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const response = result.response;
    const text = response.text();

    return {
      success: true,
      text,
      model,
    };
  } catch (error) {
    console.error("Gemini API error:", error.message);

    return {
      success: false,
      text: null,
      error: error.message,
      model,
    };
  }
}

module.exports = { initGemini, askGemini, isGeminiAvailable };
