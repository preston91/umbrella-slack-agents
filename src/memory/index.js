// src/memory/index.js
// Long-term memory system - per client, deal, partner with intelligent recall

const { Memory, Relationship, Document, FollowUp, DecisionLog } = require('../storage/models');

const ENTITY_TYPES = {
  CLIENT: 'client',
  DEAL: 'deal',
  PARTNER: 'partner',
  INVESTOR: 'investor',
  CANDIDATE: 'candidate',
  PROJECT: 'project',
  COMPETITOR: 'competitor'
};

const MEMORY_EXTRACTION_PROMPT = `
You are a Memory Extraction Agent.

Analyze the conversation and extract key facts to remember about entities (people, companies, deals, etc.)

Return a JSON array of memory items:
[
  {
    "entity_type": "client|deal|partner|investor|candidate|project|competitor",
    "entity_name": "Name of the entity",
    "facts": [
      { "key": "fact_category", "value": "the fact", "confidence": 0.0-1.0 }
    ]
  }
]

Categories for facts:
- preference (likes, dislikes, preferences)
- concern (worries, objections, blockers)
- goal (objectives, targets, aspirations)
- context (background, history, situation)
- relationship (connections, dynamics)
- timeline (deadlines, milestones)
- financial (budget, pricing, revenue)
- decision (choices made, rationale)
- sentiment (mood, attitude, tone)

Return ONLY valid JSON, no other text.
`;

class LongTermMemory {
  constructor(anthropic) {
    this.anthropic = anthropic;
  }

  /* --------------------------------
     ENTITY MANAGEMENT
  -------------------------------- */
  createEntity(type, name, initialFacts = {}) {
    const entityId = this.normalizeId(name);

    // Store initial facts
    for (const [key, value] of Object.entries(initialFacts)) {
      Memory.set(type, entityId, key, value, {
        entityName: name,
        source: 'manual'
      });
    }

    console.log(`🧠 Created ${type} entity: ${name}`);

    return { type, id: entityId, name };
  }

  normalizeId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* --------------------------------
     MEMORY OPERATIONS
  -------------------------------- */
  remember(entityType, entityName, key, value, options = {}) {
    const entityId = this.normalizeId(entityName);

    Memory.set(entityType, entityId, key, value, {
      entityName,
      source: options.source || 'agent',
      confidence: options.confidence || 1.0
    });

    console.log(`🧠 Remembered for ${entityName}: ${key}`);

    return { entityType, entityId, entityName, key, value };
  }

  recall(entityType, entityName, key = null) {
    const entityId = this.normalizeId(entityName);

    if (key) {
      return Memory.get(entityType, entityId, key);
    }

    return Memory.getAll(entityType, entityId);
  }

  /* --------------------------------
     AUTOMATIC EXTRACTION
  -------------------------------- */
  async extractMemories(text, source = 'conversation') {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: MEMORY_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: text }]
    });

    let extracted = [];
    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      extracted = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse memory extraction:', e.message);
      return [];
    }

    const saved = [];
    for (const entity of extracted) {
      const entityId = this.normalizeId(entity.entity_name);

      for (const fact of entity.facts || []) {
        Memory.set(entity.entity_type, entityId, fact.key, fact.value, {
          entityName: entity.entity_name,
          source,
          confidence: fact.confidence || 0.8
        });
        saved.push({ entity: entity.entity_name, fact });
      }
    }

    if (saved.length > 0) {
      console.log(`🧠 Extracted ${saved.length} memories from conversation`);
    }

    return saved;
  }

  /* --------------------------------
     ENTITY PROFILES
  -------------------------------- */
  getEntityProfile(entityType, entityName) {
    const entityId = this.normalizeId(entityName);
    const memories = Memory.getAll(entityType, entityId);

    // Get related documents
    const documents = Document.getByEntity(entityType, entityId);

    // Get related decisions
    const decisions = DecisionLog.search(entityName);

    // Get follow-ups
    const followUps = FollowUp.getByEntity(entityType, entityId);

    // Get relationship data if it's a person
    const relationships = Relationship.search(entityName);

    return {
      type: entityType,
      id: entityId,
      name: entityName,
      memories,
      documents,
      decisions: decisions.slice(0, 10),
      followUps,
      relationships: relationships.slice(0, 5)
    };
  }

  /* --------------------------------
     CONTEXT BUILDING
  -------------------------------- */
  buildContext(entityType, entityName) {
    const profile = this.getEntityProfile(entityType, entityName);
    const memories = profile.memories;

    let context = `## ${entityName} (${entityType})\n\n`;

    // Group memories by category
    const categories = {};
    for (const [key, data] of Object.entries(memories)) {
      const category = key.split('_')[0] || 'general';
      if (!categories[category]) categories[category] = [];
      categories[category].push({ key, ...data });
    }

    // Build context string
    for (const [category, items] of Object.entries(categories)) {
      context += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
      for (const item of items) {
        const value = typeof item.value === 'object' ? JSON.stringify(item.value) : item.value;
        const confidence = item.confidence < 1 ? ` (${Math.round(item.confidence * 100)}% confident)` : '';
        context += `- ${value}${confidence}\n`;
      }
      context += '\n';
    }

    // Add recent decisions
    if (profile.decisions.length > 0) {
      context += `### Recent Decisions\n`;
      for (const d of profile.decisions.slice(0, 5)) {
        context += `- ${d.decision}\n`;
      }
      context += '\n';
    }

    // Add pending follow-ups
    const pendingFollowUps = profile.followUps.filter(f => f.status === 'pending');
    if (pendingFollowUps.length > 0) {
      context += `### Pending Follow-ups\n`;
      for (const f of pendingFollowUps) {
        context += `- ${f.action} (due: ${new Date(f.scheduled_for).toLocaleDateString()})\n`;
      }
      context += '\n';
    }

    return context;
  }

  /* --------------------------------
     SEARCH & DISCOVERY
  -------------------------------- */
  searchAcrossEntities(query, entityTypes = null) {
    const types = entityTypes || Object.values(ENTITY_TYPES);
    const results = [];

    for (const type of types) {
      const matches = Memory.search(type, query);
      results.push(...matches.map(m => ({ ...m, entity_type: type })));
    }

    return results.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  listEntities(entityType, limit = 50) {
    return Memory.getByType(entityType, limit);
  }

  /* --------------------------------
     INTELLIGENCE QUERIES
  -------------------------------- */
  async queryMemory(question, relevantEntities = []) {
    // Build context from relevant entities
    let context = '';
    for (const { type, name } of relevantEntities) {
      context += this.buildContext(type, name) + '\n---\n';
    }

    // If no entities specified, search for relevant ones
    if (relevantEntities.length === 0) {
      const searchResults = this.searchAcrossEntities(question);
      const uniqueEntities = new Map();

      for (const r of searchResults.slice(0, 5)) {
        const key = `${r.entity_type}:${r.entity_id}`;
        if (!uniqueEntities.has(key)) {
          uniqueEntities.set(key, { type: r.entity_type, name: r.entity_name || r.entity_id });
        }
      }

      for (const entity of uniqueEntities.values()) {
        context += this.buildContext(entity.type, entity.name) + '\n---\n';
      }
    }

    if (!context) {
      return { answer: "I don't have any relevant information stored about this.", sources: [] };
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: `You are a Memory Recall Agent. Answer questions based on the stored context.
Be specific and cite the relevant information. If you're not sure, say so.`,
      messages: [
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}`
        }
      ]
    });

    return {
      answer: response.content[0].text,
      sources: relevantEntities
    };
  }

  /* --------------------------------
     MEMORY MAINTENANCE
  -------------------------------- */
  async consolidateMemories(entityType, entityName) {
    const profile = this.getEntityProfile(entityType, entityName);
    const memories = profile.memories;

    if (Object.keys(memories).length < 5) {
      return null; // Not enough to consolidate
    }

    const memoryText = Object.entries(memories)
      .map(([k, v]) => `${k}: ${JSON.stringify(v.value)}`)
      .join('\n');

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      system: `You are a Memory Consolidation Agent. Review the stored facts and:
1. Identify redundant or outdated information
2. Suggest a consolidated summary
3. Flag any contradictions

Return JSON:
{
  "summary": "Consolidated summary of key facts",
  "keep": ["key1", "key2"],
  "remove": ["key3"],
  "contradictions": ["description of any contradictions"]
}`,
      messages: [{ role: 'user', content: `Consolidate memories for ${entityName}:\n\n${memoryText}` }]
    });

    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to consolidate memories:', e.message);
      return null;
    }
  }

  /* --------------------------------
     STATS & REPORTING
  -------------------------------- */
  getMemoryStats() {
    const stats = {};

    for (const type of Object.values(ENTITY_TYPES)) {
      const entities = Memory.getByType(type);
      stats[type] = {
        entityCount: entities.length,
        totalFacts: entities.reduce((sum, e) => sum + e.fact_count, 0)
      };
    }

    return stats;
  }
}

module.exports = { LongTermMemory, ENTITY_TYPES };
