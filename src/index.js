// src/index.js

require("dotenv").config();

const { App } = require("@slack/bolt");
const cron = require("node-cron");
const { validateEnv } = require("./utils/env");
const { initClaude, askClaude, askClaudeWithSearch } = require("./services/claude");
const { initGemini } = require("./services/gemini");
const { initSupabase } = require("./services/supabase");
const { getSummaryData, clearAll } = require("./services/memory");
const { registerMentionHandler, registerDMHandler } = require("./handlers/mentions");
const { AGENTS, getDateContext } = require("./config/agents");
const {
  getUpcomingEvents,
  getCurrentBrandCycle,
  formatEventForSlack,
  getHeritageMonths,
  getCulturalMomentsForMonth,
} = require("./data/cultural-calendar");
const {
  getTeamActivityPrompt,
  scanForTalentMentions,
  getPendingHandoffs,
  getTalentContextPrompt,
  getOpportunitiesContextPrompt,
} = require("./services/team-context");
const {
  getAllTalent,
  getOpportunities,
  addTalent,
} = require("./services/talent-network");
// Email, Calendar, and Productivity integrations
const { initGmail, isGmailAvailable } = require("./services/gmail");
const { initCalendar, isCalendarAvailable } = require("./services/calendar");
const {
  getProductivityContextPrompt,
  generateMorningBriefing,
  generateTeamMeetingUpdates,
  getMeetingAlert,
  runDailySync,
  formatBriefingForSlack,
} = require("./services/productivity");
const { syncFollowUps, getHighPriorityFollowUps } = require("./services/followups");

// Validate environment and get config
const env = validateEnv();

// Initialize AI clients
initClaude(env.anthropic.apiKey);
initGemini(env.gemini.apiKey);

// Initialize Supabase (optional - falls back to in-memory)
initSupabase(env.supabase.url, env.supabase.serviceKey);

// Initialize Gmail & Calendar (optional - for email/calendar integration)
// This is done async in the startup function below
const hasGoogleAuth = env.google.clientId && env.google.clientSecret && env.google.refreshToken;

// Initialize Slack app
const app = new App({
  token: env.slack.botToken,
  signingSecret: env.slack.signingSecret,
  socketMode: true,
  appToken: env.slack.appToken,
});

// Register handlers
registerMentionHandler(app);
registerDMHandler(app); // Handle direct messages to bot

// Helper to post to channel
async function postToChannel(channel, text) {
  try {
    await app.client.chat.postMessage({ channel, text });
  } catch (error) {
    console.error(`Failed to post to ${channel}:`, error.message);
  }
}

// ===== 8-HOUR WORKDAY SCHEDULE (9am - 5pm CT) =====
// All times in America/Chicago timezone

// ===== 8:45 AM - PRE-STANDUP SYNC =====
cron.schedule(
  "45 8 * * 1-5", // Mon-Fri at 8:45am
  async () => {
    console.log("8:45am - Running daily productivity sync...");
    await runDailySync();
    console.log("8:45am - Productivity sync complete");
  },
  { timezone: "America/Chicago" }
);

// ===== 9:00 AM - MORNING STANDUP =====
cron.schedule(
  "0 9 * * 1-5", // Mon-Fri at 9am
  async () => {
    console.log("9am - Morning standup tasks...");

    // Get current date context for all prompts
    const dateContext = getDateContext();

    // Get productivity context (email, calendar, follow-ups)
    const productivityContext = await getProductivityContextPrompt();

    // Generate morning briefing
    const briefing = await generateMorningBriefing();
    if (briefing.sections.length > 0) {
      const briefingMessage = formatBriefingForSlack(briefing);
      await postToChannel("#cos-command", briefingMessage);
    }

    // 1. COS Daily Summary with full productivity context
    const { events, tasks } = await getSummaryData();
    const summaryPrompt = `${dateContext}It's 9am - time for morning standup.

${productivityContext}

${events.length > 0 || tasks.length > 0 ? `*Agent Activity from last 24h:*
${events.map((e) => `- ${e.channel}: ${e.text}`).join("\n") || "None"}

Tasks:
${tasks.map((t) => `- ${t.assigned_to}: ${t.description} [${t.status}]`).join("\n") || "None"}` : "No overnight agent activity to report."}

Based on the calendar, emails, and follow-ups above:
1. What's the most important thing for Preston to handle this morning?
2. Any meetings today that need prep?
3. Any urgent follow-ups that can't wait?
4. What action items from recent calls need attention?`;

    const cosResult = await askClaude(AGENTS.cos.systemPrompt, summaryPrompt);
    if (cosResult.success) {
      await postToChannel("#cos-command", `*Daily Priorities - 9am*\n\n${cosResult.text}`);
    }

    // 2. Product Revenue - Daily Prospecting
    const revenuePrompt = `${dateContext}It's 9am. Time for your daily prospecting tasks.

Generate your morning output:
1. List 5 email drafts to prospects (existing warm leads first)
2. List 5 LinkedIn message drafts to prospects
3. For each, explain who they are and why now
4. What should Preston prioritize sending first?

Focus on anyone who mentioned workflow problems, automation, or "too many tools".`;

    const revenueResult = await askClaude(AGENTS.revenue.systemPrompt, revenuePrompt);
    if (revenueResult.success) {
      await postToChannel("#product-revenue", `*Daily Prospecting - 9am*\n\n${revenueResult.text}`);
    }

    // 3. UHG Deals - Daily Pipeline
    const uhgPrompt = `${dateContext}It's 9am. Time for your daily pipeline review.

Generate your morning output:
1. 3 email drafts for UHG prospects (fundraising, app builds, advisory)
2. 3 LinkedIn messages for UHG prospects
3. Summary of what moved in each active deal
4. What does Preston need to do TODAY to move deals forward?

Focus on: Profluence, Malcolm Jenkins, Fred's intros, anyone raising money.`;

    const uhgResult = await askClaudeWithSearch(AGENTS.deals.systemPrompt, uhgPrompt);
    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*Daily Pipeline - 9am*\n\n${uhgResult.text}`);
    }

    // 4. Moments Agent - Daily Opportunity Scan
    const upcomingWeek = getUpcomingEvents(7);
    const upcoming30Days = getUpcomingEvents(30);
    const brandCycles = getCurrentBrandCycle();
    const currentMonth = new Date().getMonth() + 1;
    const heritageMonths = getHeritageMonths(currentMonth);
    const culturalMoments = getCulturalMomentsForMonth(currentMonth);

    const momentsPrompt = `${dateContext}It's 9am. Time for your daily opportunity scan.

*CULTURAL CALENDAR DATA:*

*Heritage/Awareness Months:*
${heritageMonths.length > 0 ? heritageMonths.map((h) => `- ${h.name} (${h.community})`).join("\n") : "None this month"}

*This Week's Events (next 7 days):*
${upcomingWeek.length > 0 ? upcomingWeek.map(formatEventForSlack).join("\n\n") : "No major events this week"}

*30-Day Pipeline:*
${upcoming30Days.length > 0 ? upcoming30Days.map(formatEventForSlack).join("\n\n") : "No major events in next 30 days"}

*Cultural Moments This Month:*
${culturalMoments.slice(0, 10).map((m) => `- ${m.name} (${m.date})`).join("\n")}

*Current Brand Cycles:*
${brandCycles.map((c) => `- *${c.name}*: ${c.description}. Action: ${c.action}`).join("\n")}

Generate your morning output based on this calendar data:
1. *This Week's Hot Moments* - Which events should we be actively pitching RIGHT NOW?
2. *Opportunity Alerts* - Any urgent talent + event + brand matches to flag?
3. *What's Getting Urgent* - Anything approaching lead time cutoff?
4. *Hand off to UHG* - Tag specific opportunities for UHG to draft outreach

For each opportunity, specify:
- The talent/brand match
- Estimated deal value
- What UHG earns
- Who needs to take action`;

    const momentsResult = await askClaudeWithSearch(AGENTS.moments.systemPrompt, momentsPrompt);
    if (momentsResult.success) {
      await postToChannel("#moments", `*Daily Opportunity Scan - 9am*\n\n${momentsResult.text}`);
    }

    // 5. Ops - Cash check
    const opsPrompt = `${dateContext}It's 9am. Quick cash position check.
- Review any outstanding invoices
- Flag any payments due this week
- Note any upcoming expenses`;

    const opsResult = await askClaude(AGENTS.ops.systemPrompt, opsPrompt);
    if (opsResult.success) {
      await postToChannel("#ops-finance", `*Morning Cash Check - 9am*\n\n${opsResult.text}`);
    }

    clearAll();
    console.log("9am tasks completed");
  },
  { timezone: "America/Chicago" }
);

// ===== 10:30 AM - MID-MORNING CHECK =====
cron.schedule(
  "30 10 * * 1-5", // Mon-Fri at 10:30am
  async () => {
    console.log("10:30am - Mid-morning tasks...");
    const dateContext = getDateContext();

    // Get cross-agent context for collaboration
    const momentsTeamContext = await getTeamActivityPrompt("moments", 4);
    const uhgTeamContext = await getTeamActivityPrompt("deals", 4);
    const relTeamContext = await getTeamActivityPrompt("relationships", 4);
    const talentContext = await getTalentContextPrompt();
    const oppsContext = await getOpportunitiesContextPrompt();

    // Moments → UHG Handoff
    const handoffPrompt = `${dateContext}It's 10:30am - time to hand off opportunities to UHG.

${momentsTeamContext}

${talentContext}

${oppsContext}

Review the opportunities you identified this morning. For each one:
1. Create a brief deal summary
2. Specify what outreach UHG should draft
3. Note any relationship gaps that need filling

To hand off, format like: "@UHG: [Talent] x [Brand] for [Event] - [estimated value] - need outreach by [date]"

The UHG agent will receive your handoffs and confirm receipt.`;

    const momentsResult = await askClaudeWithSearch(AGENTS.moments.systemPrompt, handoffPrompt);
    if (momentsResult.success) {
      await postToChannel("#moments", `*UHG Handoff - 10:30am*\n\n${momentsResult.text}`);
    }

    // UHG - Sync with Moments (with full context)
    const uhgPendingHandoffs = await getPendingHandoffs("deals");
    let uhgSyncPrompt = `${dateContext}It's 10:30am - sync with Moments Agent and other teams.

${uhgTeamContext}

${talentContext}

${oppsContext}

`;

    if (uhgPendingHandoffs.length > 0) {
      uhgSyncPrompt += `*INCOMING HANDOFFS:*\n`;
      for (const h of uhgPendingHandoffs) {
        uhgSyncPrompt += `- From ${h.from}: ${h.content}\n`;
      }
      uhgSyncPrompt += `\n`;
    }

    uhgSyncPrompt += `For each opportunity:
1. Acknowledge receipt
2. Confirm you'll draft outreach by noon
3. Flag any blockers - if you need an intro, tag @Relationships

To request intros: "@Relationships: Need intro to [contact] at [company] for [deal]"`;

    const uhgResult = await askClaudeWithSearch(AGENTS.deals.systemPrompt, uhgSyncPrompt);
    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*Moments Sync - 10:30am*\n\n${uhgResult.text}`);
    }

    // Relationships - Research contacts (with pending requests)
    const relPendingHandoffs = await getPendingHandoffs("relationships");
    let relationshipsPrompt = `${dateContext}It's 10:30am - deep research time.

${relTeamContext}

`;

    if (relPendingHandoffs.length > 0) {
      relationshipsPrompt += `*INTRO REQUESTS FROM TEAM:*\n`;
      for (const h of relPendingHandoffs) {
        relationshipsPrompt += `- From ${h.from}: ${h.content}\n`;
      }
      relationshipsPrompt += `\n`;
    }

    relationshipsPrompt += `For each person we need to reach:
- What do we know about them?
- Who in Preston's network can intro?
- What's the best approach?

After researching, hand back to the requesting agent with intro paths:
"@UHG: For [contact] - best path is through [connector]. Here's the approach..."`;

    const relResult = await askClaudeWithSearch(AGENTS.relationships.systemPrompt, relationshipsPrompt);
    if (relResult.success) {
      await postToChannel("#relationships", `*Contact Research - 10:30am*\n\n${relResult.text}`);
    }

    console.log("10:30am tasks completed");
  },
  { timezone: "America/Chicago" }
);

// ===== 12:00 PM - MIDDAY CHECK =====
cron.schedule(
  "0 12 * * 1-5", // Mon-Fri at noon
  async () => {
    console.log("12pm - Midday check...");
    const dateContext = getDateContext();

    // COS - Unblock items
    const cosPrompt = `${dateContext}It's noon - midday check.

Review morning activity:
1. What got done?
2. What's stuck?
3. Any blockers to clear?
4. What needs Preston's attention before EOD?`;

    const cosResult = await askClaude(AGENTS.cos.systemPrompt, cosPrompt);
    if (cosResult.success) {
      await postToChannel("#cos-command", `*Midday Check - 12pm*\n\n${cosResult.text}`);
    }

    // UHG - Deal follow-ups
    const uhgPrompt = `${dateContext}It's noon - follow up on all active deals.

For each deal in progress:
1. What's the status?
2. Did we send the outreach we committed to?
3. Any responses to handle?
4. What's the next action?`;

    const uhgResult = await askClaude(AGENTS.deals.systemPrompt, uhgPrompt);
    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*Deal Follow-ups - 12pm*\n\n${uhgResult.text}`);
    }

    // Moments - Talent research (with full team context and talent network)
    const talentMentions = await scanForTalentMentions(8); // Last 8 hours
    const teamActivity = await getTeamActivityPrompt("moments", 8);
    const talentContext = await getTalentContextPrompt();
    const opportunitiesContext = await getOpportunitiesContextPrompt();
    const pendingHandoffs = await getPendingHandoffs("moments");

    let momentsPrompt = `${dateContext}It's noon - talent research time.

${teamActivity}

${talentContext}

${opportunitiesContext}

`;

    // Add any detected talent mentions
    if (talentMentions.length > 0) {
      momentsPrompt += `*NEW TALENT MENTIONS DETECTED:*\n`;
      for (const mention of talentMentions.slice(0, 5)) {
        momentsPrompt += `- *${mention.name}* (mentioned in #${mention.source})\n`;
        momentsPrompt += `  Context: "${mention.context}"\n`;
      }
      momentsPrompt += `\nFor each new talent, use web search to create a full profile:
- Who are they? (role, achievements)
- Audience/demographics
- Brand history (past endorsements)
- What deals they might be open to
- Upcoming opportunities that fit them

Then hand off to @UHG with an opportunity brief.\n`;
    } else {
      momentsPrompt += `No new talent mentions detected in the last 8 hours.

Review existing talent in the network for upcoming moments:
1. Check the talent profiles above
2. Match them to upcoming cultural moments
3. Create any new opportunity briefs for UHG
4. Flag any talent relationships that need attention\n`;
    }

    // Add pending handoffs
    if (pendingHandoffs.length > 0) {
      momentsPrompt += `\n*PENDING REQUESTS FROM OTHER AGENTS:*\n`;
      for (const h of pendingHandoffs.slice(0, 3)) {
        momentsPrompt += `- From ${h.from}: ${h.content}\n`;
      }
    }

    const momentsResult = await askClaudeWithSearch(AGENTS.moments.systemPrompt, momentsPrompt);
    if (momentsResult.success) {
      await postToChannel("#moments", `*Talent Research - 12pm*\n\n${momentsResult.text}`);
    }

    console.log("12pm tasks completed");
  },
  { timezone: "America/Chicago" }
);

// ===== 2:00 PM - AFTERNOON PUSH =====
cron.schedule(
  "0 14 * * 1-5", // Mon-Fri at 2pm
  async () => {
    console.log("2pm - Afternoon push...");

    // Revenue - Lead research
    const revenuePrompt = `It's 2pm - lead research time.

Dig into Preston's network for new prospects:
- Anyone who runs a team that could use Umbrella?
- Any recent conversations about process problems?
- Who should we add to the pipeline?

Draft personalized outreach for any new prospects.`;

    const revenueResult = await askClaudeWithSearch(AGENTS.revenue.systemPrompt, revenuePrompt);
    if (revenueResult.success) {
      await postToChannel("#product-revenue", `*Lead Research - 2pm*\n\n${revenueResult.text}`);
    }

    // UHG - Brand outreach
    const uhgPrompt = `It's 2pm - brand outreach time.

For talent in our network, identify brands to approach:
1. What brands fit each talent?
2. Draft cold outreach to brand contacts
3. Note any warm intro paths via Relationships

Focus on upcoming moments in the next 30-60 days.`;

    const uhgResult = await askClaudeWithSearch(AGENTS.deals.systemPrompt, uhgPrompt);
    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*Brand Outreach - 2pm*\n\n${uhgResult.text}`);
    }

    // Moments - Brand matching
    const momentsPrompt = `It's 2pm - match brands to upcoming moments.

Look at events in the next 60 days:
1. Which brands should be activating around these moments?
2. What talent in our network fits?
3. Create 3 new opportunity briefs for UHG

Be specific: talent + brand + moment + deal type + estimated value.`;

    const momentsResult = await askClaudeWithSearch(AGENTS.moments.systemPrompt, momentsPrompt);
    if (momentsResult.success) {
      await postToChannel("#moments", `*Brand Matching - 2pm*\n\n${momentsResult.text}`);
    }

    // Ops - Contractor/invoice check
    const opsPrompt = `It's 2pm - contractor and invoice check.

- Any contractor deliverables due?
- Any invoices to send?
- Any payments to follow up on?`;

    const opsResult = await askClaude(AGENTS.ops.systemPrompt, opsPrompt);
    if (opsResult.success) {
      await postToChannel("#ops-finance", `*Contractor Check - 2pm*\n\n${opsResult.text}`);
    }

    console.log("2pm tasks completed");
  },
  { timezone: "America/Chicago" }
);

// ===== 3:30 PM - LATE AFTERNOON =====
cron.schedule(
  "30 15 * * 1-5", // Mon-Fri at 3:30pm
  async () => {
    console.log("3:30pm - Late afternoon tasks...");

    // Moments - Urgency alerts
    const momentsPrompt = `It's 3:30pm - urgency check.

Flag anything that's getting urgent:
1. Events within 14 days - have we pitched?
2. Events within 30 days - are deals progressing?
3. Any lead time cutoffs approaching?

For anything urgent, ping the relevant agent to take action TODAY.`;

    const momentsResult = await askClaude(AGENTS.moments.systemPrompt, momentsPrompt);
    if (momentsResult.success) {
      await postToChannel("#moments", `*Urgency Alerts - 3:30pm*\n\n${momentsResult.text}`);
    }

    // UHG - Talent check
    const uhgPrompt = `It's 3:30pm - talent relationship check.

For key talent in our network:
1. When did we last touch base?
2. Any upcoming opportunities for them?
3. Anyone we need to re-engage?

Draft check-in messages for any talent that's gone quiet.`;

    const uhgResult = await askClaude(AGENTS.deals.systemPrompt, uhgPrompt);
    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*Talent Check - 3:30pm*\n\n${uhgResult.text}`);
    }

    // Revenue - Pipeline review
    const revenuePrompt = `It's 3:30pm - pipeline review.

Update status on all prospects:
- Who moved forward today?
- Who needs follow-up?
- Any deals ready to close?

Flag anything that needs Preston's push.`;

    const revenueResult = await askClaude(AGENTS.revenue.systemPrompt, revenuePrompt);
    if (revenueResult.success) {
      await postToChannel("#product-revenue", `*Pipeline Review - 3:30pm*\n\n${revenueResult.text}`);
    }

    // Relationships - Warmth check
    const relPrompt = `It's 3:30pm - relationship warmth check.

Review key relationships:
1. Who haven't we talked to in 30+ days?
2. Any relationships cooling that we need to warm up?
3. Suggest touchpoints for Preston to send.`;

    const relResult = await askClaude(AGENTS.relationships.systemPrompt, relPrompt);
    if (relResult.success) {
      await postToChannel("#relationships", `*Warmth Check - 3:30pm*\n\n${relResult.text}`);
    }

    console.log("3:30pm tasks completed");
  },
  { timezone: "America/Chicago" }
);

// ===== 5:00 PM - END OF DAY =====
cron.schedule(
  "0 17 * * 1-5", // Mon-Fri at 5pm
  async () => {
    console.log("5pm - End of day wrap-up...");

    // COS - EOD Summary
    const cosPrompt = `It's 5pm - end of day summary.

Wrap up the day:
1. *What moved today* - deals, relationships, opportunities
2. *What's blocked* - needs resolution
3. *Tomorrow's priorities* - what should Preston focus on first thing

Keep it tight and actionable.`;

    const cosResult = await askClaude(AGENTS.cos.systemPrompt, cosPrompt);
    if (cosResult.success) {
      await postToChannel("#cos-command", `*End of Day Summary - 5pm*\n\n${cosResult.text}`);
    }

    // UHG - Deal status update
    const uhgPrompt = `It's 5pm - final deal status update.

For each active deal:
1. Status: pitched / meeting scheduled / negotiating / closed
2. What moved today
3. Next action and when

Flag any deals that need Preston's attention tomorrow morning.`;

    const uhgResult = await askClaude(AGENTS.deals.systemPrompt, uhgPrompt);
    if (uhgResult.success) {
      await postToChannel("#uhg-deals", `*EOD Deal Status - 5pm*\n\n${uhgResult.text}`);
    }

    // Moments - EOD Pipeline
    const momentsPrompt = `It's 5pm - end of day opportunity pipeline update.

Summarize today's opportunity work:
1. New opportunities identified
2. Opportunities handed to UHG
3. Status updates on in-progress opportunities
4. Tomorrow's focus

Quick wins and urgent items for tomorrow morning.`;

    const momentsResult = await askClaude(AGENTS.moments.systemPrompt, momentsPrompt);
    if (momentsResult.success) {
      await postToChannel("#moments", `*EOD Pipeline - 5pm*\n\n${momentsResult.text}`);
    }

    // Revenue - Close attempts
    const revenuePrompt = `It's 5pm - last push for closes.

Any deals that could close TODAY with one more push?
- Draft final follow-up messages
- What's the ask?
- What's the urgency?

Otherwise, set up tomorrow for closes.`;

    const revenueResult = await askClaude(AGENTS.revenue.systemPrompt, revenuePrompt);
    if (revenueResult.success) {
      await postToChannel("#product-revenue", `*Close Push - 5pm*\n\n${revenueResult.text}`);
    }

    console.log("5pm tasks completed - workday complete");
  },
  { timezone: "America/Chicago" }
);

// ===== MEETING REMINDERS - Every 15 minutes during workday =====
cron.schedule(
  "*/15 9-17 * * 1-5", // Every 15 min, 9am-5pm, Mon-Fri
  async () => {
    if (!isCalendarAvailable()) return;

    const meetingAlert = await getMeetingAlert();
    if (meetingAlert && meetingAlert.alert) {
      await postToChannel("#cos-command", meetingAlert.message);
      console.log(`Meeting reminder sent: ${meetingAlert.meeting.title} in ${meetingAlert.minutesUntil} min`);
    }
  },
  { timezone: "America/Chicago" }
);

// ===== HOURLY MEETING UPDATE CHECK =====
cron.schedule(
  "0 10-17 * * 1-5", // Every hour 10am-5pm, Mon-Fri
  async () => {
    if (!isGmailAvailable()) return;

    console.log("Hourly - Checking for meeting updates to share with team...");

    const teamUpdates = await generateTeamMeetingUpdates();
    if (teamUpdates) {
      await postToChannel("#cos-command", teamUpdates);
      console.log("Posted meeting updates to team");
    }
  },
  { timezone: "America/Chicago" }
);

// ===== AFTERNOON FOLLOW-UP REMINDER - 2pm =====
cron.schedule(
  "0 14 * * 1-5", // 2pm Mon-Fri
  async () => {
    console.log("2pm - Follow-up reminder check...");

    const highPriority = await getHighPriorityFollowUps();
    if (highPriority.length > 0) {
      let message = "*Afternoon Follow-up Reminder*\n\n";
      message += `You have ${highPriority.length} high priority follow-ups:\n\n`;

      for (const f of highPriority.slice(0, 5)) {
        message += `- *${f.title}*`;
        if (f.contact_name) message += ` (${f.contact_name})`;
        message += "\n";
        if (f.description) message += `  ${f.description.substring(0, 100)}\n`;
      }

      await postToChannel("#cos-command", message);
    }
  },
  { timezone: "America/Chicago" }
);

// ===== EVENING SYNC - 6pm =====
cron.schedule(
  "0 18 * * 1-5", // 6pm Mon-Fri
  async () => {
    console.log("6pm - Running evening follow-up sync...");
    await syncFollowUps();
    console.log("6pm - Evening sync complete");
  },
  { timezone: "America/Chicago" }
);

// Start
(async () => {
  // Initialize Google services before starting (async initialization)
  if (hasGoogleAuth) {
    console.log("Initializing Google services...");
    const [gmailResult, calendarResult] = await Promise.all([
      initGmail(env.google.clientId, env.google.clientSecret, env.google.refreshToken),
      initCalendar(env.google.clientId, env.google.clientSecret, env.google.refreshToken),
    ]);

    if (gmailResult) {
      console.log("Gmail integration: READY");
    } else {
      console.error("Gmail integration: FAILED - check your OAuth refresh token");
    }

    if (calendarResult) {
      console.log("Calendar integration: READY");
    } else {
      console.error("Calendar integration: FAILED - check your OAuth refresh token");
    }
  } else {
    console.warn("Google OAuth not configured. Email/Calendar features disabled.");
    console.warn("To enable, set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN");
  }

  await app.start();
  console.log("Umbrella agents online");
  console.log("8-hour workday scheduled: 9am, 10:30am, 12pm, 2pm, 3:30pm, 5pm CT (Mon-Fri)");

  if (isGmailAvailable()) {
    console.log("Email/Calendar integration: ENABLED");
    console.log("- Meeting reminders: every 15 min");
    console.log("- Follow-up tracking: active");
    console.log("- Meeting notes extraction: active");
    console.log("- Interactive email queries: active (DM or @mention the bot)");
  } else {
    console.log("Email/Calendar integration: DISABLED (check logs above for errors)");
  }

  console.log("\nInteractive queries enabled:");
  console.log("- DM the bot to chat with COS agent");
  console.log("- @mention in any channel to chat with that channel's agent");
  console.log("- Ask about emails: 'any updates from [name]?', 'what needs follow-up?', etc.");
})();
