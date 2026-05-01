import { Link, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Button } from "./ui/button";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTemplate } from "@/contexts/TemplateContext";
import { SocialIcons } from "./SocialIcons";
import { NavDropdown, MobileNavGroup, type NavItem } from "./NavDropdown";

const WonderfulHeader = lazy(() => import("@/templates/wonderful-white/WonderfulHeader").then(m => ({ default: m.WonderfulHeader })));
const WonderfulFooter = lazy(() => import("@/templates/wonderful-white/WonderfulFooter").then(m => ({ default: m.WonderfulFooter })));

function ClassicHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { settings, activeLogos } = useSettings();
  const { user, isSoSession } = useAuth();
  const clubName = settings.clubName || "SkyHigh";
  const logoNav = activeLogos.nav;

  const xcChildren: NavItem[] = useMemo(() => [
    ...(settings.xcMapsEnabled ? [{ name: "Maps", path: "/xc/maps" }] : []),
    ...(settings.xcMapsEnabled && settings.flightTrackerEnabled ? [{ name: "Flight History", path: "/xc/flights" }] : []),
    ...(settings.xcAirspaceEnabled ? [{ name: "Airspace", path: "/xc/airspace" }] : []),
    ...(settings.xcCompetitionsEnabled ? [{ name: "Competitions", path: "/xc/competitions" }] : []),
    ...(settings.xcMapsEnabled ? [{ name: "Bored? Try the Demo", path: "/xc/maps/demo" }] : []),
  ], [settings.xcMapsEnabled, settings.flightTrackerEnabled, settings.xcAirspaceEnabled, settings.xcCompetitionsEnabled]);

  const navLinks: NavItem[] = [
    { name: "Sites", path: "/sites" },
    { name: "Pilots", children: [
      { name: "New Pilots", path: "/page/new-pilots" },
      { name: "Visiting Pilots", path: "/page/visiting-pilots" },
      ...(settings.joinPageEnabled ? [{ name: "Join the Club", path: "/join" }] : []),
      ...(settings.groundHandlingEnabled ? [{ name: "Ground Handling", path: "/ground-handling" }] : []),
    ]},
    ...(xcChildren.length > 0 ? [{ name: "XC", children: xcChildren }] : []),
    { name: "News", path: "/news" },
    { name: "Events", path: "/events" },
    { name: "Community", children: [
      { name: "Image Wall", path: "/club-photos" },
      { name: "Video Wall", path: "/video-wall" },
      { name: "Insta Wall", path: "/insta-wall" },
      ...(settings.businessDirectoryEnabled ? [{ name: "Business Directory", path: "/business-directory" }] : []),
    ]},
    { name: "About Us", path: "/page/about" },
    { name: "Shop", path: "/shop" },
    { name: "Safety/Rules", path: "/safety" },
    ...(user && !isSoSession ? [{ name: "Admin", path: "/admin" }] : []),
  ];

  return (
    <header className="bg-navy text-white sticky top-0 z-[10000] shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-[88px] items-center">
          <div className="flex items-center relative z-50">
            <Link to="/" className="flex items-center">
              {logoNav ? (
                <img src={logoNav} alt={clubName} className="h-[110px] w-auto translate-y-6 drop-shadow-lg" />
              ) : (
                <img
                  src="/logo-light.png"
                  alt={clubName}
                  className="h-[110px] w-auto translate-y-6 drop-shadow-lg"
                />
              )}
            </Link>
          </div>

          <nav className="hidden lg:flex items-center space-x-6">
            {navLinks.map((link) =>
              link.children ? (
                <NavDropdown
                  key={link.name}
                  item={link}
                  className="text-sm font-medium hover:text-sky transition-colors whitespace-nowrap inline-flex items-center"
                />
              ) : (
                <Link
                  key={link.name}
                  to={link.path!}
                  className="text-sm font-medium hover:text-sky transition-colors whitespace-nowrap"
                >
                  {link.name}
                </Link>
              )
            )}
            {settings.onlineCheckInEnabled && (
              <Link to="/check-in">
                <Button variant="orange" size="sm">
                  Online Check-in
                </Button>
              </Link>
            )}
          </nav>

          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-300 hover:text-white focus:outline-none"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden bg-navy-light border-t border-gray-700 relative z-[9999]">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              <MobileNavGroup
                key={link.name}
                item={link}
                textColor="#fff"
                onNavigate={() => setIsMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium hover:bg-navy hover:text-white"
              />
            ))}
            {settings.onlineCheckInEnabled && (
              <Link
                to="/check-in"
                className="block px-3 py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <Button variant="orange" className="w-full justify-center">
                  Online Check-in
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function ClassicFooter() {
  const { settings, activeLogos } = useSettings();
  const { user, isSoSession } = useAuth();
  const clubName = settings.clubName || "SkyHigh";
  const logoFooter = activeLogos.footer;

  return (
    <footer className="bg-navy text-gray-300 py-12 border-t-4 border-sky">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1 md:col-span-2">
          <div className="mb-4">
            {logoFooter ? (
              <img src={logoFooter} alt={clubName} className="h-10 w-auto" />
            ) : (
              <img
                src="/logo-light.png"
                alt={clubName}
                className="h-10 w-auto"
              />
            )}
          </div>
          {settings.clubTagline && (
            <p className="text-sm text-foreground-faint max-w-md mb-3">
              {settings.clubTagline}
            </p>
          )}
          <p className="text-sm text-foreground-faint max-w-md">
            Connecting pilots across Victoria's premier flight sites—from the coastal bluffs of the Mornington Peninsula to the soaring peaks of Central Victoria.
          </p>
          <SocialIcons />
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Quick Links</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/sites" className="hover:text-sky">Flying Sites</Link></li>
            <li><Link to="/safety" className="hover:text-sky">Safety & Rules</Link></li>
            <li><Link to="/join" className="hover:text-sky">Join the Club</Link></li>
            {!isSoSession && <li><Link to="/admin" className="hover:text-sky">Admin</Link></li>}
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Emergency</h4>
          <ul className="space-y-2 text-sm">
            <li>Dial 000 for Emergencies</li>
            <li><Link to="/safety#safety-officer-directory" className="text-orange hover:text-orange-dark">Contact Safety Officers</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-gray-700 text-sm text-center text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} {clubName}. All rights reserved.</p>
        {user && <Link to="/features" className="text-foreground-secondary hover:text-sky transition-colors text-xs mt-1 inline-block">Platform Overview</Link>}
      </div>
    </footer>
  );
}

export function Layout() {
  const { settings, activeLogos } = useSettings();
  const { isWonderfulWhite } = useTemplate();
  const clubName = settings.clubName || "SkyHigh";

  useEffect(() => {
    document.title = clubName;
    const favicon = activeLogos.favicon;
    if (favicon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = favicon;
    }

    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "/manifest.json";
      document.head.appendChild(manifestLink);
    }

    const appleTouchIcon = settings.pwaIcon192 || activeLogos.favicon;
    if (appleTouchIcon) {
      let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
      if (!appleLink) {
        appleLink = document.createElement("link");
        appleLink.rel = "apple-touch-icon";
        document.head.appendChild(appleLink);
      }
      appleLink.href = appleTouchIcon;
    }

    let themeColor = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }
    themeColor.content = settings.clubPrimaryColor || "#00a8e8";

    let mobileCapable = document.querySelector("meta[name='mobile-web-app-capable']") as HTMLMetaElement;
    if (!mobileCapable) {
      mobileCapable = document.createElement("meta");
      mobileCapable.name = "mobile-web-app-capable";
      mobileCapable.content = "yes";
      document.head.appendChild(mobileCapable);
    }

    let appleMobileCapable = document.querySelector("meta[name='apple-mobile-web-app-capable']") as HTMLMetaElement;
    if (!appleMobileCapable) {
      appleMobileCapable = document.createElement("meta");
      appleMobileCapable.name = "apple-mobile-web-app-capable";
      appleMobileCapable.content = "yes";
      document.head.appendChild(appleMobileCapable);
    }
  }, [clubName, activeLogos.favicon, settings.pwaIcon192, settings.clubPrimaryColor]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--tmpl-body-bg)" }}>
      {isWonderfulWhite ? <Suspense fallback={null}><WonderfulHeader /></Suspense> : <ClassicHeader />}
      <main className={`flex-grow flex flex-col ${isWonderfulWhite ? 'pt-[56px] sm:pt-[76px]' : ''}`}>
        <Outlet />
      </main>
      {isWonderfulWhite ? <Suspense fallback={null}><WonderfulFooter /></Suspense> : <ClassicFooter />}
    </div>
  );
}
