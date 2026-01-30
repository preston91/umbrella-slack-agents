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

  // Convert to Gemini format
  let contents;
  if (typeof userTextOrMessages === "string") {
    contents = [{ role: "user", parts: [{ text: userTextOrMessages }] }];
  } else if (Array.isArray(userTextOrMessages)) {
    // Convert from Claude format {role, content} to Gemini format {role, parts}
    contents = userTextOrMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));
  } else {
    contents = [{ role: "user", parts: [{ text: String(userTextOrMessages) }] }];
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
