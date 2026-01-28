// src/config/channels.js

const CHANNEL_AGENT_MAP = {
  "cos-command": "cos",
  "relationships": "relationships",
  "fundraising": "fundraising",
  "product-revenue": "revenue",
  "product-cs": "product_cs",
  "ops-finance": "ops",
  "uhg-deals": "deals",
};

// Reverse lookup: agent key -> channel name
const AGENT_CHANNEL_MAP = Object.fromEntries(
  Object.entries(CHANNEL_AGENT_MAP).map(([channel, agent]) => [agent, channel])
);

module.exports = { CHANNEL_AGENT_MAP, AGENT_CHANNEL_MAP };
