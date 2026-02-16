// src/handlers/routing.js
// Inter-agent communication - ALL agents can route to each other

const { AGENTS } = require("../config/agents");
const { AGENT_CHANNEL_MAP } = require("../config/channels");
const { logTask } = require("../services/memory");

// Route patterns that any agent can use
const ROUTE_PATTERNS = [
  /^assign\s+(\w+)\s*:\s*(.*)$/i,           // "assign uhg: task"
  /^@(\w+)\s*[:-]?\s*(.*)$/i,               // "@uhg task" or "@uhg: task"
  /^route\s+(?:to\s+)?(\w+)\s*:\s*(.*)$/i,  // "route to uhg: task"
  /^handoff\s+(?:to\s+)?(\w+)\s*:\s*(.*)$/i, // "handoff to uhg: task"
];

// Agent name aliases for flexible routing
const AGENT_ALIASES = {
  // UHG/Deals
  uhg: "deals",
  deals: "deals",
  // Moments
  moments: "moments",
  opportunity: "moments",
  opportunities: "moments",
  // Relationships
  relationships: "relationships",
  rel: "relationships",
  intros: "relationships",
  // Revenue
  revenue: "revenue",
  sales: "revenue",
  product: "revenue",
  // COS
  cos: "cos",
  chief: "cos",
  command: "cos",
  // Ops
  ops: "ops",
  finance: "ops",
  hr: "ops",
  // Fundraising
  fundraising: "fundraising",
  investors: "fundraising",
  // Product CS
  product_cs: "product_cs",
  cs: "product_cs",
  support: "product_cs",
  // Content
  content: "content",
  signal: "content",
  substack: "content",
  voice: "content",
};

async function handleAgentRouting(text, fromAgent, client, say) {
  // Try each pattern
  let match = null;
  for (const pattern of ROUTE_PATTERNS) {
    match = text.match(pattern);
    if (match) break;
  }

  if (!match) return false;

  const targetAlias = match[1].toLowerCase();
  const task = match[2];

  // Resolve alias to actual agent key
  const targetKey = AGENT_ALIASES[targetAlias];
  if (!targetKey) {
    await say(`Unable to route - unknown agent "${targetAlias}". Try: uhg, moments, relationships, revenue, cos, ops, fundraising, content`);
    return true;
  }

  // Prevent self-routing
  if (targetKey === fromAgent) {
    await say(`That's you! No need to route to yourself.`);
    return true;
  }

  const channelName = AGENT_CHANNEL_MAP[targetKey];
  if (!channelName) {
    await say(`Unable to route - no channel configured for "${targetKey}"`);
    return true;
  }

  const targetAgent = AGENTS[targetKey];
  if (!targetAgent) {
    await say(`Unable to route - agent "${targetKey}" not configured`);
    return true;
  }

  const fromAgentName = AGENTS[fromAgent]?.name || fromAgent;

  await logTask(fromAgent, targetKey, task);

  try {
    await client.chat.postMessage({
      channel: `#${channelName}`,
      text: `*Handoff from ${fromAgentName}*\n\n${task}`,
    });

    await say(`Routed to *${targetAgent.name}* in #${channelName}`);
  } catch (error) {
    console.error("Failed to route task:", error.message);
    await say(`Failed to route: ${error.message}`);
  }

  return true;
}

// Legacy function for backwards compatibility
async function handleCOSRouting(text, client, say) {
  return handleAgentRouting(text, "cos", client, say);
}

module.exports = { handleCOSRouting, handleAgentRouting };
