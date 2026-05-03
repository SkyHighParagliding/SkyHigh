<div align="center">
  <img width="1200" height="475" alt="SkyHigh Banner" src="public/skyhigh-banner.png" />
  <h1>SkyHigh Paragliding & Hang Gliding Club</h1>
  <p>A modern, full-stack platform for free flight clubs, featuring AI-powered site management, automated weather tracking, and production-grade media storage.</p>
</div>

---

> 📚 **For detailed project documentation**, refer to the [Documentation Index](./wiki-md.md) which includes API reference, implementation summaries, and configuration guides.

---

## 🚀 Overview

SkyHigh is a comprehensive management platform designed specifically for paragliding and hang gliding clubs. It streamlines site information, member submissions, and administrative tasks using cutting-edge AI and cloud technologies.

### Key Features
- **AI-Powered Site Management**: Automated scraping and parsing of site guides with Gemini AI.
- **Smart Image Enhancer**: AI-driven photo enhancement, watermarking, and automated variant generation (Hero, Banner, Sliders).
- **Environment-Agnostic Storage**: Seamless switching between local filesystem (dev) and Cloudflare R2 (prod).
- **Dual Database Support**: Fully compatible with SQLite (local) and PostgreSQL (production) via a robust abstraction layer.
- **PWA Ready**: Built-in support for branding, icons, and offline-ready mobile experiences.
- **TidyHQ Integration**: Automated syncing of club officers and member data.

---

## 🛠 Tech Stack
- **Frontend**: React (Vite), Tailwind CSS, Shadcn/UI, Lucide Icons.
- **Backend**: Node.js, Express, Multer, Sharp (Image Processing).
- **AI**: Google Gemini Pro & Vision models.
- **Database**: SQLite (Development) / PostgreSQL (Production).
- **Storage**: Local Filesystem / Cloudflare R2 (S3-Compatible).

---

## ⚙️ Local Setup

### Prerequisites
- **Node.js** (v20+ recommended)
- **npm** (v10+)

### 1. Installation
```bash
npm install
```

### 2. Configuration
Copy the template and fill in your API keys:
```bash
cp .env.template .env
```
*Note: You will need a `GEMINI_API_KEY` to use AI features.*

### 3. Development
```bash
npm run dev
```
The app will be available at `http://localhost:5173`. The Express backend runs on `http://localhost:3000`.

---

## 📦 Architecture Notes

### Database Abstraction & Migrations
The project uses a custom database adapter (`server/pgDb.ts`) that allows you to write SQLite-style queries (including `INSERT OR IGNORE` and `datetime` functions) while maintaining full compatibility with PostgreSQL. This is automatically managed via the `DATABASE_URL` environment variable. Schema migrations are handled natively by the built-in runner (`server/db.ts`), ensuring structures like `project_documents` stay synchronized between environments.

### Admin Dashboard & Deep Linking
The Admin Dashboard utilizes a hybrid navigation strategy:
- `react-router-dom` handles route-level navigation.
- **URL Hashes** (`#proj-ID`, `#cont-ID`, `#spon-ID`, `#biz-ID`) are used to manage "deep-linked" modal state and sub-page focus. This allows the global admin search to directly link users into specific edit dialogs without full page reloads.

### Google Drive Integration & Caching
Project file management is integrated directly with Google Drive via Google Apps Script. To ensure a snappy UI, the backend employs an in-memory cache (5-minute TTL) for Drive file listings, automatically invalidating when documents are uploaded, linked, or deleted.

### Structured Storage
All media assets are stored using a namespaced hierarchy:
- `images/hero/` - 1920x1080 background images.
- `images/sites/` - 1920x600 banner images.
- `images/sliders/` - Multi-size slider variants.
- `branding/` - Club logos and PWA assets.

### Migration & Seeding
If starting with a fresh database, the application will automatically seed initial settings, pages, and site data from the `server/data/seeds/` directory on the first run.

---

## 📄 License
This project is proprietary and intended for club use. See the committee for contribution guidelines.
