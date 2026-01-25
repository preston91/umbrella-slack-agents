/**
 * Supabase Integration for Umbrella AI Employees
 *
 * Features:
 * - Cloud memory storage (replaces local JSON)
 * - Document storage with vector search (RAG)
 * - Conversation history
 * - Agent context persistence
 */

const { createClient } = require("@supabase/supabase-js");

let supabase = null;

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.log("⚠️  Supabase not configured - using local storage");
    return null;
  }

  supabase = createClient(url, key);
  console.log("✅ Supabase connected");
  return supabase;
}

function isSupabaseEnabled() {
  return supabase !== null;
}

/* ================================
   AGENT CONTEXT (replaces MD files)
================================ */
async function saveAgentContextCloud(agentKey, context) {
  if (!supabase) return false;

  const { error } = await supabase
    .from("agent_context")
    .upsert({
      agent_key: agentKey,
      context: context,
      updated_at: new Date().toISOString()
    }, { onConflict: "agent_key" });

  if (error) {
    console.error(`Failed to save context for ${agentKey}:`, error.message);
    return false;
  }
  return true;
}

async function loadAgentContextCloud(agentKey) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agent_context")
    .select("context")
    .eq("agent_key", agentKey)
    .single();

  if (error || !data) return null;
  return data.context;
}

/* ================================
   CONVERSATIONS (replaces JSON files)
================================ */
async function saveConversationCloud(channelName, messages) {
  if (!supabase) return false;

  const { error } = await supabase
    .from("conversations")
    .upsert({
      channel_name: channelName,
      messages: messages,
      updated_at: new Date().toISOString()
    }, { onConflict: "channel_name" });

  if (error) {
    console.error(`Failed to save conversation for ${channelName}:`, error.message);
    return false;
  }
  return true;
}

async function loadConversationCloud(channelName) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("messages")
    .eq("channel_name", channelName)
    .single();

  if (error || !data) return null;
  return data.messages;
}

/* ================================
   DOCUMENTS & RAG
================================ */
async function saveDocument(title, content, metadata = {}) {
  if (!supabase) return null;

  // Store the document
  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      content,
      metadata,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save document:", error.message);
    return null;
  }

  return data;
}

async function searchDocuments(query, limit = 5) {
  if (!supabase) return [];

  // Simple text search for now
  // TODO: Add vector embeddings for semantic search
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .textSearch("content", query)
    .limit(limit);

  if (error) {
    console.error("Document search failed:", error.message);
    return [];
  }

  return data || [];
}

/* ================================
   DRAFTS (emails, posts, etc)
================================ */
async function saveDraftCloud(agentKey, draftType, content, metadata = {}) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("drafts")
    .insert({
      agent_key: agentKey,
      draft_type: draftType, // 'email', 'linkedin', 'tweet', etc
      content,
      metadata,
      status: "pending",
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save draft:", error.message);
    return null;
  }

  return data;
}

async function getDraftsCloud(agentKey = null, status = "pending") {
  if (!supabase) return [];

  let query = supabase
    .from("drafts")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (agentKey) {
    query = query.eq("agent_key", agentKey);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load drafts:", error.message);
    return [];
  }

  return data || [];
}

async function updateDraftStatusCloud(draftId, status) {
  if (!supabase) return false;

  const { error } = await supabase
    .from("drafts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", draftId);

  if (error) {
    console.error("Failed to update draft:", error.message);
    return false;
  }

  return true;
}

/* ================================
   KEY FACTS (auto-extracted memories)
================================ */
async function saveKeyFact(agentKey, fact, source = "conversation") {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("key_facts")
    .insert({
      agent_key: agentKey,
      fact,
      source,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save key fact:", error.message);
    return null;
  }

  return data;
}

async function getKeyFacts(agentKey, limit = 50) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("key_facts")
    .select("*")
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load key facts:", error.message);
    return [];
  }

  return data || [];
}

/* ================================
   SETUP HELPER
================================ */
function getSetupSQL() {
  return `
-- Run this in Supabase SQL Editor to set up tables

-- Agent context (persistent memory per agent)
CREATE TABLE IF NOT EXISTS agent_context (
  agent_key TEXT PRIMARY KEY,
  context TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (chat history per channel)
CREATE TABLE IF NOT EXISTS conversations (
  channel_name TEXT PRIMARY KEY,
  messages JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (for RAG)
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536), -- For OpenAI embeddings later
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drafts (emails, posts, etc)
CREATE TABLE IF NOT EXISTS drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_key TEXT,
  draft_type TEXT, -- 'email', 'linkedin', 'tweet'
  content TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'sent', 'rejected'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Key facts (auto-extracted memories)
CREATE TABLE IF NOT EXISTS key_facts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_key TEXT,
  fact TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable vector extension for RAG (run separately if needed)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drafts_agent ON drafts(agent_key);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_key_facts_agent ON key_facts(agent_key);
CREATE INDEX IF NOT EXISTS idx_documents_content ON documents USING GIN(to_tsvector('english', content));
`;
}

module.exports = {
  initSupabase,
  isSupabaseEnabled,
  saveAgentContextCloud,
  loadAgentContextCloud,
  saveConversationCloud,
  loadConversationCloud,
  saveDocument,
  searchDocuments,
  saveDraftCloud,
  getDraftsCloud,
  updateDraftStatusCloud,
  saveKeyFact,
  getKeyFacts,
  getSetupSQL,
};
