// src/services/meeting-notes.js
// Extract meeting notes from Otter.ai and Tactic emails
// These services send transcripts/summaries to email, so we parse from Gmail

const { getRecentEmails, getEmailDetails, searchEmails } = require("./gmail");
const { getRecentlyCompletedMeetings } = require("./calendar");

/**
 * Search for Otter.ai meeting notes in email
 * Otter sends emails from otter.ai with transcripts and summaries
 */
async function getOtterNotes(hours = 48) {
  // Search for Otter.ai emails
  const otterEmails = await searchEmails("from:otter.ai OR from:otter", 20);

  // Filter to recent ones
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const recentNotes = otterEmails.filter(
    (email) => new Date(email.date).getTime() > cutoff
  );

  return recentNotes.map((email) => parseOtterEmail(email));
}

/**
 * Parse Otter.ai email content
 */
function parseOtterEmail(email) {
  const body = email.body || email.snippet || "";
  const subject = email.subject || "";

  // Extract meeting title (usually in subject)
  // Format: "Meeting notes: [Title]" or "Otter.ai: [Title]"
  let meetingTitle = subject
    .replace(/^(Meeting notes:|Otter\.ai:|Your meeting|Notes from)\s*/i, "")
    .trim();

  // Extract key sections from body
  const sections = {
    summary: extractSection(body, ["Summary", "Overview", "Key Points"]),
    actionItems: extractActionItems(body),
    attendees: extractAttendees(body),
    transcript: extractSection(body, ["Transcript", "Full transcript"]),
  };

  return {
    id: email.id,
    source: "otter",
    meetingTitle,
    date: email.date,
    emailSubject: email.subject,
    ...sections,
    rawBody: body.substring(0, 3000),
  };
}

/**
 * Search for Tactic meeting notes in email
 * Tactic sends meeting recaps with action items
 */
async function getTacticNotes(hours = 48) {
  // Search for Tactic emails
  const tacticEmails = await searchEmails("from:tactic OR from:meettactic", 20);

  // Filter to recent ones
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const recentNotes = tacticEmails.filter(
    (email) => new Date(email.date).getTime() > cutoff
  );

  return recentNotes.map((email) => parseTacticEmail(email));
}

/**
 * Parse Tactic email content
 */
function parseTacticEmail(email) {
  const body = email.body || email.snippet || "";
  const subject = email.subject || "";

  // Extract meeting title from subject
  let meetingTitle = subject
    .replace(/^(Meeting recap:|Tactic:|Your meeting|Recap:)\s*/i, "")
    .trim();

  // Extract key sections
  const sections = {
    summary: extractSection(body, ["Summary", "Meeting Summary", "Recap"]),
    actionItems: extractActionItems(body),
    decisions: extractSection(body, ["Decisions", "Key Decisions"]),
    nextSteps: extractSection(body, ["Next Steps", "Follow-up", "Next Actions"]),
    attendees: extractAttendees(body),
  };

  return {
    id: email.id,
    source: "tactic",
    meetingTitle,
    date: email.date,
    emailSubject: email.subject,
    ...sections,
    rawBody: body.substring(0, 3000),
  };
}

/**
 * Get all meeting notes from any supported source
 */
async function getAllMeetingNotes(hours = 48) {
  const [otterNotes, tacticNotes] = await Promise.all([
    getOtterNotes(hours),
    getTacticNotes(hours),
  ]);

  // Also search for generic meeting notes emails
  const genericNotes = await searchGenericMeetingNotes(hours);

  const allNotes = [...otterNotes, ...tacticNotes, ...genericNotes];

  // Sort by date, newest first
  allNotes.sort((a, b) => new Date(b.date) - new Date(a.date));

  return allNotes;
}

/**
 * Search for generic meeting notes/recap emails
 */
async function searchGenericMeetingNotes(hours = 48) {
  const emails = await searchEmails(
    "subject:(meeting notes OR recap OR follow up OR action items) -from:otter -from:tactic",
    10
  );

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const recentEmails = emails.filter(
    (email) => new Date(email.date).getTime() > cutoff
  );

  return recentEmails.map((email) => ({
    id: email.id,
    source: "email",
    meetingTitle: email.subject,
    date: email.date,
    emailSubject: email.subject,
    summary: email.snippet,
    actionItems: extractActionItems(email.body || email.snippet || ""),
    rawBody: (email.body || email.snippet || "").substring(0, 2000),
  }));
}

/**
 * Match meeting notes to calendar events
 */
async function matchNotesToMeetings(notes = null) {
  const meetingNotes = notes || (await getAllMeetingNotes(48));
  const recentMeetings = await getRecentlyCompletedMeetings(48);

  const matched = [];

  for (const note of meetingNotes) {
    // Try to match by title similarity or date proximity
    const noteDate = new Date(note.date);

    let bestMatch = null;
    let bestScore = 0;

    for (const meeting of recentMeetings) {
      const meetingDate = new Date(meeting.start);
      const hoursDiff = Math.abs(noteDate - meetingDate) / (1000 * 60 * 60);

      // Score based on time proximity and title similarity
      let score = 0;

      // Time proximity (within 24 hours gets points)
      if (hoursDiff <= 24) {
        score += 50 - hoursDiff * 2;
      }

      // Title matching
      const titleSimilarity = calculateTitleSimilarity(
        note.meetingTitle,
        meeting.title
      );
      score += titleSimilarity * 50;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = meeting;
      }
    }

    matched.push({
      ...note,
      matchedMeeting: bestMatch,
      matchScore: bestScore,
    });
  }

  return matched;
}

/**
 * Calculate title similarity (simple word overlap)
 */
function calculateTitleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;

  const words1 = title1.toLowerCase().split(/\s+/);
  const words2 = title2.toLowerCase().split(/\s+/);

  const commonWords = words1.filter((w) => words2.includes(w));
  return commonWords.length / Math.max(words1.length, words2.length);
}

/**
 * Extract a section from email body
 */
function extractSection(body, sectionNames) {
  for (const name of sectionNames) {
    // Look for section header
    const pattern = new RegExp(`${name}[:\\s]*([\\s\\S]*?)(?=\\n\\n|$)`, "i");
    const match = body.match(pattern);
    if (match && match[1]) {
      return match[1].trim().substring(0, 500);
    }
  }
  return null;
}

/**
 * Extract action items from text
 */
function extractActionItems(text) {
  if (!text) return [];

  const patterns = [
    /(?:action items?|to-?do|next steps?|follow[- ]?ups?)[:\s]*([^]*?)(?=\n\n|$)/gi,
    /[-•*]\s*(?:TODO|ACTION|FOLLOW UP)[:\s]*([^\n]+)/gi,
    /(?:^|\n)[-•*]\s*([A-Z][^.!?\n]*(?:by|before|deadline|due)[^.!?\n]*)/gm,
  ];

  const items = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = match[1]?.trim();
      if (item && item.length > 5 && item.length < 200) {
        items.push(item);
      }
    }
  }

  // Also look for bullet points in action sections
  const actionSection = extractSection(text, [
    "Action Items",
    "To Do",
    "Next Steps",
    "Follow Up",
  ]);
  if (actionSection) {
    const bullets = actionSection.match(/[-•*]\s*([^\n]+)/g) || [];
    for (const bullet of bullets) {
      const cleaned = bullet.replace(/^[-•*]\s*/, "").trim();
      if (cleaned && !items.includes(cleaned)) {
        items.push(cleaned);
      }
    }
  }

  return items.slice(0, 10); // Limit to 10 items
}

/**
 * Extract attendees from text
 */
function extractAttendees(text) {
  if (!text) return [];

  // Look for attendees/participants section
  const attendeeSection = extractSection(text, [
    "Attendees",
    "Participants",
    "Present",
    "On the call",
  ]);

  if (attendeeSection) {
    // Split by common delimiters
    const names = attendeeSection.split(/[,;\n]/).map((n) => n.trim());
    return names.filter((n) => n.length > 2 && n.length < 50);
  }

  return [];
}

/**
 * Get meeting notes context for AI prompt injection
 */
async function getMeetingNotesContextPrompt() {
  try {
    const matchedNotes = await matchNotesToMeetings();

    if (matchedNotes.length === 0) {
      return "*MEETING NOTES:*\nNo recent meeting notes found in email.";
    }

    let prompt = "*RECENT MEETING NOTES:*\n\n";

    for (const note of matchedNotes.slice(0, 5)) {
      prompt += `*${note.meetingTitle}* (via ${note.source})\n`;
      prompt += `Date: ${new Date(note.date).toLocaleDateString()}\n`;

      if (note.matchedMeeting) {
        prompt += `Calendar: ${note.matchedMeeting.title}\n`;
        prompt += `With: ${note.matchedMeeting.attendees.map((a) => a.name).join(", ")}\n`;
      }

      if (note.summary) {
        prompt += `Summary: ${note.summary.substring(0, 200)}...\n`;
      }

      if (note.actionItems && note.actionItems.length > 0) {
        prompt += `Action Items:\n`;
        for (const item of note.actionItems.slice(0, 3)) {
          prompt += `  - ${item}\n`;
        }
      }

      if (note.nextSteps) {
        prompt += `Next Steps: ${note.nextSteps.substring(0, 150)}\n`;
      }

      prompt += "\n";
    }

    return prompt;
  } catch (error) {
    console.error("getMeetingNotesContextPrompt error:", error.message);
    return "*MEETING NOTES:*\nError fetching meeting notes.";
  }
}

/**
 * Get action items from recent meetings that need follow-up
 */
async function getPendingMeetingActions() {
  const notes = await getAllMeetingNotes(72); // Last 3 days

  const allActions = [];

  for (const note of notes) {
    if (note.actionItems && note.actionItems.length > 0) {
      for (const item of note.actionItems) {
        allActions.push({
          action: item,
          meetingTitle: note.meetingTitle,
          meetingDate: note.date,
          source: note.source,
        });
      }
    }
  }

  return allActions;
}

module.exports = {
  getOtterNotes,
  getTacticNotes,
  getAllMeetingNotes,
  matchNotesToMeetings,
  getMeetingNotesContextPrompt,
  getPendingMeetingActions,
  extractActionItems,
};
