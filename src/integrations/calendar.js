// src/integrations/calendar.js
// Google Calendar integration - meetings, agendas, auto-saved notes

const { google } = require('googleapis');
const { CalendarEvent, Document, Memory } = require('../storage/models');

const AGENDA_PROMPT = `
You are a Meeting Agenda Agent.

Create a structured, actionable meeting agenda.

Format:
# [Meeting Title]

**Date:** [date]
**Duration:** [duration]
**Attendees:** [list]

## Objectives
- [ ] Objective 1
- [ ] Objective 2

## Agenda Items
### 1. [Topic] (X min)
- Discussion points
- Desired outcome

### 2. [Topic] (X min)
- Discussion points
- Desired outcome

## Pre-work
- What attendees should prepare

## Notes
[Space for meeting notes]

## Action Items
[To be filled during meeting]
`;

const NOTES_PROMPT = `
You are a Meeting Notes Agent.

Create clear, actionable meeting notes from the provided discussion.

Structure:
## Summary
1-2 sentence overview

## Key Decisions
- Decision 1
- Decision 2

## Discussion Points
- Point discussed and outcome

## Action Items
- [ ] Action | Owner | Due Date

## Open Questions
- Questions to follow up on

## Next Steps
- What happens next
`;

class CalendarIntegration {
  constructor(config = {}) {
    this.anthropic = config.anthropic;
    this.calendar = null;
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
      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }
  }

  getAuthUrl() {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    });
  }

  async authenticate(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    return tokens;
  }

  /* --------------------------------
     MEETING CREATION
  -------------------------------- */
  async createMeeting(data) {
    const startTime = new Date(data.startTime);
    const endTime = data.endTime
      ? new Date(data.endTime)
      : new Date(startTime.getTime() + (data.durationMinutes || 30) * 60000);

    // Generate agenda
    const agenda = await this.generateAgenda({
      title: data.title,
      attendees: data.attendees,
      objectives: data.objectives,
      duration: data.durationMinutes || 30
    });

    // Save to local database
    const localEvent = CalendarEvent.create({
      title: data.title,
      description: data.description,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      attendees: data.attendees,
      location: data.location,
      meeting_link: data.meetingLink,
      agenda: agenda.content
    });

    // Create in Google Calendar if connected
    let googleEvent = null;
    if (this.calendar) {
      try {
        const event = {
          summary: data.title,
          description: `${data.description || ''}\n\n${agenda.content}`,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: data.timeZone || 'America/New_York'
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: data.timeZone || 'America/New_York'
          },
          attendees: data.attendees?.map(email => ({ email })),
          conferenceData: data.addVideoCall ? {
            createRequest: { requestId: `meeting-${Date.now()}` }
          } : undefined
        };

        googleEvent = await this.calendar.events.insert({
          calendarId: 'primary',
          resource: event,
          conferenceDataVersion: data.addVideoCall ? 1 : 0,
          sendUpdates: 'all'
        });

        // Update local record with external ID
        const db = require('../storage/db').getDb();
        db.prepare('UPDATE calendar_events SET external_id = ? WHERE id = ?')
          .run(googleEvent.data.id, localEvent.id);

        console.log(`📆 Created Google Calendar event: ${data.title}`);
      } catch (e) {
        console.error('Failed to create Google Calendar event:', e.message);
      }
    }

    console.log(`📆 Created meeting: ${data.title} (ID: ${localEvent.id})`);

    return {
      localEvent,
      googleEvent: googleEvent?.data,
      agenda
    };
  }

  /* --------------------------------
     AGENDA GENERATION
  -------------------------------- */
  async generateAgenda(meetingInfo) {
    const prompt = `Create a meeting agenda for:

Title: ${meetingInfo.title}
Duration: ${meetingInfo.duration} minutes
Attendees: ${meetingInfo.attendees?.join(', ') || 'TBD'}
${meetingInfo.objectives ? `Objectives:\n${meetingInfo.objectives.map(o => `- ${o}`).join('\n')}` : ''}
${meetingInfo.context ? `Context: ${meetingInfo.context}` : ''}
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: AGENDA_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;

    // Save as document
    const doc = Document.create({
      title: `Agenda: ${meetingInfo.title}`,
      type: 'agenda',
      content,
      related_entity_type: 'meeting',
      related_entity_id: meetingInfo.eventId?.toString()
    });

    return { content, document: doc };
  }

  /* --------------------------------
     MEETING NOTES
  -------------------------------- */
  async generateNotes(eventId, discussion) {
    const event = CalendarEvent.getById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const prompt = `Create meeting notes for:

Meeting: ${event.title}
Date: ${event.start_time}
Attendees: ${event.attendees || 'Unknown'}

Discussion/Transcript:
${discussion}
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1200,
      system: NOTES_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const notes = response.content[0].text;

    // Update the event with notes
    CalendarEvent.updateNotes(eventId, notes);

    // Also save as a document
    const doc = Document.create({
      title: `Notes: ${event.title}`,
      type: 'notes',
      content: notes,
      related_entity_type: 'meeting',
      related_entity_id: eventId.toString()
    });

    // Extract and store key decisions in memory
    const decisionMatch = notes.match(/## Key Decisions\n([\s\S]*?)(?=\n##|$)/);
    if (decisionMatch) {
      Memory.set('meeting', eventId.toString(), 'decisions', decisionMatch[1].trim(), {
        source: 'meeting_notes',
        entityName: event.title
      });
    }

    console.log(`📝 Generated notes for: ${event.title}`);

    return { notes, document: doc };
  }

  /* --------------------------------
     FETCH UPCOMING EVENTS
  -------------------------------- */
  async getUpcomingEvents(days = 7) {
    const localEvents = CalendarEvent.getUpcoming(days);

    // If Google Calendar is connected, sync
    if (this.calendar) {
      try {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + days);

        const response = await this.calendar.events.list({
          calendarId: 'primary',
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: true,
          orderBy: 'startTime'
        });

        // Merge with local events
        const googleEvents = response.data.items || [];
        for (const ge of googleEvents) {
          const exists = localEvents.find(le => le.external_id === ge.id);
          if (!exists) {
            // Add to local database
            CalendarEvent.create({
              title: ge.summary,
              description: ge.description,
              start_time: ge.start.dateTime || ge.start.date,
              end_time: ge.end.dateTime || ge.end.date,
              attendees: ge.attendees?.map(a => a.email),
              location: ge.location,
              meeting_link: ge.hangoutLink,
              external_id: ge.id
            });
          }
        }

        return CalendarEvent.getUpcoming(days);
      } catch (e) {
        console.error('Failed to fetch Google Calendar events:', e.message);
      }
    }

    return localEvents;
  }

  /* --------------------------------
     PRE-MEETING PREP
  -------------------------------- */
  async prepareForMeeting(eventId) {
    const event = CalendarEvent.getById(eventId);
    if (!event) return null;

    // Get related documents
    const relatedDocs = Document.getByEntity('meeting', eventId.toString());

    // Get any memory about attendees
    const attendeeContext = [];
    const attendees = event.attendees ? JSON.parse(event.attendees) : [];

    for (const attendee of attendees) {
      const memories = Memory.search('relationship', attendee);
      if (memories.length > 0) {
        attendeeContext.push({
          attendee,
          context: memories.map(m => m.value)
        });
      }
    }

    return {
      event,
      agenda: relatedDocs.find(d => d.type === 'agenda'),
      previousNotes: relatedDocs.filter(d => d.type === 'notes'),
      attendeeContext
    };
  }

  /* --------------------------------
     RECURRING MEETING PATTERNS
  -------------------------------- */
  async analyzeRecurringMeetings() {
    const db = require('../storage/db').getDb();
    const events = db.prepare(`
      SELECT title, COUNT(*) as count,
             AVG(julianday(end_time) - julianday(start_time)) * 24 * 60 as avg_duration
      FROM calendar_events
      GROUP BY title
      HAVING count > 1
      ORDER BY count DESC
    `).all();

    return events.map(e => ({
      title: e.title,
      occurrences: e.count,
      avgDurationMinutes: Math.round(e.avg_duration)
    }));
  }
}

module.exports = CalendarIntegration;
