// src/services/followups.js
// Unified follow-up tracking combining email, calendar, and meeting notes

const { getClient, isSupabaseAvailable } = require("./supabase");
const { getFollowUpEmails, getAwaitingResponse, extractActionItems } = require("./gmail");
const { getMeetingsNeedingFollowUp, getRecentlyCompletedMeetings } = require("./calendar");
const { getPendingMeetingActions, getAllMeetingNotes } = require("./meeting-notes");

// In-memory fallback
let memoryFollowups = [];

/**
 * Create or update a follow-up item
 */
async function createFollowUp({
  type, // 'email', 'meeting', 'action_item', 'manual'
  title,
  description,
  sourceId = null, // email ID, meeting ID, etc.
  sourceType = null, // 'gmail', 'calendar', 'otter', 'tactic'
  contactName = null,
  contactEmail = null,
  dueDate = null,
  priority = "normal", // 'high', 'normal', 'low'
  status = "pending", // 'pending', 'reminded', 'completed', 'snoozed'
}) {
  const followUp = {
    id: Date.now().toString(),
    type,
    title,
    description,
    source_id: sourceId,
    source_type: sourceType,
    contact_name: contactName,
    contact_email: contactEmail,
    due_date: dueDate,
    priority,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reminded_at: null,
    completed_at: null,
  };

  const supabase = getClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("followups")
        .upsert(followUp, { onConflict: "source_id,source_type" })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Supabase createFollowUp error:", error.message);
    }
  }

  // In-memory fallback
  const existing = memoryFollowups.findIndex(
    (f) => f.source_id === sourceId && f.source_type === sourceType
  );
  if (existing >= 0) {
    memoryFollowups[existing] = { ...memoryFollowups[existing], ...followUp };
    return memoryFollowups[existing];
  }
  memoryFollowups.push(followUp);
  return followUp;
}

/**
 * Get all pending follow-ups
 */
async function getPendingFollowUps() {
  const supabase = getClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("followups")
        .select("*")
        .in("status", ["pending", "reminded"])
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Supabase getPendingFollowUps error:", error.message);
    }
  }

  return memoryFollowups.filter(
    (f) => f.status === "pending" || f.status === "reminded"
  );
}

/**
 * Mark follow-up as completed
 */
async function completeFollowUp(followUpId) {
  const supabase = getClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("followups")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", followUpId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Supabase completeFollowUp error:", error.message);
    }
  }

  const index = memoryFollowups.findIndex((f) => f.id === followUpId);
  if (index >= 0) {
    memoryFollowups[index].status = "completed";
    memoryFollowups[index].completed_at = new Date().toISOString();
    return memoryFollowups[index];
  }
  return null;
}

/**
 * Snooze follow-up until a later date
 */
async function snoozeFollowUp(followUpId, snoozedUntil) {
  const supabase = getClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("followups")
        .update({
          status: "snoozed",
          due_date: snoozedUntil,
          updated_at: new Date().toISOString(),
        })
        .eq("id", followUpId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Supabase snoozeFollowUp error:", error.message);
    }
  }

  const index = memoryFollowups.findIndex((f) => f.id === followUpId);
  if (index >= 0) {
    memoryFollowups[index].status = "snoozed";
    memoryFollowups[index].due_date = snoozedUntil;
    return memoryFollowups[index];
  }
  return null;
}

/**
 * Sync follow-ups from all sources (email, calendar, meeting notes)
 * This scans for new items and creates follow-up entries
 */
async function syncFollowUps() {
  console.log("Syncing follow-ups from all sources...");
  const newFollowUps = [];

  // 1. Email follow-ups (starred, awaiting response)
  try {
    const [flaggedEmails, awaitingResponse] = await Promise.all([
      getFollowUpEmails(),
      getAwaitingResponse(),
    ]);

    // Flagged emails needing action
    for (const email of flaggedEmails) {
      const actions = extractActionItems(email);
      const followUp = await createFollowUp({
        type: "email",
        title: `Follow up: ${email.subject}`,
        description: actions.actions.length > 0
          ? actions.actions.map((a) => a.text).join("; ")
          : email.snippet,
        sourceId: email.id,
        sourceType: "gmail",
        contactName: extractName(email.from),
        contactEmail: extractEmail(email.from),
        priority: email.labels?.includes("IMPORTANT") ? "high" : "normal",
      });
      newFollowUps.push(followUp);
    }

    // Emails awaiting response (sent, no reply)
    for (const email of awaitingResponse) {
      if (email.daysSinceSent >= 3) { // Only after 3 days
        const followUp = await createFollowUp({
          type: "email",
          title: `Awaiting response: ${email.subject}`,
          description: `Sent ${email.daysSinceSent} days ago, no reply yet`,
          sourceId: `awaiting_${email.id}`,
          sourceType: "gmail",
          contactName: extractName(email.to),
          contactEmail: extractEmail(email.to),
          priority: email.daysSinceSent >= 7 ? "high" : "normal",
        });
        newFollowUps.push(followUp);
      }
    }
  } catch (error) {
    console.error("Email sync error:", error.message);
  }

  // 2. Meeting follow-ups
  try {
    const meetingsNeedingFollowUp = await getMeetingsNeedingFollowUp();

    for (const meeting of meetingsNeedingFollowUp) {
      const followUp = await createFollowUp({
        type: "meeting",
        title: `Follow up: ${meeting.title}`,
        description: `Meeting with ${meeting.attendees.map((a) => a.name).join(", ")}`,
        sourceId: meeting.id,
        sourceType: "calendar",
        contactName: meeting.attendees[0]?.name || null,
        contactEmail: meeting.attendees[0]?.email || null,
        priority: "normal",
      });
      newFollowUps.push(followUp);
    }
  } catch (error) {
    console.error("Calendar sync error:", error.message);
  }

  // 3. Action items from meeting notes
  try {
    const pendingActions = await getPendingMeetingActions();

    for (const action of pendingActions) {
      const followUp = await createFollowUp({
        type: "action_item",
        title: action.action.substring(0, 100),
        description: `From meeting: ${action.meetingTitle}`,
        sourceId: `action_${action.meetingTitle}_${action.action.substring(0, 20)}`,
        sourceType: action.source,
        priority: detectPriority(action.action),
      });
      newFollowUps.push(followUp);
    }
  } catch (error) {
    console.error("Meeting notes sync error:", error.message);
  }

  console.log(`Synced ${newFollowUps.length} follow-ups`);
  return newFollowUps;
}

/**
 * Get follow-ups due soon (for reminders)
 */
async function getFollowUpsDueSoon(hours = 24) {
  const pending = await getPendingFollowUps();
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);

  return pending.filter((f) => {
    if (!f.due_date) return true; // No due date = always show
    return new Date(f.due_date) <= cutoff;
  });
}

/**
 * Get high priority follow-ups
 */
async function getHighPriorityFollowUps() {
  const pending = await getPendingFollowUps();
  return pending.filter((f) => f.priority === "high");
}

/**
 * Get follow-ups grouped by type
 */
async function getFollowUpsGrouped() {
  const pending = await getPendingFollowUps();

  return {
    email: pending.filter((f) => f.type === "email"),
    meeting: pending.filter((f) => f.type === "meeting"),
    action_item: pending.filter((f) => f.type === "action_item"),
    manual: pending.filter((f) => f.type === "manual"),
  };
}

/**
 * Generate follow-up context for AI prompt injection
 */
async function getFollowUpsContextPrompt() {
  try {
    const [pending, highPriority, dueSoon] = await Promise.all([
      getPendingFollowUps(),
      getHighPriorityFollowUps(),
      getFollowUpsDueSoon(8), // Next 8 hours
    ]);

    let prompt = "*FOLLOW-UPS & TASKS:*\n\n";

    // Urgent items
    if (highPriority.length > 0) {
      prompt += "*HIGH PRIORITY:*\n";
      for (const f of highPriority.slice(0, 5)) {
        prompt += `- ${f.title}`;
        if (f.contact_name) prompt += ` (${f.contact_name})`;
        prompt += `\n  ${f.description?.substring(0, 100) || ""}\n`;
      }
      prompt += "\n";
    }

    // Due soon
    if (dueSoon.length > 0) {
      prompt += "*DUE SOON:*\n";
      for (const f of dueSoon.slice(0, 5)) {
        prompt += `- ${f.title}`;
        if (f.due_date) {
          prompt += ` (due ${new Date(f.due_date).toLocaleDateString()})`;
        }
        prompt += "\n";
      }
      prompt += "\n";
    }

    // All pending by type
    const grouped = await getFollowUpsGrouped();

    if (grouped.email.length > 0) {
      prompt += `*Email Follow-ups (${grouped.email.length}):*\n`;
      for (const f of grouped.email.slice(0, 3)) {
        prompt += `- ${f.title}\n`;
      }
      prompt += "\n";
    }

    if (grouped.meeting.length > 0) {
      prompt += `*Meeting Follow-ups (${grouped.meeting.length}):*\n`;
      for (const f of grouped.meeting.slice(0, 3)) {
        prompt += `- ${f.title}\n`;
      }
      prompt += "\n";
    }

    if (grouped.action_item.length > 0) {
      prompt += `*Action Items (${grouped.action_item.length}):*\n`;
      for (const f of grouped.action_item.slice(0, 5)) {
        prompt += `- ${f.title}\n`;
      }
      prompt += "\n";
    }

    prompt += `\nTotal pending: ${pending.length} items\n`;

    return prompt;
  } catch (error) {
    console.error("getFollowUpsContextPrompt error:", error.message);
    return "*FOLLOW-UPS:*\nError fetching follow-ups.";
  }
}

/**
 * Generate team update from recent completed meetings
 */
async function generateMeetingUpdates() {
  try {
    const notes = await getAllMeetingNotes(24); // Last 24 hours
    const updates = [];

    for (const note of notes) {
      updates.push({
        meeting: note.meetingTitle,
        date: note.date,
        summary: note.summary || note.rawBody?.substring(0, 200) || "No summary",
        actionItems: note.actionItems || [],
        nextSteps: note.nextSteps || null,
      });
    }

    return updates;
  } catch (error) {
    console.error("generateMeetingUpdates error:", error.message);
    return [];
  }
}

// Helper functions
function extractName(fromHeader) {
  // "John Doe <john@example.com>" -> "John Doe"
  const match = fromHeader?.match(/^([^<]+)/);
  return match ? match[1].trim() : fromHeader;
}

function extractEmail(fromHeader) {
  // "John Doe <john@example.com>" -> "john@example.com"
  const match = fromHeader?.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader;
}

function detectPriority(text) {
  const highPriorityKeywords = [
    "urgent",
    "asap",
    "immediately",
    "critical",
    "today",
    "eod",
    "end of day",
    "deadline",
  ];
  const lower = text.toLowerCase();
  return highPriorityKeywords.some((k) => lower.includes(k)) ? "high" : "normal";
}

module.exports = {
  createFollowUp,
  getPendingFollowUps,
  completeFollowUp,
  snoozeFollowUp,
  syncFollowUps,
  getFollowUpsDueSoon,
  getHighPriorityFollowUps,
  getFollowUpsGrouped,
  getFollowUpsContextPrompt,
  generateMeetingUpdates,
};
