// src/index.js
// Umbrella AI Agents - Main Application

const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config();

// Import new modules
const { getDb, closeDb } = require('./storage/db');
const { ChannelSummary, DecisionLog, Task, FollowUp, Memory } = require('./storage/models');
const Summarizer = require('./agents/summarizer');
const ExecutionAgents = require('./agents/executor');
const { LongTermMemory, ENTITY_TYPES } = require('./memory');
const GmailIntegration = require('./integrations/gmail');
const LinkedInIntegration = require('./integrations/linkedin');
const CalendarIntegration = require('./integrations/calendar');
const DocsIntegration = require('./integrations/docs');

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

// Initialize database
const db = getDb();

// Initialize agents and integrations
const summarizer = new Summarizer(anthropic);
const executor = new ExecutionAgents(anthropic);
const memory = new LongTermMemory(anthropic);

// Optional integrations (configured via env vars)
const gmail = new GmailIntegration({ anthropic });
const linkedin = new LinkedInIntegration({ anthropic });
const calendar = new CalendarIntegration({ anthropic });
const docs = new DocsIntegration({ anthropic });

/* --------------------------------
   IN-MEMORY EVENT LOG (for daily summary)
-------------------------------- */
const EVENT_LOG = {
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
2) What's blocked
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
const cleanText = (text) => text.replace(/<@.*?>/g, "").trim();

async function callClaude(agentKey, userText, contextMemory = null) {
  const agent = AGENTS[agentKey];
  let systemPrompt = agent.systemPrompt;

  // Inject relevant memory context if available
  if (contextMemory) {
    systemPrompt += `\n\n## Relevant Context\n${contextMemory}`;
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 800,
    system: systemPrompt,
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
   COS COMMANDS
-------------------------------- */
const COS_COMMANDS = {
  // Assign task to another agent
  async assign(args, client, say) {
    const match = args.match(/^(\w+)\s*:\s*(.*)$/);
    if (!match) {
      await say("⚠️ Usage: `assign <agent>: <task>`");
      return true;
    }

    const [, targetKey, task] = match;
    const channelEntry = Object.entries(CHANNEL_AGENT_MAP).find(
      ([_, agent]) => agent === targetKey.toLowerCase()
    );

    if (!channelEntry) {
      await say(`⚠️ Unknown agent "${targetKey}"`);
      return true;
    }

    const [channelName] = channelEntry;

    // Log task
    EVENT_LOG.tasks.push({
      from: "COS",
      to: targetKey,
      task,
      time: new Date().toISOString(),
    });

    // Save to database
    Task.create({
      type: 'assignment',
      title: task.substring(0, 100),
      description: task,
      assigned_agent: targetKey.toLowerCase(),
      metadata: { source: 'cos_routing' }
    });

    await client.chat.postMessage({
      channel: `#${channelName}`,
      text: `📌 *Task from COS*\n${task}`,
    });

    await say(`✅ Routed to *${AGENTS[targetKey.toLowerCase()]?.name || targetKey}*`);
    return true;
  },

  // Summarize a channel
  async summarize(args, client, say) {
    const channelName = args.trim() || 'cos-command';
    await say(`🔄 Generating summary for #${channelName}...`);

    try {
      // Get channel ID
      const channels = await client.conversations.list({ types: 'public_channel' });
      const channel = channels.channels.find(c => c.name === channelName);

      if (!channel) {
        await say(`⚠️ Channel #${channelName} not found`);
        return true;
      }

      const result = await summarizer.processChannel(client, channel.id, channelName);

      if (result.summary) {
        await say(`📝 *Channel Summary for #${channelName}*\n\n${result.summary.summary}`);

        if (result.decisions.length > 0) {
          await say(`📋 *Extracted ${result.decisions.length} decision(s)* and saved to decision log.`);
        }
      } else {
        await say(`ℹ️ No recent messages to summarize in #${channelName}`);
      }
    } catch (e) {
      console.error('Summarize error:', e);
      await say(`⚠️ Failed to summarize: ${e.message}`);
    }

    return true;
  },

  // Show recent decisions
  async decisions(args, client, say) {
    const decisions = DecisionLog.getActive();

    if (decisions.length === 0) {
      await say("📋 No active decisions logged yet.");
      return true;
    }

    let response = "📋 *Recent Decisions*\n\n";
    for (const d of decisions.slice(0, 10)) {
      response += `• *${d.decision}*\n`;
      if (d.context) response += `  _Context: ${d.context}_\n`;
      if (d.made_by) response += `  _By: ${d.made_by}_\n`;
      response += `  _${new Date(d.created_at).toLocaleDateString()}_\n\n`;
    }

    await say(response);
    return true;
  },

  // Show follow-ups
  async followups(args, client, say) {
    const days = parseInt(args) || 7;
    const followUps = FollowUp.getUpcoming(days);

    if (followUps.length === 0) {
      await say(`📅 No follow-ups scheduled for the next ${days} days.`);
      return true;
    }

    let response = `📅 *Upcoming Follow-ups (${days} days)*\n\n`;
    for (const f of followUps) {
      const dueDate = new Date(f.scheduled_for).toLocaleDateString();
      response += `• *${f.entity_name || f.entity_id}*: ${f.action}\n`;
      response += `  _Due: ${dueDate}_ | _Type: ${f.entity_type}_\n\n`;
    }

    await say(response);
    return true;
  },

  // Remember something about an entity
  async remember(args, client, say) {
    const match = args.match(/^(\w+)\s+([^:]+):\s*(.+)$/);
    if (!match) {
      await say("⚠️ Usage: `remember <type> <name>: <fact>`\nTypes: client, deal, partner, investor");
      return true;
    }

    const [, type, name, fact] = match;
    const validTypes = Object.values(ENTITY_TYPES);

    if (!validTypes.includes(type.toLowerCase())) {
      await say(`⚠️ Invalid type. Use one of: ${validTypes.join(', ')}`);
      return true;
    }

    memory.remember(type.toLowerCase(), name.trim(), `fact_${Date.now()}`, fact.trim(), {
      source: 'slack_command'
    });

    await say(`🧠 Remembered about ${name}: "${fact}"`);
    return true;
  },

  // Recall information about an entity
  async recall(args, client, say) {
    const match = args.match(/^(\w+)\s+(.+)$/);
    if (!match) {
      await say("⚠️ Usage: `recall <type> <name>`");
      return true;
    }

    const [, type, name] = match;
    const context = memory.buildContext(type.toLowerCase(), name.trim());

    if (context.includes('###')) {
      await say(`🧠 *What I know about ${name}*\n\n${context}`);
    } else {
      await say(`🤔 I don't have any stored information about ${name} yet.`);
    }

    return true;
  },

  // Schedule a follow-up
  async followup(args, client, say) {
    const match = args.match(/^([^:]+):\s*(.+?)\s+in\s+(\d+)\s*(day|week|month)s?$/i);
    if (!match) {
      await say("⚠️ Usage: `followup <entity>: <action> in <N> days/weeks`");
      return true;
    }

    const [, entity, action, num, unit] = match;
    const days = unit.toLowerCase() === 'week' ? parseInt(num) * 7
      : unit.toLowerCase() === 'month' ? parseInt(num) * 30
      : parseInt(num);

    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + days);

    FollowUp.create({
      entity_type: 'general',
      entity_id: entity.toLowerCase().replace(/\s+/g, '-'),
      entity_name: entity.trim(),
      action: action.trim(),
      reason: 'Manually scheduled via Slack',
      scheduled_for: scheduledFor.toISOString()
    });

    await say(`📅 Follow-up scheduled: "${action}" for ${entity} on ${scheduledFor.toLocaleDateString()}`);
    return true;
  },

  // Create a document
  async doc(args, client, say) {
    const match = args.match(/^(\w+)\s+(.+)$/);
    if (!match) {
      await say("⚠️ Usage: `doc <type> <description>`\nTypes: memo, proposal, brief, report, agenda, notes");
      return true;
    }

    const [, type, description] = match;
    await say(`📄 Creating ${type}...`);

    try {
      const result = await docs.generateDocument(description, type);
      await say(`📄 *Document Created*\n\n*${result.localDoc.title}*\n\n${result.content.substring(0, 500)}...`);
    } catch (e) {
      await say(`⚠️ Failed to create document: ${e.message}`);
    }

    return true;
  },

  // Draft an email
  async email(args, client, say) {
    const match = args.match(/^to\s+([^\s:]+)\s*:\s*(.+)$/i);
    if (!match) {
      await say("⚠️ Usage: `email to <recipient>: <request>`");
      return true;
    }

    const [, recipient, request] = match;
    await say(`✉️ Drafting email...`);

    try {
      const result = await gmail.draftEmail(request, { to: recipient.trim() });
      await say(`✉️ *Email Draft*\n\n*To:* ${recipient}\n*Subject:* ${result.subject}\n\n${result.body}`);
    } catch (e) {
      await say(`⚠️ Failed to draft email: ${e.message}`);
    }

    return true;
  },

  // Help command
  async help(args, client, say) {
    const helpText = `
*🤖 COS Commands*

*Task Management*
• \`assign <agent>: <task>\` - Route task to an agent
• \`followup <entity>: <action> in <N> days\` - Schedule follow-up
• \`followups [days]\` - Show upcoming follow-ups

*Knowledge & Memory*
• \`remember <type> <name>: <fact>\` - Store information
• \`recall <type> <name>\` - Retrieve stored information
• \`decisions\` - Show recent decisions

*Content Creation*
• \`summarize [channel]\` - Summarize channel activity
• \`doc <type> <description>\` - Create a document
• \`email to <recipient>: <request>\` - Draft an email

*Types:* client, deal, partner, investor, project
*Doc types:* memo, proposal, brief, report, agenda, notes
*Agents:* cos, relationships, fundraising, revenue, product_cs, ops, deals
`;

    await say(helpText);
    return true;
  }
};

/* --------------------------------
   COS COMMAND HANDLER
-------------------------------- */
async function handleCOSCommand(text, client, say) {
  const parts = text.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1).join(' ');

  // Check for legacy assign format
  if (text.match(/^assign\s+\w+\s*:/i)) {
    return COS_COMMANDS.assign(text.replace(/^assign\s+/i, ''), client, say);
  }

  if (COS_COMMANDS[command]) {
    return COS_COMMANDS[command](args, client, say);
  }

  return false;
}

/* --------------------------------
   LISTEN TO MENTIONS
-------------------------------- */
app.event("app_mention", async ({ event, say, client }) => {
  try {
    const channelInfo = await client.conversations.info({
      channel: event.channel,
    });

    const channelName = channelInfo.channel.name;
    const agentKey = CHANNEL_AGENT_MAP[channelName] || "cos";
    const agent = AGENTS[agentKey];
    const text = cleanText(event.text);

    // Log event
    EVENT_LOG.events.push({
      channel: channelName,
      agent: agentKey,
      text,
      time: new Date().toISOString(),
    });

    console.log(`MENTION in #${channelName}:`, text);

    // Try to extract memories from the message
    memory.extractMemories(text, `slack:#${channelName}`).catch(e => {
      console.error('Memory extraction error:', e.message);
    });

    // Handle COS commands
    if (agentKey === "cos") {
      const handled = await handleCOSCommand(text, client, say);
      if (handled) return;
    }

    // Extract any tasks mentioned
    executor.extractTasks(text, channelName).catch(e => {
      console.error('Task extraction error:', e.message);
    });

    // Get relevant memory context for the agent
    let contextMemory = null;
    if (agentKey === 'relationships' || agentKey === 'deals' || agentKey === 'fundraising') {
      // Try to find relevant entity mentions
      const searchResults = memory.searchAcrossEntities(text);
      if (searchResults.length > 0) {
        const topEntity = searchResults[0];
        contextMemory = memory.buildContext(topEntity.entity_type, topEntity.entity_name || topEntity.entity_id);
      }
    }

    // Call the appropriate agent
    const reply = await callClaude(agentKey, text, contextMemory);

    await say(`🧠 *${agent.name} online*\n_${agent.role}_\n\n${reply}`);

  } catch (error) {
    console.error('Error handling mention:', error);
    await say(`⚠️ Sorry, I encountered an error: ${error.message}`);
  }
});

/* --------------------------------
   SCHEDULED TASKS
-------------------------------- */

// Daily summary (every 24 hours)
setInterval(async () => {
  try {
    console.log('📊 Running daily summary...');

    const summaryPrompt = `
Summarize the last 24 hours.

Events:
${EVENT_LOG.events.map(e => `- ${e.channel}: ${e.text}`).join("\n")}

Tasks:
${EVENT_LOG.tasks.map(t => `- ${t.to}: ${t.task}`).join("\n")}
`;

    const summary = await callClaude("cos", summaryPrompt);

    // Save summary to database
    ChannelSummary.create({
      channel_name: 'cos-command',
      summary,
      period_start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date().toISOString(),
      message_count: EVENT_LOG.events.length
    });

    await app.client.chat.postMessage({
      channel: "#cos-command",
      text: `📊 *Daily COS Summary*\n\n${summary}`,
    });

    // Clear event log
    EVENT_LOG.events = [];
    EVENT_LOG.tasks = [];

    console.log('📊 Daily summary posted');
  } catch (e) {
    console.error('Daily summary error:', e);
  }
}, 1000 * 60 * 60 * 24);

// Follow-up checker (every hour)
setInterval(async () => {
  try {
    const dueFollowUps = FollowUp.getDue();

    for (const f of dueFollowUps) {
      await app.client.chat.postMessage({
        channel: "#cos-command",
        text: `📅 *Follow-up Due*\n\n*${f.entity_name || f.entity_id}*\n${f.action}\n\n_Reason: ${f.reason || 'Scheduled follow-up'}_`,
      });

      // Mark as completed (or you could mark as 'notified' and wait for confirmation)
      FollowUp.complete(f.id);
    }

    if (dueFollowUps.length > 0) {
      console.log(`📅 Processed ${dueFollowUps.length} due follow-ups`);
    }
  } catch (e) {
    console.error('Follow-up check error:', e);
  }
}, 1000 * 60 * 60);

/* --------------------------------
   GRACEFUL SHUTDOWN
-------------------------------- */
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  closeDb();
  process.exit(0);
});

/* --------------------------------
   START
-------------------------------- */
(async () => {
  await app.start();
  console.log("⚡ Umbrella agent is live in Slack");
  console.log("📦 Database initialized");
  console.log("🧠 Long-term memory active");
  console.log("📊 Scheduled tasks running");

  // Log memory stats on startup
  const stats = memory.getMemoryStats();
  console.log('📈 Memory stats:', stats);
})();
