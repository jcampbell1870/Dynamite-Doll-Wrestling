// Mirrors Services/RosterService.cs. Bronwyne "Dynamite Doll" Billington is the
// headliner and highest-rated competitor; everyone else is fictional.
export const ROSTER = [
  {
    "id": "dynamite-doll",
    "name": "Bronwyne Billington",
    "nickname": "The Dynamite Doll",
    "hometown": "Calgary, Alberta",
    "signatureMove": "Dynamite Diving Headbutt",
    "bio": "Daughter of British Bulldogs and WWF tag team champion Tom \"Dynamite Kid\" Billington. She carries the family snap suplex and diving headbutt into a new era and headlines every card.",
    "primaryColor": "#e01b24",
    "accentColor": "#ffd44d",
    "power": 10,
    "speed": 10,
    "technique": 10,
    "stamina": 9
  },
  {
    "id": "steel-city-siren",
    "name": "Marlowe Vance",
    "nickname": "Steel City Siren",
    "hometown": "Sheffield, England",
    "signatureMove": "Foundry Slam",
    "bio": "A mat-based bruiser who wears opponents down with heavy European uppercuts.",
    "primaryColor": "#4a6fa5",
    "accentColor": "#d9e4f5",
    "power": 9,
    "speed": 6,
    "technique": 7,
    "stamina": 8
  },
  {
    "id": "prairie-cyclone",
    "name": "Josie Kestrel",
    "nickname": "Prairie Cyclone",
    "hometown": "Regina, Saskatchewan",
    "signatureMove": "Cyclone Dropkick",
    "bio": "Fastest feet on the roster. Lives and dies by the springboard.",
    "primaryColor": "#2f9e68",
    "accentColor": "#f7f7c6",
    "power": 6,
    "speed": 9,
    "technique": 8,
    "stamina": 7
  },
  {
    "id": "midnight-mamba",
    "name": "Rosa Delacroix",
    "nickname": "Midnight Mamba",
    "hometown": "New Orleans, Louisiana",
    "signatureMove": "Bayou Backbreaker",
    "bio": "Submission specialist who hunts the arm from the opening bell.",
    "primaryColor": "#6a3fa0",
    "accentColor": "#f0c419",
    "power": 7,
    "speed": 7,
    "technique": 9,
    "stamina": 7
  },
  {
    "id": "tundra-titan",
    "name": "Ingrid Halvorsen",
    "nickname": "Tundra Titan",
    "hometown": "Tromso, Norway",
    "signatureMove": "Glacier Powerbomb",
    "bio": "The biggest woman on the card. Slow to start, impossible to stop.",
    "primaryColor": "#1f6f8b",
    "accentColor": "#e8f6f9",
    "power": 10,
    "speed": 4,
    "technique": 6,
    "stamina": 9
  },
  {
    "id": "neon-nightingale",
    "name": "Aiko Tanaka",
    "nickname": "Neon Nightingale",
    "hometown": "Osaka, Japan",
    "signatureMove": "Nightingale Bridge",
    "bio": "Strong-style striker with the crispest suplex chain in the promotion.",
    "primaryColor": "#ff5fa2",
    "accentColor": "#1b1b2f",
    "power": 7,
    "speed": 8,
    "technique": 9,
    "stamina": 8
  },
  {
    "id": "outback-outlaw",
    "name": "Dallas Mercer",
    "nickname": "Outback Outlaw",
    "hometown": "Perth, Australia",
    "signatureMove": "Boomerang Lariat",
    "bio": "A brawler who is happiest when the referee stops counting.",
    "primaryColor": "#c9762a",
    "accentColor": "#2b1d0e",
    "power": 8,
    "speed": 7,
    "technique": 6,
    "stamina": 8
  },
  {
    "id": "crown-jewel",
    "name": "Vivienne Ashford",
    "nickname": "The Crown Jewel",
    "hometown": "London, England",
    "signatureMove": "Royal Decree DDT",
    "bio": "Technically flawless, endlessly arrogant, and the reigning champion before the Dolls arrived.",
    "primaryColor": "#b8912f",
    "accentColor": "#2c2c54",
    "power": 7,
    "speed": 8,
    "technique": 10,
    "stamina": 7
  }
];

export function findWrestler(id) {
  return ROSTER.find((w) => w.id === id) || ROSTER[0];
}
