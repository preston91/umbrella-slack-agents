// src/index.js

const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

/* --------------------------------
   INIT
-------------------------------- */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const gemini = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

/* --------------------------------
   PERSISTENT MEMORY
-------------------------------- */
const MEMORY_DIR = path.join(__dirname, "..", "memory");
const CONVERSATIONS_DIR = path.join(MEMORY_DIR, "conversations");
const CONTEXT_DIR = path.join(MEMORY_DIR, "context");

// Create memory directories if they don't exist
[MEMORY_DIR, CONVERSATIONS_DIR, CONTEXT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Load conversation history for a channel
function loadConversation(channelName) {
  const filePath = path.join(CONVERSATIONS_DIR, `${channelName}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  return [];
}

// Save conversation history for a channel
function saveConversation(channelName, history) {
  const filePath = path.join(CONVERSATIONS_DIR, `${channelName}.json`);
  // Keep last 200 messages - plenty of context
  const trimmed = history.slice(-200);
  fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2));
}

// Add message to conversation
function addToConversation(channelName, role, content, attachments = []) {
  const history = loadConversation(channelName);
  history.push({
    role,
    content,
    attachments,
    timestamp: new Date().toISOString(),
  });
  saveConversation(channelName, history);
  return history;
}

// Load agent context (persistent knowledge)
function loadAgentContext(agentKey) {
  const filePath = path.join(CONTEXT_DIR, `${agentKey}.md`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
  return "";
}

// Save agent context
function saveAgentContext(agentKey, context) {
  const filePath = path.join(CONTEXT_DIR, `${agentKey}.md`);
  fs.writeFileSync(filePath, context);
}

/* --------------------------------
   TASK MEMORY (persisted)
-------------------------------- */
const TASKS_FILE = path.join(MEMORY_DIR, "tasks.json");

function loadTasks() {
  if (fs.existsSync(TASKS_FILE)) {
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
  }
  return [];
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function addTask(task) {
  const tasks = loadTasks();
  tasks.push({ ...task, id: Date.now(), status: "open" });
  saveTasks(tasks);
}

/* --------------------------------
   AGENTS (SOURCE OF TRUTH)
-------------------------------- */
const AGENTS = {
  cos: {
    name: "Umbrella COS",
    role: "Coordinates, clarifies, routes work",
    llm: "claude",
    systemPrompt: `You are my Chief of Staff for Umbrella. You have perfect memory of everything I've shared with you.

IMPORTANT: Below this prompt you'll see "Stored Context" - this is your knowledge base. Reference it naturally. You already know this information, don't ask for things I've already told you.

Your job:
- Coordinate across all departments
- Track priorities, tasks, blockers
- Give me concise status updates
- Make decisions easier for me

When I share info, just acknowledge briefly and USE it going forward. Don't be overly formal or ask unnecessary questions.

End responses with:
1) What moved
2) What's blocked
3) What needs my decision`,
  },
  relationships: {
    name: "Umbrella Relationships",
    role: "Trust & influence mapping",
    llm: "gemini",
    systemPrompt: `You are my Relationship Intelligence Agent for Umbrella. You have perfect memory of everyone I've told you about.

IMPORTANT: Below this prompt you'll see "Stored Context" - these are the people and relationships you know. Use this knowledge naturally.

You track people, context, timing, leverage. When I mention someone, check your context first - you may already know them.

You advise on:
- How to approach people
- Timing of outreach
- Leverage points
- Relationship dynamics

Be strategic and direct. Don't ask for info you already have.`,
  },
  fundraising: {
    name: "Umbrella Fundraising",
    role: "Investor strategy & capital",
    llm: "claude",
    systemPrompt: `You are the Fundraising Lead for Umbrella. You have perfect memory of our fundraising status.

IMPORTANT: Below this prompt you'll see "Stored Context" - this is everything you know about our raise, investors, and terms. Use it.

You track investors, conversations, terms, timeline. When I share updates, incorporate them into your knowledge.

Be investor-grade. No fluff. Help me close this round.`,
  },
  revenue: {
    name: "Umbrella Revenue",
    role: "Sales & growth",
    llm: "gemini",
    systemPrompt: `You are the CRO for Umbrella. You have perfect memory of our pipeline and deals.

IMPORTANT: Below this prompt you'll see "Stored Context" - this is your knowledge of our sales, customers, and deals. Reference it.

You own pipeline, pricing, customer acquisition. Track deal stages and blockers.

Sales are political - help me navigate. Be direct about what's working and what's not.`,
  },
  product_cs: {
    name: "Umbrella Product / CS",
    role: "Product adoption & retention",
    llm: "claude",
    systemPrompt: `You own product and customer success for Umbrella. You have perfect memory of our product and customers.

IMPORTANT: Below this prompt you'll see "Stored Context" - this is your knowledge of our product, roadmap, and customer feedback.

Track roadmap, feedback, adoption, churn risks. Optimize for simplicity.`,
  },
  ops: {
    name: "Umbrella Ops",
    role: "Finance, HR, execution",
    llm: "gemini",
    systemPrompt: `You are Ops / Finance / HR for Umbrella. You have perfect memory of our operations.

IMPORTANT: Below this prompt you'll see "Stored Context" - this is your knowledge of financials, team, and operations.

Be conservative and precise. Flag risks early. Track burn, runway, hiring.`,
  },
  deals: {
    name: "Umbrella UHG",
    role: "Deals & opportunity capture",
    llm: "claude",
    systemPrompt: `You are the UHG operator for Umbrella. You have perfect memory of opportunities and deals.

IMPORTANT: Below this prompt you'll see "Stored Context" - this is your knowledge of partnerships, opportunities, and market intel.

Think asymmetric upside. Don't chase low leverage. Help me capture the big ones.`,
  },
};

/* --------------------------------
   CHANNEL → AGENT MAP
-------------------------------- */
const CHANNEL_AGENT_MAP = {
  "cos-command": "cos",
  "relationships": "relationships",
  "fundraising": "fundraising",
  "product-revenue-growth": "revenue",
  "product-cs": "product_cs",
  "ops-finance": "ops",
  "uhg-deals": "deals",
};

/* --------------------------------
   FILE HANDLING
-------------------------------- */
async function downloadFile(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data).toString("base64");
  } catch (error) {
    console.error("Error downloading file:", error.message);
    return null;
  }
}

async function processAttachments(event) {
  const attachments = [];

  if (event.files && event.files.length > 0) {
    for (const file of event.files) {
      const fileInfo = {
        name: file.name,
        type: file.mimetype,
        title: file.title,
      };

      // For images, download and include base64
      if (file.mimetype && file.mimetype.startsWith("image/")) {
        const base64 = await downloadFile(file.url_private);
        if (base64) {
          fileInfo.base64 = base64;
          fileInfo.description = `[Image: ${file.name}]`;
        }
      } else if (file.mimetype === "application/pdf") {
        fileInfo.description = `[PDF: ${file.name}]`;
      } else {
        fileInfo.description = `[File: ${file.name} (${file.mimetype})]`;
      }

      attachments.push(fileInfo);
    }
  }

  return attachments;
}

/* --------------------------------
   HELPERS
-------------------------------- */
const cleanText = (text) =>
  text.replace(/<@.*?>/g, "").trim();

function buildConversationContext(history, agentKey) {
  const agentContext = loadAgentContext(agentKey);
  let context = "";

  if (agentContext) {
    context += `## Stored Context\n${agentContext}\n\n`;
  }

  if (history.length > 0) {
    context += "## Recent Conversation\n";
    for (const msg of history.slice(-20)) { // Last 20 messages
      const role = msg.role === "user" ? "User" : "Assistant";
      context += `${role}: ${msg.content}\n`;
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          context += `  ${att.description || att.name}\n`;
        }
      }
    }
  }

  return context;
}

async function callClaude(agentKey, userText, history = [], attachments = []) {
  const agent = AGENTS[agentKey];
  const conversationContext = buildConversationContext(history, agentKey);

  const systemPrompt = conversationContext
    ? `${agent.systemPrompt}\n\n---\n\n${conversationContext}`
    : agent.systemPrompt;

  // Build messages array with history
  const messages = [];

  // Add recent history as conversation
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  // Build current message content (text + images)
  const currentContent = [];

  // Add any images first
  for (const att of attachments) {
    if (att.base64 && att.type && att.type.startsWith("image/")) {
      currentContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.type,
          data: att.base64,
        },
      });
    }
  }

  // Add the text
  currentContent.push({
    type: "text",
    text: userText,
  });

  // Add current message with images if present
  messages.push({
    role: "user",
    content: currentContent.length === 1 ? userText : currentContent,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048, // More tokens for detailed image analysis
    system: systemPrompt,
    messages: messages,
  });

  return response.content[0].text;
}

async function callGemini(agentKey, userText, history = [], attachments = []) {
  const agent = AGENTS[agentKey];
  const conversationContext = buildConversationContext(history, agentKey);

  let prompt = agent.systemPrompt;

  if (conversationContext) {
    prompt += `\n\n---\n\n${conversationContext}`;
  }

  prompt += `\n\n---\n\nUser: ${userText}`;

  // Build content parts for Gemini (supports images too)
  const parts = [];

  // Add images if present
  for (const att of attachments) {
    if (att.base64 && att.type && att.type.startsWith("image/")) {
      parts.push({
        inlineData: {
          mimeType: att.type,
          data: att.base64,
        },
      });
    }
  }

  // Add text
  parts.push({ text: prompt });

  const result = await gemini.generateContent(parts.length === 1 ? prompt : parts);
  const response = await result.response;

  return response.text();
}

// Default LLM provider - can be "claude" or "gemini"
const DEFAULT_LLM = process.env.DEFAULT_LLM || "claude";
const GEMINI_AVAILABLE = !!process.env.GOOGLE_API_KEY;

async function callLLM(agentKey, userText, history = [], attachments = [], provider = null) {
  let llmProvider = provider || AGENTS[agentKey].llm || DEFAULT_LLM;

  // Fall back to Claude if Gemini requested but no API key
  if (llmProvider === "gemini" && !GEMINI_AVAILABLE) {
    console.log(`Gemini requested for ${agentKey} but no API key - falling back to Claude`);
    llmProvider = "claude";
  }

  // If there are images, prefer Claude (better vision) unless Gemini explicitly set
  if (attachments.length > 0 && attachments.some(a => a.base64)) {
    console.log(`  📷 Processing ${attachments.filter(a => a.base64).length} image(s)`);
  }

  if (llmProvider === "gemini") {
    return callGemini(agentKey, userText, history, attachments);
  }

  return callClaude(agentKey, userText, history, attachments);
}

/* --------------------------------
   COS TASK ROUTING
-------------------------------- */
async function handleCOSRouting(text, client, say) {
  const match = text.match(/^assign\s+(\w+)\s*:\s*(.*)$/i);
  if (!match) return false;

  const targetKey = match[1].toLowerCase();
  const task = match[2];

  const channelEntry = Object.entries(CHANNEL_AGENT_MAP).find(
    ([_, agent]) => agent === targetKey
  );

  if (!channelEntry) {
    await say(`⚠️ Unknown agent "${targetKey}"`);
    return true;
  }

  const [channelName] = channelEntry;

  addTask({
    from: "COS",
    to: targetKey,
    task,
    time: new Date().toISOString(),
  });

  await client.chat.postMessage({
    channel: `#${channelName}`,
    text: `📌 *Task from COS*\n${task}`,
  });

  await say(`✅ Routed to *${AGENTS[targetKey].name}*`);
  return true;
}

/* --------------------------------
   AUTO-EXTRACT KEY FACTS
-------------------------------- */
async function extractAndSaveKeyFacts(agentKey, userMessage, assistantReply) {
  // Use Claude to extract key facts from the conversation
  const extractPrompt = `Extract any important facts, names, numbers, dates, or context from this message that should be remembered long-term. If there's nothing worth remembering, respond with just "NONE".

User said: "${userMessage}"

Return ONLY the key facts as bullet points, nothing else. Be concise. Examples of things to extract:
- People's names and roles
- Company names
- Numbers (revenue, funding amounts, dates)
- Relationships between people
- Deals or opportunities
- Deadlines or timelines
- Strategic priorities`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      messages: [{ role: "user", content: extractPrompt }],
    });

    const facts = response.content[0].text.trim();

    if (facts && facts !== "NONE" && facts.toLowerCase() !== "none") {
      const existingContext = loadAgentContext(agentKey);
      const timestamp = new Date().toISOString().split('T')[0]; // Just date
      const newContext = existingContext
        ? `${existingContext}\n\n[${timestamp}]\n${facts}`
        : `[${timestamp}]\n${facts}`;
      saveAgentContext(agentKey, newContext);
      console.log(`  📝 Extracted facts for ${agentKey}:`, facts.slice(0, 100));
    }
  } catch (error) {
    console.error("Error extracting facts:", error.message);
  }
}

/* --------------------------------
   CONTEXT COMMANDS
-------------------------------- */
async function handleContextCommand(text, agentKey, say) {
  // "context" or "what do you know" - Show what the agent knows
  const contextMatch = text.match(/^(context|what do you know|show context)\??$/i);
  if (contextMatch) {
    const context = loadAgentContext(agentKey);
    if (context) {
      await say(`📚 *What I know:*\n\n${context.slice(0, 3000)}${context.length > 3000 ? '\n\n_(truncated)_' : ''}`);
    } else {
      await say(`I don't have any stored knowledge yet. Just share info with me naturally and I'll remember it.`);
    }
    return true;
  }

  // "clear context" or "forget everything" - Reset agent's context
  const clearMatch = text.match(/^(clear context|forget everything|reset)$/i);
  if (clearMatch) {
    saveAgentContext(agentKey, "");
    const convPath = path.join(CONVERSATIONS_DIR, `${CHANNEL_AGENT_MAP[agentKey] || agentKey}.json`);
    if (fs.existsSync(convPath)) fs.unlinkSync(convPath);
    await say(`🗑️ Memory cleared. Starting fresh.`);
    return true;
  }

  return false;
}

/* --------------------------------
   LISTEN TO MENTIONS
-------------------------------- */
app.event("app_mention", async ({ event, say, client }) => {
  const channelInfo = await client.conversations.info({
    channel: event.channel,
  });

  const channelName = channelInfo.channel.name;
  const agentKey = CHANNEL_AGENT_MAP[channelName] || "cos";
  const agent = AGENTS[agentKey];
  const text = cleanText(event.text);

  // Process any file attachments
  const attachments = await processAttachments(event);

  console.log(`MENTION in #${channelName}:`, text);
  if (attachments.length > 0) {
    console.log(`  Attachments:`, attachments.map(a => a.name));
  }

  // Handle special commands
  const handled = await handleContextCommand(text, agentKey, say);
  if (handled) return;

  if (agentKey === "cos") {
    const routed = await handleCOSRouting(text, client, say);
    if (routed) return;
  }

  // Show typing indicator
  const thinkingMsg = await client.chat.postMessage({
    channel: event.channel,
    text: `⏳ *${agent.name}* is thinking...`,
  });

  try {
    // Load conversation history
    const history = loadConversation(channelName);

    // Add user message to history
    let userMessage = text;
    if (attachments.length > 0) {
      userMessage += "\n\n[Attachments: " + attachments.map(a => a.description || a.name).join(", ") + "]";
    }

    addToConversation(channelName, "user", userMessage, attachments);

    // Get response with full history and attachments (for vision)
    let reply;
    try {
      reply = await callLLM(agentKey, userMessage, history, attachments);
    } catch (llmError) {
      // If image processing fails, retry without images
      if (llmError.message && llmError.message.includes("image")) {
        console.log("  ⚠️ Image processing failed, retrying without images...");
        reply = await callLLM(agentKey, userMessage, history, []);
        reply += "\n\n_(Note: I couldn't process the image. Try a smaller image or different format.)_";
      } else {
        throw llmError;
      }
    }

    // Save assistant response to history
    addToConversation(channelName, "assistant", reply);

    // Auto-extract and save key facts (runs in background, don't await)
    extractAndSaveKeyFacts(agentKey, userMessage, reply).catch(err =>
      console.error("Fact extraction error:", err.message)
    );

    // Delete thinking message
    await client.chat.delete({
      channel: event.channel,
      ts: thinkingMsg.ts,
    });

    // Show actual LLM used (accounting for fallback)
    let llmUsed = agent.llm || DEFAULT_LLM;
    if (llmUsed === "gemini" && !GEMINI_AVAILABLE) llmUsed = "claude";
    const llmIcon = llmUsed === "gemini" ? "💎" : "🤖";
    await say(`🧠 *${agent.name}* ${llmIcon}\n_${agent.role}_\n\n${reply}`);

  } catch (error) {
    console.error("Error processing message:", error.message);

    // Delete thinking message
    try {
      await client.chat.delete({
        channel: event.channel,
        ts: thinkingMsg.ts,
      });
    } catch (e) {}

    await say(`❌ *${agent.name}* hit an error: ${error.message}\n\nTry again or rephrase your message.`);
  }
});

/* --------------------------------
   DAILY COS SUMMARY (EVERY 24H)
-------------------------------- */
setInterval(async () => {
  const tasks = loadTasks();
  const openTasks = tasks.filter(t => t.status === "open");

  // Gather recent activity from all channels
  let activity = "";
  for (const channelName of Object.keys(CHANNEL_AGENT_MAP)) {
    const history = loadConversation(channelName);
    const recent = history.slice(-5);
    if (recent.length > 0) {
      activity += `\n#${channelName}:\n`;
      for (const msg of recent) {
        activity += `- ${msg.role}: ${msg.content.slice(0, 100)}...\n`;
      }
    }
  }

  const summaryPrompt = `
Summarize the last 24 hours.

Open Tasks:
${openTasks.map(t => `- ${t.to}: ${t.task}`).join("\n") || "None"}

Recent Activity:
${activity || "None"}

Give me a brief executive summary.
`;

  const summary = await callLLM("cos", summaryPrompt, [], []);

  await app.client.chat.postMessage({
    channel: "#cos-command",
    text: `📊 *Daily COS Summary*\n\n${summary}`,
  });
}, 1000 * 60 * 60 * 24);

/* --------------------------------
   START
-------------------------------- */
(async () => {
  await app.start();
  console.log("⚡ Umbrella agent is live in Slack");
  console.log(`📁 Memory stored in: ${MEMORY_DIR}`);
})();
