// src/data/talent-roster.js
// Comprehensive talent roster - WME and CAA basketball clients
// Last updated: 2026-02-02

const TALENT_ROSTER = {
  // ============================================
  // NBA ROSTERS BY TEAM
  // ============================================
  nba: {
    // ATLANTA HAWKS
    "Atlanta Hawks": {
      caa: ["Trae Young", "Luke Kennard", "Nickeil Alexander-Walker", "Jacob Toppin"],
      wme: [],
    },

    // BOSTON CELTICS
    "Boston Celtics": {
      caa: ["Neemias Queta", "Anfernee Simons", "Ron Harper Jr."],
      wme: ["Payton Pritchard"],
    },

    // BROOKLYN NETS
    "Brooklyn Nets": {
      caa: ["Jalen Wilson"],
      wme: ["Nicolas Claxton", "Ziaire Williams", "Terance Mann", "Drake Powell", "Daniel Wolf", "Ben Saraf"],
    },

    // CHARLOTTE HORNETS
    "Charlotte Hornets": {
      caa: ["Grant Williams"],
      wme: ["Seth Curry", "Josh Green", "Antonio Reeves", "Liam McNeeley"],
    },

    // CHICAGO BULLS
    "Chicago Bulls": {
      caa: ["Nikola Vucevic"],
      wme: ["Coby White", "Julian Phillips"],
    },

    // CLEVELAND CAVALIERS
    "Cleveland Cavaliers": {
      caa: ["Donovan Mitchell", "Tyrese Proctor"],
      wme: [],
    },

    // DALLAS MAVERICKS
    "Dallas Mavericks": {
      caa: ["D'Angelo Russell", "Cooper Flagg"],
      wme: [],
    },

    // DENVER NUGGETS
    "Denver Nuggets": {
      caa: ["Christian Braun"],
      wme: ["Cameron Johnson", "Bruce Brown Jr."],
    },

    // DETROIT PISTONS
    "Detroit Pistons": {
      caa: ["Isaiah Stewart", "Ron Holland"],
      wme: ["Jaden Ivey"],
    },

    // GOLDEN STATE WARRIORS
    "Golden State Warriors": {
      caa: ["Brandin Podziemski", "Gary Payton II"],
      wme: [],
    },

    // HOUSTON ROCKETS
    "Houston Rockets": {
      caa: ["Reed Sheppard", "Jae'Sean Tate"],
      wme: [],
    },

    // INDIANA PACERS
    "Indiana Pacers": {
      caa: ["Benn Mathurin", "Jarace Walker"],
      wme: ["Tyrese Haliburton", "Obi Toppin", "Isaiah Jackson"],
    },

    // LA CLIPPERS
    "LA Clippers": {
      caa: ["Kawhi Leonard"],
      wme: ["Chris Paul", "Kris Dunn"],
    },

    // LA LAKERS
    "LA Lakers": {
      caa: ["Deandre Ayton", "Jaxson Hayes"],
      wme: ["Maxi Kleber"],
    },

    // MEMPHIS GRIZZLIES
    "Memphis Grizzlies": {
      caa: ["Scotty Pippen Jr."],
      wme: ["Jaren Jackson Jr.", "Santi Aldama"],
    },

    // MIAMI HEAT
    "Miami Heat": {
      caa: ["Andrew Wiggins", "Jaime Jaquez Jr.", "Kel'el Ware"],
      wme: [],
    },

    // MILWAUKEE BUCKS
    "Milwaukee Bucks": {
      caa: ["Amir Coffey", "Andre Jackson Jr."],
      wme: ["Myles Turner", "Kyle Kuzma", "Gary Harris"],
    },

    // MINNESOTA TIMBERWOLVES
    "Minnesota Timberwolves": {
      caa: ["Anthony Edwards", "Jaden McDaniels"],
      wme: ["Julius Randle", "Mike Conley Jr."],
    },

    // NEW ORLEANS PELICANS
    "New Orleans Pelicans": {
      caa: ["Zion Williamson"],
      wme: ["Jordan Poole", "Jordan Hawkins"],
    },

    // NEW YORK KNICKS
    "New York Knicks": {
      caa: ["Kevin McCullar Jr."],
      wme: ["Jalen Brunson", "Karl-Anthony Towns", "OG Anunoby", "Josh Hart", "Guerschon Yabusele"],
    },

    // OKLAHOMA CITY THUNDER
    "Oklahoma City Thunder": {
      caa: ["Chet Holmgren"],
      wme: ["Isaiah Hartenstein"],
    },

    // ORLANDO MAGIC
    "Orlando Magic": {
      caa: ["Anthony Black"],
      wme: ["Jett Howard", "Jase Richardson"],
    },

    // PHILADELPHIA 76ERS
    "Philadelphia 76ers": {
      caa: ["Joel Embiid"],
      wme: ["Paul George", "Kelly Oubre Jr.", "Johni Broome"],
    },

    // PHOENIX SUNS
    "Phoenix Suns": {
      caa: ["Devin Booker", "Jalen Green", "Grayson Allen", "Nick Richards", "Ryan Dunn"],
      wme: [],
    },

    // PORTLAND TRAIL BLAZERS
    "Portland Trail Blazers": {
      caa: ["Duop Reath", "Blake Wesley"],
      wme: [],
    },

    // SACRAMENTO KINGS
    "Sacramento Kings": {
      caa: ["Devin Carter"],
      wme: [],
    },

    // SAN ANTONIO SPURS
    "San Antonio Spurs": {
      caa: ["Devin Vassell"],
      wme: [],
    },

    // TORONTO RAPTORS
    "Toronto Raptors": {
      caa: ["Scottie Barnes", "RJ Barrett", "Gradey Dick"],
      wme: [],
    },

    // UTAH JAZZ
    "Utah Jazz": {
      caa: ["Cody Williams"],
      wme: ["Walker Kessler", "Kenyon Martin Jr."],
    },

    // WASHINGTON WIZARDS
    "Washington Wizards": {
      caa: ["Alex Sarr", "Bub Carrington", "Tre Johnson", "Cam Whitmore"],
      wme: ["Jamir Watkins"],
    },
  },

  // ============================================
  // WNBA ROSTERS
  // ============================================
  wnba: {
    wme: [
      "Aaliyah Edwards",
      "Aliyah Boston",
      "Jackie Young",
      "Satou Sabally",
      "Kelsey Plum",
      "Kahleah Copper",
      "Sabrina Ionescu",
    ],
    caa: [
      "Alysha Clark",
      "Cameron Brink",
    ],
  },

  // ============================================
  // NIL / COLLEGE / HIGH SCHOOL (WME ONLY)
  // ============================================
  nil_college: {
    women: [
      "Gabby Anderson",
      "Grace VanSlooten",
      "Jazzy Davidson",
      "Lauren Betts",
      "Morgan Cheli",
      "Olivia Miles",
      "Raven Johnson",
      "Rori Harmon",
      "Mikayla Blakes",
      "Sienna Betts",
    ],
    men: [
      "Caleb Gaskins",
      "Darius Acuff Jr.",
      "DJ Wagner",
      "Elliot Cadeau",
      "Felipe Quinones",
      "Gene Roebuck",
      "Ian Jackson",
      "Jacob Ensminger",
      "Jayden Ross",
      "Jaden Schutt",
      "JJ Starling",
      "Kiyan Anthony",
      "Tahaad Pettiford",
      "Zion Green",
      "Deron Rippey Jr.",
      "Boss Mhoon",
      "Justin Pippen",
      "Ethan Thompson",
      "Christian Collins",
      "Beckham Black",
      "Nasir Anderson",
    ],
  },

  // ============================================
  // BASKETBALL LEGENDS
  // ============================================
  legends: {
    wme: [
      "Candace Parker",
    ],
    caa: [
      "Dwyane Wade",
      "Carmelo Anthony",
      "Tony Parker",
      "Pau Gasol",
      "Marc Gasol",
      "Manu Ginobili",
      "Ben Wallace",
      "Allan Houston",
      "Walt 'Clyde' Frazier",
      "Rip Hamilton",
      "Kenyon Martin Sr.",
      "Juwan Howard",
      "Elena Delle Donne",
    ],
  },

  // ============================================
  // COACHES & EXECUTIVES (WME ONLY)
  // ============================================
  coaches_executives: {
    college_coaches: [
      "Dan Hurley",
      "Scott Drew",
      "Kelvin Sampson",
      "Bill Self",
      "Geno Auriemma",
      "Cori Close",
      "Lindsay Gottlieb",
      "Brad Underwood",
      "Chris Beard",
      "Andy Enfield",
      "Chris Holtmann",
      "T.J. Otzelberger",
      "Steve Pikiell",
      "Micah Shrewsberry",
      "Todd Golden",
    ],
    nba_wnba_staff: [
      { name: "Trajan Langdon", role: "President, Detroit Pistons" },
      { name: "J.B. Bickerstaff", role: "Head Coach, Detroit Pistons" },
      { name: "Chris Finch", role: "Head Coach, Minnesota Timberwolves" },
      { name: "Charles Lee", role: "Head Coach, Charlotte Hornets" },
      { name: "Jamahl Mosley", role: "Head Coach, Orlando Magic" },
      { name: "Cheryl Reeve", role: "Head Coach, Minnesota Lynx" },
      { name: "Shareef Abdur-Rahim", role: "President, G-League" },
      { name: "Koby Altman", role: "President, Cleveland Cavaliers" },
    ],
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all talent by agency
 */
function getTalentByAgency(agency) {
  const result = [];
  const ag = agency.toLowerCase();

  // NBA players
  for (const [team, roster] of Object.entries(TALENT_ROSTER.nba)) {
    const players = roster[ag] || [];
    players.forEach(name => {
      result.push({
        name,
        type: "athlete",
        league: "NBA",
        team,
        agency: agency.toUpperCase(),
      });
    });
  }

  // WNBA players
  const wnbaPlayers = TALENT_ROSTER.wnba[ag] || [];
  wnbaPlayers.forEach(name => {
    result.push({
      name,
      type: "athlete",
      league: "WNBA",
      agency: agency.toUpperCase(),
    });
  });

  // NIL/College (WME only)
  if (ag === "wme") {
    [...TALENT_ROSTER.nil_college.women, ...TALENT_ROSTER.nil_college.men].forEach(name => {
      result.push({
        name,
        type: "nil_athlete",
        agency: "WME",
      });
    });
  }

  // Legends
  const legends = TALENT_ROSTER.legends[ag] || [];
  legends.forEach(name => {
    result.push({
      name,
      type: "legend",
      agency: agency.toUpperCase(),
    });
  });

  // Coaches/Executives (WME only)
  if (ag === "wme") {
    TALENT_ROSTER.coaches_executives.college_coaches.forEach(name => {
      result.push({
        name,
        type: "coach",
        league: "NCAA",
        agency: "WME",
      });
    });
    TALENT_ROSTER.coaches_executives.nba_wnba_staff.forEach(({ name, role }) => {
      result.push({
        name,
        type: "executive",
        role,
        agency: "WME",
      });
    });
  }

  return result;
}

/**
 * Get all talent (combined WME and CAA)
 */
function getAllTalent() {
  return [...getTalentByAgency("wme"), ...getTalentByAgency("caa")];
}

/**
 * Get talent by team
 */
function getTalentByTeam(teamName) {
  const team = TALENT_ROSTER.nba[teamName];
  if (!team) return [];

  const result = [];
  ["caa", "wme"].forEach(agency => {
    (team[agency] || []).forEach(name => {
      result.push({
        name,
        type: "athlete",
        league: "NBA",
        team: teamName,
        agency: agency.toUpperCase(),
      });
    });
  });
  return result;
}

/**
 * Search talent by name
 */
function searchTalent(query) {
  const all = getAllTalent();
  const q = query.toLowerCase();
  return all.filter(t => t.name.toLowerCase().includes(q));
}

/**
 * Get star players (high-profile talent for major brand opportunities)
 */
function getStarPlayers() {
  return [
    // NBA Stars
    "Trae Young",
    "Donovan Mitchell",
    "Anthony Edwards",
    "Zion Williamson",
    "Jalen Brunson",
    "Joel Embiid",
    "Devin Booker",
    "Scottie Barnes",
    "Kawhi Leonard",
    "Karl-Anthony Towns",
    "Chet Holmgren",
    "Cooper Flagg",
    "Tyrese Haliburton",
    "Paul George",
    "Kyle Kuzma",
    "Chris Paul",
    "Jaren Jackson Jr.",
    // WNBA Stars
    "Sabrina Ionescu",
    "Aliyah Boston",
    "Cameron Brink",
    "Kelsey Plum",
    "Kahleah Copper",
    // NIL Stars
    "Kiyan Anthony",
    "DJ Wagner",
    "Lauren Betts",
    // Legends
    "Dwyane Wade",
    "Carmelo Anthony",
    "Candace Parker",
  ];
}

/**
 * Get roster summary stats
 */
function getRosterStats() {
  const wmeTalent = getTalentByAgency("wme");
  const caaTalent = getTalentByAgency("caa");

  return {
    total: wmeTalent.length + caaTalent.length,
    wme: {
      total: wmeTalent.length,
      nba: wmeTalent.filter(t => t.league === "NBA").length,
      wnba: wmeTalent.filter(t => t.league === "WNBA").length,
      nil: wmeTalent.filter(t => t.type === "nil_athlete").length,
      legends: wmeTalent.filter(t => t.type === "legend").length,
      coaches: wmeTalent.filter(t => t.type === "coach").length,
      executives: wmeTalent.filter(t => t.type === "executive").length,
    },
    caa: {
      total: caaTalent.length,
      nba: caaTalent.filter(t => t.league === "NBA").length,
      wnba: caaTalent.filter(t => t.league === "WNBA").length,
      legends: caaTalent.filter(t => t.type === "legend").length,
    },
  };
}

module.exports = {
  TALENT_ROSTER,
  getTalentByAgency,
  getAllTalent,
  getTalentByTeam,
  searchTalent,
  getStarPlayers,
  getRosterStats,
};
