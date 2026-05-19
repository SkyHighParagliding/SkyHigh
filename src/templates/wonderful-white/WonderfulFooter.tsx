import { Link } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { SocialIcons } from "@/components/SocialIcons";

export function WonderfulFooter() {
  const { settings, darkLogos } = useSettings();
  const { user, isSoSession } = useAuth();
  const clubName = settings.clubName || "SkyHigh";
  const footerLogo = darkLogos.nav || darkLogos.footer;

  return (
    <footer
      className="border-t py-12"
      style={{
        background: "var(--tmpl-footer-bg)",
        color: "var(--tmpl-footer-text)",
        borderColor: "var(--tmpl-footer-border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1 md:col-span-2">
          <div className="mb-4">
            {footerLogo ? (
              <img
                src={footerLogo}
                alt={clubName}
                className="h-20 w-auto"
              />
            ) : (
              <span className="text-lg font-semibold" style={{ color: "var(--tmpl-heading-color)" }}>
                {clubName}
              </span>
            )}
          </div>
          {settings.clubTagline && (
            <p className="text-sm mb-3 max-w-md" style={{ color: "var(--tmpl-footer-text)" }}>
              {settings.clubTagline}
            </p>
          )}
          <p className="text-sm max-w-md" style={{ color: "var(--tmpl-footer-text)" }}>
            Connecting pilots across Victoria's premier flight sites—from the coastal bluffs of the Mornington Peninsula to the soaring peaks of Central Victoria.
          </p>
          <SocialIcons />
        </div>
        <div>
          <h4 className="font-semibold mb-4 text-sm" style={{ color: "var(--tmpl-heading-color)" }}>Quick Links</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/sites" className="hover:opacity-70 transition-opacity">Flying Sites</Link></li>
            <li><Link to="/safety" className="hover:opacity-70 transition-opacity">Safety & Rules</Link></li>
            <li><Link to="/join" className="hover:opacity-70 transition-opacity">Join the Club</Link></li>
            {!isSoSession && <li><Link to="/admin" className="hover:opacity-70 transition-opacity">Admin</Link></li>}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-4 text-sm" style={{ color: "var(--tmpl-heading-color)" }}>Emergency</h4>
          <ul className="space-y-2 text-sm">
            <li>Dial 000 for Emergencies</li>
            <li>
              <Link to="/safety#safety-officer-directory" className="hover:opacity-70 transition-opacity" style={{ color: "var(--tmpl-accent)" }}>
                Contact Safety Officers
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t text-sm text-center" style={{ borderColor: "var(--tmpl-footer-border)" }}>
        <p>&copy; {new Date().getFullYear()} {clubName}. All rights reserved.</p>
      </div>
    </footer>
  );
}
