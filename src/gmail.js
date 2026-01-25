/**
 * Gmail Integration for Umbrella AI Employees
 *
 * Flow:
 * 1. User asks agent to check email / draft response
 * 2. Agent reads inbox, drafts reply
 * 3. User approves: "send it"
 * 4. Agent sends email
 *
 * Setup:
 * 1. Go to console.cloud.google.com
 * 2. Create project → Enable Gmail API
 * 3. Create OAuth 2.0 credentials (Desktop app)
 * 4. Download credentials.json → put in project root
 * 5. Run: node src/gmail.js --auth (first time only)
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
];

const TOKEN_PATH = path.join(__dirname, "..", "gmail_token.json");
const CREDENTIALS_PATH = path.join(__dirname, "..", "gmail_credentials.json");

let gmail = null;

/* ================================
   AUTHENTICATION
================================ */
async function initGmail() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log("⚠️  Gmail not configured - missing gmail_credentials.json");
    console.log("   Get credentials from console.cloud.google.com");
    return null;
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris ? redirect_uris[0] : "http://localhost:3000/oauth2callback"
    );

    // Check for existing token
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      oAuth2Client.setCredentials(token);
      gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      console.log("✅ Gmail connected");
      return gmail;
    } else {
      console.log("⚠️  Gmail token missing - run: node src/gmail.js --auth");
      return null;
    }
  } catch (error) {
    console.error("Gmail init failed:", error.message);
    return null;
  }
}

function isGmailEnabled() {
  return gmail !== null;
}

/* ================================
   READ EMAILS
================================ */
async function getRecentEmails(maxResults = 10, query = "") {
  if (!gmail) return [];

  try {
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: query, // e.g., "from:sequoia.com" or "is:unread"
    });

    if (!res.data.messages) return [];

    const emails = [];
    for (const msg of res.data.messages) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = detail.data.payload.headers;
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      // Get body
      let body = "";
      if (detail.data.payload.body.data) {
        body = Buffer.from(detail.data.payload.body.data, "base64").toString("utf8");
      } else if (detail.data.payload.parts) {
        const textPart = detail.data.payload.parts.find(p => p.mimeType === "text/plain");
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, "base64").toString("utf8");
        }
      }

      emails.push({
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: detail.data.snippet,
        body: body.slice(0, 5000), // Truncate long emails
      });
    }

    return emails;
  } catch (error) {
    console.error("Failed to fetch emails:", error.message);
    return [];
  }
}

async function getEmailThread(threadId) {
  if (!gmail) return null;

  try {
    const res = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages = res.data.messages.map(msg => {
      const headers = msg.payload.headers;
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      let body = "";
      if (msg.payload.body.data) {
        body = Buffer.from(msg.payload.body.data, "base64").toString("utf8");
      } else if (msg.payload.parts) {
        const textPart = msg.payload.parts.find(p => p.mimeType === "text/plain");
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, "base64").toString("utf8");
        }
      }

      return {
        id: msg.id,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        body: body.slice(0, 5000),
      };
    });

    return {
      threadId,
      subject: messages[0]?.subject,
      messages,
    };
  } catch (error) {
    console.error("Failed to fetch thread:", error.message);
    return null;
  }
}

/* ================================
   SEND EMAILS
================================ */
async function sendEmail(to, subject, body, threadId = null) {
  if (!gmail) return { success: false, error: "Gmail not connected" };

  try {
    // Build the email
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];

    const email = emailLines.join("\r\n");
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedEmail,
        threadId: threadId, // Reply to thread if provided
      },
    });

    return {
      success: true,
      messageId: res.data.id,
      threadId: res.data.threadId,
    };
  } catch (error) {
    console.error("Failed to send email:", error.message);
    return { success: false, error: error.message };
  }
}

async function createDraft(to, subject, body, threadId = null) {
  if (!gmail) return { success: false, error: "Gmail not connected" };

  try {
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];

    const email = emailLines.join("\r\n");
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: encodedEmail,
          threadId: threadId,
        },
      },
    });

    return {
      success: true,
      draftId: res.data.id,
    };
  } catch (error) {
    console.error("Failed to create draft:", error.message);
    return { success: false, error: error.message };
  }
}

/* ================================
   HELPER: Format email for Slack display
================================ */
function formatEmailForSlack(email) {
  return `*From:* ${email.from}
*Subject:* ${email.subject}
*Date:* ${email.date}

${email.snippet || email.body.slice(0, 500)}${email.body.length > 500 ? "..." : ""}`;
}

/* ================================
   AUTH FLOW (run once to get token)
================================ */
async function runAuthFlow() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error("❌ Missing gmail_credentials.json");
    console.error("   1. Go to console.cloud.google.com");
    console.error("   2. Create project → Enable Gmail API");
    console.error("   3. Create OAuth 2.0 credentials (Desktop app)");
    console.error("   4. Download and save as gmail_credentials.json");
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris ? redirect_uris[0] : "http://localhost:3000/oauth2callback"
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("\n🔐 Gmail Authorization Required\n");
  console.log("1. Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\n2. Sign in and authorize the app");
  console.log("3. Copy the authorization code");
  console.log("4. Paste it here and press Enter:\n");

  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Authorization code: ", async (code) => {
    rl.close();

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log("\n✅ Gmail token saved to gmail_token.json");
      console.log("   You can now use Gmail features!");
    } catch (error) {
      console.error("\n❌ Failed to get token:", error.message);
    }
  });
}

// Run auth flow if called directly with --auth flag
if (require.main === module && process.argv.includes("--auth")) {
  runAuthFlow();
}

module.exports = {
  initGmail,
  isGmailEnabled,
  getRecentEmails,
  getEmailThread,
  sendEmail,
  createDraft,
  formatEmailForSlack,
};
