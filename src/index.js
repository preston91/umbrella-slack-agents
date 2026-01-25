// src/index.js

const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
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

/* --------------------------------
   MEMORY (IN-MEMORY, SIMPLE + SAFE)
-------------------------------- */
const MEMORY = {
  events: [],
  tasks: [],
};

/* --------------------------------
   AGENTS (SOURCE OF TRUTH)
-------------------------------- */
const AGENTS = {
  cos: {
    name: "Umbrella COS",
    role: "Coordinates, clarifies, routes work",
    systemPrompt: `
You are my Chief of Staff.

You act as central command.
You do not execute tasks yourself.
You assign, track, summarize, and escalate.

Every response must end with:
1) What moved
2) What’s blocked
3) What needs my decision
`,
  },
  relationships: {
    name: "Umbrella Relationships",
    role: "Trust & influence mapping",
    systemPrompt: `
You are my Relationship Intelligence Agent.
You track people, context, timing, leverage.
You never send messages yourself.
You advise strategically.
`,
  },
  fundraising: {
    name: "Umbrella Fundraising",
    role: "Investor strategy & capital",
    systemPrompt: `
You are the Fundraising Lead.
Investor-grade only.
No fabricated metrics.
Coordinate with Ops + Relationships.
`,
  },
  revenue: {
    name: "Umbrella Revenue",
    role: "Sales & growth",
    systemPrompt: `
You are the CRO.
Focus on revenue, pricing, deal structure.
Assume sales are political.
`,
  },
  product_cs: {
    name: "Umbrella Product / CS",
    role: "Product adoption & retention",
    systemPrompt: `
You own product and customer success.
Optimize for adoption, clarity, simplicity.
`,
  },
  ops: {
    name: "Umbrella Ops",
    role: "Finance, HR, execution",
    systemPrompt: `
You are Ops / Finance / HR.
Be conservative and precise.
Flag risks early.
`,
  },
  deals: {
    name: "Umbrella UHG",
    role: "Deals & opportunity capture",
    systemPrompt: `
You are the UHG operator.
Think asymmetric upside.
Do not chase low leverage.
`,
  },
};

/* --------------------------------
   CHANNEL → AGENT MAP
-------------------------------- */
const CHANNEL_AGENT_MAP = {
  "cos-command": "cos",
  "relationships": "relationships",
  "fundraising": "fundraising",
  "product-revenue": "revenue",
  "product-cs": "product_cs",
  "ops-finance": "ops",
  "uhg-deals": "deals",
};

/* --------------------------------
   HELPERS
-------------------------------- */
const cleanText = (text) =>
  text.replace(/<@.*?>/g, "").trim();

async function callClaude(agentKey, userText) {
  const agent = AGENTS[agentKey];

  const response = await anthropic.messages.create({
    model:"claude-sonnet-4-5-20250929",
    max_tokens: 600,
    system: agent.systemPrompt,
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
  });

  return response.content[0].text;
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

  MEMORY.tasks.push({
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

  MEMORY.events.push({
    channel: channelName,
    agent: agentKey,
    text,
    time: new Date().toISOString(),
  });

  console.log(`MENTION in #${channelName}:`, text);

  if (agentKey === "cos") {
    const routed = await handleCOSRouting(text, client, say);
    if (routed) return;
  }

  const reply = await callClaude(agentKey, text);

  await say(`🧠 *${agent.name} online*\n_${agent.role}_\n\n${reply}`);
});

/* --------------------------------
   DAILY COS SUMMARY (EVERY 24H)
-------------------------------- */
setInterval(async () => {
  const summaryPrompt = `
Summarize the last 24 hours.

Events:
${MEMORY.events.map(e => `- ${e.channel}: ${e.text}`).join("\n")}

Tasks:
${MEMORY.tasks.map(t => `- ${t.to}: ${t.task}`).join("\n")}
`;

  const summary = await callClaude("cos", summaryPrompt);

  await app.client.chat.postMessage({
    channel: "#cos-command",
    text: `📊 *Daily COS Summary*\n\n${summary}`,
  });

  MEMORY.events = [];
  MEMORY.tasks = [];
}, 1000 * 60 * 60 * 24);

/* --------------------------------
   START
-------------------------------- */
(async () => {
  await app.start();
  console.log("⚡ Umbrella agent is live in Slack");
})();


