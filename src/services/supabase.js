// src/services/supabase.js
// Persistent memory using YOUR existing Supabase schema

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

function getClient() {
  return supabase;
}

// ========== TASKS (using your existing tasks table) ==========

async function createTask({ description, assignedTo, assignedBy = "cos", deadline = null, deliverable = null }) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        description,
        assigned_to: assignedTo,
        assigned_by: assignedBy,
        deadline,
        deliverable,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Supabase createTask error:", error.message);
    return null;
  }
}

async function getTasks(status = null, assignedTo = null) {
  if (!supabase) return [];

  try {
    let query = supabase.from("tasks").select("*");

    if (status) query = query.eq("status", status);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Supabase getTasks error:", error.message);
    return [];
  }
}

async function updateTaskStatus(taskId, status, notes = null) {
  if (!supabase) return null;

  try {
    const update = { status, updated_at: new Date().toISOString() };
    if (notes) update.notes = notes;

    const { data, error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", taskId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Supabase updateTaskStatus error:", error.message);
    return null;
  }
}

// ========== CONVERSATIONS (chat history per channel) ==========

async function getConversation(channelName) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("messages")
      .eq("channel_name", channelName)
      .single();

    if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
    return data?.messages || [];
  } catch (error) {
    console.error("Supabase getConversation error:", error.message);
    return [];
  }
}

async function appendMessage(channelName, role, content, agent = null) {
  if (!supabase) return;

  try {
    const message = {
      role,
      content,
      agent,
      timestamp: new Date().toISOString(),
    };

    // Get existing messages
    const messages = await getConversation(channelName);
    messages.push(message);

    // Keep last 50 messages per channel
    const trimmed = messages.slice(-50);

    // Upsert
    const { error } = await supabase
      .from("conversations")
      .upsert({
        channel_name: channelName,
        messages: trimmed,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  } catch (error) {
    console.error("Supabase appendMessage error:", error.message);
  }
}

// ========== AGENT CONTEXT (persistent memory per agent) ==========

async function getAgentContext(agentKey) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("agent_context")
      .select("context")
      .eq("agent_key", agentKey)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data?.context || null;
  } catch (error) {
    console.error("Supabase getAgentContext error:", error.message);
    return null;
  }
}

async function setAgentContext(agentKey, context) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from("agent_context")
      .upsert({
        agent_key: agentKey,
        context,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  } catch (error) {
    console.error("Supabase setAgentContext error:", error.message);
  }
}

// ========== KEY FACTS (auto-extracted memories) ==========

async function addKeyFact(agentKey, fact, source = null) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("key_facts")
      .insert({
        agent_key: agentKey,
        fact,
        source,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Supabase addKeyFact error:", error.message);
    return null;
  }
}

async function getKeyFacts(agentKey, limit = 20) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("key_facts")
      .select("*")
      .eq("agent_key", agentKey)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Supabase getKeyFacts error:", error.message);
    return [];
  }
}

// ========== DRAFTS ==========

async function createDraft(agentKey, draftType, content, metadata = {}) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("drafts")
      .insert({
        agent_key: agentKey,
        draft_type: draftType,
        content,
        metadata,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Supabase createDraft error:", error.message);
    return null;
  }
}

async function getDrafts(agentKey = null, status = "pending") {
  if (!supabase) return [];

  try {
    let query = supabase.from("drafts").select("*");

    if (agentKey) query = query.eq("agent_key", agentKey);
    if (status) query = query.eq("status", status);

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Supabase getDrafts error:", error.message);
    return [];
  }
}

// ========== SUMMARY DATA (for daily digest) ==========

async function getSummaryData(hours = 24) {
  if (!supabase) return { events: [], tasks: [] };

  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Get recent tasks
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (tasksError) throw tasksError;

    // Get all conversations updated recently (as "events")
    const { data: convos, error: convosError } = await supabase
      .from("conversations")
      .select("*")
      .gte("updated_at", since);

    if (convosError) throw convosError;

    // Flatten conversations into events
    const events = [];
    for (const convo of convos || []) {
      for (const msg of convo.messages || []) {
        if (new Date(msg.timestamp) >= new Date(since)) {
          events.push({
            channel: convo.channel_name,
            agent: msg.agent,
            text: msg.content,
            time: msg.timestamp,
          });
        }
      }
    }

    return { events, tasks: tasks || [] };
  } catch (error) {
    console.error("Supabase getSummaryData error:", error.message);
    return { events: [], tasks: [] };
  }
}

module.exports = {
  initSupabase,
  isSupabaseAvailable,
  getClient,
  // Tasks
  createTask,
  getTasks,
  updateTaskStatus,
  // Conversations
  getConversation,
  appendMessage,
  // Agent context
  getAgentContext,
  setAgentContext,
  // Key facts
  addKeyFact,
  getKeyFacts,
  // Drafts
  createDraft,
  getDrafts,
  // Summary
  getSummaryData,
};
