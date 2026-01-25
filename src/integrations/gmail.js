// src/integrations/gmail.js
// Gmail integration - email drafting, inbox triage, follow-ups
// Supports both Claude (Anthropic) and Gemini (Google) for AI processing

const { google } = require('googleapis');
const { EmailDraft, FollowUp, Memory, Relationship } = require('../storage/models');

const EMAIL_DRAFT_PROMPT = `
You are an Email Drafting Agent.

Write professional, concise emails that match the requested tone.

Guidelines:
- Be direct and clear
- Match the formality level to the context
- Keep it brief unless detail is required
- Include clear call-to-action when needed

Return the email in this format:
SUBJECT: [subject line]
---
[email body]
`;

const INBOX_TRIAGE_PROMPT = `
You are an Inbox Triage Agent.

Analyze the email and categorize it.

Return a JSON object:
{
  "priority": "urgent|high|normal|low",
  "category": "action_required|fyi|follow_up|spam|personal",
  "summary": "1-2 sentence summary",
  "suggested_action": "What to do with this email",
  "needs_response": boolean,
  "response_deadline": "ISO date if urgent, null otherwise",
  "key_entities": ["people or companies mentioned"]
}

Return ONLY valid JSON, no other text.
`;

class GmailIntegration {
  constructor(config = {}) {
    this.anthropic = config.anthropic;
    this.gemini = config.gemini; // Optional Gemini client

    // Gmail API setup (requires OAuth credentials)
    this.gmail = null;
    this.oauth2Client = null;

    if (config.googleCredentials) {
      this.initGoogleClient(config.googleCredentials);
    }
  }

  initGoogleClient(credentials) {
    const { client_id, client_secret, redirect_uri } = credentials;

    this.oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uri
    );

    // If we have tokens, set them
    if (credentials.tokens) {
      this.oauth2Client.setCredentials(credentials.tokens);
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    }
  }

  getAuthUrl() {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify'
      ]
    });
  }

  async authenticate(code) {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    return tokens;
  }

  /* --------------------------------
     AI PROVIDER SELECTION
  -------------------------------- */
  async callAI(systemPrompt, userMessage) {
    // Prefer Gemini for email tasks if available (Google ecosystem)
    if (this.gemini) {
      return this.callGemini(systemPrompt, userMessage);
    }

    // Fall back to Claude
    if (this.anthropic) {
      return this.callClaude(systemPrompt, userMessage);
    }

    throw new Error('No AI provider configured');
  }

  async callClaude(systemPrompt, userMessage) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
    return response.content[0].text;
  }

  async callGemini(systemPrompt, userMessage) {
    // Gemini API structure
    const model = this.gemini.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: userMessage }
    ]);
    return result.response.text();
  }

  /* --------------------------------
     EMAIL DRAFTING
  -------------------------------- */
  async draftEmail(request, context = {}) {
    const contextStr = context.relationship
      ? `\nRelationship context: ${JSON.stringify(context.relationship)}`
      : '';

    const prompt = `Draft an email based on this request:

${request}
${contextStr}

Tone: ${context.tone || 'professional'}`;

    const response = await this.callAI(EMAIL_DRAFT_PROMPT, prompt);

    // Parse the response
    const subjectMatch = response.match(/SUBJECT:\s*(.+?)(?:\n|---)/);
    const subject = subjectMatch ? subjectMatch[1].trim() : 'No Subject';
    const body = response.split('---')[1]?.trim() || response;

    // Save draft to database
    const draft = EmailDraft.create({
      to_address: context.to || 'TBD',
      subject,
      body,
      context: JSON.stringify({ request, ...context }),
      status: 'draft'
    });

    console.log(`✉️ Created email draft: "${subject}" (ID: ${draft.id})`);

    return { subject, body, draft };
  }

  /* --------------------------------
     INBOX TRIAGE
  -------------------------------- */
  async triageEmail(email) {
    const emailContent = `
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.body}
`;

    const response = await this.callAI(INBOX_TRIAGE_PROMPT, emailContent);

    let triage;
    try {
      const jsonText = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      triage = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse triage JSON:', e.message);
      return null;
    }

    // Store entities in memory
    for (const entity of triage.key_entities || []) {
      Memory.set('contact', entity.toLowerCase().replace(/\s+/g, '-'), 'mentioned_in_email', {
        subject: email.subject,
        date: email.date,
        context: triage.summary
      }, { source: 'email_triage' });
    }

    // Create follow-up if needed
    if (triage.needs_response && triage.response_deadline) {
      FollowUp.create({
        entity_type: 'email',
        entity_id: email.id || `email-${Date.now()}`,
        entity_name: email.from,
        action: `Respond to email: ${email.subject}`,
        reason: triage.suggested_action,
        scheduled_for: triage.response_deadline
      });
    }

    return triage;
  }

  /* --------------------------------
     FETCH EMAILS (requires Gmail API)
  -------------------------------- */
  async fetchRecentEmails(maxResults = 20) {
    if (!this.gmail) {
      console.warn('Gmail API not initialized. Set up OAuth credentials.');
      return [];
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'is:unread'
      });

      const messages = response.data.messages || [];
      const emails = [];

      for (const msg of messages) {
        const detail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const headers = detail.data.payload.headers;
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;

        emails.push({
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          body: this.extractBody(detail.data.payload)
        });
      }

      return emails;
    } catch (e) {
      console.error('Failed to fetch emails:', e.message);
      return [];
    }
  }

  extractBody(payload) {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    return '';
  }

  /* --------------------------------
     SEND EMAIL (requires Gmail API)
  -------------------------------- */
  async sendEmail(to, subject, body) {
    if (!this.gmail) {
      console.warn('Gmail API not initialized. Cannot send email.');
      return null;
    }

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\n');

    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    try {
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      console.log(`📤 Email sent to ${to}: "${subject}"`);
      return response.data;
    } catch (e) {
      console.error('Failed to send email:', e.message);
      return null;
    }
  }

  /* --------------------------------
     BATCH INBOX PROCESSING
  -------------------------------- */
  async processInbox() {
    const emails = await this.fetchRecentEmails();
    const results = [];

    for (const email of emails) {
      const triage = await this.triageEmail(email);
      results.push({ email, triage });
    }

    // Sort by priority
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    results.sort((a, b) =>
      (priorityOrder[a.triage?.priority] || 3) - (priorityOrder[b.triage?.priority] || 3)
    );

    return results;
  }
}

module.exports = GmailIntegration;
