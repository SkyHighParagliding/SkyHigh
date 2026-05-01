import { Wind, CloudSun, Map, Compass, Sparkles, ImagePlus, Users, ShieldAlert, FileText, Newspaper, Home, Settings, BookOpen, GraduationCap, MessageCircle, Navigation, Lock, Printer, FolderOpen, Briefcase, Contact2, Search } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

interface Feature {
  icon: React.ReactNode;
  title: string;
  highlights: string[];
}

interface FeatureCategory {
  id: string;
  title: string;
  features: Feature[];
}

const categories: FeatureCategory[] = [
  {
    id: "weather",
    title: "Weather & Wind Intelligence",
    features: [
      {
        icon: <CloudSun className="w-5 h-5" />,
        title: "Multi-Source Live Weather",
        highlights: [
          "Live-Wind and Weather Underground station data",
          "Auto-scraping every 15-30 min during flying hours",
          "ECMWF 6-hour forecasts with colour-coded flyability",
        ],
      },
      {
        icon: <Compass className="w-5 h-5" />,
        title: "Interactive Wind Compass",
        highlights: [
          "Animated compass needle with ideal wind sectors",
          "Colour-coded status ring for at-a-glance flyability",
        ],
      },
      {
        icon: <Map className="w-5 h-5" />,
        title: "Animated Wind Map",
        highlights: [
          "D3-based wind particle animation across Victoria",
          "Play/pause timeline, zoom controls, speed adjustment",
          "HSL colour-coded wind speed (calm to strong)",
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "Smart Tools",
    features: [
      {
        icon: <Sparkles className="w-5 h-5" />,
        title: "Smart Site Generator & Bulk Import",
        highlights: [
          "Scrape any site guide URL — Smart extraction structures all data",
          "Bulk import entire states from siteguide.org.au",
          "Customisable prompts for text and image generation",
        ],
      },
      {
        icon: <ImagePlus className="w-5 h-5" />,
        title: "Smart Image Enhancer",
        highlights: [
          "Upload → Use Original or Smart Enhance",
          "Auto-generates hero (1920×1080) and banner (1920×600) versions",
          "Content images auto-resized to 1200×800 under 300KB",
        ],
      },
      {
        icon: <Search className="w-5 h-5" />,
        title: "Public Smart Assistant",
        highlights: [
          "Conversational Smart search on home page",
          "Accesses live weather, sites, forecasts, safety officers",
          "Conversation history for follow-up questions",
        ],
      },
    ],
  },
  {
    id: "safety",
    title: "Pilot Safety",
    features: [
      {
        icon: <ShieldAlert className="w-5 h-5" />,
        title: "Digital Check-in & Safety Officers",
        highlights: [
          "Optional 3-step check-in: select site → review hazards → confirm flight",
          "Safety officer directory with obfuscated contact details",
          "Dismissible alert banner for urgent club announcements",
        ],
      },
    ],
  },
  {
    id: "cms",
    title: "Content Management",
    features: [
      {
        icon: <Navigation className="w-5 h-5" />,
        title: "Flying Site Directory",
        highlights: [
          "Rich site guides with hazards, rules, launch/landing info, maps",
          "Site status management, QR codes, club site badges",
          "WhereToFly integration for curated wind data",
        ],
      },
      {
        icon: <Newspaper className="w-5 h-5" />,
        title: "News, Pages & Events",
        highlights: [
          "Markdown editors with image toolbar (upload, Smart enhance, paste URL)",
          "Custom CMS pages with auto-generated slugs",
          "TidyHQ events integration with auto-sync",
        ],
      },
      {
        icon: <Home className="w-5 h-5" />,
        title: "Dynamic Home Page",
        highlights: [
          "Configurable hero images, CTAs, and live weather cards",
          "Quick action cards with drag-and-drop ordering and auto-cycle",
          "Schools card (randomised order), Telegram groups, custom widgets",
        ],
      },
    ],
  },
  {
    id: "management",
    title: "Project & Document Management",
    features: [
      {
        icon: <FolderOpen className="w-5 h-5" />,
        title: "Document Filing System",
        highlights: [
          "8-folder structure aligned with the Procedures Manual",
          "Google Drive integration for upload, view, search, and delete",
          "Graceful offline mode when Drive not connected",
        ],
      },
      {
        icon: <Briefcase className="w-5 h-5" />,
        title: "Project Management",
        highlights: [
          "Track site works, stakeholders, and land management projects",
          "Parks Victoria liaison with PV contact picker and expectations",
          "Attach documents (upload or link), link contacts with roles",
          "Markdown-enabled notes with write/preview toggle",
        ],
      },
      {
        icon: <Contact2 className="w-5 h-5" />,
        title: "Contact Directory",
        highlights: [
          "Central directory for external contacts across all projects",
          "Search, add, edit, delete with project-link warnings",
        ],
      },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    features: [
      {
        icon: <Settings className="w-5 h-5" />,
        title: "Admin Dashboard",
        highlights: [
          "Smart search across all features, procedures, sites, pages, and documents",
          "Organised nav cards: Content, Governance, Management, Settings, Features",
          "Multi-user auth with bcrypt passwords and session tokens",
        ],
      },
      {
        icon: <BookOpen className="w-5 h-5" />,
        title: "Built-in Admin Manual & Procedures",
        highlights: [
          "Version-controlled how-to guides for every feature",
          "Procedures Manual CMS with 23 editable sections",
          "Markdown formatting guide for content editors",
        ],
      },
    ],
  },
];

const totalFeatures = categories.reduce((sum, cat) => sum + cat.features.length, 0);

export function Features() {
  const { settings } = useSettings();
  const clubName = settings.clubName || 'SkyHigh';
  return (
    <div className="bg-card min-h-screen">
      <style>{`
        @media print {
          nav, footer, .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .feature-card { break-inside: avoid; }
          .category-section { break-before: page; }
          .category-section:first-of-type { break-before: avoid; }
        }
      `}</style>

      <div className="no-print fixed top-20 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg shadow-lg hover:bg-navy-light transition-colors text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12 print:py-6">
        <div className="text-center mb-10 print:mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky/10 text-sky rounded-full text-xs font-bold uppercase tracking-widest mb-4">
            Platform Overview
          </div>
          <h1 className="text-3xl font-black text-navy mb-2 print:text-2xl">{clubName}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto print:text-sm">
            Club management platform with live weather, Smart tools, pilot safety, document management, and a full CMS.
          </p>
          <p className="text-xs text-foreground-faint mt-2">{categories.length} categories &middot; {totalFeatures} features</p>
        </div>

        <div className="mb-8 print:mb-4">
          <div className="flex flex-wrap justify-center gap-2 print:gap-1">
            {categories.map((cat, idx) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="px-3 py-1.5 rounded-full bg-background hover:bg-sky/5 transition-colors text-sm text-navy font-medium no-print"
              >
                <span className="text-sky font-bold mr-1">{idx + 1}.</span>
                {cat.title}
              </a>
            ))}
          </div>
        </div>

        <div className="border-t border-border-faint" />

        {categories.map((category, catIdx) => (
          <section key={category.id} id={category.id} className={`py-8 print:py-4 ${catIdx > 0 ? "category-section border-t border-border-faint" : ""}`}>
            <div className="flex items-baseline gap-3 mb-6 print:mb-3">
              <span className="text-2xl font-black text-sky/20 print:text-xl">{String(catIdx + 1).padStart(2, "0")}</span>
              <h2 className="text-xl font-bold text-navy print:text-lg">{category.title}</h2>
            </div>

            <div className="space-y-4 print:space-y-3">
              {category.features.map((feature, fIdx) => (
                <div
                  key={fIdx}
                  className="feature-card border border-border-faint rounded-lg p-4 print:p-3 hover:border-sky/30 transition-all print:border-border-subtle"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky/10 flex items-center justify-center flex-shrink-0 text-sky">
                      {feature.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-navy mb-1.5 print:text-sm">{feature.title}</h3>
                      <ul className="space-y-1">
                        {feature.highlights.map((h, hIdx) => (
                          <li key={hIdx} className="text-sm text-foreground-secondary print:text-xs flex items-start gap-2">
                            <span className="text-sky mt-1.5 flex-shrink-0">•</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
