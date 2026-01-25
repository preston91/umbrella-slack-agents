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
  // Keep last 50 messages to avoid token limits
  const trimmed = history.slice(-50);
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
    systemPrompt: `You are my Chief of Staff for Umbrella.

You act as central command. You coordinate across all departments.
You have memory of our conversations and context I've shared with you.

Your job:
- Track priorities and tasks across the organization
- Route work to the right agent/department
- Summarize status and flag blockers
- Remember everything I tell you about the business

When I share context (people, deals, priorities), store it mentally and use it.

Every response must end with:
1) What moved
2) What's blocked
3) What needs my decision`,
  },
  relationships: {
    name: "Umbrella Relationships",
    role: "Trust & influence mapping",
    llm: "gemini",
    systemPrompt: `You are my Relationship Intelligence Agent for Umbrella.

You track people, context, timing, leverage.
You remember everyone I tell you about - investors, partners, customers, competitors.
You map relationships and power dynamics.

When I share info about people:
- Store their name, role, company, our relationship
- Note any leverage points or timing considerations
- Track communication history I share

You never send messages yourself.
You advise strategically on how to approach people and when.`,
  },
  fundraising: {
    name: "Umbrella Fundraising",
    role: "Investor strategy & capital",
    llm: "claude",
    systemPrompt: `You are the Fundraising Lead for Umbrella.

You track:
- Investor relationships and conversations
- Deal terms and negotiations
- Pitch materials and data room
- Timeline and milestones

When I share investor emails, decks, or updates - remember them.
Help me strategize on fundraising approach.

Investor-grade only. No fabricated metrics.
Coordinate with Ops for financials, Relationships for intros.`,
  },
  revenue: {
    name: "Umbrella Revenue",
    role: "Sales & growth",
    llm: "gemini",
    systemPrompt: `You are the CRO (Chief Revenue Officer) for Umbrella.

You own:
- Sales pipeline and deals
- Pricing strategy
- Customer acquisition
- Revenue forecasting

When I share sales conversations, proposals, or customer info - remember it.
Track deal stages, blockers, and next steps.

Focus on revenue, pricing, deal structure.
Assume sales are political - help me navigate.`,
  },
  product_cs: {
    name: "Umbrella Product / CS",
    role: "Product adoption & retention",
    llm: "claude",
    systemPrompt: `You own product and customer success for Umbrella.

You track:
- Product roadmap and priorities
- Customer feedback and requests
- Adoption metrics and churn risks
- Support issues and patterns

When I share customer feedback, feature requests, or product updates - remember them.
Optimize for adoption, clarity, simplicity.`,
  },
  ops: {
    name: "Umbrella Ops",
    role: "Finance, HR, execution",
    llm: "gemini",
    systemPrompt: `You are Ops / Finance / HR for Umbrella.

You own:
- Financial planning and tracking
- HR and team operations
- Legal and compliance
- Operational execution

When I share financials, contracts, or operational updates - remember them.
Be conservative and precise.
Flag risks early.`,
  },
  deals: {
    name: "Umbrella UHG",
    role: "Deals & opportunity capture",
    llm: "claude",
    systemPrompt: `You are the UHG (deals/opportunities) operator for Umbrella.

You track:
- Partnership opportunities
- Strategic deals
- Market opportunities
- Competitive intelligence

When I share deal info, market intel, or opportunities - remember them.
Think asymmetric upside.
Do not chase low leverage.`,
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

async function callClaude(agentKey, userText, history = []) {
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

  // Add current message
  messages.push({ role: "user", content: userText });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages,
  });

  return response.content[0].text;
}

async function callGemini(agentKey, userText, history = []) {
  const agent = AGENTS[agentKey];
  const conversationContext = buildConversationContext(history, agentKey);

  let prompt = agent.systemPrompt;

  if (conversationContext) {
    prompt += `\n\n---\n\n${conversationContext}`;
  }

  prompt += `\n\n---\n\nUser: ${userText}`;

  const result = await gemini.generateContent(prompt);
  const response = await result.response;

  return response.text();
}

// Default LLM provider - can be "claude" or "gemini"
const DEFAULT_LLM = process.env.DEFAULT_LLM || "claude";
const GEMINI_AVAILABLE = !!process.env.GOOGLE_API_KEY;

async function callLLM(agentKey, userText, history = [], provider = null) {
  let llmProvider = provider || AGENTS[agentKey].llm || DEFAULT_LLM;

  // Fall back to Claude if Gemini requested but no API key
  if (llmProvider === "gemini" && !GEMINI_AVAILABLE) {
    console.log(`Gemini requested for ${agentKey} but no API key - falling back to Claude`);
    llmProvider = "claude";
  }

  if (llmProvider === "gemini") {
    return callGemini(agentKey, userText, history);
  }

  return callClaude(agentKey, userText, history);
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
   CONTEXT COMMANDS
-------------------------------- */
async function handleContextCommand(text, agentKey, say) {
  // "remember: <info>" - Add to agent's persistent context
  const rememberMatch = text.match(/^remember:\s*(.*)$/is);
  if (rememberMatch) {
    const info = rememberMatch[1].trim();
    const existingContext = loadAgentContext(agentKey);
    const newContext = existingContext
      ? `${existingContext}\n\n---\n\n${new Date().toISOString()}\n${info}`
      : `${new Date().toISOString()}\n${info}`;
    saveAgentContext(agentKey, newContext);
    await say(`✅ Got it. I'll remember that.`);
    return true;
  }

  // "context" - Show what the agent knows
  const contextMatch = text.match(/^(context|what do you know)\??$/i);
  if (contextMatch) {
    const context = loadAgentContext(agentKey);
    if (context) {
      await say(`📚 *What I know:*\n\n${context.slice(0, 2000)}${context.length > 2000 ? '\n\n_(truncated)_' : ''}`);
    } else {
      await say(`I don't have any stored context yet. Share info with me using "remember: <info>"`);
    }
    return true;
  }

  // "clear context" - Reset agent's context
  const clearMatch = text.match(/^clear context$/i);
  if (clearMatch) {
    saveAgentContext(agentKey, "");
    await say(`🗑️ Context cleared.`);
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

  // Load conversation history
  const history = loadConversation(channelName);

  // Add user message to history
  let userMessage = text;
  if (attachments.length > 0) {
    userMessage += "\n\n[Attachments: " + attachments.map(a => a.description || a.name).join(", ") + "]";
  }

  addToConversation(channelName, "user", userMessage, attachments);

  // Get response with full history
  const reply = await callLLM(agentKey, userMessage, history);

  // Save assistant response to history
  addToConversation(channelName, "assistant", reply);

  // Show actual LLM used (accounting for fallback)
  let llmUsed = agent.llm || DEFAULT_LLM;
  if (llmUsed === "gemini" && !GEMINI_AVAILABLE) llmUsed = "claude";
  const llmIcon = llmUsed === "gemini" ? "💎" : "🤖";
  await say(`🧠 *${agent.name}* ${llmIcon}\n_${agent.role}_\n\n${reply}`);
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

  const summary = await callLLM("cos", summaryPrompt, []);

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
