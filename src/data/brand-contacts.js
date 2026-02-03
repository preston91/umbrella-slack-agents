// src/data/brand-contacts.js
// Brand contacts database - companies we have relationships with
// Last updated: 2026-02-03

const BRAND_CONTACTS = {
  // ============================================
  // BEAUTY & SKINCARE
  // ============================================
  beauty_skincare: [
    { name: "Avaline", category: "Wine/Beauty", notes: "Cameron Diaz's wine brand" },
    { name: "Sable Labs", category: "Beauty" },
    { name: "Briogeo Hair", category: "Haircare" },
    { name: "Summer Fridays", category: "Skincare" },
    { name: "Amika", category: "Haircare" },
    { name: "Cetaphil", category: "Skincare" },
    { name: "Clinique", category: "Skincare", parent: "Estee Lauder" },
    { name: "MAC Cosmetics", category: "Cosmetics" },
    { name: "Ouai", category: "Haircare" },
    { name: "Cecred", category: "Haircare", notes: "Beyonce's haircare brand" },
    { name: "Charlotte Tilbury", category: "Cosmetics" },
    { name: "Drunk Elephant", category: "Skincare" },
    { name: "Elf Beauty", category: "Cosmetics" },
    { name: "Glossier", category: "Beauty" },
    { name: "Laura Mercier", category: "Cosmetics" },
    { name: "Nars", category: "Cosmetics" },
    { name: "Rare Beauty", category: "Cosmetics", notes: "Selena Gomez's brand" },
    { name: "Revlon", category: "Cosmetics" },
    { name: "Tower28", category: "Clean Beauty" },
    { name: "Fresh Beauty", category: "Skincare" },
    { name: "Topicals", category: "Skincare", notes: "Black-owned" },
    { name: "EOS", category: "Lip Care/Skincare" },
    { name: "Sensori", category: "Beauty" },
    { name: "Shea Moisture", category: "Haircare/Skincare", notes: "Black haircare" },
    { name: "Carol's Daughter", category: "Haircare", notes: "Black haircare" },
    { name: "Ceremonia", category: "Haircare", notes: "Latina-founded" },
    { name: "Rhode Skin", category: "Skincare", parent: "Elf", notes: "Hailey Bieber's brand" },
    { name: "La Mer", category: "Luxury Skincare", parent: "Estee Lauder" },
    { name: "Dr. Jart", category: "Skincare", parent: "Estee Lauder" },
    { name: "Tom Ford Beauty", category: "Luxury Beauty" },
    { name: "Aramis", category: "Men's Grooming", parent: "Estee Lauder" },
    { name: "Mielle Organics", category: "Haircare", notes: "Black haircare" },
    { name: "The Honey Pot", category: "Feminine Care", notes: "Black-owned" },
    { name: "Scotch Porter", category: "Men's Grooming", notes: "Black-owned" },
    { name: "Fenty Hair", category: "Haircare", notes: "Rihanna's brand" },
    { name: "Refy Beauty", category: "Beauty" },
    { name: "L'Oreal", category: "Beauty Conglomerate" },
    { name: "The Estee Lauder Company", category: "Beauty Conglomerate" },
    { name: "Keys Soul Care", category: "Skincare", parent: "Elf", notes: "Alicia Keys' brand" },
  ],

  // ============================================
  // FASHION & APPAREL
  // ============================================
  fashion_apparel: [
    { name: "Jordan Brand (Womens)", category: "Athletic", parent: "Nike" },
    { name: "Nike Women's", category: "Athletic" },
    { name: "Alo Yoga", category: "Athleisure" },
    { name: "Aerie", category: "Intimates/Casual", parent: "American Eagle" },
    { name: "Revolve", category: "Fashion Retailer" },
    { name: "Kering", category: "Luxury Conglomerate", notes: "Gucci, YSL, Balenciaga" },
    { name: "Meta Fashion", category: "Digital Fashion", parent: "Meta" },
    { name: "Ssense", category: "Luxury E-commerce" },
    { name: "Puma", category: "Athletic" },
    { name: "Levi's", category: "Denim" },
    { name: "Kate Spade", category: "Accessories", notes: "Social Impact focus" },
  ],

  // ============================================
  // RETAIL
  // ============================================
  retail: [
    { name: "Sephora", category: "Beauty Retail" },
    { name: "Sephora (Community Impact)", category: "Beauty Retail", notes: "DEI/Community programs" },
    { name: "Ulta", category: "Beauty Retail" },
    { name: "Jo Malone London", category: "Fragrance", parent: "Estee Lauder" },
  ],

  // ============================================
  // TECH & PLATFORMS
  // ============================================
  tech_platforms: [
    { name: "Netflix", category: "Streaming", notes: "Strong Black Lead initiative" },
    { name: "Cash App", category: "Fintech", parent: "Block" },
    { name: "PayPal", category: "Fintech" },
    { name: "Spotify", category: "Music Streaming" },
    { name: "Microsoft", category: "Tech" },
    { name: "Hulu / Onyx Collective", category: "Streaming", notes: "Black content vertical" },
    { name: "Google", category: "Tech", notes: "Content & Community" },
    { name: "Oura Ring", category: "Wearables/Health Tech" },
    { name: "Salesforce", category: "Enterprise Tech" },
    { name: "Headspace", category: "Wellness Tech" },
    { name: "Apple Music", category: "Music Streaming", notes: "Marketing team" },
    { name: "LTK (LikeToKnow)", category: "Creator Economy" },
    { name: "ShopMy", category: "Creator Economy" },
  ],

  // ============================================
  // SPIRITS & BEVERAGES
  // ============================================
  spirits_beverages: [
    { name: "Bacardi Portfolio Brands", category: "Spirits Conglomerate" },
    { name: "HRLM (Harlem) Champagne", category: "Champagne", notes: "Black-owned" },
    { name: "LVMH", category: "Luxury Conglomerate", notes: "Head of Diversity contact" },
    { name: "Moet Hennessy", category: "Spirits/Champagne", parent: "LVMH" },
    { name: "Veuve Clicquot", category: "Champagne", parent: "LVMH" },
    { name: "Campari Portfolio Brands", category: "Spirits Conglomerate" },
    { name: "Diageo - Smirnoff", category: "Spirits" },
    { name: "Lobos", category: "Tequila", notes: "LeBron James investment" },
    { name: "McBride Sisters", category: "Wine", notes: "Black-owned" },
    { name: "Medase Cocktails", category: "RTD Cocktails" },
    { name: "Jim Beam", category: "Bourbon" },
    { name: "Grey Goose", category: "Vodka", parent: "Bacardi" },
    { name: "Clase Azul", category: "Tequila" },
    { name: "Camino Brands", category: "Spirits" },
    { name: "Sir Davis", category: "Whiskey", notes: "Beyonce's whiskey brand (Agency)" },
  ],

  // ============================================
  // FITNESS & WELLNESS
  // ============================================
  fitness_wellness: [
    { name: "Peloton", category: "Fitness" },
    { name: "Bloom Nutrition", category: "Supplements" },
    { name: "Olly", category: "Vitamins/Supplements" },
    { name: "Poppi", category: "Prebiotic Soda" },
  ],

  // ============================================
  // SPORTS & ENTERTAINMENT
  // ============================================
  sports_entertainment: [
    { name: "NBA", category: "Sports League" },
    { name: "NBA (BAL)", category: "Sports League", notes: "Basketball Africa League" },
    { name: "NBA (2K)", category: "Gaming" },
    { name: "UnRivaled", category: "Sports/Entertainment" },
    { name: "Disney (Cultural)", category: "Entertainment", notes: "Cultural initiatives" },
    { name: "Boardroom / 35V", category: "Sports Media", notes: "Kevin Durant's company" },
    { name: "Interscope Records", category: "Music", notes: "A&R contact" },
  ],

  // ============================================
  // CPG & CONSUMER GOODS
  // ============================================
  cpg: [
    { name: "Procter & Gamble Portfolio Brands", category: "CPG Conglomerate" },
  ],

  // ============================================
  // FINANCIAL SERVICES
  // ============================================
  financial: [
    { name: "Visa", category: "Payments" },
    { name: "American Express", category: "Payments", notes: "Community Impact programs" },
    { name: "KIVA", category: "Microfinance", notes: "Social impact lending" },
    { name: "Bloomberg", category: "Financial Media" },
  ],

  // ============================================
  // AUTOMOTIVE & TRAVEL
  // ============================================
  automotive_travel: [
    { name: "Cadillac F1 Team", category: "Automotive/Racing" },
    { name: "Delta Airlines", category: "Travel", notes: "Agency relationship" },
  ],

  // ============================================
  // AGENCIES & PARTNERS
  // ============================================
  agencies: [
    { name: "Bevel", category: "Agency", notes: "Men's grooming brand/agency" },
    { name: "JBW", category: "Agency/Watches" },
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all brands as flat list
 */
function getAllBrandContacts() {
  const allBrands = [];
  for (const [category, brands] of Object.entries(BRAND_CONTACTS)) {
    brands.forEach(brand => {
      allBrands.push({
        ...brand,
        sector: category,
      });
    });
  }
  return allBrands;
}

/**
 * Get brands by sector
 */
function getBrandsByCategory(sector) {
  return BRAND_CONTACTS[sector] || [];
}

/**
 * Search brands by name
 */
function searchBrands(query) {
  const all = getAllBrandContacts();
  const q = query.toLowerCase();
  return all.filter(b =>
    b.name.toLowerCase().includes(q) ||
    (b.notes && b.notes.toLowerCase().includes(q)) ||
    (b.parent && b.parent.toLowerCase().includes(q))
  );
}

/**
 * Get brands good for specific talent types
 */
function getBrandsForTalentType(talentType) {
  // Returns brands that typically work with certain talent
  const mapping = {
    wnba: ["Nike Women's", "Jordan Brand (Womens)", "Glossier", "Alo Yoga", "Cash App", "Oura Ring"],
    nba: ["Nike", "Jordan Brand", "Cash App", "Spotify", "Beats", "Gatorade"],
    creator: ["Glossier", "Summer Fridays", "Alo Yoga", "Revolve", "LTK", "ShopMy"],
    music: ["Spotify", "Apple Music", "Interscope Records", "Cash App", "Fashion brands"],
    black_owned_focus: ["Topicals", "The Honey Pot", "Scotch Porter", "McBride Sisters", "HRLM Champagne", "Carol's Daughter", "Shea Moisture"],
  };
  return mapping[talentType] || [];
}

/**
 * Get parent company relationships
 */
function getParentCompanyBrands(parentName) {
  const all = getAllBrandContacts();
  return all.filter(b => b.parent && b.parent.toLowerCase().includes(parentName.toLowerCase()));
}

/**
 * Get summary stats
 */
function getBrandStats() {
  const all = getAllBrandContacts();
  const byCategory = {};

  for (const [category, brands] of Object.entries(BRAND_CONTACTS)) {
    byCategory[category] = brands.length;
  }

  return {
    total: all.length,
    byCategory,
    withNotes: all.filter(b => b.notes).length,
    withParent: all.filter(b => b.parent).length,
  };
}

module.exports = {
  BRAND_CONTACTS,
  getAllBrandContacts,
  getBrandsByCategory,
  searchBrands,
  getBrandsForTalentType,
  getParentCompanyBrands,
  getBrandStats,
};
