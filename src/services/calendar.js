// src/services/calendar.js
// Google Calendar integration for meeting awareness and scheduling

const { google } = require("googleapis");

let calendar = null;
let oauth2Client = null;

/**
 * Initialize Google Calendar API
 * Uses same OAuth credentials as Gmail
 */
function initCalendar(clientId, clientSecret, refreshToken) {
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("Calendar credentials not provided. Calendar features disabled.");
    return false;
  }

  try {
    oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    calendar = google.calendar({ version: "v3", auth: oauth2Client });
    console.log("Google Calendar API initialized");
    return true;
  } catch (error) {
    console.error("Calendar init error:", error.message);
    return false;
  }
}

function isCalendarAvailable() {
  return calendar !== null;
}

/**
 * Get today's meetings
 */
async function getTodaysMeetings() {
  if (!calendar) return [];

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return getEventsInRange(startOfDay, endOfDay);
}

/**
 * Get upcoming meetings for the next N hours
 */
async function getUpcomingMeetings(hours = 4) {
  if (!calendar) return [];

  const now = new Date();
  const later = new Date(now.getTime() + hours * 60 * 60 * 1000);

  return getEventsInRange(now, later);
}

/**
 * Get meetings in a date range
 */
async function getEventsInRange(startDate, endDate) {
  if (!calendar) return [];

  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events = response.data.items || [];
    return events.map(formatEvent);
  } catch (error) {
    console.error("Calendar getEventsInRange error:", error.message);
    return [];
  }
}

/**
 * Get this week's meetings
 */
async function getThisWeeksMeetings() {
  if (!calendar) return [];

  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return getEventsInRange(startOfWeek, endOfWeek);
}

/**
 * Get meetings for the next N days
 */
async function getMeetingsForDays(days = 7) {
  if (!calendar) return [];

  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return getEventsInRange(now, future);
}

/**
 * Format calendar event for internal use
 */
function formatEvent(event) {
  const start = event.start.dateTime || event.start.date;
  const end = event.end.dateTime || event.end.date;

  return {
    id: event.id,
    title: event.summary || "No title",
    description: event.description || "",
    start: start,
    end: end,
    location: event.location || "",
    attendees: (event.attendees || []).map((a) => ({
      email: a.email,
      name: a.displayName || a.email,
      status: a.responseStatus,
    })),
    organizer: event.organizer?.email || "",
    isOrganizer: event.organizer?.self || false,
    meetingLink: extractMeetingLink(event),
    status: event.status,
    created: event.created,
    updated: event.updated,
  };
}

/**
 * Extract video meeting link (Zoom, Meet, Teams, etc.)
 */
function extractMeetingLink(event) {
  // Check for Google Meet
  if (event.hangoutLink) {
    return event.hangoutLink;
  }

  // Check conferenceData
  if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints.find(
      (e) => e.entryPointType === "video"
    );
    if (videoEntry) return videoEntry.uri;
  }

  // Check description for meeting links
  const description = event.description || "";
  const location = event.location || "";
  const text = `${description} ${location}`;

  // Common meeting URL patterns
  const patterns = [
    /https:\/\/[\w.-]+\.zoom\.us\/[^\s<"]+/i,
    /https:\/\/meet\.google\.com\/[^\s<"]+/i,
    /https:\/\/teams\.microsoft\.com\/[^\s<"]+/i,
    /https:\/\/[\w.-]+\.webex\.com\/[^\s<"]+/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return null;
}

/**
 * Get meetings with specific attendee
 */
async function getMeetingsWithContact(email, days = 30) {
  if (!calendar) return [];

  const meetings = await getMeetingsForDays(days);
  return meetings.filter((m) =>
    m.attendees.some((a) => a.email.toLowerCase().includes(email.toLowerCase()))
  );
}

/**
 * Get recently completed meetings (for follow-up)
 */
async function getRecentlyCompletedMeetings(hours = 24) {
  if (!calendar) return [];

  const now = new Date();
  const past = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const meetings = await getEventsInRange(past, now);
  return meetings.filter((m) => new Date(m.end) < now);
}

/**
 * Get meetings needing follow-up (completed in last 48h, external attendees)
 */
async function getMeetingsNeedingFollowUp() {
  if (!calendar) return [];

  const recentMeetings = await getRecentlyCompletedMeetings(48);

  // Filter to meetings with external attendees (not just internal)
  return recentMeetings.filter((m) => {
    const hasExternalAttendees = m.attendees.some(
      (a) => !a.email.includes("umbrella") && !a.email.includes("uhgconsult")
    );
    return hasExternalAttendees && m.attendees.length > 0;
  });
}

/**
 * Get next meeting (for quick status)
 */
async function getNextMeeting() {
  if (!calendar) return null;

  const upcoming = await getUpcomingMeetings(8);
  return upcoming[0] || null;
}

/**
 * Get free time slots for the day
 */
async function getFreeSlots(date = new Date()) {
  if (!calendar) return [];

  const startOfDay = new Date(date);
  startOfDay.setHours(9, 0, 0, 0); // Assume 9am start

  const endOfDay = new Date(date);
  endOfDay.setHours(18, 0, 0, 0); // Assume 6pm end

  const events = await getEventsInRange(startOfDay, endOfDay);

  // Calculate free slots
  const slots = [];
  let currentTime = startOfDay;

  for (const event of events) {
    const eventStart = new Date(event.start);
    if (eventStart > currentTime) {
      slots.push({
        start: currentTime.toISOString(),
        end: eventStart.toISOString(),
        duration: Math.round((eventStart - currentTime) / (1000 * 60)), // minutes
      });
    }
    currentTime = new Date(event.end);
  }

  // Add final slot if there's time left
  if (currentTime < endOfDay) {
    slots.push({
      start: currentTime.toISOString(),
      end: endOfDay.toISOString(),
      duration: Math.round((endOfDay - currentTime) / (1000 * 60)),
    });
  }

  return slots.filter((s) => s.duration >= 30); // Only 30+ min slots
}

/**
 * Get calendar context for AI prompt injection
 */
async function getCalendarContextPrompt() {
  if (!calendar) return "Calendar integration not configured.";

  try {
    const [today, upcoming, needFollowUp, nextMeeting] = await Promise.all([
      getTodaysMeetings(),
      getUpcomingMeetings(4),
      getMeetingsNeedingFollowUp(),
      getNextMeeting(),
    ]);

    let prompt = "*CALENDAR CONTEXT:*\n\n";

    // Next meeting alert
    if (nextMeeting) {
      const startTime = new Date(nextMeeting.start);
      const minutesUntil = Math.round((startTime - new Date()) / (1000 * 60));
      if (minutesUntil > 0 && minutesUntil <= 60) {
        prompt += `*NEXT MEETING IN ${minutesUntil} MIN:*\n`;
        prompt += `${nextMeeting.title}\n`;
        prompt += `With: ${nextMeeting.attendees.map((a) => a.name).join(", ") || "No attendees listed"}\n`;
        if (nextMeeting.meetingLink) {
          prompt += `Link: ${nextMeeting.meetingLink}\n`;
        }
        prompt += "\n";
      }
    }

    // Today's schedule
    prompt += "*Today's Meetings:*\n";
    if (today.length > 0) {
      for (const meeting of today) {
        const start = new Date(meeting.start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        const end = new Date(meeting.end).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        prompt += `- ${start}-${end}: ${meeting.title}\n`;
        prompt += `  With: ${meeting.attendees.map((a) => a.name).join(", ") || "Solo/internal"}\n`;
      }
    } else {
      prompt += "No meetings scheduled today.\n";
    }

    // Meetings needing follow-up
    prompt += "\n*Recent Meetings Needing Follow-up:*\n";
    if (needFollowUp.length > 0) {
      for (const meeting of needFollowUp.slice(0, 5)) {
        const meetingDate = new Date(meeting.start).toLocaleDateString();
        prompt += `- ${meeting.title} (${meetingDate})\n`;
        prompt += `  Attendees: ${meeting.attendees.map((a) => a.name).join(", ")}\n`;
      }
    } else {
      prompt += "No recent meetings flagged for follow-up.\n";
    }

    return prompt;
  } catch (error) {
    console.error("Calendar getCalendarContextPrompt error:", error.message);
    return "Error fetching calendar context.";
  }
}

/**
 * Format meeting for Slack display
 */
function formatMeetingForSlack(meeting) {
  const start = new Date(meeting.start);
  const timeStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  let text = `*${meeting.title}*\n`;
  text += `${dateStr} at ${timeStr}\n`;

  if (meeting.attendees.length > 0) {
    text += `With: ${meeting.attendees.map((a) => a.name).join(", ")}\n`;
  }

  if (meeting.location) {
    text += `Location: ${meeting.location}\n`;
  }

  if (meeting.meetingLink) {
    text += `<${meeting.meetingLink}|Join Meeting>\n`;
  }

  return text;
}

module.exports = {
  initCalendar,
  isCalendarAvailable,
  getTodaysMeetings,
  getUpcomingMeetings,
  getEventsInRange,
  getThisWeeksMeetings,
  getMeetingsForDays,
  getMeetingsWithContact,
  getRecentlyCompletedMeetings,
  getMeetingsNeedingFollowUp,
  getNextMeeting,
  getFreeSlots,
  getCalendarContextPrompt,
  formatMeetingForSlack,
};
