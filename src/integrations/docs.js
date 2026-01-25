// src/integrations/docs.js
// Google Docs integration - document creation, templates, auto-save

const { google } = require('googleapis');
const { Document, Memory } = require('../storage/models');

const DOC_TEMPLATES = {
  meeting_notes: `# Meeting Notes: {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

---

## Objectives
{{objectives}}

## Discussion
{{discussion}}

## Decisions
{{decisions}}

## Action Items
{{action_items}}

## Next Steps
{{next_steps}}
`,

  proposal: `# {{title}}

## Executive Summary
{{summary}}

## Problem Statement
{{problem}}

## Proposed Solution
{{solution}}

## Timeline
{{timeline}}

## Budget
{{budget}}

## Risks & Mitigations
{{risks}}

## Next Steps
{{next_steps}}
`,

  brief: `# {{title}}

## Background
{{background}}

## Objective
{{objective}}

## Key Points
{{key_points}}

## Recommendation
{{recommendation}}

## Supporting Evidence
{{evidence}}
`,

  report: `# {{title}}

**Date:** {{date}}
**Author:** {{author}}

## Executive Summary
{{summary}}

## Key Metrics
{{metrics}}

## Analysis
{{analysis}}

## Findings
{{findings}}

## Recommendations
{{recommendations}}

## Appendix
{{appendix}}
`
};

class DocsIntegration {
  constructor(config = {}) {
    this.anthropic = config.anthropic;
    this.docs = null;
    this.drive = null;
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

    if (credentials.tokens) {
      this.oauth2Client.setCredentials(credentials.tokens);
      this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    }
  }

  getAuthUrl() {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });
  }

  async authenticate(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    return tokens;
  }

  /* --------------------------------
     DOCUMENT CREATION
  -------------------------------- */
  async createDocument(data) {
    const { title, type, content, variables = {} } = data;

    // Get template if type matches
    let finalContent = content;
    if (DOC_TEMPLATES[type] && !content) {
      finalContent = this.applyTemplate(DOC_TEMPLATES[type], variables);
    }

    // Save to local database
    const localDoc = Document.create({
      title,
      type: type || 'general',
      content: finalContent,
      related_entity_type: data.relatedEntityType,
      related_entity_id: data.relatedEntityId
    });

    // Create in Google Docs if connected
    let googleDoc = null;
    if (this.docs) {
      try {
        // Create the document
        const createResponse = await this.docs.documents.create({
          requestBody: { title }
        });

        const documentId = createResponse.data.documentId;

        // Insert content
        if (finalContent) {
          await this.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [{
                insertText: {
                  location: { index: 1 },
                  text: finalContent
                }
              }]
            }
          });
        }

        googleDoc = {
          id: documentId,
          url: `https://docs.google.com/document/d/${documentId}/edit`
        };

        // Update local record
        const db = require('../storage/db').getDb();
        db.prepare('UPDATE documents SET external_id = ?, external_url = ? WHERE id = ?')
          .run(documentId, googleDoc.url, localDoc.id);

        console.log(`📄 Created Google Doc: ${title}`);
      } catch (e) {
        console.error('Failed to create Google Doc:', e.message);
      }
    }

    console.log(`📄 Created document: ${title} (ID: ${localDoc.id})`);

    return {
      localDoc,
      googleDoc,
      content: finalContent
    };
  }

  applyTemplate(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value || '');
    }
    // Clean up unused placeholders
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result;
  }

  /* --------------------------------
     AI-POWERED DOCUMENT GENERATION
  -------------------------------- */
  async generateDocument(request, type = 'general') {
    const prompt = `Create a ${type} document based on this request:

${request}

Use clear structure with headers, bullet points where appropriate, and professional language.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      system: `You are a Document Creation Agent. Create well-structured, professional documents.
Use markdown formatting for structure (# headers, - bullets, **bold**, etc.)
Be concise but thorough. Focus on actionable content.`,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;

    // Extract title from content
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : `${type} - ${new Date().toLocaleDateString()}`;

    return this.createDocument({
      title,
      type,
      content
    });
  }

  /* --------------------------------
     DOCUMENT TEMPLATES
  -------------------------------- */
  async createFromTemplate(templateName, variables, options = {}) {
    const template = DOC_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    const title = variables.title || `${templateName} - ${new Date().toLocaleDateString()}`;
    const content = this.applyTemplate(template, variables);

    return this.createDocument({
      title,
      type: templateName,
      content,
      ...options
    });
  }

  getAvailableTemplates() {
    return Object.keys(DOC_TEMPLATES);
  }

  /* --------------------------------
     DOCUMENT SEARCH & RETRIEVAL
  -------------------------------- */
  searchDocuments(query) {
    return Document.search(query);
  }

  getDocumentsByEntity(entityType, entityId) {
    return Document.getByEntity(entityType, entityId);
  }

  async getDocumentContent(docId) {
    const localDoc = Document.getById(docId);
    if (!localDoc) return null;

    // If we have Google Docs connected and there's an external ID, fetch latest
    if (this.docs && localDoc.external_id) {
      try {
        const response = await this.docs.documents.get({
          documentId: localDoc.external_id
        });

        // Extract text content from Google Docs structure
        const content = this.extractTextFromGoogleDoc(response.data);

        // Update local copy
        const db = require('../storage/db').getDb();
        db.prepare('UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(content, docId);

        return { ...localDoc, content, synced: true };
      } catch (e) {
        console.error('Failed to fetch Google Doc:', e.message);
      }
    }

    return localDoc;
  }

  extractTextFromGoogleDoc(doc) {
    let text = '';
    const content = doc.body?.content || [];

    for (const element of content) {
      if (element.paragraph) {
        for (const elem of element.paragraph.elements || []) {
          if (elem.textRun) {
            text += elem.textRun.content;
          }
        }
      }
    }

    return text;
  }

  /* --------------------------------
     DOCUMENT SHARING
  -------------------------------- */
  async shareDocument(docId, email, role = 'reader') {
    const localDoc = Document.getById(docId);
    if (!localDoc?.external_id || !this.drive) {
      console.warn('Cannot share: No Google Doc connection');
      return null;
    }

    try {
      await this.drive.permissions.create({
        fileId: localDoc.external_id,
        requestBody: {
          type: 'user',
          role: role, // 'reader', 'commenter', or 'writer'
          emailAddress: email
        },
        sendNotificationEmail: true
      });

      console.log(`📤 Shared document with ${email}`);
      return true;
    } catch (e) {
      console.error('Failed to share document:', e.message);
      return false;
    }
  }

  /* --------------------------------
     RECENT DOCUMENTS
  -------------------------------- */
  async getRecentDocuments(limit = 20) {
    const db = require('../storage/db').getDb();
    return db.prepare(`
      SELECT * FROM documents
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
  }

  /* --------------------------------
     DOCUMENT ORGANIZATION
  -------------------------------- */
  async moveToFolder(docId, folderId) {
    const localDoc = Document.getById(docId);
    if (!localDoc?.external_id || !this.drive) {
      return false;
    }

    try {
      // Get current parents
      const file = await this.drive.files.get({
        fileId: localDoc.external_id,
        fields: 'parents'
      });

      // Move to new folder
      await this.drive.files.update({
        fileId: localDoc.external_id,
        addParents: folderId,
        removeParents: file.data.parents?.join(','),
        fields: 'id, parents'
      });

      return true;
    } catch (e) {
      console.error('Failed to move document:', e.message);
      return false;
    }
  }
}

module.exports = DocsIntegration;
