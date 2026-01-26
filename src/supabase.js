/**
 * Supabase Integration for Umbrella AI Employees
 *
 * Features:
 * - Cloud memory storage (replaces local JSON)
 * - Document storage with vector search (RAG)
 * - Gemini embeddings for semantic search
 * - Conversation history
 * - Agent context persistence
 */

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

let supabase = null;
let genAI = null;

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.log("⚠️  Supabase not configured - using local storage");
    return null;
  }

  supabase = createClient(url, key);

  // Init Gemini for embeddings
  if (process.env.GOOGLE_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }

  console.log("✅ Supabase connected");
  return supabase;
}

function isSupabaseEnabled() {
  return supabase !== null;
}

/* ================================
   GEMINI EMBEDDINGS
================================ */
async function generateEmbedding(text) {
  if (!genAI) {
    console.log("⚠️  Gemini not available for embeddings");
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error("Embedding generation failed:", error.message);
    return null;
  }
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
async function saveDocument(title, content, metadata = {}, agentKey = null) {
  if (!supabase) return null;

  // Generate embedding for semantic search
  const embedding = await generateEmbedding(content.slice(0, 8000)); // Limit for embedding

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      content,
      metadata: { ...metadata, agent_key: agentKey },
      embedding,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save document:", error.message);
    return null;
  }

  console.log(`📄 Document saved: ${title}`);
  return data;
}

// Semantic search using vector similarity
async function searchDocumentsSemantic(query, limit = 5, agentKey = null) {
  if (!supabase) return [];

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) {
    // Fallback to text search
    return searchDocumentsText(query, limit);
  }

  try {
    // Use Supabase RPC for vector similarity search
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit
    });

    if (error) {
      console.error("Semantic search failed, falling back to text:", error.message);
      return searchDocumentsText(query, limit);
    }

    return data || [];
  } catch (e) {
    console.error("Semantic search error:", e.message);
    return searchDocumentsText(query, limit);
  }
}

// Simple text search fallback
async function searchDocumentsText(query, limit = 5) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .textSearch("content", query.split(" ").join(" | "))
    .limit(limit);

  if (error) {
    console.error("Text search failed:", error.message);
    return [];
  }

  return data || [];
}

// Main search function - tries semantic first, falls back to text
async function searchDocuments(query, limit = 5) {
  return searchDocumentsSemantic(query, limit);
}

// Get all documents (for listing)
async function listDocuments(limit = 20) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("documents")
    .select("id, title, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to list documents:", error.message);
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
      draft_type: draftType,
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
   SETUP SQL
================================ */
function getSetupSQL() {
  return `
-- Enable vector extension FIRST (required for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

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

-- Documents (for RAG) - using 768 dimensions for Gemini embeddings
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drafts (emails, posts, etc)
CREATE TABLE IF NOT EXISTS drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_key TEXT,
  draft_type TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drafts_agent ON drafts(agent_key);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_key_facts_agent ON key_facts(agent_key);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.title,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
`;
}

module.exports = {
  initSupabase,
  isSupabaseEnabled,
  generateEmbedding,
  saveAgentContextCloud,
  loadAgentContextCloud,
  saveConversationCloud,
  loadConversationCloud,
  saveDocument,
  searchDocuments,
  searchDocumentsText,
  listDocuments,
  saveDraftCloud,
  getDraftsCloud,
  updateDraftStatusCloud,
  saveKeyFact,
  getKeyFacts,
  getSetupSQL,
};
