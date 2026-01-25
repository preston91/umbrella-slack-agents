// src/integrations/linkedin.js
// LinkedIn integration - relationship context, post drafting, outbound support

const { Relationship, Memory, FollowUp } = require('../storage/models');

const POST_DRAFT_PROMPT = `
You are a LinkedIn Post Drafting Agent.

Create engaging, professional LinkedIn posts that:
- Hook readers in the first line
- Provide value (insight, story, or lesson)
- Are easy to scan (short paragraphs, line breaks)
- End with engagement (question or call-to-action)
- Use appropriate hashtags (2-4 max)

Do NOT use generic corporate speak. Be authentic and specific.

Format:
[Hook line]

[Body - 2-3 short paragraphs]

[Call to action or question]

[Hashtags]
`;

const OUTREACH_PROMPT = `
You are a LinkedIn Outreach Agent.

Craft personalized connection requests or messages that:
- Reference something specific about the person
- Explain why you're reaching out
- Provide value, don't just ask
- Keep it under 300 characters for connection requests

Return in this format:
TYPE: [connection_request|direct_message|inmail]
---
[message content]
`;

const RELATIONSHIP_ANALYSIS_PROMPT = `
You are a Relationship Intelligence Agent.

Analyze the provided context about a person/relationship and extract:

{
  "relationship_strength": "strong|medium|weak|new",
  "key_facts": ["Important things to remember"],
  "common_ground": ["Shared interests or connections"],
  "suggested_touchpoints": ["Ways to stay in touch"],
  "potential_value": "How this relationship could be valuable",
  "next_best_action": "What to do next with this relationship"
}

Return ONLY valid JSON, no other text.
`;

class LinkedInIntegration {
  constructor(config = {}) {
    this.anthropic = config.anthropic;

    // LinkedIn API (limited access, requires partnership)
    // Most operations will be manual or use browser automation
    this.accessToken = config.linkedinAccessToken;
  }

  /* --------------------------------
     RELATIONSHIP MANAGEMENT
  -------------------------------- */
  addRelationship(data) {
    const relationship = Relationship.create({
      person_name: data.name,
      company: data.company,
      role: data.role,
      linkedin_url: data.linkedinUrl,
      email: data.email,
      relationship_strength: data.strength || 'weak',
      notes: data.notes,
      tags: data.tags
    });

    console.log(`👤 Added relationship: ${data.name} at ${data.company}`);
    return relationship;
  }

  findRelationship(query) {
    return Relationship.search(query);
  }

  updateRelationshipStrength(id, strength) {
    const db = require('../storage/db').getDb();
    db.prepare(`
      UPDATE relationships
      SET relationship_strength = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(strength, id);
  }

  recordInteraction(relationshipId, type, notes) {
    const relationship = Relationship.getById(relationshipId);
    if (!relationship) return null;

    // Update last contact
    Relationship.updateLastContact(relationshipId);

    // Store interaction in memory
    Memory.set(
      'relationship',
      relationshipId.toString(),
      `interaction_${Date.now()}`,
      { type, notes, date: new Date().toISOString() },
      { source: 'linkedin', entityName: relationship.person_name }
    );

    return relationship;
  }

  /* --------------------------------
     RELATIONSHIP CONTEXT ENRICHMENT
  -------------------------------- */
  async analyzeRelationship(relationshipId) {
    const relationship = Relationship.getById(relationshipId);
    if (!relationship) return null;

    // Get all memory about this relationship
    const memories = Memory.getAll('relationship', relationshipId.toString());

    const context = `
Person: ${relationship.person_name}
Company: ${relationship.company || 'Unknown'}
Role: ${relationship.role || 'Unknown'}
Current Strength: ${relationship.relationship_strength}
Last Contact: ${relationship.last_contact || 'Never'}
Notes: ${relationship.notes || 'None'}

Historical Context:
${Object.entries(memories).map(([k, v]) => `- ${k}: ${JSON.stringify(v.value)}`).join('\n')}
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: RELATIONSHIP_ANALYSIS_PROMPT,
      messages: [{ role: 'user', content: context }]
    });

    let analysis;
    try {
      const jsonText = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      analysis = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse relationship analysis:', e.message);
      return null;
    }

    // Update memory with analysis
    Memory.set('relationship', relationshipId.toString(), 'latest_analysis', analysis, {
      source: 'ai_analysis',
      entityName: relationship.person_name
    });

    // Create follow-up if suggested
    if (analysis.next_best_action) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 7); // 1 week from now

      FollowUp.create({
        entity_type: 'relationship',
        entity_id: relationshipId.toString(),
        entity_name: relationship.person_name,
        action: analysis.next_best_action,
        reason: 'AI-suggested relationship nurturing',
        scheduled_for: followUpDate.toISOString()
      });
    }

    return { relationship, analysis };
  }

  /* --------------------------------
     POST DRAFTING
  -------------------------------- */
  async draftPost(topic, context = {}) {
    const prompt = `Create a LinkedIn post about:

Topic: ${topic}

${context.audience ? `Target audience: ${context.audience}` : ''}
${context.tone ? `Tone: ${context.tone}` : ''}
${context.goal ? `Goal: ${context.goal}` : ''}
${context.personalStory ? `Include this personal angle: ${context.personalStory}` : ''}
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: POST_DRAFT_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const post = response.content[0].text;

    console.log(`📝 Drafted LinkedIn post on: ${topic.substring(0, 30)}...`);

    return {
      topic,
      content: post,
      characterCount: post.length,
      createdAt: new Date().toISOString()
    };
  }

  /* --------------------------------
     OUTREACH SUPPORT
  -------------------------------- */
  async draftOutreach(target, context = {}) {
    // Check if we have existing relationship data
    const existingRelationships = Relationship.search(target.name || target.company || '');
    const existingData = existingRelationships[0];

    const memories = existingData
      ? Memory.getAll('relationship', existingData.id.toString())
      : {};

    const prompt = `Draft outreach for:

Name: ${target.name}
Company: ${target.company || 'Unknown'}
Role: ${target.role || 'Unknown'}
${target.linkedinUrl ? `LinkedIn: ${target.linkedinUrl}` : ''}

${context.purpose ? `Purpose: ${context.purpose}` : ''}
${context.sharedConnection ? `Shared connection: ${context.sharedConnection}` : ''}
${context.recentActivity ? `Their recent activity: ${context.recentActivity}` : ''}

${Object.keys(memories).length > 0 ? `
Previous interactions:
${Object.entries(memories).map(([k, v]) => `- ${k}: ${JSON.stringify(v.value)}`).join('\n')}
` : ''}
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: OUTREACH_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = response.content[0].text;
    const typeMatch = responseText.match(/TYPE:\s*(\w+)/);
    const type = typeMatch ? typeMatch[1] : 'direct_message';
    const message = responseText.split('---')[1]?.trim() || responseText;

    // Add to relationships if new
    if (!existingData) {
      this.addRelationship({
        name: target.name,
        company: target.company,
        role: target.role,
        linkedinUrl: target.linkedinUrl,
        strength: 'new',
        notes: `Outreach drafted: ${context.purpose || 'connection'}`
      });
    }

    console.log(`💬 Drafted ${type} for ${target.name}`);

    return {
      type,
      message,
      characterCount: message.length,
      target,
      createdAt: new Date().toISOString()
    };
  }

  /* --------------------------------
     NETWORK ANALYSIS
  -------------------------------- */
  getNetworkStats() {
    const strong = Relationship.getByStrength('strong');
    const medium = Relationship.getByStrength('medium');
    const weak = Relationship.getByStrength('weak');
    const newConnections = Relationship.getByStrength('new');

    return {
      total: strong.length + medium.length + weak.length + newConnections.length,
      byStrength: {
        strong: strong.length,
        medium: medium.length,
        weak: weak.length,
        new: newConnections.length
      },
      needsAttention: weak.filter(r => {
        const lastContact = r.last_contact ? new Date(r.last_contact) : null;
        if (!lastContact) return true;
        const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 30;
      })
    };
  }

  async getOutreachSuggestions(count = 5) {
    const stats = this.getNetworkStats();
    const suggestions = [];

    // Prioritize relationships that need attention
    for (const r of stats.needsAttention.slice(0, count)) {
      const analysis = await this.analyzeRelationship(r.id);
      if (analysis) {
        suggestions.push({
          relationship: r,
          analysis: analysis.analysis,
          suggestedAction: analysis.analysis.next_best_action
        });
      }
    }

    return suggestions;
  }
}

module.exports = LinkedInIntegration;
