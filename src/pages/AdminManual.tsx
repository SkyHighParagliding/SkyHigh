import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/SettingsContext";

export function AdminManual() {
  const location = useLocation();
  const { settings } = useSettings();
  const clubName = settings.clubName || 'SkyHigh';

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
      icon: <MapPin className="w-6 h-6 text-sky" />,
      link: "/admin/sites",
      category: "Content Management",
      description: "The central hub for importing, archiving, searching and managing all flying sites. Click 'Edit' on any site to open the Site Editor (covered in the next section).",
      steps: [
        "Navigate: Go to 'Flying Sites' from the Admin Dashboard. The page header shows a site count and the 'Add New Site' button (top-right).",
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
      icon: <MapPin className="w-6 h-6 text-sky" />,
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
      icon: <Home className="w-6 h-6 text-navy" />,
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
        "Photo Carousel: Toggle on/off in Site Features. When enabled, sub-options for auto-scroll and reverse direction appear. The carousel shows a scrolling strip of images from the Image Library.",
        "YouTube Carousel: Toggle on/off in Site Features. Same auto-scroll and reverse direction options. Displays YouTube video thumbnails in alternating large/small sizes.",
        "SkyHigh Video Wall: All YouTube videos are automatically displayed on the public /video-wall page as a mosaic of thumbnails. Newest videos appear first. Each tile links to the YouTube video. Thumbnails cycle through 4 size variants for visual variety.",
        "Social Media Links: At the bottom of Home Page settings. Enter URLs for each platform — only those with a URL show as footer icons."
      ]
    },
    {
      title: "Dynamic Pages",
      icon: <FileText className="w-6 h-6 text-orange" />,
      link: "/admin/pages",
      category: "Content Management",
      description: "Manage content pages like 'About Us', 'New Pilots', and 'Visiting Pilots'.",
      steps: [
        "Access via 'News, Events & Pages' on the Dashboard (Dynamic Pages tab).",
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
        "The Safety Officer Directory is managed separately from Admin Contacts — officers with 'Safety Committee' role appear automatically.",
        "Use dynamic pages (News, Events & Pages) to create linked pages like Code of Conduct or Complaints & Disciplinary, then link them from safety sections."
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
        "Requires 'Online Check-in' to be enabled in Site Features on the Dashboard."
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
      link: "/admin/competitions",
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
      icon: <LogIn className="w-6 h-6 text-navy" />,
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
      title: "Admin Search",
      icon: <MessageCircle className="w-6 h-6 text-sky" />,
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
      icon: <Settings className="w-6 h-6 text-navy" />,
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
        "Wind Field Layer: Toggle the 'Winds' button (below Airspace) to display an animated wind field overlay across the map. Uses IDW (Inverse Distance Weighting) interpolation from all live weather stations to visualise wind speed and direction as flowing streamlines. Colour scale matches the site wind arrows (green/yellow/orange/red). All visual parameters are configurable from Admin > XC > Wind Field Overlay — particle count, trail length, line width, opacity, speed scale, max speed, lifespan, interpolation range, fade distance, and IDW power. Defaults: 1200 particles, trail 12, influence 120 km, fade from 80 km.",
        "Airspace Visibility: Sectors render with solid colour fills at 18% opacity. CTA is blue, CTR is red, Prohibited is dark red, Restricted is orange, Danger is yellow, and others have distinct colours. Tap any sector for details.",
        "Proximity Alerts: During flight recording, if the GPS track enters an airspace sector, that sector flashes at 35% opacity with a dashed border, an 880 Hz beep sounds, and haptic vibration triggers (5-second cooldown between alerts).",
        "Dismiss Alerts: While proximity alerts are active, a red 'Dismiss' button appears on the map. Tapping it mutes flashing, beeping, and haptic for the current sector(s). An orange 'Muted' badge shows while alerts are suppressed. Alerts automatically re-arm when the pilot exits the dismissed sector and enters a new airspace boundary.",
        "Airspace Toggle During Flight: Airspace auto-enables when flight recording starts but pilots can now toggle it off mid-flight using the Airspace button. Toggling off hides the overlay, altitude slider, and legend while flying.",
        "Configurable Proximity Threshold: Tap the shield icon on the map to cycle through 50, 100, 150, 200, or 250 ft proximity buffers. The threshold is saved per pilot.",
        "GPS Flight Tracker: Pilots log in, tap 'Record', and the map tracks their position with a blue breadcrumb trail. Barometer altitude (GPS-calibrated, configurable sample count) is fused with GPS using a configurable weight, with a divergence guard that falls back to GPS-only if drift is too large. All smoothing parameters (EMA alpha, vertical speed alpha, baro fusion weight, calibration samples, max divergence) are tuneable from Admin > Flight Tracker > Signal Processing.",
        "Landing Detection: Auto-stop now requires BOTH ground speed AND vertical speed to be below their thresholds for the configured duration. This prevents false landings when a pilot is thermalling in a tight circle (near-zero ground speed but significant climb/sink rate). All thresholds are configurable under Admin > Flight Tracker > Auto-Start / Auto-Stop.",
        "Server Thresholds: Active pilot TTL, landed pilot TTL, phone stale threshold, and satellite max fix age are all configurable under Admin > Flight Tracker > Server-Side Thresholds. These control how long pilots remain on the live map and when the server falls back to satellite tracker polling.",
        "Satellite Tracker Visibility: Each satellite tracker type (Garmin inReach, SPOT, ZOLEO) can be individually shown or hidden from the pilot settings dialog. Toggle these under Admin > Flight Tracker > Satellite Tracker Visibility. Hidden trackers don't appear in pilot profiles — useful for hiding untested integrations until ready.",
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
      icon: <Wind className="w-6 h-6 text-sky" />,
      link: "/admin/weather",
      category: "Dashboard Settings",
      description: "Manage weather data and wind map settings. Open via the 'Weather Management' card on the Dashboard.",
      steps: [
        "Weather fetches automatically every 15–30 min during daylight hours (7am–8pm Melbourne time). Click 'Fetch Now' for an immediate update.",
        "Forecasts: Days 1–2 use hourly ECMWF data; days 3–7 use 4-hour intervals fetched daily at ~5:30am.",
        "7-Day Outlook: A compact strip on weather cards showing daily conditions and flyability dots.",
        "Tides: Coastal sites show an interactive tide chart in the 7-Day Outlook panel, auto-detected from coordinates.",
        "Wind Map: Animated wind map on the Sites page. TODAY/7 DAYS toggle switches between hourly and extended views. Click the map to see wind speed/direction at any point.",
        "Click 'Preview Wind Map' for a full-screen preview. Live station selection is per-site in the site editor."
      ]
    },
    {
      title: "AI Model Configuration",
      icon: <Sparkles className="w-6 h-6 text-sky" />,
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
      icon: <MessageCircle className="w-6 h-6 text-sky" />,
      link: "/admin/connections",
      category: "Dashboard Settings",
      description: "The home page AI assistant that helps pilots find site info, weather, and club resources.",
      steps: [
        "Settings are on the API Settings page (/admin/connections) in the Smart Assistant card.",
        "The assistant answers questions about sites, ratings, weather, and hazards from the site database.",
        "Search Disclaimer: Add text that appears at the end of every reply. Leave blank to disable.",
        "Call-to-Action Message: A promotional message shown periodically in the chat. Set frequency (Off, every response, every 2nd–5th). Supports formatting — click 'Formatting help' for reference.",
        "Committee Contact Link: Where visitors are directed for equipment or committee queries. Defaults to /page/committee."
      ]
    },
    {
      title: "Branding & Templates",
      icon: <Settings className="w-6 h-6 text-sky" />,
      link: "/admin/branding",
      category: "Dashboard Settings",
      description: "White-label your club — logos, colours, and visual template.",
      steps: [
        "Club Identity: Set your club name and tagline. Use {{clubName}} in CMS content to insert it dynamically.",
        "Logos: Upload Light and Dark versions (PNG, JPEG, SVG, WebP). Five size variants are auto-generated. Assign logos to templates using the Light/Dark toggle.",
        "PWA Icon: Upload a custom icon that appears when a user adds the site to their phone's home screen (Progressive Web App). A square image of 512×512px or larger is recommended. Displayed separately from the main logo.",
        "Template: Choose 'Classic' (navy & orange) or 'Wonderful White' (Apple-inspired frosted glass).",
        "Primary Colour: Override the accent colour with a hex code or colour picker. 'Reset to default' reverts to the template's built-in colour."
      ]
    },
    {
      title: "Page View Analytics",
      icon: <Activity className="w-6 h-6 text-sky" />,
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
        "Navigate to /admin to log in. Sessions persist until you sign out.",
        "Admin access is managed in the Admin Contact Directory — tick the 'Admin' role on any contact. Admins need a surname, phone, email, and password.",
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
        "Google Drive connection is configured in API Settings. After updates, you may need to redeploy the Apps Script."
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
        "Contacts are available for linking in Project Management."
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
        "Navigate: Go to 'Sponsors' from the Admin Dashboard (Content Management section).",
        "Add Sponsor: Click 'Add Sponsor'. Enter name (required), logo URL, website URL, and an optional markdown description.",
        "Edit: Click 'Edit' on any sponsor card to update details. Changes save immediately.",
        "Reorder: Use the sort order field to control display sequence. Lower numbers appear first.",
        "Delete: Click 'Delete' on a sponsor card — a confirmation dialog prevents accidental removal.",
        "Home Page Card: When sponsors exist, an 'Our Sponsors' card becomes available in the Home Page card picker. Select it to show sponsor names on the home page.",
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
        "Navigate: Go to 'Scheduled Tasks' from the Admin Dashboard (Integrations section).",
        "All times are Melbourne time (AEST/AEDT). The system checks once per hour whether any job is due to run.",
        "Site Guide Version Check: Checks if the SAFA site guide has a new version. If changed and auto-import is enabled, triggers a bulk site import. Default: 5:00 AM.",
        "Extended Forecast Fetch: Downloads the 7-day weather forecast grid from Open-Meteo for all Victoria sites. Default: 5:30 AM.",
        "Image Submission Notifications: Sends email to Social Media committee contacts when new submissions are pending. Can be enabled/disabled. Default: 7:00 PM.",
        "Live Weather Scraper: Fetches live wind data at random intervals (default 15–30 min) during operating hours (default 7 AM – 8 PM). Sleeps overnight.",
        "Google Drive Sync: Automatically indexes documents from Google Drive. Must be enabled and requires Drive connection. Default: 4:00 AM.",
        "Run Now: Use the 'Run Now' button on the Drive Sync card to trigger an immediate sync without waiting for the schedule.",
        "Cache Timers: The bottom section shows 8 configurable cache duration settings. Adjust how long various data caches are retained before refreshing: Admin Session TTL (hours), TidyHQ Member Cache (minutes), BOM Tide Predictions Cache (hours), Astronomical Tide Cache (minutes), TidyHQ Events Cache (minutes), Search Context Cache (minutes), Asset Register Cache (minutes), and FreeFlightWx Cache (seconds). Each has min/max constraints. Changes apply on next cache refresh cycle.",
        "Save: Click 'Save All' to apply changes. New schedule times take effect from the next hourly check."
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
        "Using Images: Select them on Home Page settings (hero backgrounds) or Site Edit pages (site banners). Use the image toolbar in News/Pages to insert from the library.",
        "Ideal Sizes: Hero backgrounds 1920×1080, site headers 1920×600, general content 1200×800. Images are auto-compressed on upload.",
        "Permanent Cloud Storage: All uploaded images are stored in Cloudflare R2 cloud storage (or namespaced local storage). They are organized into logical folders: images/sites/, images/hero/, images/sliders/, branding/, and submissions/. This structure ensures high performance and prevents data loss during system updates.",
        "Google Drive & Dropbox: Sharing links are auto-converted to direct image URLs when pasted into image fields."
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
        "Access from Admin Dashboard → Specifications → Build Blueprint.",
        "Contains 13 phases and 35+ prompts covering every feature of the platform, ordered for efficient rebuilding.",
        "Phase 1 (Foundation & Branding) is designed first so the entire app is white-label ready — any club can rebrand by changing settings, not code.",
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
        "Access from Admin Dashboard → Specifications → Product Requirements.",
        "8 sections covering: Product Vision & Goals, User Roles, Public Website, Pilot Portal, Admin Portal, Integrations, White-Label, and Non-Functional Requirements.",
        "Each section lists detailed bullet requirements for every feature area of the platform.",
        "Data Model section documents every PostgreSQL table and the data it stores.",
        "Non-Functional section covers mobile/offline, security, performance, automation, and documentation requirements.",
        "Quick navigation at the top lets you jump to any section. Print / Save PDF button available for offline reference.",
      ]
    }
  ];

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 text-navy font-bold">
            <Book className="w-5 h-5" />
            <span>Admin Manual v14.0</span>
          </div>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-navy mb-4">Administrator User Manual</h1>
          <p className="text-lg text-foreground-secondary max-w-3xl mx-auto">
            Quick reference for managing the {clubName} website. Each section links directly to the relevant admin page.
          </p>
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
                  <h2 className="text-2xl font-bold text-navy mb-4">{section.title}</h2>
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
                        <div className="flex-shrink-0 w-6 h-6 bg-card rounded-full border border-border-subtle flex items-center justify-center text-xs font-bold text-navy shadow-sm">
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

          <Card className="bg-navy text-white p-8 border-none shadow-xl">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Settings className="w-6 h-6 text-sky" />
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
                  <AlertCircle className="w-5 h-5 text-orange flex-shrink-0" />
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
                  <Settings className="w-5 h-5 text-sky flex-shrink-0" />
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Production Readiness:</strong> The system supports both local SQLite and production-grade PostgreSQL. All core configuration is managed via the <code>.env.template</code> file.
                  </p>
                </div>
              </div>
              <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                <h4 className="font-bold mb-2">Need Technical Help?</h4>
                <p className="text-sm text-foreground-faint mb-4">
                  If you encounter errors or need new features, contact the system administrator or the club's IT subcommittee.
                </p>
                <p className="text-xs text-sky font-mono">Contact your system administrator</p>
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
