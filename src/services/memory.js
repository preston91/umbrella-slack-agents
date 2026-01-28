// src/services/memory.js
// Unified memory interface - uses Supabase if available, falls back to in-memory

const supabase = require("./supabase");

// In-memory fallback store
const store = {
  events: [],
  tasks: [],
};

async function logEvent(channel, agent, text) {
  if (supabase.isSupabaseAvailable()) {
    await supabase.logEvent(channel, agent, text);
  } else {
    store.events.push({
      channel,
      agent,
      text,
      time: new Date().toISOString(),
    });
  }
}

async function logTask(from, to, task) {
  if (supabase.isSupabaseAvailable()) {
    await supabase.logTask(from, to, task);
  } else {
    store.tasks.push({
      from,
      to,
      task,
      time: new Date().toISOString(),
    });
  }
}

async function getEvents() {
  if (supabase.isSupabaseAvailable()) {
    return supabase.getRecentEvents(24);
  }
  return [...store.events];
}

async function getTasks() {
  if (supabase.isSupabaseAvailable()) {
    return supabase.getRecentTasks(24);
  }
  return [...store.tasks];
}

async function getSummaryData() {
  if (supabase.isSupabaseAvailable()) {
    return supabase.getSummaryData(24);
  }
  return {
    events: [...store.events],
    tasks: [...store.tasks],
  };
}

function clearAll() {
  // Only clears in-memory store
  // Supabase keeps history (use clearOldData for cleanup)
  store.events = [];
  store.tasks = [];
}

module.exports = {
  logEvent,
  logTask,
  getEvents,
  getTasks,
  clearAll,
  getSummaryData,
};
