// src/services/memory.js
// Unified memory interface - uses Supabase when available

const supabase = require("./supabase");

// In-memory fallback
const store = {
  conversations: {},
  tasks: [],
};

// ========== LOGGING EVENTS (uses conversations table) ==========

async function logEvent(channelName, agentKey, text, role = "user") {
  if (supabase.isSupabaseAvailable()) {
    await supabase.appendMessage(channelName, role, text, agentKey);
  } else {
    if (!store.conversations[channelName]) {
      store.conversations[channelName] = [];
    }
    store.conversations[channelName].push({
      role,
      content: text,
      agent: agentKey,
      timestamp: new Date().toISOString(),
    });
  }
}

// ========== TASKS ==========

async function logTask(from, to, taskDescription) {
  if (supabase.isSupabaseAvailable()) {
    await supabase.createTask({
      description: taskDescription,
      assignedTo: to,
      assignedBy: from,
    });
  } else {
    store.tasks.push({
      description: taskDescription,
      assigned_to: to,
      assigned_by: from,
      status: "pending",
      created_at: new Date().toISOString(),
    });
  }
}

async function getTasks(status = null, assignedTo = null) {
  if (supabase.isSupabaseAvailable()) {
    return supabase.getTasks(status, assignedTo);
  }
  let tasks = [...store.tasks];
  if (status) tasks = tasks.filter(t => t.status === status);
  if (assignedTo) tasks = tasks.filter(t => t.assigned_to === assignedTo);
  return tasks;
}

// ========== SUMMARY ==========

async function getSummaryData(hours = 24) {
  if (supabase.isSupabaseAvailable()) {
    return supabase.getSummaryData(hours);
  }

  // In-memory fallback
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const events = [];

  for (const [channel, messages] of Object.entries(store.conversations)) {
    for (const msg of messages) {
      if (new Date(msg.timestamp) >= since) {
        events.push({
          channel,
          agent: msg.agent,
          text: msg.content,
          time: msg.timestamp,
        });
      }
    }
  }

  const tasks = store.tasks.filter(t => new Date(t.created_at) >= since);

  return { events, tasks };
}

// ========== CLEAR (in-memory only) ==========

function clearAll() {
  store.conversations = {};
  store.tasks = [];
}

// ========== RE-EXPORT SUPABASE FUNCTIONS ==========
// So handlers can use them directly if needed

const {
  getConversation,
  appendMessage,
  getAgentContext,
  setAgentContext,
  addKeyFact,
  getKeyFacts,
  createDraft,
  getDrafts,
  updateTaskStatus,
} = supabase;

module.exports = {
  // Core logging
  logEvent,
  logTask,
  getTasks,
  getSummaryData,
  clearAll,
  // Supabase passthrough
  getConversation,
  appendMessage,
  getAgentContext,
  setAgentContext,
  addKeyFact,
  getKeyFacts,
  createDraft,
  getDrafts,
  updateTaskStatus,
};
