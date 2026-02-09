// src/services/email-query.js
// On-demand email query handling for interactive Slack conversations

const {
  isGmailAvailable,
  searchEmails,
  getFollowUpEmails,
  getAwaitingResponse,
  getRecentEmailsFromHours,
  extractActionItems,
  getEmailThread,
} = require("./gmail");

/**
 * Email query intent types
 */
const EMAIL_INTENTS = {
  CONTACT_UPDATES: "contact_updates", // "any updates from [name]?"
  FOLLOW_UPS: "follow_ups", // "what emails need follow-up?"
  AWAITING_RESPONSE: "awaiting_response", // "who haven't I heard back from?"
  SEARCH: "search", // "find emails about [topic]"
  RECENT: "recent", // "what came in today/this morning?"
  ACTION_ITEMS: "action_items", // "what action items from emails?"
  THREAD: "thread", // "show me the thread with [name] about [topic]"
};

/**
 * Detect if a message is an email-related query
 * Returns intent type and extracted parameters
 */
function detectEmailIntent(message) {
  const text = message.toLowerCase();

  // Contact-specific queries
  // "any updates from john?" "emails from acme" "what did sarah say?"
  const contactPatterns = [
    /(?:any\s+)?(?:updates?|news|emails?|messages?)\s+(?:from|about)\s+([a-z\s]+?)(?:\?|$|\.)/i,
    /(?:what\s+did|have\s+you\s+heard\s+from|heard\s+from)\s+([a-z\s]+?)(?:\s+say|\s+send|\?|$|\.)/i,
    /(?:check|look\s+for|find)\s+(?:emails?\s+)?(?:from|about)\s+([a-z\s]+?)(?:\?|$|\.)/i,
    /(?:anything\s+from)\s+([a-z\s]+?)(?:\?|$|\.)/i,
  ];

  for (const pattern of contactPatterns) {
    const match = text.match(pattern);
    if (match) {
      const contactName = match[1].trim();
      // Filter out generic words that aren't names
      if (!["today", "yesterday", "this week", "email", "emails"].includes(contactName)) {
        return {
          intent: EMAIL_INTENTS.CONTACT_UPDATES,
          params: { contactName },
        };
      }
    }
  }

  // Follow-up queries
  // "what needs follow-up?" "follow-ups for today" "what should I follow up on?"
  const followUpPatterns = [
    /(?:what|which|any)\s+(?:emails?\s+)?(?:need|needs|needing)\s+follow[\s-]?up/i,
    /follow[\s-]?ups?\s+(?:for\s+)?(?:today|this\s+week|needed)/i,
    /(?:what\s+should\s+I|do\s+I\s+need\s+to)\s+follow[\s-]?up/i,
    /(?:pending|outstanding)\s+follow[\s-]?ups?/i,
  ];

  for (const pattern of followUpPatterns) {
    if (pattern.test(text)) {
      return {
        intent: EMAIL_INTENTS.FOLLOW_UPS,
        params: {},
      };
    }
  }

  // Awaiting response queries
  // "who haven't I heard back from?" "waiting on responses" "unanswered emails"
  const awaitingPatterns = [
    /(?:who|which|what)\s+(?:haven't\s+I|have\s+I\s+not)\s+(?:heard\s+back|gotten\s+a\s+response)/i,
    /(?:waiting|pending)\s+(?:on|for)\s+(?:responses?|replies?)/i,
    /(?:unanswered|unreplied)\s+emails?/i,
    /(?:emails?\s+)?(?:awaiting|waiting\s+for)\s+(?:response|reply)/i,
    /(?:who\s+)?(?:owes\s+me|needs\s+to\s+respond)/i,
  ];

  for (const pattern of awaitingPatterns) {
    if (pattern.test(text)) {
      return {
        intent: EMAIL_INTENTS.AWAITING_RESPONSE,
        params: {},
      };
    }
  }

  // Recent emails queries
  // "what came in today?" "new emails this morning?" "inbox update"
  const recentPatterns = [
    /(?:what|any)\s+(?:new\s+)?(?:emails?\s+)?(?:came\s+in|arrived|received)\s+(?:today|this\s+morning|recently)/i,
    /(?:new|recent|latest)\s+(?:emails?|messages?|inbox)/i,
    /(?:inbox|email)\s+(?:update|summary|check)/i,
    /(?:what's\s+in\s+my|check\s+my)\s+inbox/i,
    /(?:today's|this\s+morning's)\s+(?:emails?|messages?)/i,
  ];

  for (const pattern of recentPatterns) {
    if (pattern.test(text)) {
      // Determine time frame
      let hours = 24;
      if (text.includes("this morning") || text.includes("today")) {
        hours = 12;
      } else if (text.includes("last hour") || text.includes("past hour")) {
        hours = 1;
      }
      return {
        intent: EMAIL_INTENTS.RECENT,
        params: { hours },
      };
    }
  }

  // Action items from emails
  // "what action items from emails?" "email tasks" "what do I need to do from emails?"
  const actionPatterns = [
    /(?:action\s+items?|tasks?|to[\s-]?dos?)\s+(?:from|in)\s+(?:emails?|inbox)/i,
    /(?:what\s+do\s+I\s+need\s+to|what\s+should\s+I)\s+(?:do|action)\s+(?:from|based\s+on)\s+emails?/i,
    /(?:email|inbox)\s+(?:action\s+items?|tasks?|to[\s-]?dos?)/i,
  ];

  for (const pattern of actionPatterns) {
    if (pattern.test(text)) {
      return {
        intent: EMAIL_INTENTS.ACTION_ITEMS,
        params: {},
      };
    }
  }

  // Search emails by topic
  // "find emails about the project" "search for contract emails"
  const searchPatterns = [
    /(?:find|search|look\s+for)\s+(?:emails?\s+)?(?:about|regarding|mentioning|with)\s+(.+?)(?:\?|$|\.)/i,
    /(?:emails?\s+)?(?:about|regarding|mentioning)\s+(.+?)(?:\?|$|\.)/i,
  ];

  for (const pattern of searchPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        intent: EMAIL_INTENTS.SEARCH,
        params: { topic: match[1].trim() },
      };
    }
  }

  // Generic email-related keywords that should trigger email context
  const emailKeywords = [
    "email", "emails", "inbox", "mail", "message", "messages",
    "sent", "received", "reply", "replied", "respond", "response",
  ];

  const hasEmailKeyword = emailKeywords.some((keyword) => text.includes(keyword));
  if (hasEmailKeyword) {
    return {
      intent: EMAIL_INTENTS.RECENT,
      params: { hours: 24, generic: true },
    };
  }

  return null;
}

/**
 * Check if a query is email-related
 */
function isEmailQuery(message) {
  return detectEmailIntent(message) !== null;
}

/**
 * Fetch email context based on detected intent
 */
async function getEmailContextForQuery(intent, params) {
  if (!isGmailAvailable()) {
    return {
      success: false,
      context: "Email integration is not configured. Please add Google OAuth credentials.",
    };
  }

  try {
    switch (intent) {
      case EMAIL_INTENTS.CONTACT_UPDATES:
        return await getContactEmailContext(params.contactName);

      case EMAIL_INTENTS.FOLLOW_UPS:
        return await getFollowUpContext();

      case EMAIL_INTENTS.AWAITING_RESPONSE:
        return await getAwaitingResponseContext();

      case EMAIL_INTENTS.RECENT:
        return await getRecentEmailContext(params.hours);

      case EMAIL_INTENTS.ACTION_ITEMS:
        return await getActionItemsContext();

      case EMAIL_INTENTS.SEARCH:
        return await searchEmailContext(params.topic);

      default:
        return await getRecentEmailContext(24);
    }
  } catch (error) {
    console.error("Email query context error:", error.message);
    return {
      success: false,
      context: `Error fetching email context: ${error.message}`,
    };
  }
}

/**
 * Get emails from a specific contact
 */
async function getContactEmailContext(contactName) {
  const emails = await searchEmails(contactName, 15);

  if (emails.length === 0) {
    return {
      success: true,
      context: `*EMAIL CONTEXT - ${contactName}:*\nNo recent emails found from or about "${contactName}".`,
      isEmpty: true,
    };
  }

  let context = `*EMAIL CONTEXT - Emails involving "${contactName}":*\n\n`;

  // Separate into received and sent
  const received = emails.filter((e) => e.from.toLowerCase().includes(contactName.toLowerCase()));
  const sent = emails.filter((e) => e.to?.toLowerCase().includes(contactName.toLowerCase()));

  if (received.length > 0) {
    context += `*Received from ${contactName}:*\n`;
    for (const email of received.slice(0, 5)) {
      const date = new Date(email.date).toLocaleDateString();
      context += `- ${date}: "${email.subject}"\n  Preview: ${email.snippet.substring(0, 150)}...\n\n`;
    }
  }

  if (sent.length > 0) {
    context += `*Sent to ${contactName}:*\n`;
    for (const email of sent.slice(0, 5)) {
      const date = new Date(email.date).toLocaleDateString();
      context += `- ${date}: "${email.subject}"\n  Preview: ${email.snippet.substring(0, 150)}...\n\n`;
    }
  }

  // Extract any action items
  const allActions = emails.flatMap((e) => extractActionItems(e).actions);
  if (allActions.length > 0) {
    context += `*Action items from these emails:*\n`;
    for (const action of allActions.slice(0, 5)) {
      context += `- ${action.text}\n`;
    }
  }

  return {
    success: true,
    context,
    emailCount: emails.length,
  };
}

/**
 * Get follow-up emails context
 */
async function getFollowUpContext() {
  const followUps = await getFollowUpEmails();

  if (followUps.length === 0) {
    return {
      success: true,
      context: "*EMAIL FOLLOW-UPS:*\nNo emails currently flagged for follow-up.",
      isEmpty: true,
    };
  }

  let context = `*EMAIL FOLLOW-UPS (${followUps.length} items):*\n\n`;

  for (const email of followUps.slice(0, 10)) {
    const date = new Date(email.date).toLocaleDateString();
    const actions = extractActionItems(email);

    context += `*From:* ${email.from}\n`;
    context += `*Subject:* ${email.subject}\n`;
    context += `*Date:* ${date}\n`;
    context += `*Preview:* ${email.snippet.substring(0, 200)}...\n`;

    if (actions.actions.length > 0) {
      context += `*Actions needed:* ${actions.actions.map((a) => a.text).join("; ")}\n`;
    }
    context += "\n---\n\n";
  }

  return {
    success: true,
    context,
    emailCount: followUps.length,
  };
}

/**
 * Get emails awaiting response context
 */
async function getAwaitingResponseContext() {
  const awaiting = await getAwaitingResponse();

  if (awaiting.length === 0) {
    return {
      success: true,
      context: "*AWAITING RESPONSE:*\nNo sent emails waiting for a response. You're all caught up!",
      isEmpty: true,
    };
  }

  let context = `*EMAILS AWAITING RESPONSE (${awaiting.length}):*\n\n`;

  // Sort by days since sent (oldest first - most urgent)
  const sorted = awaiting.sort((a, b) => b.daysSinceSent - a.daysSinceSent);

  for (const email of sorted.slice(0, 10)) {
    const urgency = email.daysSinceSent >= 5 ? " - OVERDUE" : "";

    context += `*To:* ${email.to}\n`;
    context += `*Subject:* ${email.subject}\n`;
    context += `*Sent:* ${email.daysSinceSent} days ago${urgency}\n`;
    context += `*Preview:* ${email.snippet.substring(0, 150)}...\n`;
    context += "\n---\n\n";
  }

  // Summary
  const overdue = sorted.filter((e) => e.daysSinceSent >= 5).length;
  if (overdue > 0) {
    context += `\n*Summary:* ${overdue} emails are 5+ days old without response - consider following up.\n`;
  }

  return {
    success: true,
    context,
    emailCount: awaiting.length,
    overdueCount: overdue,
  };
}

/**
 * Get recent emails context
 */
async function getRecentEmailContext(hours = 24) {
  const emails = await getRecentEmailsFromHours(hours);

  const timeFrame = hours <= 1 ? "last hour" : hours <= 12 ? "today" : "last 24 hours";

  if (emails.length === 0) {
    return {
      success: true,
      context: `*RECENT EMAILS (${timeFrame}):*\nNo new emails in the ${timeFrame}.`,
      isEmpty: true,
    };
  }

  let context = `*RECENT EMAILS (${emails.length} in ${timeFrame}):*\n\n`;

  // Group by sender for easier reading
  const bySender = {};
  for (const email of emails) {
    const sender = email.from.split("<")[0].trim() || email.from;
    if (!bySender[sender]) bySender[sender] = [];
    bySender[sender].push(email);
  }

  for (const [sender, senderEmails] of Object.entries(bySender)) {
    context += `*From ${sender}:* (${senderEmails.length} emails)\n`;
    for (const email of senderEmails.slice(0, 3)) {
      const time = new Date(email.date).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      context += `- ${time}: "${email.subject}"\n  ${email.snippet.substring(0, 100)}...\n`;
    }
    if (senderEmails.length > 3) {
      context += `  _...and ${senderEmails.length - 3} more_\n`;
    }
    context += "\n";
  }

  return {
    success: true,
    context,
    emailCount: emails.length,
  };
}

/**
 * Get action items from recent emails
 */
async function getActionItemsContext() {
  const emails = await getRecentEmailsFromHours(48);

  if (emails.length === 0) {
    return {
      success: true,
      context: "*EMAIL ACTION ITEMS:*\nNo recent emails to extract action items from.",
      isEmpty: true,
    };
  }

  const allActions = [];
  for (const email of emails) {
    const extracted = extractActionItems(email);
    if (extracted.actions.length > 0) {
      allActions.push({
        from: email.from.split("<")[0].trim(),
        subject: email.subject,
        date: email.date,
        actions: extracted.actions,
      });
    }
  }

  if (allActions.length === 0) {
    return {
      success: true,
      context: "*EMAIL ACTION ITEMS:*\nNo clear action items detected in recent emails.",
      isEmpty: true,
    };
  }

  let context = `*EMAIL ACTION ITEMS (from ${allActions.length} emails):*\n\n`;

  for (const item of allActions.slice(0, 10)) {
    const date = new Date(item.date).toLocaleDateString();
    context += `*From:* ${item.from} (${date})\n`;
    context += `*Re:* ${item.subject}\n`;
    context += `*Actions:*\n`;
    for (const action of item.actions) {
      context += `  - ${action.text}\n`;
    }
    context += "\n";
  }

  return {
    success: true,
    context,
    actionCount: allActions.reduce((sum, a) => sum + a.actions.length, 0),
  };
}

/**
 * Search emails by topic
 */
async function searchEmailContext(topic) {
  const emails = await searchEmails(topic, 15);

  if (emails.length === 0) {
    return {
      success: true,
      context: `*EMAIL SEARCH - "${topic}":*\nNo emails found matching "${topic}".`,
      isEmpty: true,
    };
  }

  let context = `*EMAIL SEARCH - "${topic}" (${emails.length} results):*\n\n`;

  for (const email of emails.slice(0, 10)) {
    const date = new Date(email.date).toLocaleDateString();
    context += `*From:* ${email.from}\n`;
    context += `*Date:* ${date}\n`;
    context += `*Subject:* ${email.subject}\n`;
    context += `*Preview:* ${email.snippet.substring(0, 200)}...\n`;
    context += "\n---\n\n";
  }

  return {
    success: true,
    context,
    emailCount: emails.length,
  };
}

/**
 * Process an email query and return formatted context for AI
 */
async function processEmailQuery(message) {
  const detected = detectEmailIntent(message);

  if (!detected) {
    return null;
  }

  console.log(`[EmailQuery] Detected intent: ${detected.intent}`, detected.params);

  const result = await getEmailContextForQuery(detected.intent, detected.params);

  return {
    intent: detected.intent,
    params: detected.params,
    ...result,
  };
}

module.exports = {
  EMAIL_INTENTS,
  detectEmailIntent,
  isEmailQuery,
  processEmailQuery,
  getEmailContextForQuery,
  // Individual context fetchers (for direct use)
  getContactEmailContext,
  getFollowUpContext,
  getAwaitingResponseContext,
  getRecentEmailContext,
  getActionItemsContext,
  searchEmailContext,
};
