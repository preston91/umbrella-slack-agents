# Umbrella

**Umbrella turns Slack into an execution layer — not just chat.**

You talk in natural language inside Slack, and AI agents with real roles do the work, not just respond.

## How It Works

Each agent has a dedicated Slack channel. Mention the bot in a channel, and that channel's specialized agent handles your request with full context of its role and responsibilities.

| Channel | Agent | Role |
|---------|-------|------|
| `#cos-command` | COS (Chief of Staff) | Coordinates, clarifies, routes work. Central command. |
| `#product-revenue` | CRO (Revenue) | Sales, growth, pricing, deal structure |
| `#relationships` | Relationships | Trust & influence mapping, strategic advice on people |
| `#fundraising` | Fundraising | Investor strategy & capital |
| `#product-cs` | Product/CS | Product adoption & retention |
| `#ops-finance` | Ops | Finance, HR, execution, risk flagging |
| `#uhg-deals` | Deals | Opportunity capture, asymmetric upside |

## Example: CRO Actions

**LinkedIn content:**
> "Draft a LinkedIn post announcing our 2026 focus on athlete-led brands."

→ CRO agent writes a polished post, tuned to your voice and audience.

**Inbound email handling:**
> *Paste an email:* "Hey, we want to kick off 2026 onboarding — what's next?"

→ CRO agent:
- Understands the relationship + deal history
- Drafts a clean response
- Proposes next steps (kickoff call, timeline, docs)
- Hands execution to Ops if needed

**Meeting prep:**
> "Prep me for a follow-up call with [client] tomorrow"

→ CRO agent:
- Pulls context from prior conversations
- Summarizes where things left off
- Suggests talking points and asks

## COS Task Routing

The COS agent can delegate work to other agents:

```
assign revenue: Draft pricing proposal for Q2 enterprise deal
assign ops: Schedule kickoff call with Acme Corp next week
assign relationships: Brief me on our history with [contact]
```

## Current Implementation

- **Slack**: Bolt framework with Socket Mode
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Memory**: In-memory event and task tracking
- **Daily Summary**: Auto-posts to `#cos-command` every 24 hours

## Planned: Multi-Model Support

Umbrella is designed for model flexibility. Roadmap includes:

- **Google Gemini** — for high-context reasoning and long document analysis
- **Model routing** — match tasks to the right model based on complexity
- **Fallback chains** — graceful degradation if a model is unavailable

## Setup

1. Create a Slack app with Socket Mode enabled
2. Add required environment variables:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
ANTHROPIC_API_KEY=sk-ant-...
```

3. Install dependencies and run:

```bash
npm install
node src/index.js
```

## Architecture

```
Slack Channel → Agent Router → AI Model → Response
                    ↓
              Memory Store (events, tasks)
                    ↓
              COS Orchestration (cross-agent delegation)
```

The system is built for executive/business operations where AI agents take on distinct functional roles rather than being general-purpose assistants.

## License

Private — internal use only.
