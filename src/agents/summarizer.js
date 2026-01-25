// src/agents/summarizer.js
// Channel summarization agent - creates and saves channel summaries

const { ChannelSummary, DecisionLog } = require('../storage/models');

const SUMMARY_SYSTEM_PROMPT = `
You are a Channel Summary Agent.

Your job is to create clear, actionable summaries of Slack channel activity.

When summarizing, structure your output as:

## Key Updates
- Bullet points of important updates/announcements

## Decisions Made
- Any decisions that were made (who decided, what, context)
- Format: "DECISION: [what] | BY: [who] | CONTEXT: [why]"

## Action Items
- Tasks mentioned or assigned
- Format: "ACTION: [task] | OWNER: [who] | DUE: [when, if mentioned]"

## Open Questions
- Unresolved questions or blockers

## Sentiment
- Brief note on team sentiment/energy if notable

Be concise. Focus on what matters for execution.
`;

const DECISION_EXTRACTION_PROMPT = `
You are a Decision Extraction Agent.

Analyze the conversation and extract any decisions that were made.

For each decision, return a JSON array with objects containing:
- decision: The actual decision made
- context: Why it was made / what problem it solves
- made_by: Who made or announced the decision (if clear)
- stakeholders: Who is affected (comma-separated)

If no decisions were made, return an empty array: []

Return ONLY valid JSON, no other text.
`;

class Summarizer {
  constructor(anthropic) {
    this.anthropic = anthropic;
  }

  async summarizeMessages(messages, channelName) {
    const conversationText = messages
      .map(m => `[${m.user || 'unknown'}]: ${m.text}`)
      .join('\n');

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Summarize this channel activity from #${channelName}:\n\n${conversationText}`
        }
      ]
    });

    const summary = response.content[0].text;

    // Save to database
    const savedSummary = ChannelSummary.create({
      channel_name: channelName,
      summary,
      period_start: messages[0]?.ts ? new Date(parseFloat(messages[0].ts) * 1000).toISOString() : new Date().toISOString(),
      period_end: new Date().toISOString(),
      message_count: messages.length
    });

    console.log(`📝 Saved summary for #${channelName} (ID: ${savedSummary.id})`);

    return { summary, savedSummary };
  }

  async extractDecisions(messages, channelName) {
    const conversationText = messages
      .map(m => `[${m.user || 'unknown'}]: ${m.text}`)
      .join('\n');

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: DECISION_EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract decisions from this conversation in #${channelName}:\n\n${conversationText}`
        }
      ]
    });

    let decisions = [];
    try {
      const text = response.content[0].text.trim();
      // Handle potential markdown code blocks
      const jsonText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      decisions = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse decisions JSON:', e.message);
      return [];
    }

    // Save each decision to database
    const savedDecisions = [];
    for (const d of decisions) {
      const saved = DecisionLog.create({
        channel_name: channelName,
        decision: d.decision,
        context: d.context,
        made_by: d.made_by,
        stakeholders: d.stakeholders,
        status: 'active'
      });
      savedDecisions.push(saved);
      console.log(`📋 Logged decision: "${d.decision.substring(0, 50)}..." (ID: ${saved.id})`);
    }

    return savedDecisions;
  }

  async getChannelHistory(client, channelId, limit = 100) {
    try {
      const result = await client.conversations.history({
        channel: channelId,
        limit
      });
      return result.messages || [];
    } catch (e) {
      console.error('Failed to fetch channel history:', e.message);
      return [];
    }
  }

  async processChannel(client, channelId, channelName) {
    console.log(`🔄 Processing channel #${channelName}...`);

    const messages = await this.getChannelHistory(client, channelId);

    if (messages.length === 0) {
      return { summary: null, decisions: [] };
    }

    // Run summary and decision extraction in parallel
    const [summaryResult, decisions] = await Promise.all([
      this.summarizeMessages(messages, channelName),
      this.extractDecisions(messages, channelName)
    ]);

    return {
      summary: summaryResult,
      decisions
    };
  }
}

module.exports = Summarizer;
