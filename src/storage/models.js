// src/storage/models.js
// Data models for interacting with the database

const { getDb } = require('./db');

/* --------------------------------
   CHANNEL SUMMARIES
-------------------------------- */
const ChannelSummary = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO channel_summaries (channel_name, summary, period_start, period_end, message_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.channel_name,
      data.summary,
      data.period_start,
      data.period_end,
      data.message_count || 0
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getByChannel(channelName, limit = 10) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM channel_summaries
      WHERE channel_name = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(channelName, limit);
  },

  getRecent(limit = 20) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM channel_summaries
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }
};

/* --------------------------------
   DECISION LOGS
-------------------------------- */
const DecisionLog = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO decision_logs (channel_name, decision, context, made_by, stakeholders, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.channel_name,
      data.decision,
      data.context || null,
      data.made_by || null,
      data.stakeholders || null,
      data.status || 'active'
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getByChannel(channelName, limit = 20) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM decision_logs
      WHERE channel_name = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(channelName, limit);
  },

  getActive() {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM decision_logs
      WHERE status = 'active'
      ORDER BY created_at DESC
    `).all();
  },

  updateStatus(id, status) {
    const db = getDb();
    return db.prepare(`
      UPDATE decision_logs
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);
  },

  search(query) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM decision_logs
      WHERE decision LIKE ? OR context LIKE ?
      ORDER BY created_at DESC
    `).all(`%${query}%`, `%${query}%`);
  }
};

/* --------------------------------
   LONG-TERM MEMORY
-------------------------------- */
const Memory = {
  set(entityType, entityId, key, value, options = {}) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO memory (entity_type, entity_id, entity_name, key, value, source, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id, key)
      DO UPDATE SET value = excluded.value,
                    source = excluded.source,
                    confidence = excluded.confidence,
                    updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      entityType,
      entityId,
      options.entityName || null,
      key,
      typeof value === 'object' ? JSON.stringify(value) : String(value),
      options.source || null,
      options.confidence || 1.0
    );
    return { entityType, entityId, key, value };
  },

  get(entityType, entityId, key) {
    const db = getDb();
    const row = db.prepare(`
      SELECT value FROM memory
      WHERE entity_type = ? AND entity_id = ? AND key = ?
    `).get(entityType, entityId, key);

    if (!row) return null;

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  },

  getAll(entityType, entityId) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT key, value, confidence, source, updated_at
      FROM memory
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY updated_at DESC
    `).all(entityType, entityId);

    const result = {};
    for (const row of rows) {
      try {
        result[row.key] = {
          value: JSON.parse(row.value),
          confidence: row.confidence,
          source: row.source,
          updatedAt: row.updated_at
        };
      } catch {
        result[row.key] = {
          value: row.value,
          confidence: row.confidence,
          source: row.source,
          updatedAt: row.updated_at
        };
      }
    }
    return result;
  },

  search(entityType, query) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM memory
      WHERE entity_type = ? AND (entity_name LIKE ? OR value LIKE ?)
      ORDER BY updated_at DESC
    `).all(entityType, `%${query}%`, `%${query}%`);
  },

  getByType(entityType, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT DISTINCT entity_id, entity_name,
             COUNT(*) as fact_count,
             MAX(updated_at) as last_updated
      FROM memory
      WHERE entity_type = ?
      GROUP BY entity_id
      ORDER BY last_updated DESC
      LIMIT ?
    `).all(entityType, limit);
  }
};

/* --------------------------------
   TASKS
-------------------------------- */
const Task = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO tasks (type, title, description, status, priority, assigned_agent, due_date, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.type,
      data.title,
      data.description || null,
      data.status || 'pending',
      data.priority || 'normal',
      data.assigned_agent || null,
      data.due_date || null,
      data.metadata ? JSON.stringify(data.metadata) : null
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  },

  getPending(agentKey = null) {
    const db = getDb();
    if (agentKey) {
      return db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'pending' AND assigned_agent = ?
        ORDER BY priority DESC, created_at ASC
      `).all(agentKey);
    }
    return db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
    `).all();
  },

  updateStatus(id, status) {
    const db = getDb();
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    return db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = CURRENT_TIMESTAMP, completed_at = ?
      WHERE id = ?
    `).run(status, completedAt, id);
  },

  getByType(type, limit = 20) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM tasks WHERE type = ? ORDER BY created_at DESC LIMIT ?
    `).all(type, limit);
  }
};

/* --------------------------------
   FOLLOW-UPS
-------------------------------- */
const FollowUp = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO follow_ups (entity_type, entity_id, entity_name, action, reason, scheduled_for, channel_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.entity_type,
      data.entity_id,
      data.entity_name || null,
      data.action,
      data.reason || null,
      data.scheduled_for,
      data.channel_name || null
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getDue() {
    const db = getDb();
    const now = new Date().toISOString();
    return db.prepare(`
      SELECT * FROM follow_ups
      WHERE status = 'pending' AND scheduled_for <= ?
      ORDER BY scheduled_for ASC
    `).all(now);
  },

  getUpcoming(days = 7) {
    const db = getDb();
    const future = new Date();
    future.setDate(future.getDate() + days);
    return db.prepare(`
      SELECT * FROM follow_ups
      WHERE status = 'pending' AND scheduled_for <= ?
      ORDER BY scheduled_for ASC
    `).all(future.toISOString());
  },

  complete(id) {
    const db = getDb();
    return db.prepare(`
      UPDATE follow_ups
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  },

  getByEntity(entityType, entityId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM follow_ups
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY scheduled_for ASC
    `).all(entityType, entityId);
  }
};

/* --------------------------------
   EMAIL DRAFTS
-------------------------------- */
const EmailDraft = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO email_drafts (to_address, subject, body, context, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.to_address,
      data.subject,
      data.body,
      data.context || null,
      data.status || 'draft'
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM email_drafts WHERE id = ?').get(id);
  },

  getDrafts() {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM email_drafts
      WHERE status = 'draft'
      ORDER BY created_at DESC
    `).all();
  },

  markSent(id) {
    const db = getDb();
    return db.prepare(`
      UPDATE email_drafts
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }
};

/* --------------------------------
   RELATIONSHIPS
-------------------------------- */
const Relationship = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO relationships (person_name, company, role, linkedin_url, email, relationship_strength, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.person_name,
      data.company || null,
      data.role || null,
      data.linkedin_url || null,
      data.email || null,
      data.relationship_strength || 'weak',
      data.notes || null,
      data.tags ? JSON.stringify(data.tags) : null
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM relationships WHERE id = ?').get(id);
  },

  search(query) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM relationships
      WHERE person_name LIKE ? OR company LIKE ? OR notes LIKE ?
      ORDER BY updated_at DESC
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
  },

  updateLastContact(id) {
    const db = getDb();
    return db.prepare(`
      UPDATE relationships
      SET last_contact = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  },

  getByStrength(strength) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM relationships
      WHERE relationship_strength = ?
      ORDER BY last_contact DESC
    `).all(strength);
  },

  getAll(limit = 100) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM relationships ORDER BY updated_at DESC LIMIT ?
    `).all(limit);
  }
};

/* --------------------------------
   CALENDAR EVENTS
-------------------------------- */
const CalendarEvent = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO calendar_events (title, description, start_time, end_time, attendees, location, meeting_link, agenda, external_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.title,
      data.description || null,
      data.start_time,
      data.end_time,
      data.attendees ? JSON.stringify(data.attendees) : null,
      data.location || null,
      data.meeting_link || null,
      data.agenda || null,
      data.external_id || null
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getUpcoming(days = 7) {
    const db = getDb();
    const now = new Date().toISOString();
    const future = new Date();
    future.setDate(future.getDate() + days);
    return db.prepare(`
      SELECT * FROM calendar_events
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time ASC
    `).all(now, future.toISOString());
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
  },

  updateNotes(id, notes) {
    const db = getDb();
    return db.prepare(`
      UPDATE calendar_events
      SET notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(notes, id);
  }
};

/* --------------------------------
   DOCUMENTS
-------------------------------- */
const Document = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO documents (title, type, content, external_url, external_id, related_entity_type, related_entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.title,
      data.type,
      data.content || null,
      data.external_url || null,
      data.external_id || null,
      data.related_entity_type || null,
      data.related_entity_id || null
    );
    return { id: result.lastInsertRowid, ...data };
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  },

  getByEntity(entityType, entityId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM documents
      WHERE related_entity_type = ? AND related_entity_id = ?
      ORDER BY created_at DESC
    `).all(entityType, entityId);
  },

  search(query) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM documents
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
    `).all(`%${query}%`, `%${query}%`);
  }
};

module.exports = {
  ChannelSummary,
  DecisionLog,
  Memory,
  Task,
  FollowUp,
  EmailDraft,
  Relationship,
  CalendarEvent,
  Document
};
