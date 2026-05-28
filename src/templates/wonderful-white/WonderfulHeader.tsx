import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { NavDropdown, MobileNavGroup, type NavItem } from "@/components/NavDropdown";

export function WonderfulHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const { settings, lightLogos, darkLogos } = useSettings();
  const { isSoSession } = useAuth();
  const location = useLocation();
  const clubName = settings.clubName || "SkyHigh";

  useEffect(() => {
    setScrolledPastHero(false);
    setIsMenuOpen(false);

    const onScroll = () => {
      const hero = document.querySelector("[data-hero]") as HTMLElement | null;
      if (hero) {
        const heroBottom = hero.getBoundingClientRect().bottom;
        setScrolledPastHero(heroBottom <= 80);
      } else {
        setScrolledPastHero(true);
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.pathname]);

  const isDark = !scrolledPastHero;
  const logoNav = isDark ? lightLogos.nav : darkLogos.nav;
  const textColor = isDark ? "#ffffff" : "#1d1d1f";

  const xcChildren: NavItem[] = [
    ...(settings.xcMapsEnabled ? [{ name: "Maps", path: "/xc/maps" }] : []),
    ...(settings.xcMapsEnabled && settings.flightTrackerEnabled ? [{ name: "Flight History", path: "/xc/flights" }] : []),
    ...(settings.xcAirspaceEnabled ? [{ name: "Airspace", path: "/xc/airspace" }] : []),
    ...(settings.xcCompetitionsEnabled ? [{ name: "Competitions", path: "/xc/competitions" }] : []),
    ...(settings.xcMapsEnabled ? [{ name: "Bored? Try the Demo", path: "/xc/maps/demo" }] : []),
  ];

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
    ...(!isSoSession ? [{ name: "Admin", path: "/admin" }] : []),
  ];

  const dropdownBg = isDark ? "rgba(0,0,0,0.80)" : "rgba(255,255,255,0.80)";
  const dropdownBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)";
  const dropdownHoverBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[10000]"
      style={{
        background: isDark ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.82)",
        color: textColor,
        borderBottom: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        transition: "background 0.3s ease, border-color 0.3s ease",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex items-center h-[56px] sm:h-[76px]">
          <div className="shrink-0 relative z-50" style={{ width: "200px" }}>
            <Link to="/" className="inline-flex items-center">
              {logoNav ? (
                <img
                  src={logoNav}
                  alt={clubName}
                  className="h-[70px] sm:h-[110px] w-auto translate-y-5 sm:translate-y-10"
                  style={{
                    filter: isDark
                      ? "drop-shadow(0 0 1px rgba(0,0,0,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
                      : "none",
                    transition: "filter 0.3s ease",
                  }}
                />
              ) : (
                <span className="text-[15px] font-semibold tracking-tight" style={{ color: textColor, transition: "color 0.3s ease" }}>
                  {clubName}
                </span>
              )}
            </Link>
          </div>

          <nav className="hidden lg:flex flex-1 items-center justify-center gap-7">
            {navLinks.map((link) =>
              link.children ? (
                <NavDropdown
                  key={link.name}
                  item={link}
                  className="text-[16px] font-light tracking-[0.01em] transition-all whitespace-nowrap opacity-80 hover:opacity-100 inline-flex items-center"
                  style={{ color: textColor, fontFamily: "var(--tmpl-font-body)", transition: "color 0.3s ease" }}
                  dropdownBg={dropdownBg}
                  dropdownBorder={dropdownBorder}
                  dropdownTextColor={textColor}
                  dropdownHoverBg={dropdownHoverBg}
                  glass
                />
              ) : (
                <Link
                  key={link.name}
                  to={link.path!}
                  className="text-[16px] font-light tracking-[0.01em] transition-all whitespace-nowrap opacity-80 hover:opacity-100"
                  style={{ color: textColor, fontFamily: "var(--tmpl-font-body)", transition: "color 0.3s ease" }}
                >
                  {link.name}
                </Link>
              )
            )}
          </nav>

          <div className="hidden lg:flex items-center justify-end gap-3 shrink-0 flex-wrap">
            {settings.onlineCheckInEnabled && (
              <Link
                to="/check-in"
                className="text-[11px] font-medium px-3.5 py-1 rounded-full text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--tmpl-accent)" }}
              >
                Check-in
              </Link>
            )}
          </div>

          <div className="lg:hidden ml-auto">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 -mr-2"
              style={{ color: textColor, transition: "color 0.3s ease" }}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="lg:hidden border-t relative z-[9999]"
          style={{
            background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.95)",
            borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
          }}
        >
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <MobileNavGroup
                key={link.name}
                item={link}
                textColor={textColor}
                onNavigate={() => setIsMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-[15px] font-medium transition-colors"
                style={{ color: textColor }}
              />
            ))}
            {settings.onlineCheckInEnabled && (
              <Link
                to="/check-in"
                className="block px-3 py-2 text-[15px] font-semibold rounded-lg text-white text-center mt-2"
                style={{ background: "var(--tmpl-accent)" }}
                onClick={() => setIsMenuOpen(false)}
              >
                Online Check-in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
