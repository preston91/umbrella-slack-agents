// src/index.js

require("dotenv").config();

const { App } = require("@slack/bolt");
const cron = require("node-cron");
const { validateEnv } = require("./utils/env");
const { initClaude, askClaude } = require("./services/claude");
const { initGemini } = require("./services/gemini");
const { initSupabase } = require("./services/supabase");
const { getSummaryData, clearAll } = require("./services/memory");
const { registerMentionHandler } = require("./handlers/mentions");
const { AGENTS } = require("./config/agents");
const {
  getUpcomingEvents,
  getCurrentBrandCycle,
  formatEventForSlack,
} = require("./data/cultural-calendar");

// Validate environment and get config
const env = validateEnv();

// Initialize AI clients
initClaude(env.anthropic.apiKey);
initGemini(env.gemini.apiKey);

// Initialize Supabase (optional - falls back to in-memory)
initSupabase(env.supabase.url, env.supabase.serviceKey);

// Initialize Slack app
const app = new App({
  token: env.slack.botToken,
  signingSecret: env.slack.signingSecret,
  socketMode: true,
  appToken: env.slack.appToken,
});

// Register handlers
registerMentionHandler(app);

// ===== DAILY 9AM CT TASKS =====
// Cron: "0 9 * * *" = 9:00am every day
// Timezone: America/Chicago (Central Time)

cron.schedule(
  "0 9 * * *",
  async () => {
    console.log("Running 9am daily tasks...");

    // 1. COS Daily Summary
    const { events, tasks } = await getSummaryData();
    if (events.length > 0 || tasks.length > 0) {
      const summaryPrompt = `Summarize the last 24 hours.

Events:
${events.map((e) => `- ${e.channel}: ${e.text}`).join("\n") || "None"}

Tasks:
${tasks.map((t) => `- ${t.assigned_to}: ${t.description} [${t.status}]`).join("\n") || "None"}`;

      const cosResult = await askClaude(
        AGENTS.cos.systemPrompt,
        summaryPrompt
      );

      if (cosResult.success) {
        await postToChannel("#cos-command", `*Daily COS Summary*\n\n${cosResult.text}`);
      }
    }

    // 2. Product Revenue Agent - Daily Prospecting
    const revenuePrompt = `It's 9am. Time for your daily prospecting tasks.

Generate your morning output:
1. List 5 email drafts to prospects (existing warm leads first)
2. List 5 LinkedIn message drafts to prospects
3. For each, explain who they are and why now
4. What should Preston prioritize sending first?

Focus on anyone who mentioned workflow problems, automation, or "too many tools".`;

    const revenueResult = await askClaude(
      AGENTS.revenue.systemPrompt,
      revenuePrompt
    );

    if (revenueResult.success) {
      await postToChannel("#product-revenue", `*Daily Prospecting - 9am*\n\n${revenueResult.text}`);
    }

    // 3. UHG Deals Agent - Daily Pipeline
    const uhgPrompt = `It's 9am. Time for your daily pipeline review.

Generate your morning output:
1. 3 email drafts for UHG prospects (fundraising, app builds, advisory)
2. 3 LinkedIn messages for UHG prospects
3. Summary of what moved in each active deal
4. What does Preston need to do TODAY to move deals forward?

Focus on: Profluence, Malcolm Jenkins, Fred's intros, anyone raising money.`;

    const uhgResult = await askClaude(
      AGENTS.deals.systemPrompt,
      uhgPrompt
    );

    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*Daily Pipeline - 9am*\n\n${uhgResult.text}`);
    }

    // 4. Moments Agent - Daily Opportunity Scan
    const upcomingWeek = getUpcomingEvents(7);
    const upcoming30Days = getUpcomingEvents(30);
    const brandCycles = getCurrentBrandCycle();

    const momentsPrompt = `It's 9am. Time for your daily opportunity scan.

*CULTURAL CALENDAR DATA:*

*This Week's Events (next 7 days):*
${upcomingWeek.length > 0 ? upcomingWeek.map(formatEventForSlack).join("\n\n") : "No major events this week"}

*30-Day Pipeline:*
${upcoming30Days.length > 0 ? upcoming30Days.map(formatEventForSlack).join("\n\n") : "No major events in next 30 days"}

*Current Brand Cycles:*
${brandCycles.map((c) => `- *${c.name}*: ${c.description}. Action: ${c.action}`).join("\n")}

Generate your morning output based on this calendar data:
1. *This Week's Hot Moments* - Which events should we be actively pitching RIGHT NOW?
2. *Opportunity Alerts* - Any urgent talent + event + brand matches to flag?
3. *What's Getting Urgent* - Anything approaching lead time cutoff?

For each opportunity, specify:
- The talent/brand match
- Estimated deal value
- What UHG earns
- Who needs to take action (Relationships, UHG, Revenue)`;

    const momentsResult = await askClaude(
      AGENTS.moments.systemPrompt,
      momentsPrompt
    );

    if (momentsResult.success) {
      await postToChannel("#moments", `*Daily Opportunity Scan - 9am*\n\n${momentsResult.text}`);
    }

    clearAll();
    console.log("9am daily tasks completed");
  },
  {
    timezone: "America/Chicago",
  }
);

// Helper to post to channel
async function postToChannel(channel, text) {
  try {
    await app.client.chat.postMessage({ channel, text });
  } catch (error) {
    console.error(`Failed to post to ${channel}:`, error.message);
  }
}

// Start
(async () => {
  await app.start();
  console.log("Umbrella agents online");
  console.log("Daily tasks scheduled for 9am CT");
})();
