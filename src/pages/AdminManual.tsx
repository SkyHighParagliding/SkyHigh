import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft,
  Book,
  MapPin,
  FileText, 
  Newspaper, 
  Activity, 
  Home, 
  Settings, 
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Wind,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  FolderOpen,
  Briefcase,
  Contact2,
  Sparkles,
  Handshake,
  Clock,
  UserPlus,
  Car,
  ShieldAlert,
  Building2,
  Trophy,
  LogIn,
  Target,
  Search,
  X,
  Flame,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/SettingsContext";

// Flattens a manual step (plain string or JSX span with nested links) to plain
// text so the keyword search can match against it.
function nodeText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (typeof node === "object" && "props" in node && (node as { props?: { children?: ReactNode } }).props) {
    return nodeText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

// Returns a snippet of `text` windowed around the first match of `q`, with every
// occurrence of `q` wrapped in a highlight mark.
function highlightSnippet(text: string, q: string): ReactNode {
  const lc = text.toLowerCase();
  const first = lc.indexOf(q);
  if (first === -1) return text;
  const start = Math.max(0, first - 60);
  const end = Math.min(text.length, first + q.length + 120);
  const clip = (start > 0 ? "… " : "") + text.slice(start, end) + (end < text.length ? " …" : "");
  const clipLc = clip.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  for (let j = clipLc.indexOf(q, 0); j !== -1; j = clipLc.indexOf(q, i)) {
    if (j > i) parts.push(clip.slice(i, j));
    parts.push(<mark key={j} className="bg-accent/20 text-ink rounded px-0.5">{clip.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  parts.push(clip.slice(i));
  return parts;
}

export function AdminManual() {
  const location = useLocation();
  const { settings } = useSettings();
  const clubName = settings.clubName || 'SkyHigh';
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location]);

  const sections = [
    {
      title: "Manage Sites Page",
      icon: <MapPin className="w-6 h-6 text-accent" />,
      link: "/admin/sites",
      category: "Content Management",
      description: "The central hub for importing, archiving, searching and managing all flying sites. Click 'Edit' on any site to open the Site Editor (covered in the next section).",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Navigate: Go to 'Flying Sites' from the Admin Dashboard. The page header shows a site count and the 'Add New Site' button (top-right).</span><Link to="/admin/sites" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Sites Admin <ExternalLink className="w-3 h-3" /></Link></span>,
        "Siteguide Version Banner: A colour-coded banner at the top shows the current siteguide.org.au version. Green = up to date. Orange = version has changed since last import. Click 'Check Now' to poll siteguide for updates. If you have previously run a manual import for the selected state (see 'Import Sites' below), and a new version is detected, the import starts automatically.",
        "Import Sites: Select a state/territory from the dropdown, then click 'Import Sites'. A progress bar shows each site being processed. Import archives your current sites before overwriting. Results show created, updated, unchanged, skipped, and errors for each site.",
        "Refresh Site List: Click the small 'Refresh site list' link below the state selector to re-fetch the master list of available sites from siteguide.org.au.",
        "Automated Import: The system checks siteguide daily at 5 AM Melbourne time. If the version has changed, it auto-imports — but only for states where you have already done at least one manual import using the 'Import Sites' button above. No separate configuration is needed.",
        "Bulk Import Protection: Fields you have manually set in the Site Editor (wind directions, wind speed, ratings, status, weather station, image) are never overwritten by imports — only empty fields are populated. This protects your manual customisations.",
        "Restore from Archive: Up to 10 version archives are kept. Select an archive from the dropdown, click 'View Changes' to see a field-by-field diff between the archive and current data, or click 'Restore' to replace all current sites with the archived version. A confirmation dialog warns you before restoring.",
        "WTF Wind Data: Click 'Fetch & Compare' to pull wind speed data from wheretofly.info and compare it with your current site values. A table shows matched sites with current vs WTF speeds. Tick the sites you want to update (differences are pre-selected), then click 'Apply'. Use 'Show all matches' to see identical sites too.",
        "Search & Filter: Use the search box to filter sites by name. Tick 'Hide closed sites' to remove closed sites from the public website — they remain visible on this admin page and can still be edited. Untick to show them publicly again.",
        "Site Table: Shows all sites with Name, Type (Coastal/Inland), and Status (Open/Closed). Click a site name to view the public page. Click 'Edit' to open the Site Editor. Click 'Delete' to remove a site (with confirmation).",
        "Add New Site: Click 'Add New Site' to create a blank site in the Site Editor. You can then use the Smart Site Generator to auto-populate fields from siteguide.org.au."
      ]
    },
    {
      title: "Site Editor",
      icon: <MapPin className="w-6 h-6 text-accent" />,
      link: "/admin/sites",
      category: "Content Management",
      description: "The full editing interface for an individual flying site — details, rules, hazards, weather stations, wind compass, QR codes and more.",
      steps: [
        "Open the Site Editor by clicking 'Edit' on any site in the Manage Sites page, or by clicking 'Add New Site'.",
        "QR Code Types: Choose between 'Info Page' (links to the site detail page) and 'XC Maps' (links directly to the XC Map centred on this site). The XC Maps option only appears when the site has 'XC Site' enabled.",
        "XC Maps QR: When 'XC Maps' is selected, a 'Preview XC Maps' button appears to test the link. Print the QR code with 'Scan for XC Map' labelling for field signs.",
        "If 'XC Site' is toggled off while the QR type is set to 'XC Maps', it automatically resets to 'Info Page'.",
        "Height Fields: Four independent height fields are available — Launch (AMSL), Landing (AMSL), Launch 2 (AMSL), and Landing 2 (AMSL). Use the second pair for sites with multiple launches or landings. Only fields with data appear on the public site detail card.",
        "Format Heights button: Enter a value in any height field (e.g. '640m', '640', or '2100'') then click 'Format Heights'. Each populated field is converted to the standard 'Xm / Y'' format — metres rounded to the nearest 1m, feet rounded to the nearest 10'. The fields are processed independently — no cross-calculation between launch and landing.",
        "XC Site Toggle: Enables the site to appear in XC Maps. When toggled on, an XC Maps QR code option becomes available in the QR Code section.",
        "Pilot Ratings: Two free-text rating fields — PG Rating and HG Rating. Enter the minimum rating and any supervisory requirements (e.g. 'PG4 | PG3 req PG5'). Leave blank if no rating restriction applies.",
        "Site Contact: Optional fields for a local contact person name and phone number — shown on the public site detail card.",
        "Google Maps Link: Paste a Google Maps URL for the site. A 'Open in Google Maps' button appears on the public site card. The map tab in the editor also shows a direct 'Google Maps' button to open the site's coordinates in Google Maps.",
        "Coordinates: Latitude and Longitude fields. A 'Copy Coordinates' button copies the coords to clipboard (e.g. -37.229874, 143.194699) for use in documents or messages. Coordinates are used to find nearby weather stations and auto-detect the tide station.",
        "Live Weather Station: A dropdown listing weather stations near the site's coordinates, ordered by distance. Select the primary station for live wind data. If coordinates have not been entered, this dropdown is empty. Stations can also be typed in manually.",
        "Alternate Weather Station: A second optional weather station. When set, the site displays data from both stations — useful for sites where two nearby stations give complementary readings.",
        "Tide Station: Coastal sites can select a tide station for the 7-Day Outlook tide chart. Defaults to 'Auto-detect nearest station' based on coordinates. Manual override lets you pick any station from the list.",
        "Flight Conditions — Wind Directions: Free-text field for the ideal wind directions (e.g. 'SE-ESE' or 'S,SW'). Shown on the public site card and used to colour-code the wind compass.",
        "Flight Conditions — Wind Speed: Free-text field for the ideal wind speed range (e.g. '10 - 18 knots'). Shown alongside wind directions on the public site card.",
        "Site Type and Status: Set whether the site is Coastal or Inland (affects image category tagging) and whether it is Open or Closed (closed sites can be hidden from public listing)."
      ]
    },
    {
      title: "Home Page Management",
      icon: <Home className="w-6 h-6 text-ink" />,
      link: "/admin/home",
      category: "Content Management",
      description: "Control the hero section, featured content, quick action cards, social media links, and widget tags.",
      steps: [
        "Alert Banner: Enable for urgent club-wide notifications.",
        "Hero: Update the title, subtitle, and CTA button text/links.",
        "Background Gallery: Select images from the Image Library for hero rotation. Choose Static or Random display.",
        "Featured Site: Select a site to highlight on the home page.",
        "Current Conditions: Choose which sites appear in the weather section.",
        "Quick Action Cards: Choose 3 cards to display, or enable 'Cycle' to rotate randomly. Edit titles, descriptions, and links. Add custom cards with 'Add Custom Card'. The Events card auto-pulls from TidyHQ.",
        "Paragliding Schools: Add school names and URLs — they display as button cards and are shuffled on each page load. Use {{schools}} in CMS pages to embed them.",
        "Telegram Groups: Add group names and invite URLs. Use {{telegram}} in CMS pages. When configured, the Community card shows group buttons instead of text.",
        "Custom Widget Tags: Create filtered subsets of Schools or Telegram groups for use on specific pages (e.g. {{vic_schools}}).",
        <span className="flex flex-wrap items-center gap-2"><span>Photo Carousel: Toggle on/off in Site Features. When enabled, sub-options for auto-scroll and reverse direction appear. The carousel shows a scrolling strip of images from the Image Library.</span><Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Options <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>YouTube Carousel: Toggle on/off in Site Features. Same auto-scroll and reverse direction options. Displays YouTube video thumbnails in alternating large/small sizes.</span><Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Options <ExternalLink className="w-3 h-3" /></Link></span>,
        "SkyHigh Video Wall: All YouTube videos are automatically displayed on the public /video-wall page as a mosaic of thumbnails. Newest videos appear first. Each tile links to the YouTube video. Thumbnails cycle through 4 size variants for visual variety.",
        "Social Media Links: At the bottom of Home Page settings. Enter URLs for each platform — only those with a URL show as footer icons."
      ]
    },
    {
      title: "Dynamic Pages",
      icon: <FileText className="w-6 h-6 text-accent" />,
      link: "/admin/pages",
      category: "Content Management",
      description: "Manage content pages like 'About Us', 'New Pilots', and 'Visiting Pilots'.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Access via 'News, Events & Pages' on the Dashboard (Dynamic Pages tab).</span><Link to="/admin/pages" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Pages Admin <ExternalLink className="w-3 h-3" /></Link></span>,
        "Create pages with a unique page address (e.g. 'training-info') — accessible at /page/training-info.",
        "Content uses Markdown formatting. See the Markdown Guide section below.",
        "Image Toolbar: 'Library' opens a scrollable 3-column grid of all images in that category. Click any thumbnail to insert it at your cursor. Switch between Hero, Banner, Landscape Lg, Landscape Sm, and Portrait tabs to browse categories. 'Paste URL' inserts an external image. Both add the correct Markdown at your cursor.",
        "Paste from Google Docs: Click the 'Paste Doc' button above the editor. A modal opens — paste content copied from Google Docs and it auto-converts to clean Markdown (headings, bold, italic, lists, links, tables preserved). Review and edit the Markdown before inserting. You can paste just a portion of a document.",
        "Widget Tags: Use {{schools}}, {{telegram}}, or {{committee}} to embed interactive content. Create custom filtered tags in Home Page Settings."
      ]
    },
    {
      title: "News & Events",
      icon: <Newspaper className="w-6 h-6 text-emerald-500" />,
      link: "/admin/pages",
      category: "Content Management",
      description: "Post updates and announcements for club members.",
      steps: [
        "Click 'Add News Item'. Use Markdown for formatting.",
        "Use the image toolbar to insert photos from the Library or via URL. The Library opens a scrollable 3-column grid — each image is shown as a clear thumbnail with the name visible on hover.",
        "Set the publication date and author. News items appear in the public 'News' section."
      ]
    },
    {
      title: "Safety & Rules",
      icon: <ShieldAlert className="w-6 h-6 text-red-500" />,
      link: "/admin/safety",
      category: "Content Management",
      description: "Edit the Safety & Rules page — emergency procedures, club rules, and custom sections.",
      steps: [
        "Each section has a title, content (Markdown), and type (Emergency, Rules, or Custom). Sections render differently based on type.",
        "Click 'Edit' to expand a section and modify its content. Use the Markdown toolbar to insert images. Use the 'Paste Doc' button to import content from Google Docs — formatting is automatically converted to Markdown.",
        "Reorder sections using the up/down arrows. Toggle visibility with the eye icon.",
        "Add optional Link URL and Link Label fields to create navigation links to other pages (e.g. /page/code-of-conduct).",
        "Click 'Add Section' to create new content areas. Delete sections with the trash icon.",
        <span className="flex flex-wrap items-center gap-2"><span>The Safety Officer Directory is managed separately from Admin Contacts — officers with 'Safety Committee' role appear automatically.</span><Link to="/admin/contacts" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Contacts <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Use dynamic pages (News, Events & Pages) to create linked pages like Code of Conduct or Complaints & Disciplinary, then link them from safety sections.</span><Link to="/admin/pages" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Pages Admin <ExternalLink className="w-3 h-3" /></Link></span>
      ]
    },
    {
      title: "Online Check-ins",
      icon: <Activity className="w-6 h-6 text-purple-500" />,
      link: "/admin/checkins",
      category: "Content Management",
      description: "Monitor pilot check-ins and site usage.",
      steps: [
        "View recent check-ins and daily/total statistics.",
        <span className="flex flex-wrap items-center gap-2"><span>Requires 'Online Check-in' to be enabled in Site Features on the Dashboard.</span><Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Options <ExternalLink className="w-3 h-3" /></Link></span>
      ]
    },
    {
      title: "Business Directory",
      icon: <Building2 className="w-6 h-6 text-emerald-600" />,
      link: "/admin/business-directory",
      category: "Content Management",
      description: "Manage the club's member business directory — showcasing member-owned businesses on the public /business-directory page.",
      steps: [
        "Add Listing: Click 'Add Business' to open the form. Fill in Business Name (required), Member Name, Category, Phone, Email, Website URL, Logo/Image URL, and Description.",
        "Category: A free-text field used to group and label listings (e.g. 'Photography', 'Aviation Services', 'Accommodation').",
        "Logo / Image URL: Paste a URL to an image that represents the business. Displayed as the listing's thumbnail card image.",
        "Edit: Click the pencil icon on any listing card to open the edit panel and update any field.",
        "Delete: Click the trash icon on a listing card. A confirmation dialog prevents accidental deletion.",
        "Public Page: All active listings appear on /business-directory as a card grid, each showing the business logo, name, category, contact details, and a link to the website."
      ]
    },
    {
      title: "Competitions",
      icon: <Trophy className="w-6 h-6 text-amber-500" />,
      link: "/admin/xc",
      category: "Content Management",
      description: "Manage paragliding competitions and events listed on the public /xc/competitions page.",
      steps: [
        "Add Competition: Click 'Add Competition' to open the form. Fill in Competition Name (required), Location, Start Date, End Date, Status, Pilot Rating Requirement, Registration URL, Description, and Rules/Scoring Summary.",
        "Status: Set to Upcoming, Open, Closed, or Completed. Shown as a badge on the public listing.",
        "Pilot Rating Requirement: Free-text field for any minimum rating or eligibility criteria (e.g. 'PG4 or equivalent').",
        "Registration URL: A direct link to the competition registration page. Shown as a 'Register' button on the public listing.",
        "Description and Rules: Markdown-supported fields for full competition details and scoring rules.",
        "Preview: Click the eye icon on any competition card to expand a preview of the public-facing content before publishing.",
        "Edit / Delete: Use the pencil and trash icons on each card. Deletion requires confirmation.",
        "Public Page: All competitions appear on /xc/competitions sorted by date, with status badges and registration links."
      ]
    },
    {
      title: "Join Page Settings",
      icon: <LogIn className="w-6 h-6 text-ink" />,
      link: "/admin/join-settings",
      category: "Content Management",
      description: "Customise the public /join membership page — hero banner, TidyHQ signup link, membership tiers, and FAQs.",
      steps: [
        "Hero Section: Set the title and subtitle displayed in the banner at the top of the Join page (e.g. 'Join the Club', 'Fly with us today').",
        "TidyHQ URL: Paste your club's TidyHQ membership signup page URL. All CTA buttons on the Join page link to this address.",
        "Membership Tiers: Expand the Tiers section to add, edit, or remove membership levels. Each tier has a Name, Price, Description, and a list of Features. Click 'Add Tier' to create a new tier. Click the X on a feature line to remove it. Tiers display as pricing cards on the Join page.",
        "FAQ Section: Expand the FAQ section to add, edit, or remove frequently asked questions. Each FAQ has a Question and Answer. If no FAQs are added, the page shows a built-in default set. Click 'Add FAQ' to create a custom entry.",
        "Save: Click the 'Save' button (top-right or bottom of the page). The button is disabled when no changes have been made."
      ]
    },
    {
      title: "Ground Handling Map",
      icon: <MapPin className="w-6 h-6 text-accent" />,
      link: "/admin/site-options",
      category: "Content Management",
      description: "The public /ground-handling page — an embedded Google My Maps of pilot-recommended ground-handling spots. The page is switched on/off in Site Options; the map content itself lives in Google My Maps, not in SkyHigh.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Show / hide the page: Toggle 'Ground Handling' in Site Features on Site Options. When on, it appears in the Pilots nav menu and at /ground-handling; when off, it is hidden from the public site (the map content is untouched either way).</span><Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Options <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Add, move or remove spots: The map is a Google My Maps, not edited inside SkyHigh. On the Site Options 'Ground Handling Map' card, use the 'open the map editor directly in Google Maps' link — you must be signed in to a Google account that has edit access to the map. Changes you save in Google Maps appear on the site automatically (no import or publish step in SkyHigh).</span><Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Options <ExternalLink className="w-3 h-3" /></Link></span>,
        "Who can edit: Edit rights are controlled in Google My Maps' own Share settings, not in SkyHigh. Keep at least one club Google account as an owner/editor of the map so it can still be maintained if a committee member moves on.",
        "How pilots use it: The page embeds the map read-only. Tap a marker to read its description, tap the directions icon to open it in Google Maps, or use 'Open full screen map' (best on mobile).",
        "If the map shows blank or 'blocked': usually a content-blocker or privacy extension in the viewer's browser (Google My Maps embeds are a common target) — try another browser or disable shields to confirm. The site's security policy already allows the Google Maps embed.",
      ]
    },
    {
      title: "Admin Search",
      icon: <MessageCircle className="w-6 h-6 text-accent" />,
      link: "/admin",
      category: "Dashboard Settings",
      description: "Smart search across the entire platform — admin features, procedures, sites, pages, news, and Google Drive documents (including PDFs).",
      steps: [
        "Type a query into the search box at the top of the Dashboard and press Enter.",
        "Returns an AI-generated summary with source citations, plus links to matching documents and pages.",
        "Clicking a search result (like a Project, Contact, Site, Sponsor, or Business) will use deep-linking to open the specific edit dialog or page automatically.",
        "Click 'Edit Prompt' to customise search behaviour."
      ]
    },
    {
      title: "Site Features",
      icon: <Settings className="w-6 h-6 text-ink" />,
      link: "/admin",
      category: "Dashboard Settings",
      description: "Toggle global features from the top of the Dashboard.",
      steps: [
        "Online Check-in: Enable/disable mandatory check-ins site-wide.",
        "Featured Site: Show/hide the featured site section on the home page.",
        "Photo & YouTube Carousels: Toggle each on/off with sub-options for auto-scroll and reverse direction.",
        "QR Codes: Set to 'Informative' to enable compact field view pages for all sites.",
        "XC Maps vs Flight Tracker — two separate toggles: XC Maps provides the map, distance rings, airspace overlay, and site list. Flight Tracker is a separate feature that adds GPS recording controls and pilot sign-in inside the map. Both can be on independently — you can offer the map without tracking, or have tracking only available when both are on. Pilot sign-in and the Record button only appear on XC Maps when Flight Tracker is also enabled."
      ]
    },
    {
      title: "XC Maps & Flight Tracker",
      icon: <MapPin className="w-6 h-6 text-emerald-500" />,
      link: "/xc/maps",
      category: "Dashboard Settings",
      description: "Cross-country mapping with distance rings, bearing lines, OpenAIP airspace overlay, GPS flight tracker, and regional weather.",
      steps: [
        "Site List: XC sites are listed on the left, sorted by distance from the pilot's phone (closest first). Distance labels shown per site. Closed sites are excluded.",
        "QR Code Deep-links: Generate 'XC Maps' QR codes in the Site Editor — scanning takes pilots directly to the map centred on that site.",
        "Airspace Overlay: Toggle the 'Airspace' button to show CTA, CTR, and other airspace sectors from OpenAIP. The altitude slider filters sectors by floor height — defaults to ground level so all ground-level sectors are immediately visible.",
        <span className="flex flex-wrap items-center gap-2"><span>Wind Field Layer: Toggle the 'Winds' button (below Airspace) to display an animated wind field overlay across the map. Uses IDW (Inverse Distance Weighting) interpolation from all live weather stations to visualise wind speed and direction as flowing streamlines. Colour scale matches the site wind arrows (green/yellow/orange/red). All visual parameters are configurable from Admin &gt; XC &gt; Wind Field Overlay — particle count, trail length, line width, opacity, speed scale, max speed, lifespan, interpolation range, fade distance, and IDW power. Defaults: 1200 particles, trail 12, influence 120 km, fade from 80 km.</span><Link to="/admin/xc" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open XC Settings <ExternalLink className="w-3 h-3" /></Link></span>,
        "Airspace Visibility: Sectors render with solid colour fills at 18% opacity. CTA is blue, CTR is red, Prohibited is dark red, Restricted is orange, Danger is yellow, and others have distinct colours. Tap any sector for details.",
        "Proximity Alerts: During flight recording, if the GPS track enters an airspace sector, that sector flashes at 35% opacity with a dashed border, an 880 Hz beep sounds, and haptic vibration triggers (5-second cooldown between alerts).",
        "Dismiss Alerts: While proximity alerts are active, a red 'Dismiss' button appears on the map. Tapping it mutes flashing, beeping, and haptic for the current sector(s). An orange 'Muted' badge shows while alerts are suppressed. Alerts automatically re-arm when the pilot exits the dismissed sector and enters a new airspace boundary.",
        "Airspace Toggle During Flight: Airspace auto-enables when flight recording starts but pilots can now toggle it off mid-flight using the Airspace button. Toggling off hides the overlay, altitude slider, and legend while flying.",
        "Configurable Proximity Threshold: Tap the shield icon on the map to cycle through 50, 100, 150, 200, or 250 ft proximity buffers. The threshold is saved per pilot.",
        <span className="flex flex-wrap items-center gap-2"><span>GPS Flight Tracker: Pilots log in, tap 'Record', and the map tracks their position with a blue breadcrumb trail. Barometer altitude (GPS-calibrated, configurable sample count) is fused with GPS using a configurable weight, with a divergence guard that falls back to GPS-only if drift is too large. All smoothing parameters (EMA alpha, vertical speed alpha, baro fusion weight, calibration samples, max divergence) are tuneable from Admin &gt; Flight Tracker &gt; Signal Processing.</span><Link to="/admin/flight-tracker" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Flight Tracker <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Landing Detection: Auto-stop now requires BOTH ground speed AND vertical speed to be below their thresholds for the configured duration. This prevents false landings when a pilot is thermalling in a tight circle (near-zero ground speed but significant climb/sink rate). All thresholds are configurable under Admin &gt; Flight Tracker &gt; Auto-Start / Auto-Stop.</span><Link to="/admin/flight-tracker" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Flight Tracker <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Server Thresholds: Active pilot TTL, landed pilot TTL, phone stale threshold, and satellite max fix age are all configurable under Admin &gt; Flight Tracker &gt; Server-Side Thresholds. These control how long pilots remain on the live map and when the server falls back to satellite tracker polling.</span><Link to="/admin/flight-tracker" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Flight Tracker <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Satellite Tracker Visibility: Each satellite tracker type (Garmin inReach, SPOT, ZOLEO) can be individually shown or hidden from the pilot settings dialog. Toggle these under Admin &gt; Flight Tracker &gt; Satellite Tracker Visibility. Hidden trackers don't appear in pilot profiles — useful for hiding untested integrations until ready.</span><Link to="/admin/flight-tracker" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Flight Tracker <ExternalLink className="w-3 h-3" /></Link></span>,
        "Weather Stations: All XC sites with live weather show wind arrow markers on the map — blue for the selected site, dark for others. Wind data refreshes every 60 seconds.",
        "Mobile Site Selector: On phones, tap the site selector to open a full-height bottom sheet (85% of screen) that sits above the map. The list scrolls independently with a fixed header.",
        "Offline Tiles: Use the download button to cache map tiles for offline use when flying in areas without mobile reception.",
        "Flight History: Pilots can view all their recorded flights under XC > Flight History (up to 500 flights retained). Each flight shows site name, date, duration, distance, max altitude, and max speed. Clicking a flight opens the detail view with a track map (launch/landing markers), full stats grid, and GPS point count. Export in IGC, GPX, or KML formats for use in XContest, Google Earth, or other flight analysis tools. Pilots can delete unwanted flights (short recordings, accidental starts, etc.) from either the list view (hover to reveal trash icon) or the detail view (Delete button). Deletion is permanent and removes all GPS breadcrumb data.",
        "Pilot Messaging: Logged-in pilots can send direct messages to other pilots visible on the map. Tap any pilot or driver pin, then press the 'Message' button in the popup. A compose bubble slides up at the bottom of the map — type a message or use voice-to-text (microphone button). Messages are delivered in real-time via polling. Recipients see a slide-up notification with the sender's name and message, plus Dismiss, Thumbs-Up, or Reply buttons. Thumbs-up sends a quick acknowledgment back to the sender. Messages auto-retry with exponential backoff if the network is unavailable — 'Sending...' indicator stays visible until delivered. All messages are ephemeral and automatically purged after 24 hours. Messaging is fully functional in Demo Mode with in-memory message storage."
      ]
    },
    {
      title: "Pilot Retrieval (Outlanding Pickup)",
      icon: <Car className="w-6 h-6 text-blue-500" />,
      link: "/xc/retrieval",
      category: "Dashboard Settings",
      description: "Uber-style shared board for retrieving outlanded pilots. Drivers claim pilots, navigate to their location, and mark them as picked up.",
      steps: [
        "Auto-Entry: When a pilot ends a recorded flight, they automatically enter retrieval mode. Their last known GPS position is saved and visible to retrieval drivers.",
        "In-Flight Retrieval: Pilots can also request retrieval while still flying by tapping the 'Request Retrieval' button during an active flight. This creates the retrieval entry immediately so drivers can start heading to the area before the pilot lands.",
        "Retrieval Driver Page: Any authenticated pilot can visit /xc/retrieval (or tap 'Retrieval Driver' on XC Maps) to see a street map with all unretrieved pilots shown as orange markers.",
        "Claiming a Pilot: Tap 'Claim' next to a pilot's name. The pilot is marked as claimed, and the 'Navigate' button opens your phone's native maps app with turn-by-turn directions to the pilot's position.",
        "Driver GPS Tracking: Once claimed, the driver's position is sent every 60 seconds so the waiting pilot can see the driver approaching on their map.",
        "Cancel / Unclaim: Any driver can unclaim a pilot, returning them to the 'awaiting' pool. This allows another driver to take over if plans change.",
        "Mark Picked Up: Once the pilot is in the car, tap 'Picked Up' to complete the retrieval. Both the driver board and the pilot's status panel update immediately.",
        "Pilot's View: After ending a flight, the pilot sees a live retrieval status panel showing whether they are awaiting pickup, who claimed them, and the driver's live position on the map.",
        "Same-Day Only: The retrieval board shows only today's entries. Stale entries from previous days are automatically filtered out.",
        "Satellite Tracker Fallback: Pilots who own a satellite tracker (Garmin inReach, SPOT, or ZOLEO) can configure it in Pilot Settings (gear icon next to their name on XC Maps). When a pilot requests retrieval and their phone loses mobile signal, the server automatically polls all configured satellite trackers every 2 minutes as a fallback. If multiple trackers are configured, the freshest valid position is used. Satellite positions appear as purple/indigo markers on the driver's map with a 'SAT' badge, so drivers know the position came via satellite rather than phone GPS. When the pilot's phone reconnects, the system automatically switches back to the more frequent phone GPS updates.",
        "Garmin inReach Setup: Pilots log in to explore.garmin.com, go to My Info > Social, enable MapShare, and copy their feed name from the Raw KML Data URL. They then enter this name in the 'Garmin inReach MapShare' field in Pilot Settings. No API key required.",
        "SPOT Tracker Setup: Pilots log in to findmespot.com, go to Settings, scroll to XML Feed, and click Create XML Feed (selecting their device and all message types). The Feed ID is a long alphanumeric string shown in the feed details. Enter it in the 'SPOT Tracker' field in Pilot Settings. No API key required.",
        "ZOLEO Setup: Pilots enter their device IMEI (found in the ZOLEO app under Settings > Device Info) in the 'ZOLEO' field in Pilot Settings. Important: ZOLEO tracking requires a club-level ZOLEO Developer API key to be configured as the ZOLEO_API_KEY environment secret. Without this key, ZOLEO positions will not be fetched. Apply for developer access at developers.zoleo.com.",
        "Offline Maps Tip: The Retrieval Driver sign-in page shows a reminder to download offline maps for the local area before heading out, since flying sites often have poor mobile coverage."
      ]
    },
    {
      title: "Weather Management",
      icon: <Wind className="w-6 h-6 text-accent" />,
      link: "/admin/weather",
      category: "Dashboard Settings",
      description: "Manage live weather scraping and the three pre-cached ECMWF wind grids that power the wind map and 7-day outlook. Open via the 'Weather Management' card on the Dashboard.",
      steps: [
        "Live Weather: Fetches wind, temperature, and gust readings from all configured stations automatically every 15–30 minutes during operating hours. Click 'Fetch Now' under Live Weather Data for an immediate update. The scraper schedule (operating hours, per-source intervals, continuous mode) is set in Admin → Scheduled Tasks; the Weather page links to it.",
        "Three Wind Grids: The wind map is powered by three independent ECMWF IFS grids fetched daily. Each covers the same geographic area (Tasmania to Canberra, eastern SA to NSW coast) and runs on its own daily schedule. The manual 'Fetch Now' buttons are in the 'Grid Data' card; the daily fetch times are set in Admin → Scheduled Tasks → Grid Data Fetch.",
        "Wind (default 5:00 am): Fetches 2-day hourly wind speed, gusts, direction, temperature, weather code, precipitation, cloud cover, visibility, CAPE, and boundary layer height at 0.15° resolution (~17km). Powers the wind speed colour heatmap and particle animation on the wind map. About 7 tiles × ~3 seconds apart — takes roughly 30 seconds to complete.",
        "Thermal (default 5:26 am): Fetches CAPE, boundary-layer height, low cloud cover, and the stability data (lifted index / CIN) at 0.09° resolution (~10km) that powers the thermal overlay. The map colours thermal strength by W* (updraft velocity) derived from these; the cloud and stability fields drive the cumulus glyphs, overcast sheet, and overdevelopment warning (see Wind Map below). Takes 1–2 minutes for a full fetch. If some tiles fail, they are automatically retried up to 4 times at increasing intervals (+30 min, +60 min, +120 min, +240 min) — no action needed. The Last Run row shows the current retry status.",
        "7-Day (default 5:30 am): Fetches 8 days of weather at 0.5° resolution, keeps days 3–8 at four time slots per day (7am, 11am, 3pm, 7pm Melbourne time). Powers the 7-day outlook cards on each site's detail page. Like Wind and Thermal, its fetch time is a configurable setting on the Scheduled Tasks page.",
        "Fetch Now Buttons: Click any of the three buttons to trigger an immediate manual fetch. The button you clicked shows 'Fetching…' and spins; the other two dim to indicate they are temporarily disabled. A status panel appears below the buttons showing the active fetch name, a live tile-by-tile progress message, and an elapsed time counter (mm:ss). All three fetches respond instantly — the actual data download runs in the background.",
        "Live Progress: While a fetch is running, the status panel updates every 2 seconds: e.g. 'Wind — Tile 5/7 · 71% · 5000/6912 pts · ok — 0:18'. If a tile fails, it shows in red. When the fetch completes, the result is shown for 5 seconds before the panel clears.",
        "Configure Grid Areas: Click this button to open a map overlay showing the current geographic coverage area used by all three grids. Drag the corner handles to resize. Click 'Set Grid Area' to save — the new bounds take effect on the next Fetch Now or scheduled run. 'Reset to defaults' restores the standard coverage area (Tasmania to Canberra, eastern SA to NSW coast).",
        "7-Day Outlook: A compact daily strip on each site's weather page showing weather icon, temperature, wind, and precipitation for days 3–8. Powered by the 7-Day grid. If the 7-Day fetch has not run today, the outlook shows the most recent available data.",
        "Wind Map: Animated three-layer canvas on site pages. The colour heatmap shows wind speed (green = light, red = strong). The particle streaks animate along wind vectors. The thermal overlay (when enabled) colours thermal strength by W* (updraft velocity) — pale yellow through to crimson — and adds cumulus glyphs where cumulus can form, a grey sheet under overcast, and an overdevelopment warning triangle where the atmosphere is primed to overdevelop. Click 'Preview Wind Map' for a full-screen view.",
        <span className="flex flex-wrap items-center gap-2"><span>Thermal Map Controls (Admin &gt; Forecast): The thermal overlay is switched on/off here, and its behaviour is tunable — the clear-sky and overcast cloud percentages that set the three cloud states (clear / cumulus / overcast), the minimum W* that is painted, the storm-risk CAPE gate for the overdevelopment warning, and the default time a site map opens at. Each field defaults to the built-in value, so leaving it unchanged does nothing; changes take effect when a site map is reloaded.</span><Link to="/admin/forecast" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Forecast Settings <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Base-map Detail Range (Admin &gt; Forecast): Frames the pilot's &quot;base-map detail&quot; slider (the map icon + slider in the tapped-point readout, which darkens the base map's roads/rivers/borders back in under the overlay). You set a floor and a ceiling percentage <em>per map</em> — Wind map and Thermal map separately, because the two overlays cover the base map by different amounts. The pilot then scrubs their slider between those bounds and their position is remembered on their device. Defaults are 0–100 (full range), so leaving them unchanged keeps the slider's full sweep.</span><Link to="/admin/forecast" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Forecast Settings <ExternalLink className="w-3 h-3" /></Link></span>,
        "Troubleshooting — No colour on wind map / all grey: The Wind fetch likely failed. Check the 'Wind' last run row — if it shows an error, click 'Wind → Fetch Now'. Watch the progress panel to confirm tiles are completing.",
        "Troubleshooting — Thermal overlay missing: Check the 'Thermal' last run row. If it shows 'partial — N tiles, retry X/4 in Ymin', the auto-retry is still running — wait for it to finish. If it shows 'unresolved after 4 retries', click 'Thermal → Fetch Now' to manually retry.",
        "Troubleshooting — 7-day outlook cards blank: Check the '7-Day' last run row. If stale or errored, click '7-Day → Fetch Now'. The cards populate immediately once the fetch completes.",
        "Troubleshooting — Tide chart flat line: The wind grid data is stale (the site forecast relies on the wind grid to position the tide window). Click 'Wind → Fetch Now'. The tide chart recovers automatically after the next live weather scraper cycle (15–30 min).",
        "Ground Readout: Tapping any point on the wind map or the thermal map pins a crosshair and shows a readout that includes 'Ground' — the terrain elevation above sea level at that point. This lets you see how high the boundary layer and cloud base sit above the actual ground, not just above sea level. Tapping the Ground figure toggles the whole app between metres and feet, the same as the other altitude values. No new grid fetch or schedule is required — ground elevation is sampled directly in the browser from terrain tiles and does not depend on a server call per tap. The server route /api/weather/elevation-at remains as a fallback if a tile has not yet loaded.",
        "Base-map Detail & Town Names (pilot controls, in the readout): The tapped-point box carries two orientation aids on both the wind and thermal maps. The map icon toggles town/place-name labels on and off (drawn on top of the overlay so names stay readable over the colours). The slider beside it intensifies the base map — darkening roads, rivers and borders so the terrain shows through the heat/wind colours without dimming the data. Each pilot's choices are remembered on their own device. The slider's usable range (floor to ceiling) is set per map in Admin → Forecast → Base-map Detail Range."
      ]
    },
    {
      title: "AI Model Configuration",
      icon: <Sparkles className="w-6 h-6 text-accent" />,
      link: "/admin/ai-models",
      category: "Dashboard Settings",
      description: "Configure AI model fallback chains for text and image tasks.",
      steps: [
        "Two panels — Text Models and Image Models — each showing an ordered fallback list. If the first model fails, the next is tried.",
        "Reorder: Hover and use up/down arrows to change priority.",
        "Replace: Click the swap icon on any model, then select a replacement from the search panel.",
        "Add/Remove: Click 'Fetch Available Models' to search, then '+ Text' or '+ Image' to add. Click X to remove.",
        "Test: Click the flask icon on any model to send a test request.",
        "Reset/Save: 'Reset' restores defaults. 'Save Changes' applies immediately."
      ]
    },
    {
      title: "Public Smart Assistant",
      icon: <MessageCircle className="w-6 h-6 text-accent" />,
      link: "/admin/connections",
      category: "Dashboard Settings",
      description: "The home page AI assistant that helps pilots find site info, weather, and club resources.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Settings are on the API Settings page in the Smart Assistant card.</span><Link to="/admin/connections" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open API Settings <ExternalLink className="w-3 h-3" /></Link></span>,
        "The assistant answers questions about sites, ratings, weather, and hazards from the site database.",
        "Search Disclaimer: Add text that appears at the end of every reply. Leave blank to disable.",
        "Call-to-Action Message: A promotional message shown periodically in the chat. Set frequency (Off, every response, every 2nd–5th). Supports formatting — click 'Formatting help' for reference.",
        "Committee Contact Link: Where visitors are directed for equipment or committee queries. Defaults to /page/committee.",
        <span className="flex flex-wrap items-center gap-2"><span>To understand the rules the assistant follows when answering (eligibility, weather cautions, gust ceiling, safety gates), see the Site Logic reference.</span><Link to="/admin/site-logic" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Logic <ExternalLink className="w-3 h-3" /></Link></span>
      ]
    },
    {
      title: "Site Logic (Admin Reference)",
      icon: <Book className="w-6 h-6 text-accent" />,
      link: "/admin/site-logic",
      category: "Dashboard Settings",
      description: "Admin-only reference explaining WHY the Smart Search assistant and the site weather cards behave as they do — the rules they follow, and why they never make the fly / no-fly decision for a pilot.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Admin-only page. A point-form summary of the rules behind the Smart Search assistant and the weather displays.</span><Link to="/admin/site-logic" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Logic <ExternalLink className="w-3 h-3" /></Link></span>,
        "Why this document exists: to keep one authoritative, version-controlled explanation of how the site decides what to show — so the behaviour stays consistent and reviewable, so anyone (or any AI engine) working on the code can read and enforce the same rules, and so admins can explain to pilots and critics why the site behaves the way it does (for example, why a weather card can read SPD GOOD while the gust number looks high).",
        "Structured in three layers: Part 1 — Principles that apply to anything the site does (e.g. decisions stay with the human; compute in code, phrase with the model; assume the safest reading when context is missing). Part 2 — a fixed What/Why/How/Principles template. Part 3 — a catalogue of concrete decisions written up against the principles.",
        "The catalogue is populated: 474 documented decisions across eight domain files (in docs/site-logic/, indexed by README.md) covering the whole codebase — Smart Search & AI safety, weather & flyability, the grid pipeline, map rendering, auth & security, admin & settings, integrations & scheduling, and XC tracking & media. It can be re-scanned and extended by an AI at any time.",
        "Source of truth: the version-controlled file docs/site-logic.md in the code repository. When you run the site locally you can edit it right here — click Edit, make changes, and Save writes straight back to that file; then commit it. On the live (production) site the page is read-only. You can also just edit the file directly and commit.",
        "Use the 'Download .md' button to save the document and feed it to any AI engine (e.g. 'read this and tell me which components don't comply'). AGENTS.md in the repo points AI coding tools at the same file automatically.",
        "Search tags: site logic, smart search, smart assistant, flyability, gust, gust ceiling, gusty, wind speed, sustained wind, weather card, SPD GOOD, DIR CROSS, eligibility, PG rating, supervision, hang gliding, HG, safety gate, emergency, spiral dive, source of truth, single source of truth, AI prompt, compliance audit, AGENTS.md, GitHub repo, docs/site-logic.md."
      ]
    },
    {
      title: "Branding",
      icon: <Settings className="w-6 h-6 text-accent" />,
      link: "/admin/branding",
      category: "Dashboard Settings",
      description: "Configure club identity — name, tagline, logos, and PWA icon.",
      steps: [
        "Club Identity: Set your club name and tagline. Use {{clubName}} in CMS content to insert it dynamically.",
        "Light Logo: Displayed in the header when scrolled over the hero image (dark backdrop). Upload PNG, JPEG, SVG, or WebP. Five size variants are auto-generated.",
        "Dark Logo: Displayed in the header once scrolled past the hero and in the footer (white/light backdrop). Upload the same formats; five size variants are auto-generated.",
        "PWA Icon: Upload a custom icon that appears when a user adds the site to their phone's home screen (Progressive Web App). A square image of 512×512px or larger is recommended. Displayed separately from the main logo.",
      ]
    },
    {
      title: "Page View Analytics",
      icon: <Activity className="w-6 h-6 text-accent" />,
      link: "/admin/pageviews",
      category: "Dashboard Settings",
      description: "Track page views across the site.",
      steps: [
        "Shows every visited page sorted by view count. Admin pages are highlighted with an orange badge.",
        "Reset individual counters or click 'Reset All' to clear everything."
      ]
    },
    {
      title: "Admin Authentication",
      icon: <Lock className="w-6 h-6 text-red-500" />,
      link: "/admin/contacts",
      category: "Dashboard Settings",
      description: "Admin login and user management.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Navigate to /admin to log in. Sessions persist until you sign out.</span><Link to="/admin" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Login <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Admin access is managed in the Admin Contact Directory — tick the 'Admin' role on any contact. Admins need a surname, phone, email, and password.</span><Link to="/admin/contacts" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Contacts <ExternalLink className="w-3 h-3" /></Link></span>,
        "Logged-in admins see an 'Edit Site' link in map popups for quick access."
      ]
    },
    {
      title: "Document Management",
      icon: <FolderOpen className="w-6 h-6 text-indigo-500" />,
      link: "/admin/documents",
      category: "Management",
      description: "Browse and manage the club's Google Drive filing system, organised by Procedures Manual categories.",
      steps: [
        "10 category folders (01–10) matching the Procedures Manual structure. Click to browse subfolders and documents.",
        "New Folder: Create subfolders within any category. Upload: Add files with drag-and-drop or file picker.",
        "File Actions (⋮ menu on each file): Download to your computer, Move to a different folder, Copy to another folder, or Delete. Move and Copy let you browse into nested folders to pick any destination.",
        "Nested folders: folders can contain subfolders to any depth (e.g. Safety > Incident Reports > 2026). Click a folder to drill in, use the breadcrumb trail to navigate back up. 'New Folder' works at any level.",
        "Click any document to open it in Google Drive. Use the search bar to find documents by name.",
        <span className="flex flex-wrap items-center gap-2"><span>Google Drive connection is configured in API Settings. After updates, you may need to redeploy the Apps Script.</span><Link to="/admin/connections" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open API Settings <ExternalLink className="w-3 h-3" /></Link></span>
      ]
    },
    {
      title: "Project Management",
      icon: <Briefcase className="w-6 h-6 text-teal-500" />,
      link: "/admin/projects",
      category: "Management",
      description: "Manage site works, stakeholder relationships, and land management projects.",
      steps: [
        "Create: Click 'New Project', give it a name, set status (Active/On Hold/Completed/Archived), and link to a flying site.",
        "Parks Victoria: Tick the checkbox to reveal PV-specific fields — liaison contact and expectations notice.",
        "Stakeholder Notes: Record works required, contractor notes, landowner notes, and other stakeholders.",
        "Costing: Track budget, funding source, and approval details (who approved, when).",
        "Documents: Upload files or link existing Drive documents. Files are auto-organised into a project subfolder on Google Drive.",
        "Contacts: Link contacts from the Contact Directory with specific roles."
      ]
    },
    {
      title: "Admin Contacts",
      icon: <Contact2 className="w-6 h-6 text-cyan-500" />,
      link: "/admin/contacts",
      category: "Management",
      description: "Manage all admin contacts, safety officers, and stakeholders in one place.",
      steps: [
        "Add contacts with name, organisation, phone, email, and notes. Assign roles: Admin, Committee, Safety Committee, Social Media, Contractor, Parks Vic.",
        "Admin role = can log into admin area (requires surname, phone, email, password). Safety Committee members auto-display on the public Safety page.",
        "'Display on Committee' and 'Display on Safety' checkboxes control public visibility. These are set automatically by TidyHQ webhook sync but can be overridden manually.",
        "Position field: Set automatically when a contact is added to a TidyHQ position group (e.g. President, Treasurer). Shown on the committee widget and About page.",
        "Password Reset: Use the 'Send Reset Email' button on any admin or committee contact.",
        "Filter by role or search by name. Import from TidyHQ to pre-fill contact details.",
        <span className="flex flex-wrap items-center gap-2"><span>Contacts are available for linking in Project Management.</span><Link to="/admin/projects" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Projects <ExternalLink className="w-3 h-3" /></Link></span>
      ]
    },
    {
      title: "Safety Officer Login",
      icon: <ShieldAlert className="w-6 h-6 text-amber-500" />,
      link: "/admin/site-options",
      category: "Management",
      description: "Controls whether Safety Officers and committee members are automatically prompted to log in when their phone detects they are near a flying site.",
      steps: [
        <span className="flex flex-wrap items-center gap-2">
          <span>Navigate: Admin Dashboard → Site Options → Safety Officer Login Prompt card.</span>
          <Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">
            Open Site Options <ExternalLink className="w-3 h-3" />
          </Link>
        </span>,
        "Auto-prompt On (default): When a user with SO or committee credentials opens the website within 500 metres of any flying site, they are shown a login popup automatically. After logging in, their session is bound to that site and they can open or close it temporarily.",
        "Auto-prompt Off: The proximity popup is completely suppressed. No login prompt appears for anyone — members, visitors, or SOs — regardless of location. This is the recommended setting if the automatic popup is inconvenient (e.g. you were near a site as a member of the public and didn't want to see the login dialog).",
        <span className="flex flex-wrap items-center gap-2"><span>Manual SO login still works when auto-prompt is off: SOs and committee members navigate to /admin and log in using their credentials as normal. After logging in they will see a prompt to bind their session to a nearby site.</span><Link to="/admin" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Login <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Who can log in as SO: Only contacts with both 'Safety Committee' and 'SO Authorised' ticked in Admin Contacts. 'SO Authorised' is set manually per contact — it is not synced from TidyHQ.</span><Link to="/admin/contacts" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Contacts <ExternalLink className="w-3 h-3" /></Link></span>,
        "SO session permissions: An SO session is locked to one specific site. The SO can mark that site as temporarily closed or reopen it. They cannot access any other admin area unless they also hold the Admin role.",
        "Proximity enforcement: The server independently verifies the user's GPS coordinates are within 500 m of the site when they log in. Turning off the auto-prompt does not disable this server-side check — manual SO logins are still proximity-verified.",
        <span className="flex flex-wrap items-center gap-2"><span>To grant or revoke SO access: Edit the contact in Admin Contacts, tick or untick 'SO Authorised', then save. The change takes effect immediately on the next login attempt.</span><Link to="/admin/contacts" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Contacts <ExternalLink className="w-3 h-3" /></Link></span>
      ]
    },
    {
      title: "Public Contacts",
      icon: <UserPlus className="w-6 h-6 text-lime-500" />,
      link: "/admin/public-contacts",
      category: "Management",
      description: "Manage pilot accounts for the flight tracker and public-facing features.",
      steps: [
        "Add pilot accounts with first name, last name, email, and password.",
        "Edit existing pilots to update their name, email, or reset their password.",
        "Send password reset emails using the key icon on each pilot row.",
        "Search pilots by name or email using the search bar.",
        "Deleting a pilot also removes all their flights and sessions."
      ]
    },
    {
      title: "Sponsors",
      icon: <Handshake className="w-6 h-6 text-amber-500" />,
      link: "/admin/sponsors",
      category: "Management",
      description: "Manage club sponsors — logos, website links, and descriptions displayed on the home page and dedicated sponsors page.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Navigate: Go to 'Sponsors' from the Admin Dashboard (Content Management section).</span><Link to="/admin/sponsors" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Sponsors <ExternalLink className="w-3 h-3" /></Link></span>,
        "Add Sponsor: Click 'Add Sponsor'. Enter name (required), logo URL, website URL, and an optional markdown description.",
        "Edit: Click 'Edit' on any sponsor card to update details. Changes save immediately.",
        "Reorder: Use the sort order field to control display sequence. Lower numbers appear first.",
        "Delete: Click 'Delete' on a sponsor card — a confirmation dialog prevents accidental removal.",
        <span className="flex flex-wrap items-center gap-2"><span>Home Page Card: When sponsors exist, an 'Our Sponsors' card becomes available in the Home Page card picker. Select it to show sponsor names on the home page.</span><Link to="/admin/home" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Home Settings <ExternalLink className="w-3 h-3" /></Link></span>,
        "Public Sponsors Page: All sponsors are listed at /sponsors with their logos, links, and descriptions. Visitors reach this via the 'View Sponsors' link on the home card."
      ]
    },
    {
      title: "Scheduled Tasks",
      icon: <Clock className="w-6 h-6 text-violet-500" />,
      link: "/admin/scheduled-tasks",
      category: "Management",
      description: "Central control for all automated jobs — configure timing, enable/disable, and view cache settings.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Navigate: Go to 'Scheduled Tasks' from the Admin Dashboard (Integrations section).</span><Link to="/admin/scheduled-tasks" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Scheduled Tasks <ExternalLink className="w-3 h-3" /></Link></span>,
        "All times are Melbourne time (AEST/AEDT). The system checks once per hour whether any job is due to run.",
        "Site Guide Version Check: Checks if the SAFA site guide has a new version. If changed and auto-import is enabled, triggers a bulk site import. Default: 5:00 AM.",
        "7-Day Fetch: Downloads the 7-day weather forecast grid from Open-Meteo for all sites. Default: 5:40 AM.",
        "Image Submission Notifications: Sends email to Social Media committee contacts when new submissions are pending. Can be enabled/disabled. Default: 7:00 PM.",
        "Live Weather Scraper: Fetches live wind data at random intervals (default 15–30 min) during operating hours (default 7 AM – 8 PM). Sleeps overnight.",
        "Google Drive Sync: Automatically indexes documents from Google Drive. Must be enabled and requires Drive connection. Default: 4:00 AM.",
        "Run Now: Use the 'Run Now' button on the Drive Sync card to trigger an immediate sync without waiting for the schedule.",
        "Cache Timers: The bottom section shows 8 configurable cache duration settings. Adjust how long various data caches are retained before refreshing: Admin Session TTL (hours), TidyHQ Member Cache (minutes), BOM Tide Predictions Cache (hours), Astronomical Tide Cache (minutes), TidyHQ Events Cache (minutes), Search Context Cache (minutes), Asset Register Cache (minutes), and FreeFlightWx Cache (seconds). Each has min/max constraints. Changes apply on next cache refresh cycle.",
        "Save: Click 'Save All' to apply changes. New schedule times take effect from the next hourly check."
      ]
    },
    {
      title: "Cameras",
      icon: <Camera className="w-6 h-6 text-sky-500" />,
      link: "/admin/webcams",
      category: "Management",
      description: "The Flowerdale webcam archive. Every image from the camera operator's feed is copied to the club's own storage in three sizes, so the public Cameras page can show any day, a timelapse, and North/South side by side.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Navigate: Admin Dashboard → 'Cameras'.</span><Link to="/admin/webcams" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Cameras <ExternalLink className="w-3 h-3" /></Link></span>,
        "Status line: each camera source shows 'Live' (images arriving), 'Overnight, nothing expected', 'Stale, no new images' (the feed has gone quiet during the day) or 'Offline'. 'Last error' explains any failed fetch — if it says the host can't be reached, the operator's site is down or blocking us.",
        "Facts panel: newest and oldest image, number of images stored, space used, when the last fetch started, the last fetch that stored something (or found nothing new), and whether the first-time 8-day backfill has run.",
        "Run now: fetches new images immediately instead of waiting for the schedule. The first run backfills the operator's last 8 days over several runs. Automatic fetching only happens on the live site.",
        "Source settings: name, the camera's time zone, the feed address, the hours to check the feed ('Check feed from/until'), and the hours images are normally expected (used for the status line). Click 'Save source settings'.",
        "Camera clocks: turn on '<camera> camera clock ignores daylight saving' if that camera's clock stays on standard time all year (Flowerdale North does). Saving re-times the images already stored so North and South line up.",
        "Storage and retention: how many days of images to keep (minimum 7; the club uses 60) — change it and click 'Save'; it applies at the next nightly cleanup. 'Preview cleanup' shows how many expired images would be removed without deleting anything; if there are some, a red 'Delete N expired images now' button appears. A warning email goes to the admins if the archive passes 25 GB, which would mean the cleanup has stopped working.",
        <span className="flex flex-wrap items-center gap-2"><span>Hide the public Cameras page: Admin → Site Options → Cameras page switch. Hiding it removes the Community menu link and the weather-card link; the live tiles on weather cards and the archiving carry on.</span><Link to="/admin/site-options" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Site Options <ExternalLink className="w-3 h-3" /></Link></span>,
      ]
    },
    {
      title: "API Settings",
      icon: <Settings className="w-6 h-6 text-blue-500" />,
      link: "/admin/connections",
      category: "Management",
      description: "Configure external service integrations — Google Drive, Google Sheets, weather APIs, AI models, and TidyHQ.",
      steps: [
        "Each service has a status card (green = active, amber = needs setup). Click to expand and configure.",
        "Google Drive: Enter the Apps Script URL. Click 'Script' to view/copy the bridge script. 'Test Connection' to verify. 'Setup Folders' creates the full 01–10 folder structure.",
        "Disconnect/Migrate Drive: 'Disconnect Drive' removes the link (files stay in Drive). To migrate, disconnect, deploy a fresh script on the new account, run 'Setup Folders', move files, then 'Sync Documents'.",
        "Document Indexing: 'Sync Documents' indexes all Drive files for AI search. Only files in 09_Public Reference are visible to public search. Supports PDFs (text extracted via Google conversion).",
        "PDF Setup (one-time): Enable Drive API in the Apps Script editor, run '_authoriseScopes', then deploy a new version.",
        "Google Sheets (Asset Register): Separate Apps Script URL from Drive. Includes CSV templates and test connection.",
        "Open-Meteo / Weather Underground: Informational — no configuration needed. Station selection is per-site.",
        "TidyHQ Group Sync: Map TidyHQ groups to website roles (Committee, Safety Committee, Position Title, Contractor, Parks Vic). When group membership changes in TidyHQ, the website updates automatically via webhook. The sync log shows recent events. See the Procedures Manual (Officer Toolkit) for handover steps."
      ]
    },
    {
      title: "Image Processing",
      icon: <ImageIcon className="w-6 h-6 text-pink-500" />,
      link: "/admin/images",
      category: "Content Management",
      description: "Central hub for all site images. Uploads create hero (1920×1080), banner (1920×600), and three slider sizes automatically.",
      steps: [
        "Dual Grid: Hero images on the left, banner images on the right. Slider images below in three galleries (Landscape Large, Landscape Small, Portrait).",
        "Upload/Enhance: Upload a photo, then choose 'Use Original' (resize only) or 'Smart Enhance' (AI-powered sunny atmosphere). Level the horizon with the ±10° slider before processing.",
        "Photographer Credit & Watermark: Enter the photographer's name in the 'Photographer Credit' field before processing. A clean '© Name' watermark (text with drop shadow, no background box) is placed on all output images (hero, banner, sliders, content). The watermark auto-detects light/dark backgrounds for optimal contrast. When a photographer name is entered, two controls appear: a Size slider (5%–50%, default 10%) and a Position selector with 6 positions — Bottom-Right (BR, default), Bottom-Left (BL), Bottom-Center (BC), Top-Right (TR), Top-Left (TL), Top-Center (TC). In the crop wizard, a live watermark preview shows exactly where the text will appear on each cropped image, updating in real-time as you change position or size. The watermark is applied at the final output step so each crop gets its own clean watermark. Available in all three upload flows: Hero & Banner modal, URL import, and Manual/Guide Image upload.",
        "URL Import: Paste an image URL and click 'Add URL' to download and add it to the library.",
        "Category Tagging: Click the wave icon (Coastal) or mountain icon (Inland) on each hero image. New sites without images auto-receive a matching banner.",
        "Slider Carousel: Click the gallery icon on slider images to toggle inclusion in the home page photo carousel.",
        "Generate Missing Slider Images: A repair button that appears automatically below the hero grid only when one or more hero images are missing their slider crops (Landscape Large, Landscape Small, or Portrait). Clicking it regenerates the missing sizes from the existing hero image. This can occur after an interrupted upload or a URL import that did not complete all sizes. The button is hidden when all slider images are present — no action is needed in normal operation.",
        "SkyHigh Image Wall: All library images are automatically displayed on the public /club-photos page in a mosaic layout. Newest images appear first. Images cycle through Hero → Banner → Landscape Large → Landscape Small → Portrait slots until every unique image is used. Community photo uploads also support photographer credit — enter a name in the upload dialog.",
        <span className="flex flex-wrap items-center gap-2"><span>Using Images: Select them on Home Page settings (hero backgrounds) or Site Edit pages (site banners). Use the image toolbar in News/Pages to insert from the library.</span><Link to="/admin/home" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Home Settings <ExternalLink className="w-3 h-3" /></Link><Link to="/admin/sites" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Sites Admin <ExternalLink className="w-3 h-3" /></Link></span>,
        "Ideal Sizes: Hero backgrounds 1920×1080, site headers 1920×600, general content 1200×800. Images are auto-compressed on upload.",
        "Permanent Cloud Storage: All uploaded images are stored in Cloudflare R2 cloud storage (or namespaced local storage). They are organized into logical folders: images/sites/, images/hero/, images/sliders/, branding/, and submissions/. This structure ensures high performance and prevents data loss during system updates.",
        "Google Drive & Dropbox: Sharing links are auto-converted to direct image URLs when pasted into image fields."
      ]
    },
    {
      title: "Sizzle Till Setup",
      icon: <Flame className="w-6 h-6 text-orange-700" />,
      link: "/admin/sizzle",
      category: "Events — Sausage Sizzle",
      description: "The Sausage Sizzle Till is a full-screen cash register for the club sausage sizzle at the 2026 NTVO (31 Oct – 3 Nov 2026), built for one iPad in landscape. It works without signal: every sale is saved on the iPad first and copied to the club website whenever there's a connection. Card payments are taken on a separate Stripe device — the till never touches card details. The till is behind the admin login, hidden from search engines, and not in any menu; the only link is the Admin Dashboard tile.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Open it: Admin Dashboard → 'Sausage Sizzle Till', or go to /admin/sizzle. You must be logged in as an admin.</span><Link to="/admin/sizzle" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Sizzle Till <ExternalLink className="w-3 h-3" /></Link></span>,
        "Log the iPad in (each morning): open the 'Sizzle Till' home-screen icon (set up below) and log in there with an admin account. The icon keeps its own login and its own saved sales, separate from Safari — logging in to Safari does not log the icon in, and sales rung up in one don't show in the other, so always use the icon. Volunteers use the till under that login — never give them the password. The login lasts as long as the 'Admin Session TTL' (Scheduled Tasks → Cache Timers, 24 hours by default), so log in again each morning. If it expires mid-service the till asks for a login; sales already rung up stay safe on the iPad and upload after you log in.",
        "Add to Home Screen (once): in Safari, type skyhighparagliding.org.au/admin/sizzle in the address bar, then tap Share → 'Add to Home Screen' → Add. A 'Sizzle Till' flame icon appears (if the icon opens the main website instead, delete it, reload /admin/sizzle in Safari and add it again); opening it runs the till full-screen with no browser bars. Turn the iPad's rotation lock off and use it landscape.",
        "Offline start-up: after the till has been opened once with signal, it loads and stays logged in even if the iPad is refreshed with no signal. Don't delete the home-screen icon or clear Safari website data during the event — that is where the sales are stored until they upload.",
        "Set the admin PIN (once): tap the 'Admin' tab and choose a 4–8 digit PIN (enter it twice). The PIN protects prices, stock and portions from volunteers; it stays unlocked for 10 minutes. Forgot it? Tap 'Forgot PIN?' and enter the website password of the admin logged in on the iPad (needs signal) — that clears the PIN so you can set a new one.",
        "Help on the iPad: the Admin and Money tabs each have a blue 'Help' button. It opens a window explaining every box on that tab (e.g. leave Sell prices blank to use the calculated price). Drag its blue title bar to move it and the corner at bottom right to resize it.",
        "Phones selling too (Admin tab → Phones): type a name (e.g. 'Sam's phone'), tap 'Add phone' and a QR code appears. On that phone, open the camera, point it at the code and tap the link — the phone opens the phone till, already set up. The QR works once, for 10 minutes. The phone gets a till-only pass for this event that ends 2 days after the last day: it can ring up sales and see prices and stock, but it can't open the admin site, change prices or see the money records. No website password goes on a volunteer's phone. On the phone, tap Share → 'Add to Home Screen' so the till is one tap away.",
        "How the devices share: every device saves each sale on itself first (so selling never needs signal), uploads to the club website, and downloads everyone else's every 15 seconds. End of day, Money and stock counts on the iPad cover every phone. Phones take cash too, into the one shared cash box. Prices, the PIN and stock changes are set on the iPad and reach the phones automatically. 'Void last sale' only voids that device's own last sale.",
        "The phone till: one screen — item cards, 'Void last sale', the order (with − and + on each line), the total, and Cash / Card. A slim bar at the top shows the phone's name, the day and 'Synced' (or how many sales are waiting to upload — tap it to try now). Card: tapping Card copies the amount (e.g. 5.00) so it can be pasted into the Stripe app's amount; if Stripe won't paste, just type the big number shown.",
        "Lost phone or volunteer gone home: Admin tab → Phones → 'Cancel' beside that phone. It stops working straight away (its sales already uploaded are kept). The list also shows when each phone last synced.",
        "Docs tab: every document for this event — initial shopping list, each day's top-up and the 2-day versions, equipment and compliance checklists, price board, float & cash-up sheet, costing & power, card guide, and the treasurer's report — built from the till's current numbers (customers per day, prices, stock plan). 'View / Print' opens it on the device (Print → Save to Files for a PDF). 'Save to Drive' files a PDF in the club Google Drive: planning documents in 08_Projects, money records in 03_Financial Records, each in a 'Sizzle <event>' folder, named with the date and time so nothing is overwritten. 'Save all planning docs to Drive' does the lot. Works from any signed-in device — the iPad, or the computer at home.",
        "Saved to Drive automatically: closing a day at End of day files that day's end-of-day summary (03_Financial Records) and the next top-up list (08_Projects); adding a purchase with a receipt photo files the photo (03_Financial Records); Money → 'Report to Drive' files the treasurer's report. A message says if a save didn't work (no signal, Drive not connected, or the website can't make PDFs yet) — nothing is lost, the records are still on the iPad and the website.",
        "Starting the next event (Admin tab → Event): tap 'Start a new event…', give it a name (e.g. '2027 NTVO'), the first day and the number of days, and the customers expected each day. Every device switches to it within a minute; phones need a new QR code. The previous event and all its sales and money records are kept, and 'Switch to …' beside 'Other events' goes back (e.g. if a new event was started by mistake). Products and Woolworths prices carry over from the data file, so ask for a Bright price check before a new event; the checklists' dated items (e.g. Statements of Trade deadlines) are still the 2026 ones until the data file is updated.",
        "Check prices before opening: the sell prices come from the costing (cost per serve including the card fee, × 1.10, rounded up to the next whole dollar). If the shop cost something different, or you want a round price, change it under Admin (see 'Sizzle Till Admin & Data').",
        "Check stock before opening: the till assumes you bought exactly the initial shopping list. If you bought different pack sizes or counts, go to Admin → Stock on hand and use 'Set on-hand' with what is actually in the Dometic, esky and boxes.",
        "Pick the trading day: the D1–D4 buttons at the top right. The till picks today's date automatically; check it's right each morning. Every sale is tagged with that day.",
        "Starting float: the recommended float (with the reasoning) is on the printed Float & Cash-up sheet. On the till, the End of day tab shows the float counts — change them to what is actually in the cash box at the start.",
        "Stripe device: before Day 1 the organiser logs the phone or reader into the Stripe Dashboard app with a volunteer-level team login (never the admin login), checks the account time zone is Melbourne, and does a $1 test payment and refund. Charge it and the power bank overnight.",
        "Header bar: tabs (Sell, End of day, Money, Admin, Data), the day buttons, and the backup badge. 'Backed up' = every sale has reached the website. 'N to upload' (amber) = sales are safe on the iPad and waiting for signal. A crossed-out cloud = the iPad has no connection. Tap the badge to try uploading straight away.",
      ]
    },
    {
      title: "Sizzle Till Selling",
      icon: <Flame className="w-6 h-6 text-orange-700" />,
      link: "/admin/sizzle",
      category: "Events — Sausage Sizzle",
      description: "Taking an order and payment. The left side has one big tile per item; the right side is the order and total. Cash and card both end with the sale being recorded and the stock reduced.",
      steps: [
        "Build the order: tap an item tile once per item (the white bubble on the tile shows how many). In the Order panel use − and + to fix quantities, or 'Clear' to start again. The big number is the total.",
        "Cash: tap 'Cash'. Tap the note the customer hands over ($5, $10, $20, $50 — notes smaller than the total are greyed out), 'Exact' for the exact amount, or type another amount in 'Other' and tap OK. The till shows CHANGE in big green numbers with the notes/coins to give (e.g. '1 × $10 + 1 × $2'). Hand over the change, then tap 'Change given — done'. 'Back' returns to the note buttons.",
        "Card: tap 'Card'. The till shows 'Key this amount into Stripe' with the total in very large numbers. Enter exactly that amount on the Stripe device and let the customer tap. Approved → tap 'Card approved' (only now is the sale recorded and the stock reduced). Declined or no signal on the Stripe device → tap 'Declined — back'; the order stays on screen so you can take cash instead.",
        "Same price for cash and card, no minimum, no surcharge. Never type an amount into Stripe from memory — always the till total.",
        "Saved instantly: each sale is written to the iPad the moment you confirm it, before anything else. A green message confirms it. If you ever see 'NOT SAVED', try again — the sale was not recorded.",
        "Stock on the tiles: the small 'N left' is how many more of that item can be made before its scarcest ingredient runs out (e.g. bread for sausages, cups for coffee), based on the portion sizes. It turns red under 15. An amber 'Low stock' banner lists the ingredients that are running short. 'SOLD OUT?' means the till thinks it's gone — check the real stock; if there's more, correct it in Admin → Stock on hand.",
        "Undo / void last sale: the dashed tile. It shows the most recent sale of the day (time, items, cash/card, total). 'Void sale' cancels it and puts the stock back. For a cash sale, give the money back from the cash box. For a card sale the till can't refund — take the customer's name and number; only the organiser does refunds in Stripe. Voided sales stay in the records, marked voided, and are excluded from all totals.",
        "Only the last sale can be voided. If an older sale was wrong, leave it and note it on the cash-up sheet so the variance is explained.",
        "No signal? Keep selling — nothing is lost. The badge counts sales waiting to upload; they go up automatically when signal returns (it retries every 30 seconds).",
      ]
    },
    {
      title: "Sizzle Till End of Day",
      icon: <Flame className="w-6 h-6 text-orange-700" />,
      link: "/admin/sizzle",
      category: "Events — Sausage Sizzle",
      description: "Close the day: check sales, count the cash (cash only — card is checked separately against Stripe), count the stock, and get tomorrow's shopping list. Make sure the day buttons show the day you're closing.",
      steps: [
        "Sales by item: quantity, cash, card and total for each item, with the count of cash sales, card sales and voided sales.",
        "Card (Stripe): the till's card total and number of card sales. Open the Stripe Dashboard → Payments, filter to today, and type the GROSS total of successful payments (not payouts — payouts have fees taken out and arrive days later) into 'Stripe Dashboard — gross today'. The variance should be $0.00. A difference usually means a card payment that was approved on Stripe but 'Card approved' wasn't tapped (or the reverse). 'Estimated card fees' is what Stripe will deduct (1.65% + 25c per card sale with Tap to Pay).",
        "Cash-up: 'Starting float' holds the count of each note/coin put in the box this morning. 'Counted at close' — count everything in the cash box by denomination and type the counts in. The right-hand column shows Float + Cash sales = Expected, then Counted and the Variance. Green = balanced, amber = over, red = short. Card sales are never part of the cash count.",
        "Stock count: count what's left of each product and type it in, in the units shown ('sausage', 'slice', 'can', 'bottle', 'g', 'ml'…). For sauces and milk, estimate (a half-full 500 mL bottle = 250). Leave a box blank to keep the till's estimate. For everyday supplies (gloves, foil, bin bags, paper towel, soap, sanitiser, detergent, ice) the estimate already assumes one day's use.",
        "Save count & close Day N: saves the float, cash count, Stripe total and stock count, and sets the stock on hand to your counts. You can correct a count and save again. A 'Closed' badge shows the time it was saved.",
        "Next-day top-up: below the count, the till builds tomorrow's Woolworths list = what tomorrow needs (plus a small safety margin on sausages, veg sausages, bread and onions) − what you counted, rounded up to whole packs, with the estimated cost. Day 4's list has no safety margin, to minimise leftovers. Ice is always bought fresh (it doesn't carry over).",
        "Customer estimates: above the top-up list the till shows how many customers you served today (one completed sale = one customer) and a box for each later day. Type how many you now expect — the top-up list changes as you type. Tap 'Save estimates' so the Admin tab and other screens use them too (printing the top-up saves them automatically). Sell prices never change with these numbers.",
        "2-day top-up: tap '2 days' for a list covering the next two days — use it if we fly at Gundowring and can't get to Bright daily (the Dometic keeps the meat and onions cold). Buy the second day's ice near the site, not a day early.",
        "PDFs on the iPad: 'End-of-day PDF' (sales, cash-up, card check, stock) and 'Top-up PDF' (same layout as the printed shopping lists, with tick boxes, stockcodes and fallbacks). Each opens a print view: tap 'Print / Save as PDF', then in the iPad print screen tap the Share icon and choose Save to Files, Google Drive, AirDrop, Mail or Messages to send it to whoever does the shop. Tap 'Close' to return to the till.",
        "Paper backup: also fill in the printed Float & Cash-up sheet (cash and card sections), and have two people sign it.",
      ]
    },
    {
      title: "Sizzle Till Money (Treasurer)",
      icon: <Flame className="w-6 h-6 text-orange-700" />,
      link: "/admin/sizzle",
      category: "Events — Sausage Sizzle",
      description: "The Money tab (PIN-protected) is the treasurer's view of the whole event: sales, actual spend from receipts, Stripe fees, the net result, cash banked, leftover stock and lessons for next time. Every sale and record is tagged with the event (this one is '2026 NTVO', id 2026-ntvo) so a future sizzle never mixes with it.",
      steps: [
        "Open: Till → 'Money' tab → admin PIN (the same PIN as the Admin tab; one unlock covers both for 10 minutes).",
        "Summary tiles: Sales (with the cash/card split), Purchases (number of receipts, and the planned spend for comparison), Stripe fees (estimated until you enter the actual figure), Net result = sales − purchases − Stripe fees (green if positive), Cash still to bank, and Leftover stock valued at what it cost (not included in the net result; ice is never counted because it melts).",
        "By day: number of sales, cash, card, total and the planned sales for each day, plus the cash variance and Stripe variance from each End-of-day close. 'not closed' means that day's End of day hasn't been saved yet — do that first or the variances are blank.",
        "Purchases — enter EVERY shop from its receipt, the same day: date, which day it was for (or 'Before Day 1' for the initial shop), store, receipt total, what for (Initial shop, Top-up shop, Ice, Gas, Equipment, Other), who paid (for reimbursement) and a note. Tap 'Photo' to photograph the receipt with the iPad camera — the photo is shrunk and saved with the record (tap the receipt icon to view it). Tap 'Add'. The bin icon removes an entry (it stays in the history marked removed). Keep the paper receipts too.",
        "Cash banked: each time cash takings leave the cash box (banked, or handed to the treasurer), record the date, which day's takings, amount, who and a deposit reference. Leave the float in the box. 'Cash still to bank' = cash sales ± the counted variances − banked; it should be $0.00 at the end.",
        "Stripe — actual figures: after the event, in the Stripe Dashboard open Balances/Payouts (or Reports) for 31 Oct – 3 Nov and enter the gross card payments, total fees and net paid out, with the payout reference, then Save. From then on the report uses the actual fees instead of the estimate. The line underneath compares Stripe's gross with the till's card total.",
        "Treasurer's report PDF: the whole event on A4 — summary, by-day table, sales by item, every purchase (and whether a receipt photo exists), cash banked, the Stripe figures, leftover stock, 'For next time' notes, planned vs actual buying per customer, sales by half-hour, and signature lines. Opens in the print view: 'Print / Save as PDF' → Share → Save to Files / Google Drive / Mail.",
        "Report CSV: the same figures one line each (days, items, purchases, fees, net result, banking) for the treasurer's spreadsheet.",
        "Next-event planning file: downloads a JSON file with what actually happened — customers per day vs planned, first/last sale and busiest half-hour, the real buying mix per customer (sausages, veg share, hot/cold drinks…), card share and items per card sale, average spend, leftovers and actual vs planned spend — plus 'suggestedConfig', ready to paste into the next event's data file. Upload it to the club Drive with the treasurer's report.",
        <span className="flex flex-wrap items-center gap-2"><span>Treasurer on a computer: log in to the website, open the till (Admin Dashboard → Sausage Sizzle Till), go to Data → 'Restore from server' to copy this event's sales and records onto that computer, then open Money. (Records only reach the server once the iPad has had signal — check the iPad's badge says 'Backed up'.)</span><Link to="/admin/sizzle" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Sizzle Till <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>After the event: upload the Treasurer's report PDF, the Report CSV, the Transactions CSV (Data tab), the next-event planning file and scans of the paper receipts to the club Drive (suggested: 03_Financial Records → '2026 NTVO Sausage Sizzle').</span><Link to="/admin/documents" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Documents <ExternalLink className="w-3 h-3" /></Link></span>,
        "History is kept: the website keeps every event's sales and records permanently, tagged by event, so 2026 NTVO can be compared with the next sizzle. A new event gets a new data file with a new event id (e.g. 2027-ntvo).",
      ]
    },
    {
      title: "Sizzle Till Admin & Data",
      icon: <Flame className="w-6 h-6 text-orange-700" />,
      link: "/admin/sizzle",
      category: "Events — Sausage Sizzle",
      description: "PIN-protected settings (prices, stock, portions, card assumptions) and the Data tab for backups, exports and restoring onto another iPad. Settings changed here apply to this iPad's till; they don't change the printed PDFs.",
      steps: [
        "Unlock: tap 'Admin' and enter the PIN. Tap 'Save prices & settings' after changing prices, card assumptions, onions or portions.",
        "Sell prices: leave blank to use the calculated price (shown underneath with the cost per serve). Type a number to fix the price of that item. The new price shows on the Sell tiles immediately.",
        "Card assumptions: 'Card share of sales (%)' (planned 70%) and 'Items per card sale' (planned 2). These drive the card fee built into the calculated prices.",
        "Serve onions: untick if the store had no pre-cut onion (we never use whole onions). Onion is then left out of the stock and costing.",
        "Portions per serve: sausages, slices, onion grams, sauce mL, mustard grams, serviettes, tea bags, coffee grams, sugar grams, milk mL, cups, stirrers. Sauce, sugar and milk are averages across all customers. Blank = the planned value (shown as 'file'). Portions change the stock depletion and the costing.",
        "Shelf prices: what Woolworths actually charged, if different from the planned price. Changes flow into the cost per serve and the calculated sell prices.",
        "Customers per day (Admin tab, top): the number of customers expected each day, with the original plan and the real count so far beside each box. Before the event, enter your estimate for every day, tap 'Save customer numbers', then 'Initial shopping list' to print it or save it as a PDF. Quantities follow these numbers; sell prices don't. During the event, update them at End of day.",
        "Stock on hand: after a top-up shop, type the number of PACKS bought against each product and tap 'Add delivery (packs)'. To correct a count, type the actual UNITS and tap 'Set on-hand (units)'. The table shows the current on-hand estimate; a red number means the till has sold more than it thought you had — recount.",
        "Data → Server backup: 'Sync now' uploads anything waiting. 'Restore from server' copies every sale and record for this event (2026 NTVO) from the club website onto this device — use it on a replacement iPad (log in, open the till, Data → Restore from server). Nothing is deleted.",
        "Data → Export: 'Full backup (JSON)' saves everything on the iPad to a file (keep a copy at the end of each day). 'Transactions (CSV)' is one row per item per sale, including cash/card, tendered, change and voided — opens in Excel or Google Sheets. 'Stock (CSV)' is the current on-hand estimate per product.",
        "Data → Import: 'Import a JSON backup' merges a Full backup file into this iPad (sales with the same id are replaced by the file's copy).",
        "One till iPad: use one iPad for the till. A second device would keep its own stock count.",
      ]
    },
    {
      title: "Sizzle Shopping Lists & PDFs",
      icon: <Flame className="w-6 h-6 text-orange-700" />,
      link: "/admin/sizzle",
      category: "Events — Sausage Sizzle",
      description: "The printed documents for volunteers and the committee, and how prices, quantities and the float were worked out. These are generated on the developer's computer from one data file; regenerate them after any price or quantity change.",
      steps: [
        "The documents: 01 Initial shopping list (Day 1 perishables + non-perishables for all four days); 02 Day 2, Day 3 and Day 4 top-up lists, plus 'Days 2–3' and 'Days 3–4' combined lists for when we can't get to Bright daily; 03 Equipment checklist (own/borrow/buy, who's bringing it, est. cost); 04 Compliance checklist (with links); 05 Price board (large print for the stall, 'Cash or card — tap & pay, no minimum'); 06 Float & cash-up sheet (with a card/Stripe section and signatures); 07 Costing & power summary (committee record); 08 Card payments — volunteer quick guide.",
        "Shopping list layout: grouped by area of the store, with a tick box, the exact shelf name, brand, pack size, number of packs, price, line total, Woolworths stockcode (a link to the product), and notes: 'CONFIRM IN STORE' where the Bright stock or pack contents weren't certain, 'NOT OWN BRAND' where no Woolworths/Essentials product exists, and a fallback to buy if it's missing. Specials are noted but costed at the regular price. Gas isn't sold at Woolworths and is shown separately as an estimate.",
        "Where prices came from: Woolworths online with the store set to Woolworths Bright (87–91 Gavan St, 03 5732 3900), regular shelf prices, checked 19 Oct 2026. Every PDF says this in its header.",
        "Onions: the only pre-cut onion Woolworths sells is 'Prep Set Go Frozen Diced Onions'. It thaws in the Dometic overnight. If Bright has none, untick 'Serve onions' on the till and skip them — never use whole onions.",
        "How sell prices are set: cost per serve = ingredients (e.g. 1 sausage, 1 slice, 20 g onion, sauces, serviette) + a share of the day's supplies (gas, gloves, foil spread over food; ice over cold drinks; bin bags, soap etc. over everything). The Stripe fee is added BEFORE the 10% markup: price = 1.10 × (cost + card share × 25c ÷ items per card sale) ÷ (1 − 1.10 × card share × 1.65%), then rounded UP to the next $1. The costing PDF also shows the worst case (every sale a single-item card sale) and flags any item whose price would change.",
        "Quantities: customers per day (75, 75, 75, then 62 on Day 4) × the lunch mix (1.3 sausages per customer of which 12% veg, 0.5 hot drinks, 0.6 cold drinks) × portion sizes, rounded up to whole packs. Small perishables carry a safety margin on Days 1–3; Day 4 has none to minimise leftovers.",
        "Float: worked out from the likely baskets and notes ($20, $10, $50, $5, exact) for the 30% of customers expected to pay cash. Notes cover the lunch rush (they come back in as people pay); $1 and $2 coins cover the whole day (they rarely come back). The reasoning is printed on the Float & Cash-up sheet.",
        "Power: the Bluetti Elite 300 runs only the kettle (≤ 2,200 W; 2,000 W preferred — the two AC sockets share 10 A). The Elite 100 runs only the Dometic from its 12 V socket. Recharge both every night; the figures are on the costing & power PDF.",
        "Regenerating (developer task): prices, portions, the lunch mix, customers per day, equipment and compliance items all live in data/sizzle/sizzle-2026.json in the website code. For the next event, copy that file, give it a new event id and name, paste in the 'suggestedConfig' from this event's next-event planning file, and re-check prices. After editing it, run 'npm run sizzle:pdfs'; the PDFs are written to output/sizzle/ on that computer. 'npm run sizzle:simulate' runs a simulated 75-customer lunch to check stock and change.",
        <span className="flex flex-wrap items-center gap-2"><span>Getting them to the club Drive: PDFs are NOT uploaded automatically. Upload them through Document Management (suggested: 08_Projects → a 'Sausage Sizzle 2026' folder), and re-upload after regenerating so the Drive copies aren't stale.</span><Link to="/admin/documents" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Documents <ExternalLink className="w-3 h-3" /></Link></span>,
        "Compliance (see the checklist PDF): FoodTrader Class 4 notification to the club's principal council; Statements of Trade for Alpine Shire AND Indigo Shire lodged at least 5 days before trading (by Mon 26 Oct 2026), then withdraw the unused one; confirm with the Alpine Shire environmental health officer because the state fundraiser guidance covers up to two consecutive days and this event is four; check Fire Danger Period / Total Fire Ban each morning before lighting the BBQ.",
      ]
    },
    {
      title: "Troubleshooting",
      icon: <AlertCircle className="w-6 h-6 text-accent" />,
      link: "/admin",
      category: "Troubleshooting",
      description: "Common issues and how to diagnose them. Railway deployment logs are the primary diagnostic tool for server-side problems.",
      steps: [
        "Check Railway Logs: Go to railway.com → log in with the club's web@skyhighparagliding.org.au account → select the skyhigh project → click the web service → Deployments tab → click the active deployment → 'View Logs'. Logs update in real time and show all weather scraper activity, errors, and API calls.",
        <span className="flex flex-wrap items-center gap-2"><span>Tide Chart Flat Line: The ECMWF weather grid data is stale. In Railway logs, look for 'extractSiteForecast: [datetime] not in grid — fine grid is stale'. Fix: go to Weather Management and click 'Fetch Now'. The chart recovers automatically after the next scraper cycle (15–30 min).</span><Link to="/admin/weather" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Weather Management <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Weather Data Stopped Updating: In Railway logs, check for 'Updated ECMWF forecasts for 0/X sites'. This means the ECMWF grid fetch is failing (usually rate limiting or a network timeout). Click 'Fetch Now' in Weather Management. If the problem persists, check Open-Meteo API status — the free tier has no auth and is sometimes temporarily unavailable.</span><Link to="/admin/weather" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Weather Management <ExternalLink className="w-3 h-3" /></Link></span>,
        "Images Not Loading: Check the Cloudflare R2 bucket at dash.cloudflare.com (log in with web@skyhighparagliding.org.au). The bucket is skyhigh-media. Verify CORS settings are still active (should allow GET from any origin). If the public URL returns 403, R2 public access may need to be re-enabled.",
        "Emails Not Sending: Go to resend.com → log in → check the dashboard for bounced or failed delivery events. Verify the domain skyhighparagliding.org.au is still Verified (green). DNS is at Cloudflare (dash.cloudflare.com, web@ account; all records DNS-only). If the Resend or Gmail DKIM/SPF/DMARC records are removed there, domain verification lapses and emails fail. Plain-language DNS notes: docs/dns-handover.md in the code.",
        <span className="flex flex-wrap items-center gap-2"><span>TidyHQ Sync Not Updating Website: Go to Connections &amp; APIs → TidyHQ. Check the sync log for recent webhook events. If blank, check that the webhook URL is still registered in TidyHQ Admin → API → Webhooks. The webhook fires on membership changes, group changes, and contact updates.</span><Link to="/admin/connections" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open API Settings <ExternalLink className="w-3 h-3" /></Link></span>,
        <span className="flex flex-wrap items-center gap-2"><span>Admin Login Not Working: If an admin can't log in and can't receive a password reset email (email failing), another admin can update the password directly via Admin Contacts → open the contact → enter a new password → Save.</span><Link to="/admin/contacts" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Admin Contacts <ExternalLink className="w-3 h-3" /></Link></span>,
        "Site not appearing after Save: Check the browser console for errors. The most common cause is a PostgreSQL type validation error from a partially edited field. Open the site again, check all fields are valid, and save.",
        "Sizzle Till shows the login page with no signal: the till can only start offline after it has been opened once with signal on that iPad (that's when it saves itself for offline use). Get signal, open the till once, then it will work offline. Never clear Safari website data or use Private Browsing for the till.",
        "Sizzle Till badge stays amber ('N to upload'): the sales are safe on the iPad. Check the iPad has signal, then tap the badge. If the Data tab says the login has expired, log in again on the website — uploads resume by themselves.",
        "Sizzle Till card total doesn't match Stripe: compare the till's card sale times (Data → Transactions CSV) with Stripe's payment list. Usually a payment was approved on the Stripe device but 'Card approved' wasn't tapped, or a declined payment was marked approved. Check the Stripe account time zone is Melbourne.",
        "Deployment Failed on Railway:Go to railway.com → skyhigh project → Deployments tab. Click the failed deployment to see build logs. Common causes: npm install failure (check for package version conflicts), TypeScript compile error (the build command runs tsc), or a missing environment variable (Railway Variables tab).",
      ]
    },
    {
      title: "Markdown Formatting Guide",
      icon: <FileText className="w-6 h-6 text-indigo-500" />,
      link: "/admin/pages",
      category: "Reference",
      description: "Formatting reference for News and Dynamic Pages content.",
      steps: [
        <div key="md-1"><code># Heading</code>, <code>## Sub-heading</code> — <strong>**bold**</strong>, <em>*italic*</em></div>,
        <div key="md-2"><code>[Link text](url)</code> — <code>- bullet item</code> — <code>1. numbered item</code></div>,
        <div key="md-3"><code>![Alt](url)</code> for images — or use the image toolbar to insert automatically</div>,
        <div key="md-4"><code>&gt; Blockquote</code> — <code>---</code> for horizontal line</div>,
        <div key="md-5"><code>{`->centred text<-`}</code> — <code>{`->>right-aligned<<-`}</code> — <code>^^^large text^^^</code> — <code>::caption::</code></div>,
        <div key="md-6"><code>:::highlight</code> / <code>:::info</code> / <code>:::warning</code> then content, then <code>:::</code> — coloured callout boxes</div>,
        <div key="md-7"><strong>Paste from Google Docs:</strong> Click 'Paste Doc' above any editor to paste content from Google Docs. Formatting (headings, bold, italic, lists, links, tables) is auto-converted to Markdown. You can paste a full document or just a selected portion.</div>
      ]
    },
    {
      id: "build-blueprint",
      icon: <FolderOpen className="w-6 h-6" />,
      title: "Build Blueprint",
      link: "/build-blueprint",
      category: "Reference",
      description: "Complete ordered set of prompts to recreate the entire platform from scratch.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Access from Admin Dashboard → Specifications → Build Blueprint.</span><Link to="/build-blueprint" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Build Blueprint <ExternalLink className="w-3 h-3" /></Link></span>,
        "Contains 13 phases and 35+ prompts covering every feature of the platform, ordered for efficient rebuilding.",
        "Phase 1 (Foundation & Branding) is designed first so all club identity — name, logo, tagline, and colour — is controlled from admin settings, not code.",
        "Architecture Principles section lists the 7 core design rules: branding-first, one library per concern, shared hooks, server-side validation, typed API, progressive enhancement, migration-based schema.",
        "Each prompt has an instruction (what to build) and bullet-point details (exactly how to build it, including table schemas, API endpoints, and component names).",
        "Quick Navigation at the top lets you jump to any phase. Print-friendly formatting for offline reference.",
      ]
    },
    {
      id: "product-spec",
      icon: <Target className="w-6 h-6 text-indigo-500" />,
      title: "Product Requirements",
      link: "/product-spec",
      category: "Reference",
      description: "Complete PRD — product vision, user roles, all functional requirements, integrations, and non-functional standards.",
      steps: [
        <span className="flex flex-wrap items-center gap-2"><span>Access from Admin Dashboard → Specifications → Product Requirements.</span><Link to="/product-spec" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-ink text-white rounded hover:bg-ink-muted transition-colors">Open Product Requirements <ExternalLink className="w-3 h-3" /></Link></span>,
        "8 sections covering: Product Vision & Goals, User Roles, Public Website, Pilot Portal, Admin Portal, Integrations, Branding, and Non-Functional Requirements.",
        "Each section lists detailed bullet requirements for every feature area of the platform.",
        "Data Model section documents every PostgreSQL table and the data it stores.",
        "Non-Functional section covers mobile/offline, security, performance, automation, and documentation requirements.",
        "Quick navigation at the top lets you jump to any section. Print / Save PDF button available for offline reference.",
      ]
    }
  ];

  // Keyword search: substring match (case-insensitive) across each section's
  // title, description and steps. Returns matching sections with highlighted
  // snippets and the same anchor slug the section Card uses below.
  const q = query.trim().toLowerCase();
  const results = q.length >= 2
    ? sections.flatMap((section) => {
        const slug = section.title.toLowerCase().replace(/\s+/g, "-");
        const desc = section.description || "";
        const titleHit = section.title.toLowerCase().includes(q);
        const snippets: string[] = [];
        if (desc.toLowerCase().includes(q)) snippets.push(desc);
        for (const step of (section.steps || [])) {
          const t = nodeText(step);
          if (t.toLowerCase().includes(q)) snippets.push(t);
        }
        if (!titleHit && snippets.length === 0) return [];
        return [{ title: section.title, slug, titleHit, snippets }];
      })
    : [];
  const totalHits = results.reduce((n, r) => n + r.snippets.length + (r.titleHit ? 1 : 0), 0);

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <Link to="/admin" className="inline-flex items-center text-accent hover:text-accent-hover font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 text-ink font-bold">
            <Book className="w-5 h-5" />
            <span>Admin Manual v15.3</span>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-ink mb-4">Administrator User Manual</h1>
          <p className="text-lg text-foreground-secondary max-w-3xl mx-auto">
            Quick reference for managing the {clubName} website. Each section links directly to the relevant admin page.
          </p>
        </div>

        {/* Keyword search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="w-4 h-4 text-foreground-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the manual — e.g. 'ground', 'weather', 'tide'"
              aria-label="Search the manual"
              className="w-full rounded-xl border border-border-subtle bg-card pl-10 pr-10 py-3 text-sm text-ink placeholder:text-foreground-faint shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-faint hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {q.length >= 2 && (
            <div className="mt-3 bg-card border border-border-subtle rounded-xl p-4 shadow-sm">
              {results.length === 0 ? (
                <p className="text-sm text-foreground-secondary">
                  No matches for “{query}”. Try a shorter keyword (e.g. “hand” for ground handling).
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-faint mb-3">
                    {results.length} section{results.length > 1 ? "s" : ""} · {totalHits} match{totalHits > 1 ? "es" : ""}
                  </p>
                  <div className="space-y-3">
                    {results.map((r) => (
                      <a
                        key={r.slug}
                        href={`#${r.slug}`}
                        onClick={() => setQuery("")}
                        className="block rounded-lg border border-border-faint p-3 hover:border-accent hover:bg-accent/5 transition-colors"
                      >
                        <span className="text-sm font-semibold text-accent">{r.title}</span>
                        {r.snippets.slice(0, 3).map((sn, i) => (
                          <p key={i} className="text-xs text-foreground-secondary mt-1 leading-relaxed">
                            {highlightSnippet(sn, q)}
                          </p>
                        ))}
                        {r.snippets.length > 3 && (
                          <p className="text-[11px] text-foreground-faint mt-1">+{r.snippets.length - 3} more on this page</p>
                        )}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Index */}
        <div className="mb-12 bg-card border border-border-subtle rounded-xl p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-faint mb-4">Contents</h2>
          {[
            {
              label: "Content Management",
              entries: [
                ["Manage Sites Page", "manage-sites-page"],
                ["Site Editor", "site-editor"],
                ["Home Page Management", "home-page-management"],
                ["Dynamic Pages", "dynamic-pages"],
                ["News & Events", "news-&-events"],
                ["Safety & Rules", "safety-&-rules"],
                ["Online Check-ins", "online-check-ins"],
                ["Business Directory", "business-directory"],
                ["Competitions", "competitions"],
                ["Join Page Settings", "join-page-settings"],
                ["Image Processing", "image-processing"],
                ["Ground Handling Map", "ground-handling-map"],
              ],
            },
            {
              label: "Dashboard Settings",
              entries: [
                ["Admin Search", "admin-search"],
                ["Site Features", "site-features"],
                ["XC Maps & Flight Tracker", "xc-maps-&-flight-tracker"],
                ["Pilot Retrieval", "pilot-retrieval-(outlanding-pickup)"],
                ["Weather Management", "weather-management"],
                ["AI Model Configuration", "ai-model-configuration"],
                ["Public Smart Assistant", "public-smart-assistant"],
                ["Branding", "branding"],
                ["Page View Analytics", "page-view-analytics"],
                ["Admin Authentication", "admin-authentication"],
              ],
            },
            {
              label: "Management",
              entries: [
                ["Document Management", "document-management"],
                ["Project Management", "project-management"],
                ["Admin Contacts", "admin-contacts"],
                ["Safety Officer Login", "safety-officer-login"],
                ["Public Contacts", "public-contacts"],
                ["Sponsors", "sponsors"],
                ["Scheduled Tasks", "scheduled-tasks"],
                ["Cameras", "cameras"],
                ["API Settings", "api-settings"],
              ],
            },
            {
              label: "Events — Sausage Sizzle",
              entries: [
                ["Till Setup", "sizzle-till-setup"],
                ["Selling", "sizzle-till-selling"],
                ["End of Day", "sizzle-till-end-of-day"],
                ["Money (Treasurer)", "sizzle-till-money-(treasurer)"],
                ["Admin & Data", "sizzle-till-admin-&-data"],
                ["Shopping Lists & PDFs", "sizzle-shopping-lists-&-pdfs"],
              ],
            },
            {
              label: "Reference",
              entries: [
                ["Troubleshooting", "troubleshooting"],
                ["Markdown Formatting Guide", "markdown-formatting-guide"],
                ["Build Blueprint", "build-blueprint"],
                ["Product Requirements", "product-spec"],
              ],
            },
          ].map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <span className="text-xs font-semibold text-foreground-faint uppercase tracking-wide">{group.label} — </span>
              {group.entries.map(([label, id], i) => (
                <span key={id}>
                  <a href={`#${id}`} className="text-sm text-accent hover:text-accent-hover hover:underline">{label}</a>
                  {i < group.entries.length - 1 && <span className="text-foreground-faint mx-1">·</span>}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-12">
          {sections.map((section, idx) => {
            const prevCategory = idx > 0 ? (sections[idx - 1] as any).category : null;
            const showCategoryHeader = (section as any).category && (section as any).category !== prevCategory;
            return (
            <div key={idx}>
            {showCategoryHeader && (
              <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-6 mt-4">{(section as any).category}</h2>
            )}
            <Card id={section.title.toLowerCase().replace(/\s+/g, '-')} className="overflow-hidden border-none shadow-lg scroll-mt-24">
              <div className="flex flex-col md:flex-row">
                <div className="md:w-1/3 bg-card p-8 border-r border-border-faint">
                  <div className="mb-4">{section.icon}</div>
                  <h2 className="text-2xl font-bold text-ink mb-4">{section.title}</h2>
                  <p className="text-foreground-secondary text-sm mb-6 leading-relaxed">
                    {section.description}
                  </p>
                  <Link to={section.link}>
                    <Button className="w-full justify-between group">
                      Go to Component
                      <ExternalLink className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
                <div className="md:w-2/3 bg-background/50 p-8">
                  <h3 className="text-sm font-bold text-foreground-faint uppercase tracking-widest mb-6">How to use</h3>
                  <ul className="space-y-4">
                    {section.steps.map((step, sIdx) => (
                      <li key={sIdx} className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-card rounded-full border border-border-subtle flex items-center justify-center text-xs font-bold text-ink shadow-sm">
                          {sIdx + 1}
                        </div>
                        <div className="text-foreground-label">{step}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
            </div>
          );
          })}

          <Card className="bg-ink text-white p-8 border-none shadow-xl">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Settings className="w-6 h-6 text-accent" />
                Quick Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Unsaved Changes:</strong> All editor pages warn you before navigating away. Choose "Save Changes" or "Discard".
                  </p>
                </div>
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-accent flex-shrink-0" />
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Errors:</strong> Errors appear inline where the action took place — no browser popups. Read the message and retry.
                  </p>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Procedures Manual:</strong> A separate editable document for committee use — 23 sections covering governance, finance, safety, events, and more. Accessible from the Dashboard.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Settings className="w-5 h-5 text-accent flex-shrink-0" />
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Live Site:</strong> <a href="https://www.skyhighparagliding.org.au" target="_blank" rel="noopener noreferrer" className="text-accent underline">www.skyhighparagliding.org.au</a> — hosted on Railway, PostgreSQL database, images on Cloudflare R2. All credentials under the club's <code>web@skyhighparagliding.org.au</code> account.
                  </p>
                </div>
              </div>
              <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                <h4 className="font-bold mb-3">Service Account Links</h4>
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-gray-300"><strong className="text-white">Railway (hosting + logs):</strong> <a href="https://railway.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">railway.com</a></p>
                  <p className="text-xs text-gray-300"><strong className="text-white">GitHub (source code):</strong> <a href="https://github.com/SkyHighParagliding" target="_blank" rel="noopener noreferrer" className="text-accent underline">github.com/SkyHighParagliding</a></p>
                  <p className="text-xs text-gray-300"><strong className="text-white">Cloudflare R2 (images):</strong> <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">dash.cloudflare.com</a></p>
                  <p className="text-xs text-gray-300"><strong className="text-white">DNS (Cloudflare) + domain (Vodien):</strong> <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">dash.cloudflare.com</a> — DNS records; <a href="https://manage.vodien.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">manage.vodien.com</a> — domain registration</p>
                  <p className="text-xs text-gray-300"><strong className="text-white">Resend (email):</strong> <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">resend.com</a></p>
                  <p className="text-xs text-gray-300"><strong className="text-white">TidyHQ:</strong> <a href="https://skyhigh.tidyhq.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">skyhigh.tidyhq.com</a></p>
                  <p className="text-xs text-gray-300"><strong className="text-white">Google Workspace / Drive:</strong> <a href="https://workspace.google.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">workspace.google.com</a></p>
                </div>
                <p className="text-xs text-gray-400">All login credentials and recovery procedures are in the Credential Recovery document on Google Drive (01_Governance folder).</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center text-foreground-faint text-sm">
          &copy; {new Date().getFullYear()} {clubName}. Administrative Portal.
        </div>
      </div>
    </div>
  );
}
