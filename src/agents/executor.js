// src/agents/executor.js
// Execution agents - scheduling, follow-ups, doc creation

const { Task, FollowUp, Document, CalendarEvent, Memory } = require('../storage/models');

const TASK_EXTRACTION_PROMPT = `
You are a Task Extraction Agent.

Analyze the message and extract any tasks, action items, or to-dos.

For each task, return a JSON array with objects containing:
- title: Brief task title
- description: What needs to be done
- type: One of [follow_up, scheduling, doc_creation, research, outreach, other]
- priority: One of [urgent, high, normal, low]
- assigned_to: Who should do it (if mentioned)
- due_date: When it's due (ISO format if specific, null if not)

If no tasks found, return an empty array: []

Return ONLY valid JSON, no other text.
`;

const FOLLOW_UP_PROMPT = `
You are a Follow-up Scheduling Agent.

Based on the context, determine if a follow-up is needed and when.

Return a JSON object:
{
  "needs_follow_up": boolean,
  "action": "What to do in the follow-up",
  "reason": "Why this follow-up is important",
  "suggested_date": "ISO date string for when to follow up",
  "entity_type": "client|deal|partner|investor|candidate|other",
  "entity_name": "Name of the person/company"
}

If no follow-up needed, return: { "needs_follow_up": false }

Return ONLY valid JSON, no other text.
`;

const DOC_OUTLINE_PROMPT = `
You are a Document Creation Agent.

Based on the request, create a structured outline for the document.

Return a JSON object:
{
  "title": "Document title",
  "type": "memo|proposal|brief|report|agenda|notes",
  "sections": [
    { "heading": "Section title", "content_guidance": "What to include" }
  ],
  "key_points": ["Main points to cover"]
}

Return ONLY valid JSON, no other text.
`;

class ExecutionAgents {
  constructor(anthropic) {
    this.anthropic = anthropic;
  }

  /* --------------------------------
     TASK EXTRACTION & MANAGEMENT
  -------------------------------- */
  async extractTasks(text, channelName = null) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: TASK_EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract tasks from this message:\n\n${text}`
        }
      ]
    });

    let tasks = [];
    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      tasks = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse tasks JSON:', e.message);
      return [];
    }

    // Save tasks to database
    const savedTasks = [];
    for (const t of tasks) {
      const saved = Task.create({
        type: t.type || 'other',
        title: t.title,
        description: t.description,
        priority: t.priority || 'normal',
        assigned_agent: t.assigned_to,
        due_date: t.due_date,
        metadata: { channel: channelName }
      });
      savedTasks.push(saved);
      console.log(`✅ Created task: "${t.title}" (ID: ${saved.id})`);
    }

    return savedTasks;
  }

  /* --------------------------------
     FOLLOW-UP SCHEDULING
  -------------------------------- */
  async scheduleFollowUp(context, channelName = null) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: FOLLOW_UP_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Determine if follow-up is needed based on this context:\n\n${context}`
        }
      ]
    });

    let result;
    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      result = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse follow-up JSON:', e.message);
      return null;
    }

    if (!result.needs_follow_up) {
      return null;
    }

    // Create the follow-up
    const followUp = FollowUp.create({
      entity_type: result.entity_type || 'other',
      entity_id: result.entity_name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      entity_name: result.entity_name,
      action: result.action,
      reason: result.reason,
      scheduled_for: result.suggested_date || this.getDefaultFollowUpDate(),
      channel_name: channelName
    });

    console.log(`📅 Scheduled follow-up: "${result.action}" for ${result.entity_name} (ID: ${followUp.id})`);

    return followUp;
  }

  getDefaultFollowUpDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3); // Default: 3 days from now
    return date.toISOString();
  }

  async checkDueFollowUps() {
    const dueFollowUps = FollowUp.getDue();
    return dueFollowUps;
  }

  async getUpcomingFollowUps(days = 7) {
    return FollowUp.getUpcoming(days);
  }

  /* --------------------------------
     DOCUMENT CREATION
  -------------------------------- */
  async createDocumentOutline(request, relatedEntity = null) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: DOC_OUTLINE_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Create a document outline for:\n\n${request}`
        }
      ]
    });

    let outline;
    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      outline = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse document outline JSON:', e.message);
      return null;
    }

    // Build the content
    let content = `# ${outline.title}\n\n`;
    content += `**Type:** ${outline.type}\n\n`;
    content += `## Key Points\n`;
    for (const point of outline.key_points || []) {
      content += `- ${point}\n`;
    }
    content += '\n';

    for (const section of outline.sections || []) {
      content += `## ${section.heading}\n`;
      content += `_Guidance: ${section.content_guidance}_\n\n`;
    }

    // Save to database
    const doc = Document.create({
      title: outline.title,
      type: outline.type,
      content: content,
      related_entity_type: relatedEntity?.type,
      related_entity_id: relatedEntity?.id
    });

    console.log(`📄 Created document: "${outline.title}" (ID: ${doc.id})`);

    return { outline, document: doc, content };
  }

  /* --------------------------------
     MEETING SCHEDULING
  -------------------------------- */
  async scheduleMeeting(request) {
    const MEETING_PROMPT = `
You are a Meeting Scheduling Agent.

Based on the request, extract meeting details.

Return a JSON object:
{
  "title": "Meeting title",
  "description": "Brief description",
  "duration_minutes": 30,
  "attendees": ["person1", "person2"],
  "suggested_times": ["ISO datetime 1", "ISO datetime 2"],
  "agenda_items": ["Item 1", "Item 2"]
}

Return ONLY valid JSON, no other text.
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      system: MEETING_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract meeting details from:\n\n${request}`
        }
      ]
    });

    let meeting;
    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      meeting = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse meeting JSON:', e.message);
      return null;
    }

    // Create agenda document
    let agenda = `# ${meeting.title}\n\n`;
    agenda += `**Duration:** ${meeting.duration_minutes} minutes\n`;
    agenda += `**Attendees:** ${meeting.attendees?.join(', ') || 'TBD'}\n\n`;
    agenda += `## Agenda\n`;
    for (const item of meeting.agenda_items || []) {
      agenda += `- [ ] ${item}\n`;
    }

    // Save to calendar (using first suggested time)
    const startTime = meeting.suggested_times?.[0] || new Date().toISOString();
    const endTime = new Date(new Date(startTime).getTime() + (meeting.duration_minutes || 30) * 60000).toISOString();

    const event = CalendarEvent.create({
      title: meeting.title,
      description: meeting.description,
      start_time: startTime,
      end_time: endTime,
      attendees: meeting.attendees,
      agenda: agenda
    });

    console.log(`📆 Created meeting: "${meeting.title}" (ID: ${event.id})`);

    return { meeting, event, agenda };
  }

  /* --------------------------------
     BATCH PROCESSING
  -------------------------------- */
  async processMessage(text, channelName = null) {
    // Extract tasks and potentially schedule follow-ups
    const [tasks, followUp] = await Promise.all([
      this.extractTasks(text, channelName),
      this.scheduleFollowUp(text, channelName)
    ]);

    return { tasks, followUp };
  }
}

module.exports = ExecutionAgents;
