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

async function askGemini(systemPrompt, userText, options = {}) {
  if (!client) {
    throw new Error("Gemini client not initialized or API key not provided.");
  }

  const {
    model = "gemini-1.5-flash",
  } = options;

  try {
    const genModel = client.getGenerativeModel({ model });

    const result = await genModel.generateContent({
      contents: [{ role: "user", parts: [{ text: userText }] }],
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
