// src/data/brand-moments.js
// Annual brand moments and activations in basketball/sports
// These are recurring brand activations that happen every year

const BRAND_MOMENTS = {
  // ============================================
  // JANUARY BRAND MOMENTS
  // ============================================
  january: [
    {
      name: "NBA MLK Day Celebration",
      typical_date: "Third Monday of January",
      date_2026: "2026-01-19",
      description: "NBA's annual celebration of Martin Luther King Jr. Day with special games in Atlanta and Memphis",
      brand_activations: [
        { brand: "NBA", activation: "Honor King shooting shirts, Days of Service" },
        { brand: "Nike", activation: "MLK-themed colorways and products" },
        { brand: "State Farm", activation: "Community assist initiatives" },
      ],
      talent_fit: ["NBA players", "civil rights advocates", "community leaders"],
      deal_types: ["appearances", "community service", "content", "social campaigns"],
      avg_deal_value: "$15K-$50K",
      lead_time_days: 45,
    },
    {
      name: "Nike Kobe Anniversary Releases",
      typical_date: "Late January",
      date_2026: "2026-01-22",
      description: "Nike releases commemorative Kobe sneakers around the anniversary of his passing",
      brand_activations: [
        { brand: "Nike", activation: "Kobe 1 Protro '81 Points Game' release (20th anniversary)" },
        { brand: "Nike", activation: "Special edition drops and tributes" },
      ],
      talent_fit: ["NBA players who wear Kobes", "influencers"],
      deal_types: ["seeding", "content", "unboxing", "tributes"],
      avg_deal_value: "$10K-$50K",
      lead_time_days: 30,
    },
  ],

  // ============================================
  // FEBRUARY BRAND MOMENTS
  // ============================================
  february: [
    {
      name: "NBA All-Star Weekend Brand Activations",
      typical_date: "Mid-February (Presidents Day Weekend)",
      date_2026: "2026-02-13",
      end_date_2026: "2026-02-15",
      location_2026: "Los Angeles, Crypto.com Arena",
      description: "Massive brand activation weekend - the biggest basketball marketing event of the year",
      brand_activations: [
        { brand: "Nike/Jordan Brand", activation: "Jordan Fam Fest, Nike Future Game Experience, exclusive product debuts" },
        { brand: "American Express", activation: "Multi-floor Amex Experience activation, celebrity performances" },
        { brand: "AT&T", activation: "Presenting sponsor of Slam Dunk Contest, XR Dunk Court experiences" },
        { brand: "Google Pixel", activation: "Google Pixel House, SLAM magazine cover creator" },
        { brand: "Foot Locker", activation: "34,000+ sq ft multi-day activation with Nike, Jordan, Adidas, Puma" },
        { brand: "State Farm", activation: "All-Star Saturday Night title sponsor, Assist Tracker donations" },
        { brand: "DoorDash", activation: "NBA Crossover activations" },
        { brand: "Peloton", activation: "NBA Crossover activations" },
        { brand: "New Era", activation: "Official Draft/Championship caps, retail activations" },
        { brand: "Michelob ULTRA", activation: "VIP experiences, courtside activations" },
      ],
      talent_fit: ["NBA All-Stars", "celebrities", "musicians", "influencers"],
      deal_types: ["appearances", "brand activations", "parties", "content", "seeding"],
      avg_deal_value: "$25K-$250K",
      lead_time_days: 90,
    },
    {
      name: "Black History Month NBA Activations",
      typical_date: "All February",
      date_2026: "2026-02-01",
      end_date_2026: "2026-02-28",
      description: "Month-long NBA celebration of Black history and culture",
      brand_activations: [
        { brand: "NBA", activation: "NBA Pioneers Day (Feb 1), Built By Black History campaign" },
        { brand: "NBA", activation: "NBA HBCU Classic during All-Star Weekend" },
        { brand: "NBA", activation: "NBA All-Star Pitch Competition for Black founders" },
        { brand: "Various", activation: "Black-owned business spotlights, community conversations" },
      ],
      talent_fit: ["Black NBA/WNBA players", "Black creators", "Black entrepreneurs"],
      deal_types: ["content", "panels", "community events", "brand campaigns"],
      avg_deal_value: "$10K-$75K",
      lead_time_days: 60,
    },
    {
      name: "Valentine's Day Sneaker Releases",
      typical_date: "February 14",
      date_2026: "2026-02-14",
      description: "Annual Valentine's themed sneaker releases across major brands",
      brand_activations: [
        { brand: "Nike", activation: "Valentine's Day colorways" },
        { brand: "Jordan Brand", activation: "Special edition releases" },
        { brand: "Adidas", activation: "Love-themed drops" },
      ],
      talent_fit: ["athletes", "influencers", "couples content creators"],
      deal_types: ["seeding", "couple content", "unboxing"],
      avg_deal_value: "$5K-$25K",
      lead_time_days: 30,
    },
  ],

  // ============================================
  // MARCH-APRIL BRAND MOMENTS
  // ============================================
  march_april: [
    {
      name: "March Madness Brand Activations",
      typical_date: "Mid-March through early April",
      date_2026: "2026-03-17",
      end_date_2026: "2026-04-06",
      description: "NCAA Tournament - $1B+ in ad revenue, massive brand exposure",
      brand_activations: [
        { brand: "Capital One", activation: "Official bracket challenges, Fan Fest, March Madness Music Festival" },
        { brand: "AT&T", activation: "Block Party at Final Four, Women's Final Four concerts" },
        { brand: "Coca-Cola/Powerade", activation: "Official sports drink, sampling activations" },
        { brand: "Pizza Hut", activation: "Official Pizza of March Madness" },
        { brand: "Reese's", activation: "Official Candy Partner" },
        { brand: "Home Depot", activation: "Tips from the Tool Shaq content with Shaq" },
        { brand: "Degree", activation: "NIL deals for walk-on athletes" },
      ],
      talent_fit: ["college players (NIL)", "NBA legends", "coaches", "influencers"],
      deal_types: ["NIL deals", "content", "appearances", "watch parties"],
      avg_deal_value: "$10K-$100K (NIL: $1K-$25K)",
      lead_time_days: 60,
    },
    {
      name: "McDonald's All-American Game",
      typical_date: "Late March/Early April",
      date_2026: "2026-04-01",
      location_2026: "TBD",
      description: "Premier high school basketball all-star game - scouts top prospects",
      brand_activations: [
        { brand: "McDonald's", activation: "Title sponsor, proceeds to Ronald McDonald House" },
        { brand: "Adidas", activation: "Exclusive sneaker colorways for participants" },
        { brand: "Powerade", activation: "Jam Fest sponsor (3-point contest & dunk competition)" },
      ],
      talent_fit: ["high school prospects", "NBA legends", "basketball influencers"],
      deal_types: ["appearances", "content", "seeding"],
      avg_deal_value: "$5K-$50K",
      lead_time_days: 45,
    },
    {
      name: "Jordan Brand Classic",
      typical_date: "Mid-April",
      date_2026: "2026-04-18",
      location_2026: "TBD (rotates: MSG, Barclays, T-Mobile Arena)",
      description: "Jordan Brand's premier high school all-star showcase",
      brand_activations: [
        { brand: "Jordan Brand", activation: "Boys and Girls high school all-star games" },
        { brand: "Nike", activation: "Product seeding, exclusive releases" },
      ],
      talent_fit: ["high school prospects", "Jordan athletes", "basketball legends"],
      deal_types: ["appearances", "content", "mentorship content"],
      avg_deal_value: "$10K-$75K",
      lead_time_days: 60,
    },
    {
      name: "Nike Hoop Summit",
      typical_date: "Early April",
      date_2026: "2026-04-11",
      location_2026: "Moda Center, Portland, Oregon",
      description: "USA Basketball vs World Select Team - top international prospects",
      brand_activations: [
        { brand: "Nike", activation: "Title sponsor, product seeding" },
        { brand: "USA Basketball", activation: "International showcase" },
      ],
      talent_fit: ["international prospects", "NBA scouts", "basketball media"],
      deal_types: ["appearances", "content", "scouting content"],
      avg_deal_value: "$5K-$30K",
      lead_time_days: 45,
    },
  ],

  // ============================================
  // MAY BRAND MOMENTS
  // ============================================
  may: [
    {
      name: "NBA Draft Combine",
      typical_date: "Mid-May",
      date_2026: "2026-05-11",
      end_date_2026: "2026-05-18",
      location_2026: "Wintrust Arena, Chicago",
      description: "Pre-draft measurements, testing, and interviews - draft prospect showcase",
      brand_activations: [
        { brand: "NBA", activation: "G League Elite Camp, combine events" },
        { brand: "State Farm", activation: "NBA Draft presented by State Farm branding" },
        { brand: "Various agencies", activation: "Prospect showcases, brand introductions" },
      ],
      talent_fit: ["draft prospects", "NBA agents", "scouts"],
      deal_types: ["prospect appearances", "brand introductions", "content"],
      avg_deal_value: "$5K-$25K",
      lead_time_days: 30,
    },
    {
      name: "NBA Playoffs Brand Surge",
      typical_date: "April-June",
      date_2026: "2026-04-19",
      end_date_2026: "2026-06-22",
      description: "Playoff games drive massive brand exposure and activation opportunities",
      brand_activations: [
        { brand: "Kia Motors", activation: "Highest broadcast brand value (~$23M+)" },
        { brand: "State Farm", activation: "Major playoff exposure, Chris Paul/Cliff Paul content" },
        { brand: "Google", activation: "In-game ads and search campaigns" },
        { brand: "YouTube TV", activation: "Presenting partner" },
        { brand: "DraftKings/FanDuel", activation: "Sports betting promotions" },
      ],
      talent_fit: ["playoff players", "legends", "analysts"],
      deal_types: ["watch parties", "content", "predictions", "brand campaigns"],
      avg_deal_value: "$15K-$100K",
      lead_time_days: 30,
    },
  ],

  // ============================================
  // JUNE BRAND MOMENTS
  // ============================================
  june: [
    {
      name: "NBA Finals Brand Activations",
      typical_date: "June",
      date_2026: "2026-06-04",
      end_date_2026: "2026-06-22",
      description: "NBA Finals - peak basketball viewership and brand exposure",
      brand_activations: [
        { brand: "YouTube/YouTube TV", activation: "Presenting partner" },
        { brand: "Kia Motors", activation: "Highest broadcast brand value" },
        { brand: "Michelob ULTRA", activation: "Official global partner, giveaways" },
        { brand: "Google", activation: "Major exposure throughout" },
        { brand: "State Farm", activation: "Major exposure throughout" },
      ],
      talent_fit: ["Finals players", "legends", "celebrities", "influencers"],
      deal_types: ["watch parties", "content", "appearances", "brand campaigns"],
      avg_deal_value: "$25K-$150K",
      lead_time_days: 30,
    },
    {
      name: "NBA Draft Night Activations",
      typical_date: "Late June",
      date_2026: "2026-06-25",
      end_date_2026: "2026-06-26",
      location_2026: "Barclays Center, Brooklyn, NY",
      description: "Two-night NBA Draft - top prospects selected by teams",
      brand_activations: [
        { brand: "State Farm", activation: "Title sponsor - NBA Draft presented by State Farm" },
        { brand: "AT&T", activation: "Retail activations (e.g., Flaggship Experience for Cooper Flagg)" },
        { brand: "New Era", activation: "Official NBA Draft caps" },
        { brand: "Various brands", activation: "Pop-ups featuring draft prospects" },
      ],
      talent_fit: ["draft prospects", "legends", "analysts", "influencers"],
      deal_types: ["draft night content", "reactions", "brand activations", "appearances"],
      avg_deal_value: "$10K-$100K",
      lead_time_days: 45,
    },
    {
      name: "Juneteenth NBA Celebration",
      typical_date: "June 19",
      date_2026: "2026-06-19",
      description: "NBA celebrates Juneteenth with community activations",
      brand_activations: [
        { brand: "NBA", activation: "Community events, Black business spotlights" },
        { brand: "Various", activation: "Juneteenth-themed content and campaigns" },
      ],
      talent_fit: ["Black NBA/WNBA players", "activists", "community leaders"],
      deal_types: ["community events", "content", "panels"],
      avg_deal_value: "$10K-$50K",
      lead_time_days: 45,
    },
  ],

  // ============================================
  // JULY BRAND MOMENTS
  // ============================================
  july: [
    {
      name: "NBA Summer League Brand Activations",
      typical_date: "July",
      date_2026: "2026-07-05",
      end_date_2026: "2026-07-21",
      location_2026: "Thomas & Mack Center, Las Vegas",
      description: "NBA 2K Summer League - rookies and young players showcase, Vegas activations",
      brand_activations: [
        { brand: "2K Games", activation: "Title sponsor - NBA 2K Summer League" },
        { brand: "Michelob ULTRA", activation: "Courtside Deck lounge, VIP experiences, limo transfers" },
        { brand: "Chase Freedom/NBPA", activation: "Brotherhood Deli activation - NYC bodega theme" },
        { brand: "NBPA", activation: "Speakeasy showcasing player-owned spirits" },
        { brand: "NBA Top Shot", activation: "On-site kiosk, dynamically minted Moments" },
      ],
      talent_fit: ["rookies", "young players", "veterans", "influencers"],
      deal_types: ["appearances", "brand activations", "content", "VIP access"],
      avg_deal_value: "$10K-$75K",
      lead_time_days: 45,
    },
    {
      name: "WNBA All-Star Weekend",
      typical_date: "Mid-July",
      date_2026: "2026-07-18",
      end_date_2026: "2026-07-20",
      description: "WNBA All-Star - record-breaking viewership (4M+ in 2025)",
      brand_activations: [
        { brand: "U.S. Bank", activation: "Presenting sponsor of WNBA Live Fan Festival" },
        { brand: "Nike", activation: "Nx3 3-on-3 tournament" },
        { brand: "AT&T", activation: "Meet-and-greets with A'ja Wilson, Sabrina Ionescu" },
        { brand: "Google Pixel", activation: "Virtual try-on features, WNBA Search Trends quiz" },
        { brand: "American Express", activation: "Fast lane entry, Amex More Machine trivia" },
        { brand: "Starry (PepsiCo)", activation: "Starry 3-Point Contest sponsor" },
      ],
      talent_fit: ["WNBA All-Stars", "influencers", "celebrities"],
      deal_types: ["appearances", "brand activations", "content", "meet-and-greets"],
      avg_deal_value: "$15K-$100K",
      lead_time_days: 60,
    },
    {
      name: "Nike EYBL Peach Jam Finals",
      typical_date: "Mid-July",
      date_2026: "2026-07-10",
      end_date_2026: "2026-07-13",
      location_2026: "North Augusta, South Carolina",
      description: "Nike EYBL circuit finals championship - premier recruiting showcase",
      brand_activations: [
        { brand: "Nike", activation: "Title sponsor, product seeding to top prospects" },
        { brand: "Various", activation: "Scout/media access, prospect showcases" },
      ],
      talent_fit: ["high school prospects", "Nike EYBL players", "scouts"],
      deal_types: ["seeding", "appearances", "scouting content"],
      avg_deal_value: "$5K-$30K",
      lead_time_days: 45,
    },
    {
      name: "July 4th Patriotic Campaigns",
      typical_date: "July 4th week",
      date_2026: "2026-07-04",
      description: "Patriotic-themed brand campaigns and releases",
      brand_activations: [
        { brand: "Nike", activation: "USA-themed sneaker releases" },
        { brand: "Jordan Brand", activation: "Patriotic colorways" },
        { brand: "Under Armour", activation: "USA-themed apparel" },
      ],
      talent_fit: ["Team USA athletes", "patriotic content creators"],
      deal_types: ["content", "seeding", "campaigns"],
      avg_deal_value: "$10K-$50K",
      lead_time_days: 30,
    },
  ],

  // ============================================
  // AUGUST-SEPTEMBER BRAND MOMENTS
  // ============================================
  august_september: [
    {
      name: "Back-to-School Campaigns",
      typical_date: "August-September",
      date_2026: "2026-08-01",
      end_date_2026: "2026-09-15",
      description: "Major back-to-school marketing push across sports/athletic brands",
      brand_activations: [
        { brand: "Nike", activation: "'Why Do It?' campaign - reintroduction of Just Do It for new gen" },
        { brand: "Under Armour", activation: "NIL partnerships (~100 collegiate athletes), 'Be The Athlete No One Saw Coming'" },
        { brand: "Adidas", activation: "Back-to-school footwear and apparel campaigns" },
        { brand: "Foot Locker", activation: "Back-to-school sneaker campaigns" },
        { brand: "Dick's Sporting Goods", activation: "Athletic gear campaigns" },
      ],
      talent_fit: ["young athletes", "college players (NIL)", "high school stars"],
      deal_types: ["NIL deals", "content", "campaigns", "seeding"],
      avg_deal_value: "$5K-$50K (NIL)",
      lead_time_days: 60,
    },
    {
      name: "Signature Shoe Season Launches",
      typical_date: "August-September",
      date_2026: "2026-08-15",
      end_date_2026: "2026-09-30",
      description: "New signature shoe launches ahead of NBA season",
      brand_activations: [
        { brand: "Nike", activation: "LeBron, Giannis, Ja, Book signature updates" },
        { brand: "Jordan Brand", activation: "Luka, Tatum signature updates" },
        { brand: "Adidas", activation: "Harden, AE signature updates" },
        { brand: "Puma", activation: "Lamelo signature updates" },
        { brand: "New Balance", activation: "Kawhi, Zion signature updates" },
      ],
      talent_fit: ["signature athletes", "sneaker influencers", "basketball media"],
      deal_types: ["launches", "content", "unboxing", "reviews"],
      avg_deal_value: "$10K-$100K",
      lead_time_days: 60,
    },
    {
      name: "PUMA Hoops: The Basketball Tournament (TBT)",
      typical_date: "Summer",
      date_2026: "2026-07-20",
      end_date_2026: "2026-08-05",
      description: "$1 million winner-take-all 5-on-5 tournament",
      brand_activations: [
        { brand: "PUMA Hoops", activation: "Official sponsor and outfitter" },
        { brand: "TBT", activation: "Alumni/pro team competition" },
      ],
      talent_fit: ["former NBA/college players", "basketball influencers"],
      deal_types: ["appearances", "content", "commentary"],
      avg_deal_value: "$5K-$25K",
      lead_time_days: 30,
    },
  ],

  // ============================================
  // OCTOBER BRAND MOMENTS
  // ============================================
  october: [
    {
      name: "NBA Season Tip-Off / Opening Night",
      typical_date: "Late October",
      date_2026: "2026-10-20",
      description: "NBA season opener - major brand push to kick off season",
      brand_activations: [
        { brand: "NBA", activation: "'Start to Finish' campaign (Paolo, Brunson, Flagg)" },
        { brand: "American Express", activation: "NBA Tip-Off presenting sponsor" },
        { brand: "AT&T (Amazon Prime)", activation: "'The Half' halftime show title sponsor" },
        { brand: "Wingstop (Amazon Prime)", activation: "Thursday/Friday games presenting sponsor" },
        { brand: "Mercedes-Benz (Amazon Prime)", activation: "Saturday NBA telecasts sponsor" },
        { brand: "State Farm (Amazon Prime)", activation: "Playoff second round coverage" },
      ],
      talent_fit: ["NBA stars", "legends", "analysts", "influencers"],
      deal_types: ["content", "predictions", "watch parties", "brand campaigns"],
      avg_deal_value: "$15K-$75K",
      lead_time_days: 45,
    },
    {
      name: "Halloween Basketball Content",
      typical_date: "October 31",
      date_2026: "2026-10-31",
      description: "Halloween-themed basketball content and sneaker releases",
      brand_activations: [
        { brand: "Nike", activation: "Halloween colorway releases" },
        { brand: "Various", activation: "Player costume reveals, themed content" },
      ],
      talent_fit: ["NBA/WNBA players", "influencers"],
      deal_types: ["costume content", "themed releases", "social content"],
      avg_deal_value: "$5K-$25K",
      lead_time_days: 21,
    },
  ],

  // ============================================
  // NOVEMBER-DECEMBER BRAND MOMENTS
  // ============================================
  november_december: [
    {
      name: "Emirates NBA Cup",
      typical_date: "November-December",
      date_2026: "2026-11-12",
      end_date_2026: "2026-12-17",
      championship_location: "Las Vegas",
      description: "In-season tournament with unique branding and championship in Vegas",
      brand_activations: [
        { brand: "Emirates", activation: "Title partner, co-branded logo, in-arena signage" },
        { brand: "Emirates", activation: "First commercial referee jersey patches in NBA/WNBA history" },
        { brand: "Various", activation: "NBA Crossover, NBA District, NBA House partner activations" },
      ],
      talent_fit: ["NBA players", "legends", "influencers"],
      deal_types: ["tournament content", "watch parties", "brand activations"],
      avg_deal_value: "$15K-$75K",
      lead_time_days: 45,
    },
    {
      name: "Thanksgiving Basketball",
      typical_date: "Thanksgiving week",
      date_2026: "2026-11-26",
      description: "Thanksgiving week NBA/college basketball - family viewing prime time",
      brand_activations: [
        { brand: "Various", activation: "Family-focused brand campaigns" },
        { brand: "Food brands", activation: "Thanksgiving-themed athlete content" },
      ],
      talent_fit: ["NBA players", "college players", "legends"],
      deal_types: ["family content", "thankful messages", "brand campaigns"],
      avg_deal_value: "$10K-$50K",
      lead_time_days: 30,
    },
    {
      name: "NBA Christmas Day",
      typical_date: "December 25",
      date_2026: "2026-12-25",
      description: "NBA Christmas Day - biggest regular season viewing day",
      brand_activations: [
        { brand: "State Farm", activation: "Presenting sponsor of all five games" },
        { brand: "Capital One", activation: "Sponsored elements" },
        { brand: "Taco Bell", activation: "Sponsored elements" },
        { brand: "Google Gemini", activation: "Sponsored elements" },
        { brand: "NBA2K", activation: "Sponsored elements" },
        { brand: "Kia", activation: "Halftime show sponsor" },
        { brand: "DraftKings", activation: "In-game betting promotions" },
        { brand: "Jordan Brand", activation: "Christmas colorway sneaker releases (Luka 5, etc.)" },
        { brand: "Nike", activation: "Christmas edition signature shoes" },
        { brand: "NBA", activation: "'Jingle Hoops Regifted' animated campaign" },
      ],
      talent_fit: ["Christmas Day game players", "legends", "celebrities"],
      deal_types: ["content", "watch parties", "seeding", "campaigns"],
      avg_deal_value: "$20K-$100K",
      lead_time_days: 60,
    },
    {
      name: "New Year's Eve/Day Basketball",
      typical_date: "December 31 - January 1",
      date_2026: "2026-12-31",
      end_date_2026: "2027-01-01",
      description: "New Year's basketball content and resolutions campaigns",
      brand_activations: [
        { brand: "Various", activation: "New Year's resolutions content" },
        { brand: "Fitness brands", activation: "New Year fitness pushes with athletes" },
      ],
      talent_fit: ["NBA players", "fitness influencers", "athletes"],
      deal_types: ["resolutions content", "fitness campaigns", "year-in-review"],
      avg_deal_value: "$10K-$50K",
      lead_time_days: 30,
    },
  ],

  // ============================================
  // YEAR-ROUND BRAND PROGRAMS
  // ============================================
  year_round: [
    {
      name: "Gatorade Player of the Year Awards",
      typical_date: "Annual awards cycle",
      description: "Annual awards to high school student-athletes in multiple sports",
      brand_activations: [
        { brand: "Gatorade", activation: "Player of the Year awards since 1986" },
        { brand: "Gatorade", activation: "$6.4M+ in grants to 2,200+ youth sports orgs" },
        { brand: "Gatorade", activation: "College basketball campaigns (Paige Bueckers, JuJu Watkins, Cooper Flagg)" },
      ],
      talent_fit: ["high school athletes", "college athletes", "legends"],
      deal_types: ["endorsements", "content", "campaigns"],
      avg_deal_value: "$25K-$500K",
      lead_time_days: 90,
    },
    {
      name: "State Farm Assist Tracker",
      typical_date: "Year-round (since 2015)",
      description: "$5 per regular/postseason assist to STEM education",
      brand_activations: [
        { brand: "State Farm", activation: "Assist Tracker donations" },
        { brand: "State Farm", activation: "All-Star Game: $1,900 per assist to beneficiaries" },
        { brand: "State Farm", activation: "STEM room renovations, gymnasium refurbishments" },
      ],
      talent_fit: ["high-assist players (Chris Paul, etc.)", "community-focused athletes"],
      deal_types: ["endorsements", "community activations", "content"],
      avg_deal_value: "$50K-$500K",
      lead_time_days: 60,
    },
    {
      name: "Nike EYBL Circuit",
      typical_date: "Spring-Summer (4 regular sessions + Peach Jam finals)",
      description: "Premier Nike grassroots basketball circuit",
      brand_activations: [
        { brand: "Nike", activation: "EYBL regular season sessions across US cities" },
        { brand: "Nike", activation: "Peach Jam Championships (July)" },
        { brand: "Nike", activation: "Girls EYBL - Nike Nationals in Chicago" },
        { brand: "Nike", activation: "13 teams sponsored by stars (LeBron, KD, Davis, etc.)" },
      ],
      talent_fit: ["high school prospects", "Nike athletes as mentors"],
      deal_types: ["mentorship", "appearances", "seeding"],
      avg_deal_value: "$10K-$100K",
      lead_time_days: 60,
    },
    {
      name: "Adidas 3SSB Circuit",
      typical_date: "Spring-Summer",
      description: "Adidas grassroots basketball circuit",
      brand_activations: [
        { brand: "Adidas", activation: "Spring Sessions, Earn Your Stripes Invitational, 3SSB Gauntlet" },
        { brand: "Adidas", activation: "NCAA live-period events for college coach recruiting" },
      ],
      talent_fit: ["high school prospects", "Adidas athletes"],
      deal_types: ["seeding", "appearances"],
      avg_deal_value: "$5K-$50K",
      lead_time_days: 45,
    },
    {
      name: "PUMA PRO16/NXTPRO Circuit",
      typical_date: "Spring-Summer",
      description: "PUMA-sponsored national grassroots championship",
      brand_activations: [
        { brand: "PUMA", activation: "Official partner and outfitter" },
        { brand: "PUMA", activation: "National championship across 17U, 16U, 15U divisions" },
      ],
      talent_fit: ["high school prospects", "PUMA athletes"],
      deal_types: ["seeding", "appearances"],
      avg_deal_value: "$5K-$50K",
      lead_time_days: 45,
    },
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all brand moments for a specific month
 */
function getBrandMomentsByMonth(month) {
  const monthMap = {
    1: "january",
    2: "february",
    3: "march_april",
    4: "march_april",
    5: "may",
    6: "june",
    7: "july",
    8: "august_september",
    9: "august_september",
    10: "october",
    11: "november_december",
    12: "november_december",
  };

  const key = monthMap[month];
  return BRAND_MOMENTS[key] || [];
}

/**
 * Get upcoming brand moments within N days
 */
function getUpcomingBrandMoments(daysAhead = 60) {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const results = [];

  for (const [period, moments] of Object.entries(BRAND_MOMENTS)) {
    if (period === "year_round") continue; // Skip year-round programs

    for (const moment of moments) {
      const dateStr = moment.date_2026;
      if (!dateStr) continue;

      const momentDate = new Date(dateStr);
      if (momentDate >= now && momentDate <= future) {
        results.push({
          ...moment,
          period,
          days_until: Math.ceil((momentDate - now) / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  return results.sort((a, b) => a.days_until - b.days_until);
}

/**
 * Get brand moments by brand name
 */
function getBrandMomentsByBrand(brandName) {
  const results = [];
  const searchBrand = brandName.toLowerCase();

  for (const [period, moments] of Object.entries(BRAND_MOMENTS)) {
    for (const moment of moments) {
      const hasMatch = moment.brand_activations?.some(
        ba => ba.brand.toLowerCase().includes(searchBrand)
      );
      if (hasMatch) {
        results.push({ ...moment, period });
      }
    }
  }

  return results;
}

/**
 * Get all unique brands in the system
 */
function getAllBrands() {
  const brands = new Set();

  for (const [period, moments] of Object.entries(BRAND_MOMENTS)) {
    for (const moment of moments) {
      moment.brand_activations?.forEach(ba => brands.add(ba.brand));
    }
  }

  return Array.from(brands).sort();
}

/**
 * Get year-round programs
 */
function getYearRoundPrograms() {
  return BRAND_MOMENTS.year_round;
}

module.exports = {
  BRAND_MOMENTS,
  getBrandMomentsByMonth,
  getUpcomingBrandMoments,
  getBrandMomentsByBrand,
  getAllBrands,
  getYearRoundPrograms,
};
