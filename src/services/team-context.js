// src/services/team-context.js
// Enables agents to see each other's work and collaborate

const { getConversation, getSummaryData } = require("./memory");
const { CHANNEL_AGENT_MAP, AGENT_CHANNEL_MAP } = require("../config/channels");
const { getNetworkSummary, getAllTalent, getOpportunities } = require("./talent-network");

// Get activity from all agent channels for cross-agent awareness
async function getTeamContext(hours = 8) {
  const context = {
    channels: {},
    summary: "",
    talentMentioned: [],
    pendingHandoffs: [],
  };

  // Get recent activity from all channels
  for (const [channelName, agentKey] of Object.entries(CHANNEL_AGENT_MAP)) {
    const messages = await getConversation(channelName);
    const recentMessages = messages.filter(msg => {
      const msgTime = new Date(msg.timestamp);
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      return msgTime >= cutoff;
    });

    if (recentMessages.length > 0) {
      context.channels[channelName] = {
        agent: agentKey,
        messageCount: recentMessages.length,
        lastActivity: recentMessages[recentMessages.length - 1]?.timestamp,
        recentMessages: recentMessages.slice(-5).map(m => ({
          role: m.role,
          content: m.content?.substring(0, 300) + (m.content?.length > 300 ? "..." : ""),
          time: m.timestamp,
        })),
      };
    }
  }

  // Build summary text for agent context
  let summaryParts = [];
  for (const [channel, data] of Object.entries(context.channels)) {
    if (data.messageCount > 0) {
      summaryParts.push(`*#${channel}* (${data.agent}): ${data.messageCount} messages`);
      // Include key snippets
      const snippets = data.recentMessages
        .filter(m => m.role === "assistant")
        .slice(-2)
        .map(m => `  - "${m.content}"`);
      if (snippets.length > 0) {
        summaryParts.push(...snippets);
      }
    }
  }
  context.summary = summaryParts.join("\n");

  return context;
}

// Get formatted team activity for injecting into prompts
async function getTeamActivityPrompt(forAgent, hours = 4) {
  const context = await getTeamContext(hours);
  const network = await getNetworkSummary();

  let prompt = `\n*TEAM ACTIVITY (last ${hours} hours):*\n`;

  // Add channel summaries (excluding the requesting agent's own channel)
  const agentChannel = AGENT_CHANNEL_MAP[forAgent];
  for (const [channel, data] of Object.entries(context.channels)) {
    if (channel !== agentChannel && data.messageCount > 0) {
      prompt += `\n*#${channel}*:\n`;
      data.recentMessages
        .filter(m => m.role === "assistant")
        .slice(-2)
        .forEach(m => {
          prompt += `- ${m.content}\n`;
        });
    }
  }

  // Add talent network summary
  if (network.talentCount > 0) {
    prompt += `\n*TALENT NETWORK* (${network.talentCount} in database):\n`;
    network.talent.slice(0, 5).forEach(t => {
      prompt += `- ${t.name} (${t.type || "talent"}): ${t.notes || "No notes"}\n`;
    });
  }

  // Add active opportunities
  if (network.activeOpportunities > 0) {
    prompt += `\n*ACTIVE OPPORTUNITIES* (${network.activeOpportunities}):\n`;
    network.recentOpportunities
      .filter(o => !["closed", "lost"].includes(o.status))
      .slice(0, 5)
      .forEach(o => {
        prompt += `- ${o.talent_name} x ${o.brand_name || o.moment}: ${o.status} (${o.urgency})\n`;
      });
  }

  return prompt;
}

// Scan conversations for talent mentions
async function scanForTalentMentions(hours = 24) {
  const { events } = await getSummaryData(hours);
  const mentions = [];

  // Common patterns that indicate talent mentions
  const patterns = [
    /just signed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /new talent[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /(?:working with|met with|talking to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is interested|wants to|could be)/gi,
  ];

  for (const event of events) {
    if (!event.text) continue;

    for (const pattern of patterns) {
      const matches = event.text.matchAll(pattern);
      for (const match of matches) {
        const name = match[1]?.trim();
        if (name && name.length > 2 && !commonWords.includes(name.toLowerCase())) {
          mentions.push({
            name,
            source: event.channel,
            context: event.text.substring(0, 200),
            time: event.time,
          });
        }
      }
    }
  }

  return mentions;
}

// Words to exclude from talent detection
const commonWords = [
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "its", "may", "new", "now", "old", "see", "way", "who", "did",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december",
  "today", "tomorrow", "yesterday", "morning", "afternoon", "evening",
  "preston", "umbrella", // Exclude common workspace names
];

// Get pending handoffs between agents
async function getPendingHandoffs(toAgent) {
  const { events } = await getSummaryData(8);
  const handoffs = [];

  // Look for @mentions of agents in messages
  const agentMentions = {
    uhg: ["@uhg", "@deals", "hand off to uhg", "route to uhg"],
    moments: ["@moments", "opportunity for moments"],
    relationships: ["@relationships", "@rel", "need intro", "intro path"],
    cos: ["@cos", "escalate", "needs preston"],
    revenue: ["@revenue", "product prospect"],
  };

  const patterns = agentMentions[toAgent] || [];

  for (const event of events) {
    if (!event.text) continue;
    const textLower = event.text.toLowerCase();

    for (const pattern of patterns) {
      if (textLower.includes(pattern)) {
        handoffs.push({
          from: event.agent || event.channel,
          content: event.text.substring(0, 300),
          time: event.time,
        });
        break;
      }
    }
  }

  return handoffs;
}

// Format talent for context injection
async function getTalentContextPrompt() {
  const talent = await getAllTalent();
  if (talent.length === 0) {
    return "\n*TALENT NETWORK:* No talent in database yet. Add talent when mentioned using the addTalent function.\n";
  }

  let prompt = `\n*TALENT NETWORK (${talent.length} profiles):*\n`;
  for (const t of talent.slice(0, 10)) {
    prompt += `- *${t.name}* (${t.type || "talent"})\n`;
    if (t.profile) prompt += `  Profile: ${t.profile}\n`;
    if (t.demographics) prompt += `  Demo: ${t.demographics}\n`;
    if (t.brand_history) prompt += `  Brands: ${t.brand_history}\n`;
    if (t.deal_openness) prompt += `  Open to: ${t.deal_openness}\n`;
  }

  return prompt;
}

// Format opportunities for context injection
async function getOpportunitiesContextPrompt() {
  const opps = await getOpportunities();
  const active = opps.filter(o => !["closed", "lost"].includes(o.status));

  if (active.length === 0) {
    return "\n*OPPORTUNITIES:* No active opportunities. Create them when you identify talent + moment + brand matches.\n";
  }

  let prompt = `\n*ACTIVE OPPORTUNITIES (${active.length}):*\n`;
  for (const o of active.slice(0, 10)) {
    const urgencyIcon = o.urgency === "urgent" ? "!!" : o.urgency === "high" ? "!" : "";
    prompt += `- ${urgencyIcon}*${o.talent_name}* x ${o.brand_name || "TBD"} @ ${o.moment}\n`;
    prompt += `  Status: ${o.status} | Value: ${o.estimated_value || "TBD"} | Assigned: ${o.assigned_to}\n`;
  }

  return prompt;
}

module.exports = {
  getTeamContext,
  getTeamActivityPrompt,
  scanForTalentMentions,
  getPendingHandoffs,
  getTalentContextPrompt,
  getOpportunitiesContextPrompt,
};
