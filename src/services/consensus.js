// src/services/consensus.js
// Ask both Claude and Gemini, then synthesize the best response

const { askClaude } = require("./claude");
const { askGemini, isGeminiAvailable } = require("./gemini");

const SYNTHESIS_PROMPT = `You are synthesizing two AI responses into one optimal answer.

You received responses from two different AI models to the same question.
Your job is to:
1. Identify the strongest points from each response
2. Resolve any contradictions (prefer accuracy over confidence)
3. Combine into a single, coherent response
4. Keep the tone consistent with the original system prompt

Do NOT mention that there were two responses or that you're synthesizing.
Just provide the best unified answer.`;

async function askConsensus(systemPrompt, userTextOrMessages, options = {}) {
  const {
    synthesizer = "claude", // which model synthesizes the final answer
  } = options;

  // If Gemini isn't available, just use Claude
  if (!isGeminiAvailable()) {
    console.log("[consensus] Gemini unavailable, falling back to Claude only");
    return askClaude(systemPrompt, userTextOrMessages);
  }

  // Ask both in parallel
  console.log("[consensus] Querying Claude and Gemini in parallel...");
  const [claudeResult, geminiResult] = await Promise.all([
    askClaude(systemPrompt, userTextOrMessages),
    askGemini(systemPrompt, userTextOrMessages),
  ]);

  // If one failed, return the other
  if (!claudeResult.success && !geminiResult.success) {
    return {
      success: false,
      text: null,
      error: "Both Claude and Gemini failed",
      providers: { claude: claudeResult.error, gemini: geminiResult.error },
    };
  }

  if (!claudeResult.success) {
    console.log("[consensus] Claude failed, using Gemini response");
    return { ...geminiResult, consensus: false, usedProvider: "gemini" };
  }

  if (!geminiResult.success) {
    console.log("[consensus] Gemini failed, using Claude response");
    return { ...claudeResult, consensus: false, usedProvider: "claude" };
  }

  // Both succeeded - synthesize
  console.log("[consensus] Both responded, synthesizing...");

  // Get the last user message for synthesis context
  let lastUserMessage;
  if (typeof userTextOrMessages === "string") {
    lastUserMessage = userTextOrMessages;
  } else if (Array.isArray(userTextOrMessages)) {
    const lastMsg = userTextOrMessages.filter(m => m.role === "user").pop();
    lastUserMessage = lastMsg ? lastMsg.content : "See conversation above";
  } else {
    lastUserMessage = String(userTextOrMessages);
  }

  const synthesisInput = `Original system context: ${systemPrompt}

User's latest question: ${lastUserMessage}

---

Response A (Claude):
${claudeResult.text}

---

Response B (Gemini):
${geminiResult.text}

---

Provide the optimal synthesized response:`;

  const synthesized = synthesizer === "gemini"
    ? await askGemini(SYNTHESIS_PROMPT, synthesisInput)
    : await askClaude(SYNTHESIS_PROMPT, synthesisInput);

  if (!synthesized.success) {
    // Synthesis failed, default to Claude's response
    console.log("[consensus] Synthesis failed, defaulting to Claude");
    return { ...claudeResult, consensus: false, usedProvider: "claude" };
  }

  return {
    success: true,
    text: synthesized.text,
    consensus: true,
    providers: {
      claude: { success: true },
      gemini: { success: true },
      synthesizer,
    },
  };
}

module.exports = { askConsensus };
