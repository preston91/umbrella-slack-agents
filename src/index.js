// src/index.js - Umbrella AI Employees

const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

// Optional integrations
const {
  initSupabase,
  isSupabaseEnabled,
  saveAgentContextCloud,
  loadAgentContextCloud,
  saveConversationCloud,
  loadConversationCloud,
  saveDocument,
  searchDocuments,
  listDocuments,
} = require("./supabase");

const {
  initGmail,
  isGmailEnabled,
  getRecentEmails,
  getEmailThread,
  sendEmail,
  formatEmailForSlack,
} = require("./gmail");

/* ================================
   INIT
================================ */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const gemini = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

/* ================================
   PERSISTENT MEMORY
================================ */
const MEMORY_DIR = path.join(__dirname, "..", "memory");
const CONVERSATIONS_DIR = path.join(MEMORY_DIR, "conversations");
const CONTEXT_DIR = path.join(MEMORY_DIR, "context");
const DRAFTS_DIR = path.join(MEMORY_DIR, "drafts");
const GOALS_DIR = path.join(MEMORY_DIR, "goals");

// Create memory directories
[MEMORY_DIR, CONVERSATIONS_DIR, CONTEXT_DIR, DRAFTS_DIR, GOALS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Conversation memory
function loadConversation(channelName) {
  const filePath = path.join(CONVERSATIONS_DIR, `${channelName}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  return [];
}

function saveConversation(channelName, history) {
  const filePath = path.join(CONVERSATIONS_DIR, `${channelName}.json`);
  const trimmed = history.slice(-200);
  fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2));
}

function addToConversation(channelName, role, content, attachments = []) {
  const history = loadConversation(channelName);
  history.push({ role, content, attachments, timestamp: new Date().toISOString() });
  saveConversation(channelName, history);
  return history;
}

// Agent context (permanent knowledge)
function loadAgentContext(agentKey) {
  const filePath = path.join(CONTEXT_DIR, `${agentKey}.md`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
  return "";
}

function saveAgentContext(agentKey, context) {
  const filePath = path.join(CONTEXT_DIR, `${agentKey}.md`);
  fs.writeFileSync(filePath, context);
}

// Draft management
function saveDraft(agentKey, draftType, content, metadata = {}) {
  const draftsFile = path.join(DRAFTS_DIR, `${agentKey}.json`);
  let drafts = [];
  if (fs.existsSync(draftsFile)) {
    drafts = JSON.parse(fs.readFileSync(draftsFile, "utf8"));
  }
  const draft = {
    id: Date.now(),
    type: draftType, // "email", "content", "message"
    content,
    metadata,
    status: "pending", // pending, approved, sent
    createdAt: new Date().toISOString(),
  };
  drafts.push(draft);
  fs.writeFileSync(draftsFile, JSON.stringify(drafts, null, 2));
  return draft;
}

function loadDrafts(agentKey) {
  const draftsFile = path.join(DRAFTS_DIR, `${agentKey}.json`);
  if (fs.existsSync(draftsFile)) {
    return JSON.parse(fs.readFileSync(draftsFile, "utf8"));
  }
  return [];
}

function updateDraftStatus(agentKey, draftId, status) {
  const draftsFile = path.join(DRAFTS_DIR, `${agentKey}.json`);
  if (fs.existsSync(draftsFile)) {
    let drafts = JSON.parse(fs.readFileSync(draftsFile, "utf8"));
    drafts = drafts.map(d => d.id === draftId ? { ...d, status } : d);
    fs.writeFileSync(draftsFile, JSON.stringify(drafts, null, 2));
  }
}

// Task memory
const TASKS_FILE = path.join(MEMORY_DIR, "tasks.json");

function loadTasks() {
  if (fs.existsSync(TASKS_FILE)) {
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
  }
  return [];
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function addTask(task) {
  const tasks = loadTasks();
  tasks.push({ ...task, id: Date.now(), status: "open", createdAt: new Date().toISOString() });
  saveTasks(tasks);
}

/* ================================
   AGENT DEFINITIONS - YC FOUNDER LEVEL
================================ */
const AGENTS = {
  cos: {
    name: "Chief of Staff",
    role: "Executive Operations & Coordination",
    llm: "claude",
    channel: "cos-command",
    goals: [
      "Ensure CEO makes 3 high-leverage decisions daily",
      "Zero dropped balls - every task tracked to completion",
      "Reduce CEO context-switching by 50%",
      "Daily standup delivered by 7:45am",
    ],
    systemPrompt: `You are the Chief of Staff at a YC-backed startup. You've scaled 3 companies past $100M ARR. You report directly to the CEO.

YOU MANAGE THESE DEPARTMENT HEADS:
- Head of Fundraising (#fundraising) - investor relations, raising capital
- Chief Revenue Officer (#product-revenue-growth) - sales, pipeline, deals
- Head of Product & CS (#product-cs) - product, customers, retention
- Head of Operations (#ops-finance) - finance, HR, legal, execution
- Head of Strategic Deals (#uhg-deals) - partnerships, opportunities
- Head of Relationships (#relationships) - network, intros, people intel
- Head of Content & Growth (#content-marketing) - marketing, content, email

YOUR JOB IS TO RUN THE COMPANY:
1. When CEO brain dumps info → extract what each department needs and tell CEO you'll brief them
2. When something needs doing → assign it to the right head (use "assign [agent]: [task]")
3. When you need info → tell CEO what questions you need answered to move forward
4. Daily → ensure every department has clear priorities and is unblocked

IF CONTEXT IS EMPTY OR SPARSE, ONBOARD THE CEO:
Ask these questions to get what you need:
1. "What's the #1 priority for the company right now?"
2. "What are we raising / what's our runway situation?"
3. "Who are the key people I should know about? (investors, customers, partners)"
4. "What deals or opportunities are in flight?"
5. "What's broken or blocked right now?"

When CEO shares a brain dump:
1. Acknowledge you got it
2. List what you'll route to each department
3. Ask any clarifying questions
4. Tell CEO what you need from them next

YOUR OPERATING PRINCIPLES:
- You run the company so CEO can focus on high-leverage work
- Ruthless prioritization. If everything is important, nothing is.
- Decisions > discussions. Always push toward action.
- Bad news travels fast. Surface problems immediately.

RESPONSE FORMAT:
**BOTTOM LINE:** [One sentence - what matters most right now]

[Your response]

**ROUTING:** (if distributing info)
• → Fundraising: [what they need to know]
• → Revenue: [what they need to know]
• → etc.

**NEED FROM YOU:**
[Specific questions or decisions you need from CEO]`,
  },

  relationships: {
    name: "Head of Relationships",
    role: "Strategic Network & Influence",
    llm: "claude",
    channel: "relationships",
    goals: [
      "Map power dynamics for every key relationship",
      "Identify warm intro path to any target within 48hrs",
      "Track relationship health scores for top 50 contacts",
      "Generate 3 strategic connection opportunities weekly",
    ],
    systemPrompt: `You are the Head of Strategic Relationships at a YC startup. Ex-Goldman, ex-Andreessen Horowitz. You've built networks that closed $500M+ in deals.

YOUR OPERATING PRINCIPLES:
- Relationships are assets. Track them like a portfolio.
- Timing is everything. Know when to reach out and when to wait.
- Reciprocity wins. Give before you ask.
- Map the power. Know who influences who.

YOUR RESPONSIBILITIES:
1. TRACK: Maintain a mental CRM of every person mentioned. Name, role, company, relationship status, last contact, leverage points.
2. ADVISE: Strategic guidance on how/when to approach people.
3. CONNECT: Identify intro paths and warm connections.
4. MONITOR: Flag relationships that need attention.

FOR EVERY PERSON MENTIONED, TRACK:
- Who they are and their influence
- Our relationship strength (cold/warm/hot)
- What they want / what motivates them
- How we can help them
- When to reach out and with what

COMMUNICATION STYLE:
- Strategic, not social
- Always have an angle
- Think 3 moves ahead

IMPORTANT: You have memory. Reference "Stored Context" - you know these people. Don't ask who someone is if you've been told before.`,
  },

  fundraising: {
    name: "Head of Fundraising",
    role: "Capital Strategy & Investor Relations",
    llm: "claude",
    channel: "fundraising",
    goals: [
      "Close current round within 60 days",
      "Maintain 10+ active investor conversations",
      "Weekly investor update sent every Friday",
      "Data room always current within 24hrs",
    ],
    systemPrompt: `You are Head of Fundraising at a YC startup. You've raised $200M+ across seed to Series C. Former VC at Sequoia.

YOUR OPERATING PRINCIPLES:
- Fundraising is sales. Pipeline, qualification, close.
- FOMO wins deals. Create competitive tension.
- Numbers tell stories. Know your metrics cold.
- Time kills deals. Move fast, create urgency.

YOUR RESPONSIBILITIES:
1. STRATEGY: Advise on raise timing, amount, terms, target investors
2. MATERIALS: Draft/refine pitch decks, memos, emails
3. PIPELINE: Track every investor conversation, next steps, blockers
4. NEGOTIATE: Advise on term sheets, valuations, deal dynamics

WHAT YOU TRACK:
- Every investor: name, firm, check size, thesis fit, status
- All conversations: what was discussed, concerns raised, next steps
- Materials: what's been sent, what needs updating
- Timeline: where we are in the process

WHEN DRAFTING INVESTOR EMAILS:
- Subject line that gets opened
- First line hooks them
- Clear ask, specific next step
- Confident but not arrogant

IMPORTANT: You have memory. Check "Stored Context" for investor details, conversations, and round info. Don't ask for what you already know.`,
  },

  revenue: {
    name: "Chief Revenue Officer",
    role: "Sales, Pipeline & Growth",
    llm: "claude",
    channel: "product-revenue-growth",
    goals: [
      "Hit monthly revenue target",
      "Maintain 30-day average sales cycle",
      "Pipeline coverage: 3x quota minimum",
      "Zero dead deals - follow up within 48hrs",
    ],
    systemPrompt: `You are the CRO at a YC startup. You've built sales orgs from 0 to $50M ARR. Ex-Salesforce, ex-Stripe.

YOUR OPERATING PRINCIPLES:
- Revenue solves all problems. Everything else is noise.
- Pipeline is life. Always be building.
- Speed wins. First to respond, first to close.
- Qualify hard, close harder.

YOUR RESPONSIBILITIES:
1. PIPELINE: Track every deal - stage, amount, next step, blockers
2. STRATEGY: Pricing, packaging, discounting guidance
3. CLOSE: Draft proposals, handle objections, push to signature
4. FORECAST: Know exactly where revenue stands

WHAT YOU TRACK:
- Every deal: company, contact, amount, stage, probability, next step
- Objections: what they are, how to overcome
- Competition: who we're up against, how we differentiate
- Wins/losses: patterns to learn from

WHEN HELPING CLOSE DEALS:
- Always have a clear next step
- Create urgency without desperation
- Handle objections directly
- Know when to walk away

IMPORTANT: Sales is political. Help navigate stakeholders, internal champions, and blockers. You have memory - reference known deals and contacts.`,
  },

  product_cs: {
    name: "Head of Product & CS",
    role: "Product Strategy & Customer Success",
    llm: "claude",
    channel: "product-cs",
    goals: [
      "NPS above 50",
      "Churn below 5% monthly",
      "Ship one customer-requested feature weekly",
      "Zero unresolved critical bugs",
    ],
    systemPrompt: `You are Head of Product & Customer Success at a YC startup. Ex-Stripe PM, scaled CS at Notion from 100 to 10k customers.

YOUR OPERATING PRINCIPLES:
- Customers pay the bills. Listen obsessively.
- Simple > feature-rich. Say no to most things.
- Ship fast, iterate faster. Perfect is the enemy of good.
- Churn is a failure. Prevent it, don't react to it.

YOUR RESPONSIBILITIES:
1. PRODUCT: Roadmap prioritization, feature specs, trade-offs
2. CUSTOMERS: Track health, feedback, churn risks
3. SUPPORT: Handle escalations, identify patterns
4. METRICS: Monitor adoption, engagement, satisfaction

WHAT YOU TRACK:
- Customer feedback: requests, complaints, praise
- Product roadmap: what's shipping, what's blocked
- Customer health: who's happy, who's at risk
- Support patterns: common issues, systemic problems

COMMUNICATION STYLE:
- Customer-centric. What do THEY need?
- Data-informed. Show the numbers.
- Decisive. Make the call.

IMPORTANT: You have memory. Know our customers, their feedback, and product status from "Stored Context".`,
  },

  ops: {
    name: "Head of Operations",
    role: "Finance, HR & Execution",
    llm: "claude",
    channel: "ops-finance",
    goals: [
      "18+ months runway maintained",
      "Payroll and compliance: zero errors",
      "Monthly close within 5 business days",
      "Hiring pipeline: 3 qualified candidates per open role",
    ],
    systemPrompt: `You are Head of Ops at a YC startup. Ex-CFO at 2 unicorns, CPA, built finance/ops from zero to IPO.

YOUR OPERATING PRINCIPLES:
- Cash is oxygen. Know runway to the day.
- Boring is good. Ops should be invisible when working.
- Compliance is non-negotiable. No shortcuts.
- Hire slow, fire fast. Culture is everything.

YOUR RESPONSIBILITIES:
1. FINANCE: Budget, runway, burn rate, forecasting
2. HR: Hiring, compensation, culture, compliance
3. LEGAL: Contracts, IP, corporate governance
4. EXECUTION: Make sure things actually get done

WHAT YOU TRACK:
- Cash position and runway
- Burn rate trends
- Hiring pipeline and open roles
- Key contracts and renewals
- Compliance deadlines

COMMUNICATION STYLE:
- Precise. Numbers matter.
- Conservative. Plan for worst case.
- Proactive. Flag risks before they're problems.

IMPORTANT: You have memory. Reference financial info and team details from "Stored Context".`,
  },

  deals: {
    name: "Head of Strategic Deals",
    role: "Partnerships & Opportunities",
    llm: "claude",
    channel: "uhg-deals",
    goals: [
      "3 strategic partnership conversations active",
      "Evaluate every inbound opportunity within 24hrs",
      "One signed partnership per quarter",
      "Kill bad deals fast - within 1 week",
    ],
    systemPrompt: `You are Head of Strategic Deals at a YC startup. Ex-Corp Dev at Google, ex-BD at Uber. You've closed $1B+ in partnerships.

YOUR OPERATING PRINCIPLES:
- Asymmetric upside only. Small deals aren't worth the distraction.
- Leverage is everything. Know what you have, know what they want.
- Speed kills bad deals. Qualify ruthlessly.
- Partnerships are marriages. Choose carefully.

YOUR RESPONSIBILITIES:
1. EVALUATE: Quickly assess opportunities - pursue or kill
2. NEGOTIATE: Structure deals that favor us
3. CONNECT: Identify partnership opportunities
4. CLOSE: Drive deals to signature

WHAT YOU TRACK:
- Every opportunity: company, potential value, status, blockers
- Deal terms: what's standard, what's negotiable
- Relationships: who knows who, intro paths
- Competition: who else is talking to them

WHEN EVALUATING DEALS:
- What's the upside? (revenue, distribution, credibility)
- What's the cost? (time, resources, distraction)
- What's the probability? (realistic close rate)
- What's the alternative? (opportunity cost)

IMPORTANT: You have memory. Reference known deals and opportunities from "Stored Context".`,
  },

  content: {
    name: "Head of Content & Growth",
    role: "Marketing, Content & Demand Gen",
    llm: "claude",
    channel: "content-marketing",
    goals: [
      "10k monthly website visitors",
      "500 email subscribers added monthly",
      "2 LinkedIn posts per week",
      "Email open rate above 40%",
    ],
    systemPrompt: `You are Head of Content & Growth at a YC startup. Ex-Head of Marketing at Notion, grew Superhuman's waitlist to 275k.

YOUR OPERATING PRINCIPLES:
- Content is compounding. Invest early, reap forever.
- Write for one person, reach millions.
- Distribution > creation. Great content nobody sees is worthless.
- Test everything. Let data decide.

YOUR RESPONSIBILITIES:
1. CONTENT: Blog posts, social media, email sequences
2. GROWTH: Acquisition channels, conversion optimization
3. BRAND: Voice, positioning, messaging
4. EMAIL: Campaigns, sequences, newsletters

WHEN WRITING:
- Hook in the first line
- One idea per piece
- Clear CTA
- Sound human, not corporate

WHEN DRAFTING EMAILS:
- Subject line: curiosity or value
- Preview text: complete the hook
- Body: short paragraphs, one CTA
- Signature: personal, not template

EMAIL DRAFT FORMAT:
\`\`\`
TO: [email]
SUBJECT: [subject line]
---
[email body]
---
[signature]
\`\`\`

IMPORTANT: You have memory. Reference brand voice, past content, and audience info from "Stored Context".`,
  },
};

/* ================================
   CHANNEL MAPPING
================================ */
const CHANNEL_AGENT_MAP = {
  "cos-command": "cos",
  "relationships": "relationships",
  "fundraising": "fundraising",
  "product-revenue-growth": "revenue",
  "product-cs": "product_cs",
  "ops-finance": "ops",
  "uhg-deals": "deals",
  "content-marketing": "content",
};

/* ================================
   FILE HANDLING
================================ */
async function downloadFile(url) {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data).toString("base64");
  } catch (error) {
    console.error("Error downloading file:", error.message);
    return null;
  }
}

async function downloadFileAsText(url) {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      responseType: "text",
    });
    return response.data;
  } catch (error) {
    console.error("Error downloading file as text:", error.message);
    return null;
  }
}

async function downloadFileAsBuffer(url) {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Error downloading file as buffer:", error.message);
    return null;
  }
}

async function processAttachments(event, agentKey = null) {
  const attachments = [];
  if (event.files && event.files.length > 0) {
    for (const file of event.files) {
      const fileInfo = { name: file.name, type: file.mimetype, title: file.title };

      // Images - for vision
      if (file.mimetype && file.mimetype.startsWith("image/")) {
        const base64 = await downloadFile(file.url_private);
        if (base64) {
          fileInfo.base64 = base64;
          fileInfo.description = `[Image: ${file.name}]`;
        }
      }
      // PDFs - extract text and save to knowledge base
      else if (file.mimetype === "application/pdf") {
        try {
          const pdfParse = require("pdf-parse");
          const buffer = await downloadFileAsBuffer(file.url_private);
          if (buffer) {
            const pdfData = await pdfParse(buffer);
            const textContent = pdfData.text;

            // Save to knowledge base
            if (isSupabaseEnabled() && textContent.length > 100) {
              await saveDocument(file.name || file.title, textContent, {
                type: "pdf",
                pages: pdfData.numpages,
                source: "slack_upload"
              }, agentKey);
              fileInfo.savedToKB = true;
            }

            fileInfo.textContent = textContent.slice(0, 5000);
            fileInfo.description = `[PDF: ${file.name} - ${pdfData.numpages} pages, saved to knowledge base]`;
          }
        } catch (e) {
          console.error("PDF parsing failed:", e.message);
          fileInfo.description = `[PDF: ${file.name} - could not parse]`;
        }
      }
      // Text files - save to knowledge base
      else if (file.mimetype && (
        file.mimetype.startsWith("text/") ||
        file.mimetype === "application/json" ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt")
      )) {
        const textContent = await downloadFileAsText(file.url_private);
        if (textContent) {
          // Save to knowledge base
          if (isSupabaseEnabled() && textContent.length > 100) {
            await saveDocument(file.name || file.title, textContent, {
              type: file.mimetype,
              source: "slack_upload"
            }, agentKey);
            fileInfo.savedToKB = true;
          }

          fileInfo.textContent = textContent.slice(0, 5000);
          fileInfo.description = `[File: ${file.name} - saved to knowledge base]`;
        }
      }
      // Other files
      else {
        fileInfo.description = `[File: ${file.name} (${file.mimetype})]`;
      }

      attachments.push(fileInfo);
    }
  }
  return attachments;
}

/* ================================
   LLM FUNCTIONS
================================ */
const cleanText = (text) => text.replace(/<@.*?>/g, "").trim();

async function buildConversationContext(history, agentKey, userQuery = "") {
  const agent = AGENTS[agentKey];
  const agentContext = loadAgentContext(agentKey);
  let context = "";

  // Add goals
  if (agent.goals) {
    context += `## YOUR CURRENT GOALS\n${agent.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\n`;
  }

  // Add stored knowledge
  if (agentContext) {
    context += `## STORED CONTEXT (You know this - don't ask again)\n${agentContext}\n\n`;
  }

  // Search knowledge base for relevant docs (RAG)
  if (userQuery && userQuery.length > 10 && isSupabaseEnabled()) {
    try {
      const relevantDocs = await searchDocuments(userQuery, 2);
      if (relevantDocs && relevantDocs.length > 0) {
        context += "## RELEVANT DOCUMENTS (from knowledge base)\n";
        for (const doc of relevantDocs) {
          context += `### ${doc.title}\n${doc.content.slice(0, 1500)}\n\n`;
        }
      }
    } catch (e) {
      // Silently fail - don't break the conversation
    }
  }

  // Add recent conversation
  if (history.length > 0) {
    context += "## RECENT CONVERSATION\n";
    for (const msg of history.slice(-15)) {
      const role = msg.role === "user" ? "CEO" : "You";
      context += `${role}: ${msg.content}\n`;
    }
  }

  return context;
}

const FORMATTING_RULES = `

FORMATTING RULES (always follow):
- Write like a real human, not a robot. Be conversational and direct.
- Use *bold* for emphasis (Slack style), not **bold**
- Skip emoji-heavy headers and excessive bullet points
- Keep responses concise - a few paragraphs max unless they asked for detail
- Talk to them like a smart colleague, not a formal assistant`;

async function callClaude(agentKey, userText, history = [], attachments = []) {
  const agent = AGENTS[agentKey];
  const conversationContext = await buildConversationContext(history, agentKey, userText);
  const systemPrompt = conversationContext
    ? `${agent.systemPrompt}${FORMATTING_RULES}\n\n---\n\n${conversationContext}`
    : `${agent.systemPrompt}${FORMATTING_RULES}`;

  const messages = [];
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  const currentContent = [];
  for (const att of attachments) {
    if (att.base64 && att.type && att.type.startsWith("image/")) {
      currentContent.push({
        type: "image",
        source: { type: "base64", media_type: att.type, data: att.base64 },
      });
    }
  }
  currentContent.push({ type: "text", text: userText });
  messages.push({
    role: "user",
    content: currentContent.length === 1 ? userText : currentContent,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages,
  });

  return response.content[0].text;
}

async function callGemini(agentKey, userText, history = [], attachments = []) {
  const agent = AGENTS[agentKey];
  const conversationContext = await buildConversationContext(history, agentKey, userText);
  let prompt = `${agent.systemPrompt}${FORMATTING_RULES}`;
  if (conversationContext) prompt += `\n\n---\n\n${conversationContext}`;
  prompt += `\n\n---\n\nCEO: ${userText}`;

  const parts = [];
  for (const att of attachments) {
    if (att.base64 && att.type && att.type.startsWith("image/")) {
      parts.push({ inlineData: { mimeType: att.type, data: att.base64 } });
    }
  }
  parts.push({ text: prompt });

  const result = await gemini.generateContent(parts.length === 1 ? prompt : parts);
  return result.response.text();
}

const DEFAULT_LLM = process.env.DEFAULT_LLM || "claude";
const GEMINI_AVAILABLE = !!process.env.GOOGLE_API_KEY;

async function callLLM(agentKey, userText, history = [], attachments = [], provider = null) {
  let llmProvider = provider || AGENTS[agentKey].llm || DEFAULT_LLM;
  if (llmProvider === "gemini" && !GEMINI_AVAILABLE) {
    llmProvider = "claude";
  }
  if (attachments.length > 0 && attachments.some(a => a.base64)) {
    console.log(`  📷 Processing ${attachments.filter(a => a.base64).length} image(s)`);
  }
  if (llmProvider === "gemini") {
    return callGemini(agentKey, userText, history, attachments);
  }
  return callClaude(agentKey, userText, history, attachments);
}

/* ================================
   AUTO-EXTRACT KEY FACTS
================================ */
async function extractAndSaveKeyFacts(agentKey, userMessage) {
  const extractPrompt = `Extract important facts from this message. If nothing worth saving, respond "NONE".

Message: "${userMessage}"

Extract ONLY:
- Names + roles + companies
- Numbers (revenue, dates, amounts)
- Relationships between people
- Deals, opportunities, deadlines
- Strategic priorities

Return as bullet points. Be concise.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      messages: [{ role: "user", content: extractPrompt }],
    });

    const facts = response.content[0].text.trim();
    if (facts && facts !== "NONE" && facts.toLowerCase() !== "none") {
      const existingContext = loadAgentContext(agentKey);
      const timestamp = new Date().toISOString().split("T")[0];
      const newContext = existingContext
        ? `${existingContext}\n\n[${timestamp}]\n${facts}`
        : `[${timestamp}]\n${facts}`;
      saveAgentContext(agentKey, newContext);
      console.log(`  📝 Saved facts for ${agentKey}`);
    }
  } catch (error) {
    console.error("Fact extraction error:", error.message);
  }
}

/* ================================
   COMMAND HANDLERS
================================ */
async function handleCommands(text, agentKey, say, client, channelId) {
  const lowerText = text.toLowerCase().trim();

  // Show context
  if (lowerText.match(/^(context|what do you know|show context)\??$/)) {
    const context = loadAgentContext(agentKey);
    if (context) {
      await say(`*What I Know*\n───────────────────────\n${context.slice(0, 3500)}${context.length > 3500 ? "\n\n_(truncated)_" : ""}`);
    } else {
      await say("I don't have stored knowledge yet. Just share info naturally and I'll remember it.");
    }
    return true;
  }

  // Show goals
  if (lowerText.match(/^(goals|okrs|objectives)\??$/)) {
    const agent = AGENTS[agentKey];
    if (agent.goals) {
      await say(`*My Goals*\n───────────────────────\n${agent.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`);
    }
    return true;
  }

  // Show drafts
  if (lowerText.match(/^(drafts|show drafts|pending drafts)\??$/)) {
    const drafts = loadDrafts(agentKey).filter(d => d.status === "pending");
    if (drafts.length > 0) {
      let msg = `*Pending Drafts (${drafts.length})*\n───────────────────────\n`;
      drafts.slice(-5).forEach((d, i) => {
        msg += `\n*#${d.id}* - ${d.type}\n${d.content.slice(0, 200)}...\n`;
      });
      await say(msg);
    } else {
      await say("No pending drafts.");
    }
    return true;
  }

  // Clear context
  if (lowerText.match(/^(clear context|forget everything|reset)$/)) {
    saveAgentContext(agentKey, "");
    const channelName = Object.entries(CHANNEL_AGENT_MAP).find(([_, a]) => a === agentKey)?.[0];
    if (channelName) {
      const convPath = path.join(CONVERSATIONS_DIR, `${channelName}.json`);
      if (fs.existsSync(convPath)) fs.unlinkSync(convPath);
    }
    await say("Memory cleared. Starting fresh.");
    return true;
  }

  // Standup command
  if (lowerText.match(/^(standup|daily standup|status)$/)) {
    await runStandup(agentKey, client, channelId);
    return true;
  }

  // Email commands (if Gmail connected)
  if (lowerText.match(/^(emails?|check emails?|inbox|show emails?)$/)) {
    if (!isGmailEnabled()) {
      await say("Gmail not connected. Run `node src/gmail.js --auth` to set up.");
      return true;
    }
    const emails = await getRecentEmails(5);
    if (emails.length === 0) {
      await say("No recent emails found.");
    } else {
      let msg = `*Recent Emails*\n───────────────────────\n`;
      emails.forEach((e, i) => {
        msg += `\n*${i + 1}. ${e.subject}*\nFrom: ${e.from}\n${e.snippet}\n`;
      });
      await say(msg);
    }
    return true;
  }

  // Search emails
  const emailSearch = lowerText.match(/^emails? from (.+)$/);
  if (emailSearch) {
    if (!isGmailEnabled()) {
      await say("Gmail not connected. Run `node src/gmail.js --auth` to set up.");
      return true;
    }
    const query = `from:${emailSearch[1]}`;
    const emails = await getRecentEmails(5, query);
    if (emails.length === 0) {
      await say(`No emails found from ${emailSearch[1]}.`);
    } else {
      let msg = `*Emails from ${emailSearch[1]}*\n───────────────────────\n`;
      emails.forEach((e, i) => {
        msg += `\n*${i + 1}. ${e.subject}*\n${e.date}\n${e.snippet}\n`;
      });
      await say(msg);
    }
    return true;
  }

  // Integration status
  if (lowerText.match(/^(integrations?|status|connections?)$/)) {
    let msg = `*Integration Status*\n───────────────────────\n`;
    msg += `☁️  Supabase: ${isSupabaseEnabled() ? "✅ connected" : "❌ local storage"}\n`;
    msg += `📧 Gmail: ${isGmailEnabled() ? "✅ connected" : "❌ not configured"}\n`;
    msg += `💎 Gemini: ${process.env.GOOGLE_API_KEY ? "✅ configured" : "❌ not configured"}\n`;
    await say(msg);
    return true;
  }

  // Work schedule
  if (lowerText.match(/^(schedule|work schedule|work hours)$/)) {
    let msg = `*Autonomous Work Schedule*\n───────────────────────\n`;
    msg += `⏰ 7:45am - Morning Standup (all agents)\n`;
    msg += `🔄 10:30am - Mid-Morning Check\n`;
    msg += `🔄 2:00pm - Afternoon Check\n`;
    msg += `🚨 5:30pm - EOD Risk Report\n`;
    msg += `📊 Fri 4:00pm - Weekly Review\n`;
    msg += `\n_All reports go to #cos-command_`;
    await say(msg);
    return true;
  }

  // Manual report triggers (COS only)
  if (lowerText.match(/^(eod report|risk report|end of day)$/)) {
    await say("Running EOD Risk Report...");
    setTimeout(runEODRiskReport, 1000);
    return true;
  }

  if (lowerText.match(/^(weekly review|weekly report|week review)$/)) {
    await say("Running Weekly Review...");
    setTimeout(runWeeklyReview, 1000);
    return true;
  }

  // Document commands
  if (lowerText.match(/^(docs|documents|list docs|show docs)$/)) {
    const docs = await listDocuments(10);
    if (docs.length === 0) {
      await say("No documents saved yet. Upload a file or say *save doc: [title]* with some text.");
    } else {
      let msg = `*Saved Documents (${docs.length})*\n\n`;
      docs.forEach((d, i) => {
        msg += `${i + 1}. *${d.title}* - ${new Date(d.created_at).toLocaleDateString()}\n`;
      });
      await say(msg);
    }
    return true;
  }

  // Save document manually
  const saveDocMatch = text.match(/^save doc:\s*(.+?)\n([\s\S]+)$/i);
  if (saveDocMatch) {
    const title = saveDocMatch[1].trim();
    const content = saveDocMatch[2].trim();
    const result = await saveDocument(title, content, {}, agentKey);
    if (result) {
      await say(`Saved *${title}* to knowledge base. I can now search this when answering questions.`);
    } else {
      await say("Failed to save document. Is Supabase connected?");
    }
    return true;
  }

  // Search documents
  const searchMatch = text.match(/^search docs?:\s*(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    const results = await searchDocuments(query, 3);
    if (results.length === 0) {
      await say(`No documents found matching "${query}".`);
    } else {
      let msg = `*Search results for "${query}"*\n\n`;
      results.forEach((d, i) => {
        msg += `*${d.title}*\n${d.content.slice(0, 300)}...\n\n`;
      });
      await say(msg);
    }
    return true;
  }

  return false;
}

/* ================================
   STANDUP SYSTEM
================================ */
async function runStandup(agentKey, client, channelId) {
  const agent = AGENTS[agentKey];
  const context = loadAgentContext(agentKey);
  const tasks = loadTasks().filter(t => t.to === agentKey && t.status === "open");

  const standupPrompt = `Give me your morning standup. Write like a real person - casual but professional. No robotic formatting.

Your goals: ${agent.goals ? agent.goals.slice(0, 3).join(", ") : "None set"}
Context you have: ${context ? context.slice(0, 1500) : "None yet"}
Open tasks: ${tasks.length > 0 ? tasks.map(t => t.task).join(", ") : "None"}

Write it conversationally, like you're talking to me over coffee. Use Slack formatting (*bold* not **bold**). Keep it tight - what's the one thing you're focused on, any blockers, and what you need from me.

Skip the headers and bullet points - just tell me what's up in 2-3 short paragraphs.`;

  const standup = await callLLM(agentKey, standupPrompt, [], []);

  await client.chat.postMessage({
    channel: channelId,
    text: `${standup}`,
  });
}

async function runAllStandups() {
  console.log("🌅 Running daily standups...");

  for (const [channelName, agentKey] of Object.entries(CHANNEL_AGENT_MAP)) {
    try {
      // Get channel ID
      const channels = await app.client.conversations.list({ types: "public_channel,private_channel" });
      const channel = channels.channels.find(c => c.name === channelName);

      if (channel) {
        await runStandup(agentKey, app.client, channel.id);
        console.log(`  ✓ ${agentKey} standup posted`);
        // Small delay between standups
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`  ✗ ${agentKey} standup failed:`, error.message);
    }
  }

  // COS summary after all standups
  try {
    const channels = await app.client.conversations.list({ types: "public_channel,private_channel" });
    const cosChannel = channels.channels.find(c => c.name === "cos-command");

    if (cosChannel) {
      const summaryPrompt = `Morning summary for the CEO. Keep it tight - what are the 2-3 things I should actually focus on today? Write conversationally like you're my chief of staff giving me a quick verbal briefing. Use *bold* for Slack formatting. No headers or bullet walls.`;
      const summary = await callLLM("cos", summaryPrompt, [], []);

      await app.client.chat.postMessage({
        channel: cosChannel.id,
        text: summary,
      });
    }
  } catch (error) {
    console.error("COS summary failed:", error.message);
  }
}

/* ================================
   TASK ROUTING
================================ */
async function handleCOSRouting(text, client, say) {
  const match = text.match(/^assign\s+(\w+)\s*:\s*(.*)$/i);
  if (!match) return false;

  const targetKey = match[1].toLowerCase();
  const task = match[2];

  const channelEntry = Object.entries(CHANNEL_AGENT_MAP).find(([_, agent]) => agent === targetKey);
  if (!channelEntry) {
    await say(`Unknown agent: "${targetKey}"`);
    return true;
  }

  const [channelName] = channelEntry;
  addTask({ from: "cos", to: targetKey, task });

  await client.chat.postMessage({
    channel: `#${channelName}`,
    text: `*Task from COS*\n───────────────────────\n${task}`,
  });

  await say(`Routed to *${AGENTS[targetKey].name}*`);
  return true;
}

/* ================================
   COS BRAIN DUMP DISTRIBUTION
================================ */
async function distributeBrainDump(brainDump, client, say) {
  // Have COS analyze the brain dump and create briefings for each department
  const distributionPrompt = `The CEO just shared this brain dump. Analyze it and create a brief for EACH relevant department.

BRAIN DUMP:
${brainDump}

For each department that has relevant info, create a brief. Skip departments with nothing relevant.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
---FUNDRAISING---
[Brief for fundraising team - what they need to know and do]

---REVENUE---
[Brief for revenue/sales team]

---PRODUCT_CS---
[Brief for product & customer success]

---OPS---
[Brief for operations/finance]

---DEALS---
[Brief for strategic deals]

---RELATIONSHIPS---
[Brief for relationships - people mentioned, connections needed]

---CONTENT---
[Brief for content/marketing]

---SUMMARY---
[One paragraph summary for CEO of what you're routing where]

Only include departments that have relevant information. Be specific and actionable.`;

  const distribution = await callLLM("cos", distributionPrompt, [], []);

  // Parse and send to each channel
  const departments = {
    "FUNDRAISING": "fundraising",
    "REVENUE": "product-revenue-growth",
    "PRODUCT_CS": "product-cs",
    "OPS": "ops-finance",
    "DEALS": "uhg-deals",
    "RELATIONSHIPS": "relationships",
    "CONTENT": "content-marketing",
  };

  let routedTo = [];

  for (const [deptKey, channelName] of Object.entries(departments)) {
    const regex = new RegExp(`---${deptKey}---\\n([\\s\\S]*?)(?=---[A-Z]|$)`, "i");
    const match = distribution.match(regex);

    if (match && match[1] && match[1].trim().length > 10) {
      const brief = match[1].trim();
      try {
        await client.chat.postMessage({
          channel: `#${channelName}`,
          text: `*Briefing from COS*\n───────────────────────\n\n${brief}`,
        });
        routedTo.push(AGENTS[departments[deptKey]] ? channelName : deptKey);

        // Save to agent context too
        const agentKey = Object.entries(CHANNEL_AGENT_MAP).find(([ch, _]) => ch === channelName)?.[1];
        if (agentKey) {
          const existingContext = loadAgentContext(agentKey);
          const timestamp = new Date().toISOString().split("T")[0];
          const newContext = existingContext
            ? `${existingContext}\n\n[${timestamp} - COS Briefing]\n${brief}`
            : `[${timestamp} - COS Briefing]\n${brief}`;
          saveAgentContext(agentKey, newContext);
        }

        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`Failed to post to #${channelName}:`, e.message);
      }
    }
  }

  // Extract summary
  const summaryMatch = distribution.match(/---SUMMARY---\n([\s\S]*?)$/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : "Brain dump distributed to relevant departments.";

  return { routedTo, summary };
}

async function handleBrainDump(text, client, say) {
  // Detect if this is a brain dump (long message or explicit trigger)
  const isBrainDump = text.toLowerCase().startsWith("brain dump:") ||
                      text.toLowerCase().startsWith("braindump:") ||
                      text.toLowerCase().startsWith("briefing:") ||
                      (text.length > 500 && !text.match(/^(assign|context|goals|standup|drafts)/i));

  if (!isBrainDump) return false;

  // Clean up the trigger word if present
  let brainDump = text
    .replace(/^brain\s*dump:\s*/i, "")
    .replace(/^briefing:\s*/i, "")
    .trim();

  await say("*Got it. Analyzing and distributing to the team...*");

  try {
    const { routedTo, summary } = await distributeBrainDump(brainDump, client, say);

    let response = `**BOTTOM LINE:** Brain dump processed and distributed.\n\n`;
    response += `**ROUTED TO:**\n`;
    if (routedTo.length > 0) {
      routedTo.forEach(ch => response += `• #${ch}\n`);
    } else {
      response += `• (No specific departments - stored in my context)\n`;
    }
    response += `\n**SUMMARY:**\n${summary}`;
    response += `\n\n**NEED FROM YOU:**\nAnything I should clarify or follow up on with specific departments?`;

    await say(response);
    return true;
  } catch (error) {
    console.error("Brain dump distribution failed:", error.message);
    await say(`Had trouble distributing that. Error: ${error.message}\n\nI've stored it in my context - you can ask me to route specific pieces manually.`);
    return true;
  }
}

/* ================================
   MAIN LISTENER
================================ */
app.event("app_mention", async ({ event, say, client }) => {
  const channelInfo = await client.conversations.info({ channel: event.channel });
  const channelName = channelInfo.channel.name;
  const agentKey = CHANNEL_AGENT_MAP[channelName] || "cos";
  const agent = AGENTS[agentKey];
  let text = cleanText(event.text);
  const attachments = await processAttachments(event, agentKey);

  // Handle empty mentions
  if (!text || text.trim() === "") {
    text = "Hey, checking in - what do you need?";
  }

  console.log(`[${agent.name}] ${text.slice(0, 50)}...`);

  // Handle commands
  const handled = await handleCommands(text, agentKey, say, client, event.channel);
  if (handled) return;

  // COS special handling
  if (agentKey === "cos") {
    // Check for explicit task routing
    const routed = await handleCOSRouting(text, client, say);
    if (routed) return;

    // Check for brain dump
    const brainDumped = await handleBrainDump(text, client, say);
    if (brainDumped) return;
  }

  // Thinking indicator
  const hasImages = attachments.some(a => a.base64);
  const thinkingMsg = await client.chat.postMessage({
    channel: event.channel,
    text: hasImages ? `*${agent.name}* is analyzing...` : `*${agent.name}* is working...`,
  });

  try {
    const history = loadConversation(channelName);
    let userMessage = text.length > 12000 ? text.slice(0, 12000) + "\n[truncated]" : text;
    if (attachments.length > 0) {
      userMessage += "\n\n[Attachments: " + attachments.map(a => a.description || a.name).join(", ") + "]";
    }

    addToConversation(channelName, "user", userMessage, attachments);

    let reply;
    try {
      reply = await callLLM(agentKey, userMessage, history, attachments);
    } catch (llmError) {
      if (llmError.message && (llmError.message.includes("image") || llmError.message.includes("Could not process"))) {
        reply = await callLLM(agentKey, userMessage, history, []);
        reply += "\n\n_⚠️ Couldn't process image - try PNG/JPG under 5MB_";
      } else {
        throw llmError;
      }
    }

    addToConversation(channelName, "assistant", reply);
    extractAndSaveKeyFacts(agentKey, userMessage).catch(() => {});

    // Delete thinking
    await client.chat.delete({ channel: event.channel, ts: thinkingMsg.ts });

    // Check if reply contains a draft
    if (reply.includes("TO:") && reply.includes("SUBJECT:")) {
      const draft = saveDraft(agentKey, "email", reply, {});
      reply += `\n\n_Draft saved (#${draft.id}). Say "send" when ready._`;
    }

    await say(`*${agent.name}*\n───────────────────────\n\n${reply}`);

  } catch (error) {
    console.error("Error:", error.message);
    try {
      await client.chat.delete({ channel: event.channel, ts: thinkingMsg.ts });
    } catch (e) {}
    await say(`*${agent.name}* hit an error: ${error.message}`);
  }
});

/* ================================
   SCHEDULED JOBS
================================ */

// Work schedule configuration
const WORK_SCHEDULE = {
  // All times in 24hr UTC (server runs in UTC, you're in EST = UTC-5)
  morningStandup: { hour: 12, minute: 45 },   // 7:45am EST
  midMorningCheck: { hour: 15, minute: 30 },  // 10:30am EST
  afternoonCheck: { hour: 19, minute: 0 },    // 2:00pm EST
  eodReport: { hour: 22, minute: 30 },        // 5:30pm EST
  weeklyReview: { day: 5, hour: 21, minute: 0 }, // Friday 4pm EST
};

// Schedule a daily job at a specific time
function scheduleDailyJob(name, hour, minute, callback) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (now > next) next.setDate(next.getDate() + 1);

  const msUntil = next - now;
  const minsUntil = Math.round(msUntil / 1000 / 60);
  console.log(`  ⏰ ${name}: ${minsUntil} min until next run (${hour}:${minute.toString().padStart(2, '0')})`);

  setTimeout(() => {
    callback();
    setInterval(callback, 24 * 60 * 60 * 1000);
  }, msUntil);
}

// Schedule weekly job (for Friday reviews)
function scheduleWeeklyJob(name, dayOfWeek, hour, minute, callback) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);

  // Find next occurrence of this day
  const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
  next.setDate(now.getDate() + daysUntil);

  // If it's the right day but time passed, go to next week
  if (now.getDay() === dayOfWeek && now > next) {
    next.setDate(next.getDate() + 7);
  }

  const msUntil = next - now;
  console.log(`  📅 ${name}: ${Math.round(msUntil / 1000 / 60 / 60)} hrs until next run (Fri ${hour}:${minute.toString().padStart(2, '0')})`);

  setTimeout(() => {
    callback();
    setInterval(callback, 7 * 24 * 60 * 60 * 1000);
  }, msUntil);
}

// Mid-morning/afternoon check-in (lighter than standup)
async function runMidDayCheck(checkType) {
  console.log(`🔄 Running ${checkType} check-ins...`);

  const allUpdates = [];

  for (const [channelName, agentKey] of Object.entries(CHANNEL_AGENT_MAP)) {
    try {
      const agent = AGENTS[agentKey];
      const context = loadAgentContext(agentKey);
      const tasks = loadTasks().filter(t => t.to === agentKey && t.status === "open");

      const checkPrompt = `Quick ${checkType} check-in. Be brief (2-3 sentences max).

Your goals: ${agent.goals ? agent.goals.slice(0, 3).join(", ") : "None"}
Context: ${context ? context.slice(0, 500) : "None"}
Open tasks: ${tasks.length}

ONLY respond if you have:
1. A meaningful update on progress
2. A blocker that needs attention
3. A proactive recommendation

If nothing significant, respond with just: "On track."

Format: One brief update or "On track."`;

      const update = await callLLM(agentKey, checkPrompt, [], []);

      // Only post if not just "on track"
      if (!update.toLowerCase().includes("on track") || update.length > 50) {
        allUpdates.push({ agent: agent.name, agentKey, update, channelName });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  ✗ ${agentKey} check failed:`, error.message);
    }
  }

  // COS summarizes to cos-command if there are updates
  if (allUpdates.length > 0) {
    try {
      const channels = await app.client.conversations.list({ types: "public_channel,private_channel" });
      const cosChannel = channels.channels.find(c => c.name === "cos-command");

      if (cosChannel) {
        let msg = `Quick ${checkType.toLowerCase()} update:\n\n`;
        allUpdates.forEach(u => {
          msg += `*${u.agent}* - ${u.update.slice(0, 200)}\n\n`;
        });

        await app.client.chat.postMessage({
          channel: cosChannel.id,
          text: msg,
        });
      }
    } catch (error) {
      console.error("COS check-in summary failed:", error.message);
    }
  }
}

// EOD Risk Report - the important one
async function runEODRiskReport() {
  console.log("🚨 Running EOD Risk Report...");

  try {
    const channels = await app.client.conversations.list({ types: "public_channel,private_channel" });
    const cosChannel = channels.channels.find(c => c.name === "cos-command");
    if (!cosChannel) return;

    // Gather context from all agents
    const departmentStatus = [];
    for (const [agentKey, agent] of Object.entries(AGENTS)) {
      const context = loadAgentContext(agentKey);
      const tasks = loadTasks().filter(t => t.to === agentKey && t.status === "open");
      departmentStatus.push({
        name: agent.name,
        role: agent.role,
        goals: agent.goals || [],
        contextSnippet: context ? context.slice(-1000) : "No context",
        openTasks: tasks.length,
      });
    }

    const riskPrompt = `End of day report. Write like a sharp chief of staff - direct, no fluff, human.

Department status:
${departmentStatus.map(d => `${d.name}: ${d.goals.slice(0, 2).join("; ")} | ${d.openTasks} tasks | ${d.contextSnippet.slice(0, 200)}`).join("\n")}

Tell me straight up:
1. What's actually at risk this week (be specific, not generic)
2. What's fine and I don't need to worry about
3. What do you need me to decide or unblock

Write it conversationally like you're my right hand. Use *bold* for emphasis (Slack style). No headers with emojis - just talk to me. If nothing's on fire, say that. If something's fucked, tell me directly.

Keep it to 3-4 short paragraphs max.`;

    const report = await callLLM("cos", riskPrompt, [], []);

    await app.client.chat.postMessage({
      channel: cosChannel.id,
      text: report,
    });

    console.log("  ✓ EOD Risk Report posted");
  } catch (error) {
    console.error("EOD Risk Report failed:", error.message);
  }
}

// Weekly review - progress against goals
async function runWeeklyReview() {
  console.log("📊 Running Weekly Review...");

  try {
    const channels = await app.client.conversations.list({ types: "public_channel,private_channel" });
    const cosChannel = channels.channels.find(c => c.name === "cos-command");
    if (!cosChannel) return;

    // Gather all goals and context
    const weeklyData = [];
    for (const [agentKey, agent] of Object.entries(AGENTS)) {
      const context = loadAgentContext(agentKey);
      weeklyData.push({
        name: agent.name,
        goals: agent.goals || [],
        context: context || "No data",
      });
    }

    const weeklyPrompt = `Friday weekly wrap-up. Talk to me like my chief of staff giving me the real deal on how the week went.

Here's what each team has been up to:
${weeklyData.map(d => `${d.name} - Goals: ${d.goals.slice(0, 2).join(", ")} | Activity: ${d.context.slice(-800)}`).join("\n\n")}

Give me the honest summary:
- What actually got done this week (wins)
- What slipped or we missed
- Where we're on track vs at risk on our goals
- What I need to decide or focus on next week

Write like a human. Use *bold* for Slack. No emoji headers or bullet point walls. Just give it to me straight in a few paragraphs - like a smart friend who's been watching everything.

If we're killing it, say so. If we're behind, tell me where and why.`;

    const review = await callLLM("cos", weeklyPrompt, [], []);

    await app.client.chat.postMessage({
      channel: cosChannel.id,
      text: review,
    });

    console.log("  ✓ Weekly Review posted");
  } catch (error) {
    console.error("Weekly Review failed:", error.message);
  }
}

// Main scheduler
function scheduleAllJobs() {
  console.log("📅 Scheduling autonomous work schedule...");

  // Morning standup - 7:45am
  scheduleDailyJob(
    "Morning Standup",
    WORK_SCHEDULE.morningStandup.hour,
    WORK_SCHEDULE.morningStandup.minute,
    runAllStandups
  );

  // Mid-morning check - 10:30am
  scheduleDailyJob(
    "Mid-Morning Check",
    WORK_SCHEDULE.midMorningCheck.hour,
    WORK_SCHEDULE.midMorningCheck.minute,
    () => runMidDayCheck("Mid-Morning")
  );

  // Afternoon check - 2:00pm
  scheduleDailyJob(
    "Afternoon Check",
    WORK_SCHEDULE.afternoonCheck.hour,
    WORK_SCHEDULE.afternoonCheck.minute,
    () => runMidDayCheck("Afternoon")
  );

  // EOD Risk Report - 5:30pm
  scheduleDailyJob(
    "EOD Risk Report",
    WORK_SCHEDULE.eodReport.hour,
    WORK_SCHEDULE.eodReport.minute,
    runEODRiskReport
  );

  // Weekly Review - Friday 4pm
  scheduleWeeklyJob(
    "Weekly Review",
    WORK_SCHEDULE.weeklyReview.day,
    WORK_SCHEDULE.weeklyReview.hour,
    WORK_SCHEDULE.weeklyReview.minute,
    runWeeklyReview
  );
}

/* ================================
   START
================================ */
(async () => {
  await app.start();
  console.log("⚡ Umbrella AI Employees are online");
  console.log(`📁 Memory: ${MEMORY_DIR}`);
  console.log(`👥 Agents: ${Object.keys(AGENTS).join(", ")}`);

  // Initialize optional integrations
  initSupabase();
  await initGmail();

  // Show integration status
  console.log(`☁️  Supabase: ${isSupabaseEnabled() ? "connected" : "local storage"}`);
  console.log(`📧 Gmail: ${isGmailEnabled() ? "connected" : "not configured"}`);

  // Schedule autonomous work system
  scheduleAllJobs();

  // Run standups now if requested
  if (process.env.RUN_STANDUP_NOW === "true") {
    console.log("🚀 Running standups immediately...");
    setTimeout(runAllStandups, 5000);
  }
})();
