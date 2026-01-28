// src/handlers/routing.js

const { AGENTS } = require("../config/agents");
const { AGENT_CHANNEL_MAP } = require("../config/channels");
const { logTask } = require("../services/memory");

async function handleCOSRouting(text, client, say) {
  const match = text.match(/^assign\s+(\w+)\s*:\s*(.*)$/i);
  if (!match) return false;

  const targetKey = match[1].toLowerCase();
  const task = match[2];

  const channelName = AGENT_CHANNEL_MAP[targetKey];

  if (!channelName) {
    await say(`Unable to route - unknown agent "${targetKey}"`);
    return true;
  }

  const targetAgent = AGENTS[targetKey];
  if (!targetAgent) {
    await say(`Unable to route - agent "${targetKey}" not configured`);
    return true;
  }

  logTask("COS", targetKey, task);

  try {
    await client.chat.postMessage({
      channel: `#${channelName}`,
      text: `*Task from COS*\n${task}`,
    });

    await say(`Routed to *${targetAgent.name}*`);
  } catch (error) {
    console.error("Failed to route task:", error.message);
    await say(`Failed to route task: ${error.message}`);
  }

  return true;
}

module.exports = { handleCOSRouting };
