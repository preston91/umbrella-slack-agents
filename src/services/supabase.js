// src/services/supabase.js
// Persistent memory using Supabase

const { createClient } = require("@supabase/supabase-js");

let supabase = null;

function initSupabase(url, serviceKey) {
  if (!url || !serviceKey) {
    console.warn("Supabase credentials not provided. Using in-memory storage.");
    return false;
  }
  supabase = createClient(url, serviceKey);
  console.log("Supabase initialized");
  return true;
}

function isSupabaseAvailable() {
  return supabase !== null;
}

async function logEvent(channel, agent, text) {
  if (!supabase) return;

  try {
    await supabase.from("events").insert({
      channel,
      agent,
      text,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Supabase logEvent error:", error.message);
  }
}

async function logTask(from, to, task) {
  if (!supabase) return;

  try {
    await supabase.from("tasks").insert({
      from_agent: from,
      to_agent: to,
      task,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Supabase logTask error:", error.message);
  }
}

async function getRecentEvents(hours = 24) {
  if (!supabase) return [];

  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Supabase getRecentEvents error:", error.message);
    return [];
  }
}

async function getRecentTasks(hours = 24) {
  if (!supabase) return [];

  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Supabase getRecentTasks error:", error.message);
    return [];
  }
}

async function getSummaryData(hours = 24) {
  const [events, tasks] = await Promise.all([
    getRecentEvents(hours),
    getRecentTasks(hours),
  ]);
  return { events, tasks };
}

// No need to clear - we keep history in Supabase
async function clearOldData(daysToKeep = 30) {
  if (!supabase) return;

  try {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    await Promise.all([
      supabase.from("events").delete().lt("created_at", cutoff),
      supabase.from("tasks").delete().lt("created_at", cutoff),
    ]);
  } catch (error) {
    console.error("Supabase clearOldData error:", error.message);
  }
}

module.exports = {
  initSupabase,
  isSupabaseAvailable,
  logEvent,
  logTask,
  getRecentEvents,
  getRecentTasks,
  getSummaryData,
  clearOldData,
};
