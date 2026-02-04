// src/services/consensus.js
// Ask both Claude and Gemini, then synthesize the best response

const { askClaude } = require("./claude");
const { askGemini, isGeminiAvailable } = require("./gemini");

const SYNTHESIS_PROMPT = `You are synthesizing two AI responses into one optimal answer.

CRITICAL - You are writing for Slack. Format rules:
- NEVER use **double asterisks** (Slack doesn't render this)
- NEVER use ## headers (Slack doesn't render this)
- NEVER use --- dividers (Slack doesn't render this)
- USE *single asterisks* for bold
- USE _underscores_ for italic
- Write like texting a colleague, not a formal document

You received responses from two different AI models to the same question.
Your job is to:
1. Identify the strongest points from each response
2. Resolve any contradictions (prefer accuracy over confidence)
3. Combine into a single, coherent response
4. Keep it conversational - no formal document structure

Do NOT mention that there were two responses or that you're synthesizing.
Just provide the best unified answer.`;

// Helper to delay for retry backoff
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Query both providers with optional retry
async function queryBothProviders(systemPrompt, userTextOrMessages, attempt = 1) {
  console.log(`[consensus] Querying Claude and Gemini in parallel (attempt ${attempt})...`);

  const [claudeResult, geminiResult] = await Promise.all([
    askClaude(systemPrompt, userTextOrMessages),
    askGemini(systemPrompt, userTextOrMessages),
  ]);

  return { claudeResult, geminiResult };
}

async function askConsensus(systemPrompt, userTextOrMessages, options = {}) {
  const {
    synthesizer = "claude", // which model synthesizes the final answer
    maxRetries = 2, // retry once on total failure
  } = options;

  // If Gemini isn't available, just use Claude
  if (!isGeminiAvailable()) {
    console.log("[consensus] Gemini unavailable, falling back to Claude only");
    return askClaude(systemPrompt, userTextOrMessages);
  }

  let claudeResult, geminiResult;
  let lastClaudeError, lastGeminiError;

  // Try up to maxRetries times if both fail
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const results = await queryBothProviders(systemPrompt, userTextOrMessages, attempt);
    claudeResult = results.claudeResult;
    geminiResult = results.geminiResult;

    // If at least one succeeded, break out
    if (claudeResult.success || geminiResult.success) {
      break;
    }

    // Both failed - save errors and maybe retry
    lastClaudeError = claudeResult.error;
    lastGeminiError = geminiResult.error;

    if (attempt < maxRetries) {
      const backoffMs = attempt * 2000; // 2s, 4s, etc.
      console.log(`[consensus] Both providers failed, retrying in ${backoffMs}ms...`);
      console.log(`[consensus] Claude error: ${lastClaudeError}`);
      console.log(`[consensus] Gemini error: ${lastGeminiError}`);
      await delay(backoffMs);
    }
  }

  // If both still failed after retries, return detailed error
  if (!claudeResult.success && !geminiResult.success) {
    const claudeErr = claudeResult.error || lastClaudeError || "Unknown error";
    const geminiErr = geminiResult.error || lastGeminiError || "Unknown error";

    console.error(`[consensus] Both providers failed after ${maxRetries} attempts`);
    console.error(`[consensus] Claude: ${claudeErr}`);
    console.error(`[consensus] Gemini: ${geminiErr}`);

    return {
      success: false,
      text: null,
      error: `Both AI providers failed after ${maxRetries} attempts. Claude: ${claudeErr} | Gemini: ${geminiErr}`,
      providers: { claude: claudeErr, gemini: geminiErr },
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
