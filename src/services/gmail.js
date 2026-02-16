// src/services/gmail.js
// Gmail API integration for email access, follow-up tracking, and task extraction

const { google } = require("googleapis");

let gmail = null;
let oauth2Client = null;

/**
 * Noise filter - skip newsletters, promos, automated notifications, and receipts.
 * Matches against sender address and name (case-insensitive).
 */
const NOISE_SENDERS = [
  // Newsletters & marketing
  "seatgeek", "boardroom", "built in", "builtin.com", "substack",
  "medium.com", "linkedin.com", "notifications@", "newsletter",
  "marketing@", "promo@", "noreply@",
  // Receipts & financial notifications
  "apple cash", "cash@square.com", "venmo", "paypal",
  "receipt@", "billing@", "invoice@",
  // Automated service notifications
  "godaddy", "vanta.com", "notify@", "alerts@",
  "no-reply@", "donotreply@", "mailer-daemon",
  // Social & entertainment
  "facebookmail", "twitter.com", "instagram", "tiktok",
];

function isNoiseEmail(email) {
  const from = (email.from || "").toLowerCase();
  const labels = email.labels || [];

  // Skip if Gmail already categorized as promo/social/updates
  if (labels.includes("CATEGORY_PROMOTIONS") ||
      labels.includes("CATEGORY_SOCIAL") ||
      labels.includes("CATEGORY_UPDATES") ||
      labels.includes("CATEGORY_FORUMS")) {
    return true;
  }

  // Skip known noise senders
  return NOISE_SENDERS.some((pattern) => from.includes(pattern));
}

/**
 * Initialize Gmail API with OAuth2 credentials
 * Required env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */
async function initGmail(clientId, clientSecret, refreshToken) {
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("Gmail credentials not provided. Email features disabled.");
    return false;
  }

  try {
    oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Validate the token by making a test API call
    console.log("Gmail API: Testing connection...");
    const profile = await gmail.users.getProfile({ userId: "me" });
    console.log(`Gmail API initialized - connected to: ${profile.data.emailAddress}`);
    return true;
  } catch (error) {
    console.error("Gmail init error:", error.message);
    if (error.message.includes("invalid_grant") || error.message.includes("Token has been expired")) {
      console.error("Gmail OAuth token has expired. Please generate a new refresh token.");
      console.error("Follow the instructions in docs/GOOGLE_OAUTH_SETUP.md");
    }
    gmail = null; // Reset gmail on failure
    return false;
  }
}

function isGmailAvailable() {
  return gmail !== null;
}

/**
 * Get recent emails from inbox
 * @param {number} maxResults - Number of emails to fetch (default 20)
 * @param {string} query - Optional Gmail search query
 */
async function getRecentEmails(maxResults = 20, query = "", { filterNoise = true } = {}) {
  if (!gmail) return [];

  try {
    // Fetch extra messages to account for filtered-out noise
    const fetchCount = filterNoise ? maxResults * 2 : maxResults;

    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: fetchCount,
      q: query || "is:inbox category:primary",
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (const message of messages) {
      if (emails.length >= maxResults) break;
      const email = await getEmailDetails(message.id);
      if (!email) continue;
      if (filterNoise && isNoiseEmail(email)) continue;
      emails.push(email);
    }

    return emails;
  } catch (error) {
    console.error("Gmail getRecentEmails error:", error.message);
    return [];
  }
}

/**
 * Get full email details by ID
 */
async function getEmailDetails(messageId) {
  if (!gmail) return null;

  try {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = response.data.payload.headers;
    const getHeader = (name) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    // Extract body text
    let body = "";
    if (response.data.payload.body?.data) {
      body = Buffer.from(response.data.payload.body.data, "base64").toString("utf-8");
    } else if (response.data.payload.parts) {
      const textPart = response.data.payload.parts.find(
        (p) => p.mimeType === "text/plain"
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    }

    return {
      id: messageId,
      threadId: response.data.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      snippet: response.data.snippet,
      body: body.substring(0, 2000), // Limit body size
      labels: response.data.labelIds || [],
    };
  } catch (error) {
    console.error("Gmail getEmailDetails error:", error.message);
    return null;
  }
}

/**
 * Get emails needing follow-up (starred, important, or with follow-up label)
 */
async function getFollowUpEmails() {
  if (!gmail) return [];

  try {
    // Search for starred emails or emails with follow-up indicators
    const queries = [
      "is:starred is:inbox",
      "label:follow-up",
      "in:inbox subject:(follow up OR following up OR check in)",
    ];

    const allEmails = [];
    for (const query of queries) {
      const emails = await getRecentEmails(10, query);
      allEmails.push(...emails);
    }

    // Deduplicate by ID
    const uniqueEmails = Array.from(
      new Map(allEmails.map((e) => [e.id, e])).values()
    );

    return uniqueEmails;
  } catch (error) {
    console.error("Gmail getFollowUpEmails error:", error.message);
    return [];
  }
}

/**
 * Get emails from the last N hours
 */
async function getRecentEmailsFromHours(hours = 24) {
  if (!gmail) return [];

  const afterDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  const query = `in:inbox category:primary after:${Math.floor(afterDate.getTime() / 1000)}`;

  return getRecentEmails(50, query);
}

/**
 * Get emails awaiting response (sent emails without reply)
 */
async function getAwaitingResponse() {
  if (!gmail) return [];

  try {
    // Get sent emails from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const query = `in:sent after:${Math.floor(sevenDaysAgo.getTime() / 1000)}`;

    const sentEmails = await getRecentEmails(30, query);
    const awaitingResponse = [];

    for (const sent of sentEmails) {
      // Check if thread has a reply (more than one message)
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: sent.threadId,
      });

      const messages = thread.data.messages || [];
      const lastMessage = messages[messages.length - 1];

      // If last message is ours (sent), we're awaiting response
      if (lastMessage && lastMessage.labelIds?.includes("SENT")) {
        awaitingResponse.push({
          ...sent,
          daysSinceSent: Math.floor(
            (Date.now() - new Date(sent.date).getTime()) / (1000 * 60 * 60 * 24)
          ),
        });
      }
    }

    return awaitingResponse;
  } catch (error) {
    console.error("Gmail getAwaitingResponse error:", error.message);
    return [];
  }
}

/**
 * Get emails YOU received but haven't replied to
 * The inverse of getAwaitingResponse - tracks your pending replies
 */
async function getUnansweredInbound() {
  if (!gmail) return [];

  try {
    // Get inbox emails from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const query = `in:inbox category:primary after:${Math.floor(sevenDaysAgo.getTime() / 1000)}`;

    const inboxEmails = await getRecentEmails(50, query);
    const unanswered = [];

    for (const email of inboxEmails) {
      // Check the thread to see if we replied
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: email.threadId,
      });

      const messages = thread.data.messages || [];
      if (messages.length === 0) continue;

      const lastMessage = messages[messages.length - 1];

      // If last message is NOT from us, we haven't replied yet
      if (lastMessage && !lastMessage.labelIds?.includes("SENT")) {
        // Calculate days since received
        const lastMsgDate = lastMessage.payload?.headers?.find(
          (h) => h.name.toLowerCase() === "date"
        )?.value;
        const daysSinceReceived = lastMsgDate
          ? Math.floor((Date.now() - new Date(lastMsgDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Only include if older than 1 day (give yourself time to respond)
        if (daysSinceReceived >= 1) {
          unanswered.push({
            ...email,
            daysSinceReceived,
            threadMessageCount: messages.length,
          });
        }
      }
    }

    // Sort by days since received (oldest first = most urgent)
    return unanswered.sort((a, b) => b.daysSinceReceived - a.daysSinceReceived);
  } catch (error) {
    console.error("Gmail getUnansweredInbound error:", error.message);
    return [];
  }
}

/**
 * Search emails by contact name or company
 */
async function searchEmails(searchTerm, maxResults = 10) {
  if (!gmail) return [];

  const query = `${searchTerm} in:inbox OR in:sent`;
  return getRecentEmails(maxResults, query, { filterNoise: false });
}

/**
 * Get email thread for context
 */
async function getEmailThread(threadId) {
  if (!gmail) return [];

  try {
    const response = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages = [];
    for (const message of response.data.messages || []) {
      const email = await getEmailDetails(message.id);
      if (email) messages.push(email);
    }

    return messages;
  } catch (error) {
    console.error("Gmail getEmailThread error:", error.message);
    return [];
  }
}

/**
 * Create email draft
 */
async function createDraft(to, subject, body) {
  if (!gmail) return null;

  try {
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "",
      body,
    ].join("\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: { raw: encodedMessage },
      },
    });

    return {
      id: response.data.id,
      messageId: response.data.message.id,
    };
  } catch (error) {
    console.error("Gmail createDraft error:", error.message);
    return null;
  }
}

/**
 * Extract action items and follow-ups from email content
 * Returns structured data for task tracking
 */
function extractActionItems(email) {
  const actionPatterns = [
    /(?:can you|could you|please|would you)\s+([^.?!]+)/gi,
    /(?:let me know|get back to me|send me|share with me)\s+([^.?!]+)/gi,
    /(?:by|before|deadline|due)\s+(monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of week|EOD|COB)/gi,
    /(?:follow up|following up|circle back|reconnect)\s+([^.?!]+)/gi,
    /(?:action item|next step|to do)[:.]?\s*([^.?!]+)/gi,
  ];

  const actions = [];
  const text = `${email.subject} ${email.body}`;

  for (const pattern of actionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      actions.push({
        text: match[0].trim(),
        context: match[1]?.trim() || "",
      });
    }
  }

  return {
    emailId: email.id,
    from: email.from,
    subject: email.subject,
    date: email.date,
    actions: actions.slice(0, 5), // Limit to 5 actions per email
  };
}

/**
 * Get email summary for AI context injection
 */
async function getEmailContextPrompt() {
  if (!gmail) return "Email integration not configured.";

  try {
    const [recent, followUps, awaiting, unanswered] = await Promise.all([
      getRecentEmailsFromHours(24),
      getFollowUpEmails(),
      getAwaitingResponse(),
      getUnansweredInbound(),
    ]);

    let prompt = "*EMAIL CONTEXT:*\n\n";

    // PRIORITY: Emails you haven't replied to (your pending responses)
    prompt += "*🚨 YOU NEED TO REPLY TO:*\n";
    if (unanswered.length > 0) {
      for (const email of unanswered.slice(0, 7)) {
        const urgency = email.daysSinceReceived >= 3 ? "⚠️ OVERDUE" : "";
        prompt += `- From: ${email.from}\n  Subject: ${email.subject}\n  Waiting: ${email.daysSinceReceived} days ${urgency}\n\n`;
      }
    } else {
      prompt += "All caught up - no pending replies needed!\n";
    }

    // Recent emails summary
    prompt += "\n*Recent Emails (last 24h):*\n";
    if (recent.length > 0) {
      for (const email of recent.slice(0, 10)) {
        prompt += `- From: ${email.from}\n  Subject: ${email.subject}\n  Preview: ${email.snippet.substring(0, 100)}...\n\n`;
      }
    } else {
      prompt += "No new emails in the last 24 hours.\n";
    }

    // Follow-up emails
    prompt += "\n*Emails Needing Follow-up:*\n";
    if (followUps.length > 0) {
      for (const email of followUps.slice(0, 5)) {
        const actions = extractActionItems(email);
        prompt += `- From: ${email.from}\n  Subject: ${email.subject}\n`;
        if (actions.actions.length > 0) {
          prompt += `  Actions: ${actions.actions.map((a) => a.text).join("; ")}\n`;
        }
        prompt += "\n";
      }
    } else {
      prompt += "No flagged follow-ups.\n";
    }

    // Awaiting response (emails YOU sent)
    prompt += "\n*Awaiting Response (sent, no reply):*\n";
    if (awaiting.length > 0) {
      for (const email of awaiting.slice(0, 5)) {
        prompt += `- To: ${email.to}\n  Subject: ${email.subject}\n  Sent: ${email.daysSinceSent} days ago\n\n`;
      }
    } else {
      prompt += "No pending responses.\n";
    }

    return prompt;
  } catch (error) {
    console.error("Gmail getEmailContextPrompt error:", error.message);
    return "Error fetching email context.";
  }
}

module.exports = {
  initGmail,
  isGmailAvailable,
  getRecentEmails,
  getEmailDetails,
  getFollowUpEmails,
  getRecentEmailsFromHours,
  getAwaitingResponse,
  getUnansweredInbound,
  searchEmails,
  getEmailThread,
  createDraft,
  extractActionItems,
  getEmailContextPrompt,
};
