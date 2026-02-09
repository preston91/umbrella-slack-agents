// src/services/productivity.js
// Unified productivity context combining email, calendar, meeting notes, and follow-ups

const { isGmailAvailable, getEmailContextPrompt } = require("./gmail");
const { isCalendarAvailable, getCalendarContextPrompt, getNextMeeting, getMeetingsNeedingFollowUp } = require("./calendar");
const { getMeetingNotesContextPrompt, getAllMeetingNotes } = require("./meeting-notes");
const { getFollowUpsContextPrompt, syncFollowUps, generateMeetingUpdates, getPendingFollowUps } = require("./followups");

/**
 * Get full productivity context for AI agents
 * Combines: email, calendar, meeting notes, follow-ups
 */
async function getProductivityContextPrompt() {
  const sections = [];

  // Check what integrations are available
  const hasEmail = isGmailAvailable();
  const hasCalendar = isCalendarAvailable();

  if (!hasEmail && !hasCalendar) {
    return "*PRODUCTIVITY CONTEXT:*\nEmail and calendar integrations not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to enable.";
  }

  // Build context from available sources
  if (hasCalendar) {
    const calendarContext = await getCalendarContextPrompt();
    sections.push(calendarContext);
  }

  if (hasEmail) {
    const emailContext = await getEmailContextPrompt();
    sections.push(emailContext);

    // Meeting notes come from email
    const notesContext = await getMeetingNotesContextPrompt();
    sections.push(notesContext);
  }

  // Follow-ups (syncs from all sources)
  const followUpsContext = await getFollowUpsContextPrompt();
  sections.push(followUpsContext);

  return sections.join("\n\n");
}

/**
 * Generate morning briefing for Preston
 * Called at 9am with full day overview
 */
async function generateMorningBriefing() {
  const briefing = {
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    sections: [],
  };

  // 1. Today's Calendar
  if (isCalendarAvailable()) {
    const { getTodaysMeetings, getFreeSlots } = require("./calendar");
    const [meetings, freeSlots] = await Promise.all([
      getTodaysMeetings(),
      getFreeSlots(),
    ]);

    briefing.sections.push({
      title: "Today's Schedule",
      content: meetings.length > 0
        ? meetings.map((m) => {
            const time = new Date(m.start).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            return `${time} - ${m.title} (${m.attendees.map((a) => a.name).join(", ") || "solo"})`;
          })
        : ["No meetings scheduled"],
      freeTime: freeSlots.length > 0
        ? `${freeSlots.reduce((acc, s) => acc + s.duration, 0)} minutes of free time available`
        : null,
    });
  }

  // 2. Priority Follow-ups
  const followUps = await getPendingFollowUps();
  const highPriority = followUps.filter((f) => f.priority === "high");

  briefing.sections.push({
    title: "Priority Follow-ups",
    content: highPriority.length > 0
      ? highPriority.slice(0, 5).map((f) => `${f.title}${f.contact_name ? ` (${f.contact_name})` : ""}`)
      : ["No high priority items"],
    totalPending: followUps.length,
  });

  // 3. Meetings Needing Follow-up (from yesterday)
  if (isCalendarAvailable()) {
    const meetingsToFollowUp = await getMeetingsNeedingFollowUp();

    if (meetingsToFollowUp.length > 0) {
      briefing.sections.push({
        title: "Meetings to Follow Up",
        content: meetingsToFollowUp.slice(0, 3).map((m) =>
          `${m.title} - ${m.attendees.map((a) => a.name).join(", ")}`
        ),
      });
    }
  }

  // 4. Action Items from Recent Calls
  if (isGmailAvailable()) {
    const notes = await getAllMeetingNotes(24);
    const allActions = [];

    for (const note of notes) {
      if (note.actionItems?.length > 0) {
        allActions.push(...note.actionItems.map((a) => ({
          action: a,
          from: note.meetingTitle,
        })));
      }
    }

    if (allActions.length > 0) {
      briefing.sections.push({
        title: "Action Items from Recent Calls",
        content: allActions.slice(0, 5).map((a) => `${a.action} (from: ${a.from})`),
      });
    }
  }

  return briefing;
}

/**
 * Generate team update from recent meetings
 * Posts meeting summaries to relevant Slack channels
 */
async function generateTeamMeetingUpdates() {
  const updates = await generateMeetingUpdates();

  if (updates.length === 0) {
    return null;
  }

  let message = "*Meeting Updates from Recent Calls:*\n\n";

  for (const update of updates) {
    message += `*${update.meeting}*\n`;
    message += `${new Date(update.date).toLocaleDateString()}\n\n`;

    if (update.summary) {
      message += `Summary: ${update.summary}\n\n`;
    }

    if (update.actionItems.length > 0) {
      message += `Action Items:\n`;
      for (const item of update.actionItems.slice(0, 5)) {
        message += `- ${item}\n`;
      }
      message += "\n";
    }

    if (update.nextSteps) {
      message += `Next Steps: ${update.nextSteps}\n`;
    }

    message += "---\n\n";
  }

  return message;
}

/**
 * Check for upcoming meeting and return alert if needed
 */
async function getMeetingAlert() {
  if (!isCalendarAvailable()) return null;

  const nextMeeting = await getNextMeeting();
  if (!nextMeeting) return null;

  const startTime = new Date(nextMeeting.start);
  const minutesUntil = Math.round((startTime - new Date()) / (1000 * 60));

  // Alert if meeting is in 15 minutes or less
  if (minutesUntil > 0 && minutesUntil <= 15) {
    return {
      alert: true,
      minutesUntil,
      meeting: nextMeeting,
      message: `*Meeting in ${minutesUntil} minutes:* ${nextMeeting.title}\nWith: ${nextMeeting.attendees.map((a) => a.name).join(", ") || "solo"}${nextMeeting.meetingLink ? `\n${nextMeeting.meetingLink}` : ""}`,
    };
  }

  return null;
}

/**
 * Run daily sync of all follow-ups
 * Should be called at start of day
 */
async function runDailySync() {
  console.log("Running daily productivity sync...");

  try {
    // Sync follow-ups from all sources
    const newFollowUps = await syncFollowUps();
    console.log(`Synced ${newFollowUps.length} follow-ups`);

    return {
      success: true,
      followUps: newFollowUps.length,
    };
  } catch (error) {
    console.error("Daily sync error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Format briefing for Slack posting
 */
function formatBriefingForSlack(briefing) {
  let message = `*Good Morning - ${briefing.date}*\n\n`;

  for (const section of briefing.sections) {
    message += `*${section.title}:*\n`;

    if (Array.isArray(section.content)) {
      for (const item of section.content) {
        message += `- ${item}\n`;
      }
    } else {
      message += `${section.content}\n`;
    }

    if (section.freeTime) {
      message += `_${section.freeTime}_\n`;
    }

    if (section.totalPending) {
      message += `_Total pending: ${section.totalPending}_\n`;
    }

    message += "\n";
  }

  return message;
}

module.exports = {
  getProductivityContextPrompt,
  generateMorningBriefing,
  generateTeamMeetingUpdates,
  getMeetingAlert,
  runDailySync,
  formatBriefingForSlack,
};
