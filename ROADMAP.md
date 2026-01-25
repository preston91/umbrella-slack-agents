# Umbrella AI Employees - Roadmap

## Vision
Turn Slack into a fully autonomous executive team that runs the company 24/7. You set direction, they execute. You approve, they send.

---

## What's Built (Phase 1) ✅

| Feature | Status |
|---------|--------|
| 7 specialized agents (COS, Fundraising, Revenue, Product, Ops, Deals, Relationships) | ✅ |
| Content/Marketing agent | ✅ |
| Persistent memory (survives restarts) | ✅ |
| Auto-extract key facts from conversations | ✅ |
| Conversation history per channel | ✅ |
| Image/screenshot analysis (vision) | ✅ |
| Thinking indicator | ✅ |
| Multi-LLM support (Claude + Gemini) | ✅ |
| Long text handling (Otter notes etc) | ✅ |

---

## What's Missing for True Autonomy

### Phase 2: Actions (You approve, they execute)

| Feature | What it enables | Priority |
|---------|-----------------|----------|
| **Gmail Integration** | Agents draft emails, you say "send", it sends | 🔴 HIGH |
| **Calendar Integration** | Agents schedule meetings, manage your time | 🟡 MED |
| **Google Docs/Slides** | Agents update decks, create docs | 🟡 MED |
| **LinkedIn Integration** | Content agent posts, engages, DMs | 🟡 MED |

### Phase 3: Proactive Agents (They work without you asking)

| Feature | What it enables | Priority |
|---------|-----------------|----------|
| **Scheduled check-ins** | Each agent reports status daily at 9am | 🔴 HIGH |
| **Goal tracking** | Agents have OKRs, track progress | 🔴 HIGH |
| **Cross-agent communication** | COS assigns to agents, they collaborate | 🟡 MED |
| **Alerts & monitoring** | Agents watch metrics, alert on issues | 🟡 MED |
| **Follow-up automation** | "Follow up with John in 3 days" - it does | 🟡 MED |

### Phase 4: Scale & Intelligence

| Feature | What it enables | Priority |
|---------|-----------------|----------|
| **Cloud hosting** | Run 24/7 on a server, not your laptop | 🔴 HIGH |
| **Cloud memory** | Supabase/Firebase for persistent storage | 🟡 MED |
| **RAG/Documents** | Upload entire docs, agents search them | 🟡 MED |
| **Voice notes** | Transcribe and process voice messages | 🟢 LOW |
| **Multi-user** | Other team members can use agents | 🟢 LOW |

---

## Immediate Next Steps

### You need to provide:
1. **Google API Key** (for Gemini) - get from aistudio.google.com
2. **Gmail OAuth credentials** - for sending emails
3. **Create #content-marketing channel** in Slack

### I need to build:
1. Gmail integration (draft → approve → send flow)
2. Daily standup system (agents report at 9am)
3. Goal/OKR tracking per agent

---

## How It Will Work When Complete

**Morning (automated):**
```
9:00am - COS posts daily standup summary
9:05am - Each agent reports their focus for the day
9:10am - COS flags blockers needing your decision
```

**Your workflow:**
```
You: @fundraising Here's the email thread with Sequoia [paste].
     Draft a follow-up asking for next steps.

Agent: [drafts email]

You: Send it

Agent: ✅ Sent to john@sequoia.com
```

**Proactive agents:**
```
Revenue agent: "Deal with Acme hasn't moved in 7 days.
               Want me to draft a check-in email?"

Relationships agent: "You haven't talked to your advisor
                      Mark in 3 weeks. Good time to reconnect?"
```

---

## Tech Stack

**Current:**
- Node.js + Slack Bolt
- Claude API (primary LLM)
- Gemini API (secondary LLM)
- Local file storage (JSON)

**Future:**
- Supabase (database)
- Railway/Render (hosting)
- Gmail API
- Google Calendar API
- LinkedIn API

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 2 (Gmail, Calendar) | 1-2 sessions |
| Phase 3 (Proactive agents) | 2-3 sessions |
| Phase 4 (Cloud, scale) | 1-2 sessions |

This can move fast. Main bottleneck is API credentials and testing.
