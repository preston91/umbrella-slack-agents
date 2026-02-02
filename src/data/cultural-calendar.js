// src/data/cultural-calendar.js
// Cultural calendar data - events, moments, and brand campaign cycles
// Updated from Jesse's cultural calendar

const CULTURAL_CALENDAR = {
  // Major recurring events with typical dates
  events: [
    // Q1 - January-March
    {
      name: "Grammy Awards",
      category: "music",
      typical_month: 2,
      typical_week: 1,
      date_2025: "2025-02-02",
      date_2026: "2026-02-08",
      location: "Los Angeles",
      talent_fit: ["musicians", "producers", "artists"],
      brand_opportunities: ["fashion", "luxury", "alcohol", "tech"],
      deal_types: ["appearances", "after-parties", "content", "gifting suites"],
      avg_deal_value: "$25K-$100K",
      lead_time_days: 60,
    },
    {
      name: "Super Bowl",
      category: "sports",
      typical_month: 2,
      typical_week: 2,
      date_2025: "2025-02-09",
      date_2026: "2026-02-08",
      location: "Varies",
      talent_fit: ["athletes", "musicians", "celebrities"],
      brand_opportunities: ["automotive", "beer", "snacks", "streaming"],
      deal_types: ["appearances", "watch parties", "commercials", "content"],
      avg_deal_value: "$50K-$500K",
      lead_time_days: 90,
    },
    {
      name: "NBA All-Star Weekend",
      category: "sports",
      typical_month: 2,
      typical_week: 3,
      date_2025: "2025-02-14",
      date_2026: "2026-02-15",
      location: "Varies",
      talent_fit: ["basketball players", "musicians", "athletes"],
      brand_opportunities: ["sneakers", "sportswear", "gaming", "alcohol"],
      deal_types: ["appearances", "parties", "content", "brand activations"],
      avg_deal_value: "$25K-$150K",
      lead_time_days: 45,
    },
    {
      name: "SXSW",
      category: "music/tech",
      typical_month: 3,
      typical_week: 2,
      date_2025: "2025-03-07",
      date_2026: "2026-03-13",
      location: "Austin, TX",
      talent_fit: ["musicians", "tech founders", "creators"],
      brand_opportunities: ["tech", "streaming", "alcohol", "automotive"],
      deal_types: ["performances", "panels", "brand houses", "content"],
      avg_deal_value: "$15K-$75K",
      lead_time_days: 60,
    },
    {
      name: "March Madness",
      category: "sports",
      typical_month: 3,
      typical_week: 3,
      date_2025: "2025-03-18",
      date_2026: "2026-03-17",
      location: "Various",
      talent_fit: ["basketball players", "athletes", "sports personalities"],
      brand_opportunities: ["beer", "fast food", "streaming", "gambling"],
      deal_types: ["watch parties", "content", "appearances"],
      avg_deal_value: "$10K-$50K",
      lead_time_days: 30,
    },

    // Q2 - April-June
    {
      name: "Coachella",
      category: "music",
      typical_month: 4,
      typical_week: 2,
      date_2025: "2025-04-11",
      date_2026: "2026-04-10",
      location: "Indio, CA",
      talent_fit: ["musicians", "influencers", "celebrities"],
      brand_opportunities: ["fashion", "beauty", "alcohol", "tech"],
      deal_types: ["performances", "brand houses", "content", "gifting"],
      avg_deal_value: "$25K-$200K",
      lead_time_days: 90,
    },
    {
      name: "Met Gala",
      category: "fashion",
      typical_month: 5,
      typical_week: 1,
      date_2025: "2025-05-05",
      date_2026: "2026-05-04",
      location: "New York",
      talent_fit: ["celebrities", "musicians", "athletes"],
      brand_opportunities: ["luxury", "fashion", "jewelry"],
      deal_types: ["styling", "after-parties", "content"],
      avg_deal_value: "$50K-$300K",
      lead_time_days: 120,
    },
    {
      name: "NBA Finals",
      category: "sports",
      typical_month: 6,
      typical_week: 1,
      date_2025: "2025-06-05",
      date_2026: "2026-06-04",
      location: "Varies",
      talent_fit: ["basketball players", "athletes", "celebrities"],
      brand_opportunities: ["sportswear", "beer", "automotive"],
      deal_types: ["watch parties", "content", "appearances"],
      avg_deal_value: "$20K-$100K",
      lead_time_days: 30,
    },
    {
      name: "BET Awards",
      category: "entertainment",
      typical_month: 6,
      typical_week: 4,
      date_2025: "2025-06-29",
      date_2026: "2026-06-28",
      location: "Los Angeles",
      talent_fit: ["musicians", "actors", "athletes", "influencers"],
      brand_opportunities: ["beauty", "fashion", "alcohol", "automotive"],
      deal_types: ["appearances", "after-parties", "content", "gifting"],
      avg_deal_value: "$15K-$75K",
      lead_time_days: 45,
    },

    // Q3 - July-September
    {
      name: "Essence Festival",
      category: "culture",
      typical_month: 7,
      typical_week: 1,
      date_2025: "2025-07-03",
      date_2026: "2026-07-02",
      location: "New Orleans",
      talent_fit: ["musicians", "actors", "thought leaders", "influencers"],
      brand_opportunities: ["beauty", "health", "fashion", "financial services"],
      deal_types: ["performances", "panels", "brand activations", "content"],
      avg_deal_value: "$20K-$100K",
      lead_time_days: 60,
    },
    {
      name: "NFL Season Kickoff",
      category: "sports",
      typical_month: 9,
      typical_week: 1,
      date_2025: "2025-09-04",
      date_2026: "2026-09-10",
      location: "Various",
      talent_fit: ["football players", "athletes", "musicians"],
      brand_opportunities: ["beer", "snacks", "streaming", "gambling"],
      deal_types: ["watch parties", "content", "endorsements"],
      avg_deal_value: "$25K-$150K",
      lead_time_days: 45,
    },
    {
      name: "VMAs",
      category: "music",
      typical_month: 9,
      typical_week: 2,
      date_2025: "2025-09-10",
      date_2026: "2026-09-09",
      location: "New York/Los Angeles",
      talent_fit: ["musicians", "influencers", "celebrities"],
      brand_opportunities: ["fashion", "beauty", "alcohol", "tech"],
      deal_types: ["appearances", "after-parties", "content"],
      avg_deal_value: "$20K-$100K",
      lead_time_days: 45,
    },

    // Q4 - October-December
    {
      name: "Art Basel Miami",
      category: "art/culture",
      typical_month: 12,
      typical_week: 1,
      date_2025: "2025-12-04",
      date_2026: "2026-12-03",
      location: "Miami",
      talent_fit: ["artists", "musicians", "celebrities", "collectors"],
      brand_opportunities: ["luxury", "automotive", "alcohol", "fashion"],
      deal_types: ["appearances", "parties", "installations", "content"],
      avg_deal_value: "$30K-$200K",
      lead_time_days: 90,
    },
  ],

  // Brand campaign cycles - when brands are planning/activating
  brand_cycles: {
    Q1_planning: {
      months: [10, 11, 12], // Oct-Dec previous year
      description: "Brands plan Q1 campaigns, budgets finalized",
      action: "Pitch talent partnerships for Jan-Mar activations",
    },
    Q2_planning: {
      months: [1, 2, 3],
      description: "Brands plan summer campaigns",
      action: "Pitch talent for Coachella, festival season, summer campaigns",
    },
    back_to_school: {
      months: [7, 8],
      description: "Back-to-school campaigns ramp up",
      action: "Pitch youth-focused talent, athletes, musicians",
    },
    holiday: {
      months: [9, 10],
      description: "Holiday campaign planning",
      action: "Pitch talent for Q4 brand campaigns, gift guides",
    },
  },

  // Categories for talent matching
  talent_categories: [
    "athletes",
    "basketball players",
    "football players",
    "musicians",
    "producers",
    "actors",
    "influencers",
    "creators",
    "thought leaders",
    "artists",
    "celebrities",
  ],

  // Brand categories
  brand_categories: [
    "fashion",
    "luxury",
    "beauty",
    "alcohol",
    "beer",
    "automotive",
    "tech",
    "streaming",
    "gaming",
    "sportswear",
    "sneakers",
    "financial services",
    "snacks",
    "fast food",
  ],
};

// Helper functions
function getUpcomingEvents(daysAhead = 30) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const year = now.getFullYear();

  return CULTURAL_CALENDAR.events
    .map((event) => {
      const dateKey = `date_${year}`;
      const eventDate = event[dateKey] ? new Date(event[dateKey]) : null;
      return { ...event, eventDate };
    })
    .filter((event) => event.eventDate && event.eventDate >= now && event.eventDate <= cutoff)
    .sort((a, b) => a.eventDate - b.eventDate);
}

function getEventsInRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const year = start.getFullYear();

  return CULTURAL_CALENDAR.events
    .map((event) => {
      const dateKey = `date_${year}`;
      const eventDate = event[dateKey] ? new Date(event[dateKey]) : null;
      return { ...event, eventDate };
    })
    .filter((event) => event.eventDate && event.eventDate >= start && event.eventDate <= end)
    .sort((a, b) => a.eventDate - b.eventDate);
}

function findEventsForTalentType(talentType) {
  return CULTURAL_CALENDAR.events.filter((event) =>
    event.talent_fit.some((fit) => fit.toLowerCase().includes(talentType.toLowerCase()))
  );
}

function findEventsForBrandCategory(brandCategory) {
  return CULTURAL_CALENDAR.events.filter((event) =>
    event.brand_opportunities.some((opp) =>
      opp.toLowerCase().includes(brandCategory.toLowerCase())
    )
  );
}

function getCurrentBrandCycle() {
  const month = new Date().getMonth() + 1; // 1-12
  return Object.entries(CULTURAL_CALENDAR.brand_cycles)
    .filter(([_, cycle]) => cycle.months.includes(month))
    .map(([name, cycle]) => ({ name, ...cycle }));
}

function formatEventForSlack(event) {
  const daysUntil = event.eventDate
    ? Math.ceil((event.eventDate - new Date()) / (24 * 60 * 60 * 1000))
    : "TBD";

  return `*${event.name}* (${event.category})
_${daysUntil} days away_ - ${event.location}
Talent fit: ${event.talent_fit.join(", ")}
Brand opps: ${event.brand_opportunities.join(", ")}
Deal types: ${event.deal_types.join(", ")}
Avg value: ${event.avg_deal_value}
Lead time needed: ${event.lead_time_days} days`;
}

module.exports = {
  CULTURAL_CALENDAR,
  getUpcomingEvents,
  getEventsInRange,
  findEventsForTalentType,
  findEventsForBrandCategory,
  getCurrentBrandCycle,
  formatEventForSlack,
};
