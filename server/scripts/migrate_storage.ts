import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const root = process.cwd();
const uploadsDir = path.join(root, "uploads");
const dbPath = path.join(root, "database", "db.sqlite");

if (!fs.existsSync(dbPath)) {
  console.error("db.sqlite not found at", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

const MAPPING = [
  { pattern: /^site-.*\.jpg$/, folder: "images/sites" },
  { pattern: /^slider-.*\.jpg$/, folder: "images/sliders" },
  { pattern: /^hero-.*\.jpg$/, folder: "images/hero" },
  { pattern: /^logo-.*\.png$/, folder: "branding" },
  { pattern: /^pwa-icon-.*\.png$/, folder: "branding" },
  { pattern: /^sub-.*\.jpg$/, folder: "submissions" },
  { pattern: /^essential-.*\.jpg$/, folder: "images/essential" },
  { pattern: /^doc-.*$/, folder: "attachments" },
];

function ensureDir(dir: string) {
  const abs = path.join(uploadsDir, dir);
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
}

async function migrate() {
  console.log("Starting storage migration...");

  const files = fs.readdirSync(uploadsDir);
  const movedFiles = new Map<string, string>(); // oldFilename -> newKey

  for (const file of files) {
    if (fs.statSync(path.join(uploadsDir, file)).isDirectory()) continue;

    const match = MAPPING.find(m => m.pattern.test(file));
    if (match) {
      const newKey = `${match.folder}/${file}`;
      ensureDir(match.folder);
      
      const oldPath = path.join(uploadsDir, file);
      const newPath = path.join(uploadsDir, newKey);
      
      console.log(`Moving ${file} -> ${newKey}`);
      fs.renameSync(oldPath, newPath);
      movedFiles.set(file, newKey);
    }
  }

  console.log(`Moved ${movedFiles.size} files. Updating database...`);

  // Update sites table
  const sites = db.prepare("SELECT id, image, essentialInfoImages FROM sites").all() as any[];
  for (const site of sites) {
    let updated = false;
    let newImage = site.image;
    
    if (newImage && !newImage.startsWith("http")) {
      const filename = path.basename(newImage);
      if (movedFiles.has(filename)) {
        newImage = `/uploads/${movedFiles.get(filename)}`;
        updated = true;
      }
    }

    let newEssential = site.essentialInfoImages;
    if (newEssential) {
      try {
        const images = JSON.parse(newEssential);
        let essentialUpdated = false;
        const newImages = images.map((img: string) => {
          if (!img.startsWith("http")) {
            const filename = path.basename(img);
            if (movedFiles.has(filename)) {
              essentialUpdated = true;
              return `/uploads/${movedFiles.get(filename)}`;
            }
          }
          return img;
        });
        if (essentialUpdated) {
          newEssential = JSON.stringify(newImages);
          updated = true;
        }
      } catch {}
    }

    if (updated) {
      db.prepare("UPDATE sites SET image = ?, essentialInfoImages = ? WHERE id = ?").run(newImage, newEssential, site.id);
    }
  }

  // Update settings (homeHeroImages)
  const heroRow = db.prepare("SELECT value FROM settings WHERE key = 'homeHeroImages'").get() as any;
  if (heroRow?.value) {
    try {
      const images = JSON.parse(heroRow.value);
      let updated = false;
      const newImages = images.map((img: string) => {
        if (typeof img === 'string' && !img.startsWith("http")) {
          const filename = path.basename(img);
          if (movedFiles.has(filename)) {
            updated = true;
            return `/uploads/${movedFiles.get(filename)}`;
          }
        }
        return img;
      });
      if (updated) {
        db.prepare("UPDATE settings SET value = ? WHERE key = 'homeHeroImages'").run(JSON.stringify(newImages));
      }
    } catch {}
  }

  // Update settings (imageLibrary)
  const libraryRow = db.prepare("SELECT value FROM settings WHERE key = 'imageLibrary'").get() as any;
  if (libraryRow?.value) {
    try {
      const library = JSON.parse(libraryRow.value);
      let updated = false;
      const newLibrary = library.map((entry: any) => {
        let entryUpdated = false;
        const fields: (keyof any)[] = ["wide", "banner", "sliderLg", "sliderSm", "sliderPortrait"];
        for (const field of fields) {
          const val = entry[field];
          if (val && typeof val === 'string' && !val.startsWith("http")) {
            const filename = path.basename(val);
            if (movedFiles.has(filename)) {
              entry[field] = `/uploads/${movedFiles.get(filename)}`;
              entryUpdated = true;
            }
          }
        }
        if (entryUpdated) updated = true;
        return entry;
      });
      if (updated) {
        db.prepare("UPDATE settings SET value = ? WHERE key = 'imageLibrary'").run(JSON.stringify(newLibrary));
      }
    } catch {}
  }

  // Update submissions
  const submissions = db.prepare("SELECT id, filePath FROM image_submissions").all() as any[];
  for (const sub of submissions) {
    if (sub.filePath && !sub.filePath.startsWith("http")) {
      const filename = path.basename(sub.filePath);
      if (movedFiles.has(filename)) {
        const newPath = `/uploads/${movedFiles.get(filename)}`;
        db.prepare("UPDATE image_submissions SET filePath = ? WHERE id = ?").run(newPath, sub.id);
      }
    }
  }

  console.log("Migration complete!");
}

migrate().catch(console.error);
