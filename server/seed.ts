import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import db from "./db.js";
import createLogger from "./utils/logger.js";

const log = createLogger("seed");

const _seedFilename = fileURLToPath(import.meta.url);
const _seedDirname = path.dirname(_seedFilename);
const seedsDir = path.join(_seedDirname, 'data', 'seeds');

const defaultAiPrompt = `You are processing a flying site guide page from an Australian paragliding/hang gliding governing body website.

TASK:
Parse the page content and return a structured JSON object containing site information. The Page Title is the authoritative Site Name — do not confuse it with other sites mentioned as references or nearby alternatives.

CONTENT SECTIONS:
Extract and preserve the original wording from the source material. Do not rewrite, paraphrase, or embellish — use the source text as closely as possible while keeping it well-structured.
- siteOverview: A concise summary of the site, its character, and what makes it worth flying.
- knownHazards: Array of strings. Each hazard as a separate concise bullet point.
- siteRules: Array of strings. Each rule as a separate concise bullet point.
- launchArea: Description of the launch area, setup, and access.
- landingZones: Description of available landing options.

METADATA EXTRACTION:
Extract the following fields from the page content and sidebar metadata:
- name: Site name (from the Page Title).
- type: "Coastal" or "Inland".
- status: "open", "restricted", or "closed".
    - "closed": the site has a Closed badge, flying is suspended, banned, or not permitted.
    - "restricted": the site is accessible ONLY to specific named schools, flight training organisations, or named groups — NOT open to the general flying public. Look for phrases like "Bright Schools only", "restricted to [school] students", "school use only", "not available for general use", "approved schools only", "flight training schools only", "exclusive use of [named school]", or any language that reserves the site for a single named group. When in doubt and the text clearly names a specific school/group as the ONLY permitted user, use "restricted".
    - "open": all other sites. Default.
- pgRating: Formatted PG rating (see RATING FORMATTING below).
- hgRating: Formatted HG rating (see RATING FORMATTING below).
- windDir: Compass direction only (e.g. "SSW" or "S-SW"). Strip any bearing degrees like "(214 deg true)".
- windSpeed: Paragliding wind range as "X-Ykts" (e.g. "8-16kts"). No verbose descriptions. Max must never exceed 16kts — clamp if necessary. If not stated on the page, estimate based on site type and format as "X-Ykts".
- lat, lon: Decimal coordinates. Extract from Google Maps URLs in the page links (patterns: "@-38.478,145.012", "q=-38.478,145.012", "destination=-38.478,145.012"). Use the exact coordinate values found in the URL.
- navigateTo: The full Google Maps URL as found on the page.
- siteContact: Contact person or club name from sidebar metadata.
- siteContactPhone: Phone number from sidebar metadata (Australian format: 04xx xxx xxx).
- launchHeight: Launch height if mentioned.
- hoodedPloversLink: URL if mentioned.
- emergencyMarker: Emergency marker ID if mentioned.
- what3words: What3Words location if explicitly mentioned.
- weatherStationLink: Weather station URL if mentioned.
- liveStationId: Weather station ID if mentioned.
- responsibleClub: Club name from the "Responsible" sidebar field, exactly as stated. Empty string if not listed.

PG vs HG WIND SPEED CONVERSION:
Hang gliders fly in winds approximately 3 knots stronger than paragliders. The windSpeed field must always represent paragliding values.
- PG speeds stated → use directly.
- HG speeds only → subtract 3kts from both min and max, then clamp max to 16.
- Both stated → use the PG values.
Examples:
  HG 13-14kts → PG windSpeed "10-11kts".
  HG 10-20kts → PG windSpeed "7-16kts" (17 clamped).

SIDEBAR METADATA PARSING:
The page may include sidebar fields like "Contact: ..." and "Responsible: ...".
- Split contact values into name and phone. Phone numbers match Australian formats (04xx xxx xxx). Everything else is the contact name.
- Examples:
  "Contact: Anthony ( 0421 600 870 )" → siteContact: "Anthony", siteContactPhone: "0421 600 870"
  "Contact: 0421 600 870" → siteContact: "", siteContactPhone: "0421 600 870"
  "Contact: Dynasoarers 0408 335 559" → siteContact: "Dynasoarers", siteContactPhone: "0408 335 559"
  "Contact/Responsible: NEVHGC" → siteContact: "NEVHGC", siteContactPhone: "", responsibleClub: "NEVHGC"

RATING FORMATTING:
Parse the raw rating into separate pgRating and hgRating fields.
- PG scale: PG1, PG2, PG3, PG4, PG5.
- HG scale: HG Supervised, HG Intermediate, HG Advanced.
- IMPORTANT: PG2 is ALWAYS supervised — never output a bare "PG2". Always write "PG2 Supervised" (or "PG2 Sup" when abbreviating). If additional supervision requirements exist, write them after, e.g. "PG2 Supervised requires PG4/SO".
- "Endorsed" = site endorsement required. Abbreviate as "End" after first use.
- Supervision requirements formatted as: "PG2 Supervised requires FI/SSO" or "PG2 Supervised requires PG4/SO" depending on the source text.
- If unsuitable for PG or HG, return "Not suitable". If no info, return empty string.
- No rating higher than PG5 or HG Advanced.
- Abbreviate after first use: Endorsed→End, Supervised→Sup, Intermediate→Int, Advanced→Adv, requires→req.
- Multiple levels separated by " | ".
Examples:
  "PG4 / HG Intermediate" → pgRating: "PG4", hgRating: "HG Intermediate"
  "PG5 with endorsement. PG4 endorsed, under supervision of endorsed PG5" → pgRating: "PG5 Endorsed | PG4 End requires PG5 End", hgRating: ""
  "Advanced HG only" → pgRating: "Not suitable", hgRating: "HG Advanced"
  "PG2 / HG Supervised" → pgRating: "PG2 Supervised", hgRating: "HG Supervised"
  "PG2 / HG Supervised. PG2 require PG4/SO supervision." → pgRating: "PG2 Supervised requires PG4/SO", hgRating: "HG Supervised requires HG Int"

JSON OUTPUT FORMAT:
Return a single JSON object with these keys:
name, type, status, pgRating, hgRating, windDir, windSpeed, lat, lon, siteOverview, knownHazards, siteRules, launchArea, landingZones, siteContact, siteContactPhone, navigateTo, launchHeight, hoodedPloversLink, emergencyMarker, what3words, weatherStationLink, liveStationId, responsibleClub.

Type constraints:
- knownHazards, siteRules: arrays of strings.
- status: "open", "restricted", or "closed".
- All other fields: strings (empty string if not found).`;

await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run('aiSystemPrompt', defaultAiPrompt);

const existingPrompt = await db.prepare("SELECT value FROM settings WHERE key = 'aiSystemPrompt'").get() as { value: string } | undefined;
if (existingPrompt?.value && existingPrompt.value.includes('Rewrite the following sections in a positive')) {
  await db.prepare("UPDATE settings SET value = ? WHERE key = 'aiSystemPrompt'").run(defaultAiPrompt);
}
if (existingPrompt?.value && (existingPrompt.value.includes('windDirectionsIdeal') || existingPrompt.value.includes('windSpeedMin'))) {
  await db.prepare("UPDATE settings SET value = ? WHERE key = 'aiSystemPrompt'").run(defaultAiPrompt);
}
// Upgrade: add "restricted" status support if the prompt only knows "open" or "closed"
const rePromptRow = await db.prepare("SELECT value FROM settings WHERE key = 'aiSystemPrompt'").get() as { value: string } | undefined;
if (rePromptRow?.value && !rePromptRow.value.includes('"restricted"')) {
  await db.prepare("UPDATE settings SET value = ? WHERE key = 'aiSystemPrompt'").run(defaultAiPrompt);
  log.info('Upgraded aiSystemPrompt: added "restricted" status support');
}

let seedSettings: [string, string][] = [
  ['onlineCheckInEnabled', 'false'],
  ['homeHeroTitle', 'Welcome to the {{clubName}}'],
  ['homeHeroSubtitle', '{{clubName}} is one of Australia\'s largest and most active free flight paragliding clubs.'],
  ['homeHeroImages', '["https://www.dropbox.com/scl/fi/0e943qrn5goacgywf5qkx/Gemini_Portsea_LB.jpg?rlkey=tpljb4b363pj2mvtw9ikdp6cy&raw=1","https://www.dropbox.com/scl/fi/37vctmy2gnjdmwelsx05b/Flinders_1920_1080.jpg?rlkey=ifc9snh1horcqfbjtp8hfdfg8&raw=1","/uploads/site-709b3754dba7e1c8-1920x1080.jpg"]'],
  ['homeHeroImageMode', 'random'],
  ['homeHeroStaticImageIndex', '0'],
  ['alertBannerEnabled', 'false'],
  ['alertBannerText', 'Important: Site maintenance at Flinders this weekend.'],
  ['homeCta1Text', 'New Pilots'],
  ['homeCta1Link', '/page/new-pilots'],
  ['homeCta2Text', 'Explore Sites'],
  ['homeCta2Link', '/sites'],
  ['featuredSiteId', 'portsea'],
  ['featuredSiteEnabled', 'false'],
  ['weatherScraperMinInterval', '15'],
  ['weatherScraperMaxInterval', '30'],
  ['weatherScraperStartHour', '7'],
  ['weatherScraperEndHour', '20'],
  ['schedSiteguideHour', '5'],
  ['schedSiteguideMinute', '0'],
  ['schedExtendedForecastHour', '4'],
  ['schedExtendedForecastMinute', '30'],
  ['submissionNotifyHour', '19'],
  ['submissionNotifyEnabled', 'true'],
  ['schedDriveSyncHour', '4'],
  ['schedDriveSyncMinute', '0'],
  ['driveSyncEnabled', 'false'],
  ['homeBox1Desc', ''],
  ['homeBox2Desc', ''],
  ['homeBox3Desc', 'We fly whenever its on! Connect with local pilots and find mentors through our telegram chat. Contact an SO for an invitation'],
  ['pvDefaultExpectations', 'PV require prior notification of projects involving contractors to:\n1. A 3 way contract PV, SH, Contractor with confirming public liability insurance.\n2. Ensure PV complete internal cultural heritage requirements.'],
  ['youtubeVideos', JSON.stringify([{url: "https://youtu.be/Ci-DkiozZ6Q?si=uL03uD5mggY3FvUL"}])],
  ['youtubeCarouselEnabled', 'false']
];

try {
  const settingsPath = path.join(seedsDir, 'seed_settings.json');
  if (fs.existsSync(settingsPath)) {
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    seedSettings = data.map((s: any) => [s.key, s.value]);
  }
} catch (e) {
  log.error("Failed to load seed_settings.json", e);
}

const insertSetting = await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
await db.transaction(async () => {
  for (const [key, value] of seedSettings) {
    await insertSetting.run(key, value);
  }
})();

const count = await db.prepare("SELECT COUNT(*) as count FROM sites").get() as { count: number | string };
if (Number(count.count) === 0) {
  const insertSite = await db.prepare(`
    INSERT INTO sites (id, name, type, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId)
    VALUES (@id, @name, @type, @windDir, @windSpeed, @status, @hazardLevel, @lat, @lon, @description, @launch, @landing, @hazards, @rules, @image, @useLiveWeather, @liveStationId)
  `);
  
  let seedSites: any[] = [];
  try {
    const scrapedData = fs.readFileSync(path.join(seedsDir, 'scraped_sites.json'), 'utf8');
    seedSites = JSON.parse(scrapedData);
  } catch (e) {
    log.info("Could not load scraped_sites.json, using fallback seed data.");
    seedSites = [
      {
        id: "portsea",
        name: "Portsea",
        type: "Coastal dunes/cliffs",
        windDir: "S-SW",
        windSpeed: "10-14kts",
        status: "open",
        hazardLevel: "medium",
        lat: -38.32981,
        lon: 144.6956,
        useLiveWeather: "true",
        liveStationId: "IPORTS1",
        description: "The site is within the Mornington Peninsula National Park.",
        launch: "The path to the launch from the carpark leads to a glider set-up area.",
        landing: "Top landing on launch or landing on the beach.",
        hazards: '["Spectators crowding around the takeoff and landing area."]',
        rules: '["The total flyable distance is 8km."]',
        image: "/uploads/site-709b3754dba7e1c8-1920x600.jpg"
      }
    ];
  }

  const insertManySites = await db.transaction(async (sites) => {
    for (const site of sites) {
      const processedSite = {
        id: null, name: null, type: null, windDir: null, windSpeed: null,
        status: 'open', hazardLevel: 'low', lat: null, lon: null,
        description: '', launch: '', landing: '', hazards: '[]', rules: '[]', image: '',
        useLiveWeather: 'false', liveStationId: null,
        ...site
      };

      if (Array.isArray(processedSite.hazards)) {
        processedSite.hazards = JSON.stringify(processedSite.hazards);
      }
      if (Array.isArray(processedSite.rules)) {
        processedSite.rules = JSON.stringify(processedSite.rules);
      }

      await insertSite.run(processedSite);
    }
  });
  await insertManySites(seedSites);
}

const coreSeedPages = [
  {
    slug: "new-pilots",
    title: "New Pilots",
    content: "## Welcome to {{clubName}}!\n\nIf you are new to paragliding or hang gliding, you've come to the right place. {{clubName}} is dedicated to helping new pilots get the most out of this fantastic sport in a safe way.\n\n### Getting Started\n1. **Get your license:** You must have a valid SAFA license to fly at our sites.\n2. **Join the club:** Membership gives you access to our sites, events, and community.\n3. **Find a mentor:** Connect with experienced pilots who can show you the ropes.\n\n### Training\nCheck out our Training section for a list of approved schools and instructors."
  },
  {
    slug: "visiting-pilots",
    title: "Visiting Pilots",
    content: "## Welcome to Victoria!\n\nWe love having visiting pilots fly our sites. However, to ensure safety and maintain our site access, we require all visiting pilots to follow a few simple rules:\n\n1. **SAFA Membership:** You must be a current member of the Sports Aviation Federation of Australia (SAFA). International pilots can get a short-term visiting membership.\n2. **Site Briefings:** Always get a site briefing from a local pilot or Safety Officer before flying a new site.\n3. **Check-in:** Use our online check-in system before you fly."
  },
  {
    slug: "about",
    title: "About Us",
    content: "## About {{clubName}}\n\n{{clubName}} is based in Melbourne and is one of Australia's largest and most active free flight clubs. We are dedicated to helping paraglider and hang glider pilots get the most out of this fantastic sport in a safe way.\n\n### Our Committee\nOur club is run by a dedicated group of volunteers. If you have any questions, feel free to reach out to any of our committee members.\n\n{{committee}}"
  }
];

const pagesCount = await db.prepare("SELECT COUNT(*) as count FROM pages").get() as { count: number | string };
if (Number(pagesCount.count) === 0) {
  const insertPage = await db.prepare(`
    INSERT INTO pages (slug, title, content, lastUpdated)
    VALUES (@slug, @title, @content, CURRENT_TIMESTAMP)
  `);

  let seedPages = [...coreSeedPages];

  try {
    const pagesPath = path.join(seedsDir, 'seed_pages.json');
    if (fs.existsSync(pagesPath)) {
      seedPages = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
    }
  } catch (e) {
    log.error("Failed to load seed_pages.json", e);
  }

  const insertManyPages = await db.transaction(async (pages) => {
    for (const page of pages) await insertPage.run(page);
  });
  await insertManyPages(seedPages);
} else {
  for (const page of coreSeedPages) {
    const exists = await db.prepare("SELECT slug FROM pages WHERE slug = @slug").get({ slug: page.slug });
    if (!exists) {
      await db.prepare(`
        INSERT INTO pages (slug, title, content, "lastUpdated")
        VALUES (@slug, @title, @content, CURRENT_TIMESTAMP)
      `).run(page);
    }
  }
}

const airspaceExists = await db.prepare("SELECT slug FROM pages WHERE slug = 'airspace'").get();
if (!airspaceExists) {
  await db.prepare(`
    INSERT INTO pages (slug, title, content, lastUpdated)
    VALUES ('airspace', 'Airspace Resources', 'Essential airspace information for cross-country pilots flying in Victoria. Use the tools and downloads on this page to check airspace restrictions, plan routes, and stay safe.', CURRENT_TIMESTAMP)
  `).run();
}

const contactsCount = await db.prepare("SELECT COUNT(*) as count FROM contacts").get() as { count: number | string };
if (Number(contactsCount.count) === 0) {
  let seedContacts: any[] = [];
  try {
    const contactsPath = path.join(seedsDir, 'seed_contacts.json');
    if (fs.existsSync(contactsPath)) {
      seedContacts = JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
    } else {
      const officersPath = path.join(seedsDir, 'seed_officers.json');
      if (fs.existsSync(officersPath)) {
        const rawOfficers = JSON.parse(fs.readFileSync(officersPath, 'utf8'));
        seedContacts = rawOfficers.map((o: any) => ({
          id: `con-${Math.random().toString(36).substr(2, 9)}`,
          name: o.name,
          phone: o.phone || "",
          email: o.email || "",
          isSafetyCommittee: (o.type === "SO" || o.type === "SSO") ? 1 : 0,
        }));
      }
    }
  } catch (e) {
    log.error("Failed to load seed_contacts.json", e);
  }

  if (seedContacts.length > 0) {
    const cols = Object.keys(seedContacts[0]);
    const placeholders = cols.map(c => `@${c}`).join(', ');
    const insertContact = await db.prepare(`INSERT OR IGNORE INTO contacts (${cols.join(', ')}) VALUES (${placeholders})`);
    await db.transaction(async () => {
      for (const contact of seedContacts) await insertContact.run(contact);
    })();
  }
}

const projectsCount = await db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number | string };
if (Number(projectsCount.count) === 0) {
  try {
    const projectsPath = path.join(seedsDir, 'seed_projects.json');
    if (fs.existsSync(projectsPath)) {
      const seedProjects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
      if (seedProjects.length > 0) {
        const cols = Object.keys(seedProjects[0]);
        const placeholders = cols.map(c => `@${c}`).join(', ');
        const insertProject = await db.prepare(`INSERT OR IGNORE INTO projects (${cols.join(', ')}) VALUES (${placeholders})`);
        await db.transaction(async () => {
          for (const project of seedProjects) await insertProject.run(project);
        })();
      }
    }
  } catch (e) {
    log.error("Failed to load seed_projects.json", e);
  }

  try {
    const pcPath = path.join(seedsDir, 'seed_project_contacts.json');
    if (fs.existsSync(pcPath)) {
      const seedPC = JSON.parse(fs.readFileSync(pcPath, 'utf8'));
      if (seedPC.length > 0) {
        const insertPC = await db.prepare(`INSERT OR IGNORE INTO project_contacts (projectId, contactId, role) VALUES (@projectId, @contactId, @role)`);
        await db.transaction(async () => {
          for (const pc of seedPC) await insertPC.run(pc);
        })();
      }
    }
  } catch (e) {
    log.error("Failed to load seed_project_contacts.json", e);
  }
}

const eslCount = await db.prepare("SELECT COUNT(*) as count FROM external_site_listings").get() as { count: number | string };
if (Number(eslCount.count) === 0) {
  try {
    const eslPath = path.join(seedsDir, 'seed_external_listings.json');
    if (fs.existsSync(eslPath)) {
      const seedESL = JSON.parse(fs.readFileSync(eslPath, 'utf8'));
      if (seedESL.length > 0) {
        const insertESL = await db.prepare(`INSERT OR IGNORE INTO external_site_listings (id, name, url, state, region, lastScraped) VALUES (@id, @name, @url, @state, @region, @lastScraped)`);
        await db.transaction(async () => {
          for (const esl of seedESL) await insertESL.run(esl);
        })();
      }
    }
  } catch (e) {
    log.error("Failed to load seed_external_listings.json", e);
  }
}

const proceduresCount = await db.prepare("SELECT COUNT(*) as count FROM procedures").get() as { count: number | string };
if (Number(proceduresCount.count) === 0) {
  const insertProcedure = await db.prepare(`
    INSERT OR IGNORE INTO procedures (id, title, icon, iconColor, description, steps, sortOrder)
    VALUES (@id, @title, @icon, @iconColor, @description, @steps, @sortOrder)
  `);

  let seedProcedures: any[] = [];
  try {
    const proceduresPath = path.join(seedsDir, 'seed_procedures.json');
    if (fs.existsSync(proceduresPath)) {
      seedProcedures = JSON.parse(fs.readFileSync(proceduresPath, 'utf8'));
    }
  } catch (e) {
    log.error("Failed to load seed_procedures.json", e);
  }

  function parseStepsToArray(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { const once = JSON.parse(val); if (Array.isArray(once)) return once; if (typeof once === 'string') { const twice = JSON.parse(once); if (Array.isArray(twice)) return twice; } } catch {}
    }
    return [];
  }

  const insertManyProcedures = await db.transaction(async (items: any[]) => {
    for (const item of items) {
      await insertProcedure.run({
        ...item,
        steps: JSON.stringify(parseStepsToArray(item.steps))
      });
    }
  });
  await insertManyProcedures(seedProcedures);
}

const newsCount = await db.prepare("SELECT COUNT(*) as count FROM news").get() as { count: number | string };
if (Number(newsCount.count) === 0) {
  const insertNews = await db.prepare(`
    INSERT INTO news (id, title, content, date, author)
    VALUES (@id, @title, @content, @date, @author)
  `);

  let seedNews: any[] = [];
  try {
    const newsPath = path.join(seedsDir, 'seed_news.json');
    if (fs.existsSync(newsPath)) {
      seedNews = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
    }
  } catch (e) {
    log.error("Failed to load seed_news.json", e);
  }

  const insertManyNews = await db.transaction(async (items) => {
    for (const item of items) await insertNews.run(item);
  });
  await insertManyNews(seedNews);
}

const ghCount = await db.prepare("SELECT COUNT(*) as count FROM ground_handling_sites").get() as { count: number | string };
if (Number(ghCount.count) === 0) {
  const insertGH = await db.prepare(`
    INSERT INTO ground_handling_sites (id, name, lat, lon, windDirections, description, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const ghSites = [
    {
      id: "gh-albert-park",
      name: "Albert Park Lake",
      lat: -37.8467,
      lon: 144.9736,
      windDirections: "N, NE, E, SE, S, SW, W, NW",
      description: "Large open parkland surrounding Albert Park Lake. Good for all wind directions with plenty of flat, grassy space.",
      notes: "Popular with joggers and cyclists — be mindful of others. Best early mornings or weekday afternoons.",
    },
    {
      id: "gh-sandringham-beach",
      name: "Sandringham Beach Reserve",
      lat: -37.9510,
      lon: 145.0100,
      windDirections: "S, SSW, SW, W, WSW",
      description: "Grassy foreshore area with good southerly and westerly wind exposure. Close to the beach.",
      notes: "Can get busy on weekends. Dogs off-leash in some areas — watch for tangled lines.",
    },
    {
      id: "gh-point-cook",
      name: "Point Cook Coastal Park",
      lat: -37.9167,
      lon: 144.7500,
      windDirections: "S, SW, W, NW, N",
      description: "Wide open coastal parkland with consistent sea breezes. Great for practicing in stronger conditions.",
      notes: "Park closes at sunset. Check Parks Victoria website for any seasonal closures.",
    },
    {
      id: "gh-jells-park",
      name: "Jells Park",
      lat: -37.8833,
      lon: 145.1833,
      windDirections: "N, NE, NW, W",
      description: "Eastern suburbs park with large open grass areas sheltered from southerlies. Good for light wind practice.",
      notes: "Multiple flat areas available. The main oval area near the lake is best.",
    },
    {
      id: "gh-you-yangs",
      name: "You Yangs Regional Park",
      lat: -37.9167,
      lon: 144.4167,
      windDirections: "N, NE, E, NW",
      description: "Open paddock areas near the You Yangs with good inland wind exposure. Popular with pilots heading to/from western sites.",
      notes: "Can be dusty in summer. Bring water and sun protection.",
    },
  ];

  await db.transaction(async () => {
    for (const site of ghSites) {
      await insertGH.run(site.id, site.name, site.lat, site.lon, site.windDirections, site.description, site.notes);
    }
  })();
  log.info(`Seeded ${ghSites.length} ground handling sites`);
}

{
  const insertSafety = await db.prepare(`
    INSERT INTO safety_sections (id, title, content, "sortOrder", "sectionType", enabled)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING
  `);

  const safetySections = [
    {
      id: "emergency",
      title: "Emergency Procedures",
      content: `### In Case of an Accident:\n\n1. **Ensure your own safety first.**\n2. **Assess the injured pilot.** Do not move them unless they are in immediate danger.\n3. **Call 000** immediately for emergency services.\n4. **Provide exact location details** (use coordinates if possible).\n5. **Contact a Club Safety Officer** as soon as practical.\n\n### Incident Reporting\n\nAll incidents, accidents, and near-misses must be reported to SAFA and the Club Committee within 24 hours.\n\n[Submit Incident Report Form →](https://safa.asn.au/safety/reporting-an-accident/)`,
      sortOrder: 1,
      sectionType: "emergency",
      enabled: 1,
    },
    {
      id: "rules",
      title: "General Club Rules",
      content: `1. **SAFA Membership** — All pilots flying at club sites must be current financial members of the Sports Aviation Federation of Australia (SAFA).\n2. **Club Membership** — Visiting pilots must join as temporary members. Local pilots must hold full annual club membership.\n3. **Mandatory Check-in** — All pilots must use the online check-in system before launching at any club site. Failure to do so may result in disciplinary action.\n4. **Helmets & Reserves** — Approved helmets must be worn at all times while connected to a glider. A recently repacked reserve parachute is mandatory for all flights.`,
      sortOrder: 3,
      sectionType: "rules",
      enabled: 1,
    },
  ];

  await db.transaction(async () => {
    for (const s of safetySections) {
      await insertSafety.run(s.id, s.title, s.content, s.sortOrder, s.sectionType, s.enabled);
    }
  })();
}
