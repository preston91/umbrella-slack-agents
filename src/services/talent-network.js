// src/services/talent-network.js
// Shared talent network - all agents can read/write

const supabase = require("./supabase");

// In-memory fallback for talent
const store = {
  talent: [],
  brands: [],
  opportunities: [],
};

// ========== TALENT ==========

async function addTalent(talentData) {
  const talent = {
    name: talentData.name,
    type: talentData.type || "talent", // athlete, creator, artist, executive
    profile: talentData.profile || null,
    demographics: talentData.demographics || null,
    brand_history: talentData.brandHistory || null,
    social_following: talentData.socialFollowing || null,
    deal_openness: talentData.dealOpenness || null, // endorsements, appearances, equity
    notes: talentData.notes || null,
    added_by: talentData.addedBy || "system",
    source: talentData.source || null, // how we know them
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase.isSupabaseAvailable()) {
    try {
      // Check if talent already exists
      const existing = await getTalentByName(talent.name);
      if (existing) {
        return updateTalent(existing.id, talentData);
      }

      const { data, error } = await supabase.getClient()
        .from("talent_network")
        .insert(talent)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("addTalent error:", error.message);
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const existing = store.talent.find(t =>
    t.name.toLowerCase() === talent.name.toLowerCase()
  );
  if (existing) {
    Object.assign(existing, talent, { id: existing.id });
    return existing;
  }
  talent.id = Date.now();
  store.talent.push(talent);
  return talent;
}

async function getTalentByName(name) {
  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("talent_network")
        .select("*")
        .ilike("name", `%${name}%`)
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    } catch (error) {
      console.error("getTalentByName error:", error.message);
    }
  }
  return store.talent.find(t =>
    t.name.toLowerCase().includes(name.toLowerCase())
  );
}

async function getAllTalent() {
  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("talent_network")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("getAllTalent error:", error.message);
    }
  }
  return store.talent;
}

async function updateTalent(id, updates) {
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("talent_network")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("updateTalent error:", error.message);
    }
  }

  const talent = store.talent.find(t => t.id === id);
  if (talent) Object.assign(talent, updateData);
  return talent;
}

// ========== BRANDS ==========

async function addBrand(brandData) {
  const brand = {
    name: brandData.name,
    category: brandData.category || null, // CPG, tech, sports betting, etc.
    contacts: brandData.contacts || [],
    campaign_cycles: brandData.campaignCycles || null,
    talent_preferences: brandData.talentPreferences || null,
    budget_range: brandData.budgetRange || null,
    notes: brandData.notes || null,
    added_by: brandData.addedBy || "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("brand_network")
        .insert(brand)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("addBrand error:", error.message);
    }
  }

  brand.id = Date.now();
  store.brands.push(brand);
  return brand;
}

async function getAllBrands() {
  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("brand_network")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("getAllBrands error:", error.message);
    }
  }
  return store.brands;
}

// ========== OPPORTUNITIES ==========

async function addOpportunity(oppData) {
  const opportunity = {
    talent_id: oppData.talentId || null,
    talent_name: oppData.talentName,
    brand_id: oppData.brandId || null,
    brand_name: oppData.brandName || null,
    moment: oppData.moment, // event name or cultural moment
    moment_date: oppData.momentDate || null,
    deal_type: oppData.dealType || null, // appearance, content, endorsement
    estimated_value: oppData.estimatedValue || null,
    uhg_revenue: oppData.uhgRevenue || null,
    urgency: oppData.urgency || "normal", // urgent, high, normal, low
    status: oppData.status || "identified", // identified, pitched, meeting, closed, lost
    assigned_to: oppData.assignedTo || "deals",
    notes: oppData.notes || null,
    created_by: oppData.createdBy || "moments",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("opportunities")
        .insert(opportunity)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("addOpportunity error:", error.message);
    }
  }

  opportunity.id = Date.now();
  store.opportunities.push(opportunity);
  return opportunity;
}

async function getOpportunities(status = null, assignedTo = null) {
  if (supabase.isSupabaseAvailable()) {
    try {
      let query = supabase.getClient()
        .from("opportunities")
        .select("*");

      if (status) query = query.eq("status", status);
      if (assignedTo) query = query.eq("assigned_to", assignedTo);

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("getOpportunities error:", error.message);
    }
  }

  let opps = [...store.opportunities];
  if (status) opps = opps.filter(o => o.status === status);
  if (assignedTo) opps = opps.filter(o => o.assigned_to === assignedTo);
  return opps;
}

async function updateOpportunity(id, updates) {
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (supabase.isSupabaseAvailable()) {
    try {
      const { data, error } = await supabase.getClient()
        .from("opportunities")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("updateOpportunity error:", error.message);
    }
  }

  const opp = store.opportunities.find(o => o.id === id);
  if (opp) Object.assign(opp, updateData);
  return opp;
}

// ========== NETWORK SUMMARY (for agent context) ==========

async function getNetworkSummary() {
  const talent = await getAllTalent();
  const brands = await getAllBrands();
  const opportunities = await getOpportunities();

  return {
    talentCount: talent.length,
    brandCount: brands.length,
    activeOpportunities: opportunities.filter(o =>
      !["closed", "lost"].includes(o.status)
    ).length,
    talent: talent.slice(0, 20), // Last 20 added
    brands: brands.slice(0, 10),
    recentOpportunities: opportunities.slice(0, 10),
  };
}

module.exports = {
  // Talent
  addTalent,
  getTalentByName,
  getAllTalent,
  updateTalent,
  // Brands
  addBrand,
  getAllBrands,
  // Opportunities
  addOpportunity,
  getOpportunities,
  updateOpportunity,
  // Summary
  getNetworkSummary,
};
