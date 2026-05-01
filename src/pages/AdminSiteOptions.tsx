import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, QrCode, Star, Flag, Store, UserPlus, Palette, ExternalLink } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

export function AdminSiteOptions() {
  const { settings, updateSettings, loading } = useSettings();

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Site Options</h1>
          <p className="text-foreground-secondary">Manage feature visibility, check-in settings, and homepage components.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500">
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <QrCode className="w-6 h-6 mr-2" />
                Check-in & QR Codes
              </CardTitle>
              <CardDescription>Manage online check-in and QR code site cards for flying sites.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="online-checkin-toggle" className="flex items-center cursor-pointer">
                  <input
                    id="online-checkin-toggle"
                    type="checkbox"
                    className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                    checked={settings.onlineCheckInEnabled}
                    onChange={(e) => updateSettings({ onlineCheckInEnabled: e.target.checked }).catch(() => {})}
                    disabled={loading}
                  />
                  <span className="ml-2 text-sm font-medium text-foreground-label">
                    Mandatory Check-in: {settings.onlineCheckInEnabled ? "On" : "Off"}
                  </span>
                </label>
                <p className="mt-1 ml-7 text-xs text-muted-foreground">
                  When enabled, pilots must check in online before flying.
                </p>
              </div>
              <div className="border-t border-border-faint pt-3">
                <label htmlFor="qr-code-mode" className="block text-sm font-medium text-foreground-label mb-1.5">QR Code Site Cards</label>
                <select
                  id="qr-code-mode"
                  className="w-full p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                  value={settings.qrCodeMode || "off"}
                  onChange={(e) => updateSettings({ qrCodeMode: e.target.value }).catch(() => {})}
                  disabled={loading}
                >
                  <option value="off">Off</option>
                  <option value="informative">Informative</option>
                  <option value="mandatory" disabled>Mandatory</option>
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {settings.qrCodeMode === "informative"
                    ? "Pilots can scan QR codes at sites to view key info on their phone."
                    : "Enable to generate printable QR codes for each site."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-orange">
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <Star className="w-6 h-6 mr-2" />
                Home Page Options
              </CardTitle>
              <CardDescription>Show or hide sections on the home page.</CardDescription>
            </CardHeader>
            <CardContent>
              <label htmlFor="featured-site-toggle" className="flex items-center cursor-pointer">
                <input
                  id="featured-site-toggle"
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.featuredSiteEnabled}
                  onChange={(e) => updateSettings({ featuredSiteEnabled: e.target.checked }).catch(() => {})}
                  disabled={loading}
                />
                <span className="ml-2 text-sm font-medium text-foreground-label">
                  Featured Sites: {settings.featuredSiteEnabled ? "Enabled" : "Disabled"}
                </span>
              </label>
              <label htmlFor="photo-slider-toggle" className="flex items-center cursor-pointer mt-3">
                <input
                  id="photo-slider-toggle"
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.photoSliderEnabled}
                  onChange={(e) => updateSettings({ photoSliderEnabled: e.target.checked }).catch(() => {})}
                  disabled={loading}
                />
                <span className="ml-2 text-sm font-medium text-foreground-label">
                  Photo Carousel: {settings.photoSliderEnabled ? "Enabled" : "Disabled"}
                </span>
              </label>
              {settings.photoSliderEnabled && (
                <div className="ml-7 mt-1 flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={settings.photoSliderAutoScroll}
                      onChange={(e) => updateSettings({ photoSliderAutoScroll: e.target.checked }).catch(() => {})}
                      disabled={loading}
                    />
                    <span className="ml-1.5 text-xs text-foreground-secondary">Auto-scroll</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={settings.photoSliderReverse}
                      onChange={(e) => updateSettings({ photoSliderReverse: e.target.checked }).catch(() => {})}
                      disabled={loading}
                    />
                    <span className="ml-1.5 text-xs text-foreground-secondary">Reverse direction</span>
                  </label>
                </div>
              )}
              <label htmlFor="youtube-carousel-toggle" className="flex items-center cursor-pointer mt-3">
                <input
                  id="youtube-carousel-toggle"
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.youtubeCarouselEnabled}
                  onChange={(e) => updateSettings({ youtubeCarouselEnabled: e.target.checked }).catch(() => {})}
                  disabled={loading}
                />
                <span className="ml-2 text-sm font-medium text-foreground-label">
                  YouTube Carousel: {settings.youtubeCarouselEnabled ? "Enabled" : "Disabled"}
                </span>
              </label>
              {settings.youtubeCarouselEnabled && (
                <div className="ml-7 mt-1 flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={settings.youtubeCarouselAutoScroll}
                      onChange={(e) => updateSettings({ youtubeCarouselAutoScroll: e.target.checked }).catch(() => {})}
                      disabled={loading}
                    />
                    <span className="ml-1.5 text-xs text-foreground-secondary">Auto-scroll</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={settings.youtubeCarouselReverse}
                      onChange={(e) => updateSettings({ youtubeCarouselReverse: e.target.checked }).catch(() => {})}
                      disabled={loading}
                    />
                    <span className="ml-1.5 text-xs text-foreground-secondary">Reverse direction</span>
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <Flag className="w-6 h-6 mr-2" />
                Ground Handling Map
              </CardTitle>
              <CardDescription>Manage the embedded Google My Maps ground handling sites page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label htmlFor="ground-handling-toggle" className="flex items-center cursor-pointer">
                <input
                  id="ground-handling-toggle"
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.groundHandlingEnabled}
                  onChange={(e) => updateSettings({ groundHandlingEnabled: e.target.checked }).catch(() => {})}
                  disabled={loading}
                />
                <span className="ml-2 text-sm font-medium text-foreground-label">
                  Ground Handling Page: {settings.groundHandlingEnabled ? "Visible" : "Hidden"}
                </span>
              </label>
              <p className="mt-1 ml-7 text-xs text-muted-foreground">
                When enabled, the ground handling map appears in the Pilots nav menu and at /ground-handling.
              </p>

              <div className="border-t border-border-faint pt-4">
                <h4 className="text-sm font-semibold text-navy mb-2">Edit Map Sites</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  The ground handling map is a Google My Maps. To add, edit, or remove sites, open the map editor directly in Google Maps.
                </p>
                <a
                  href="https://www.google.com/maps/d/edit?mid=12KBoOkwtN3J9IR97C7RqUwM1ajNR7Lxu&usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Map Editor
                </a>
              </div>

              <div className="border-t border-border-faint pt-4">
                <h4 className="text-sm font-semibold text-navy mb-2">How to Add a New Site</h4>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>
                    Open the{" "}
                    <a
                      href="https://www.google.com/maps/d/edit?mid=12KBoOkwtN3J9IR97C7RqUwM1ajNR7Lxu&usp=sharing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky hover:underline font-medium"
                    >
                      Map Editor
                    </a>{" "}
                    in a new tab (use a computer for best results).
                    <span className="block ml-4 mt-1 text-amber-600">Apple users: make sure the link opens in your browser, not in the Google Maps app.</span>
                  </li>
                  <li>Zoom in and find the location you want to add, then click the location pin icon in the toolbar and pin the spot.</li>
                  <li>Add a name and provide a detailed description. Include the best wind direction(s) for the site. You can also add a photo.</li>
                  <li>Done — the new site will appear on the embedded map automatically.</li>
                </ol>
              </div>

              <div className="border-t border-border-faint pt-4">
                <a
                  href="/ground-handling"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky hover:text-sky-light transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View public ground handling page
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <Store className="w-6 h-6 mr-2" />
                Business Directory
              </CardTitle>
              <CardDescription>Show or hide the member business directory on the public site.</CardDescription>
            </CardHeader>
            <CardContent>
              <label htmlFor="business-directory-toggle" className="flex items-center cursor-pointer">
                <input
                  id="business-directory-toggle"
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={!!settings.businessDirectoryEnabled}
                  onChange={(e) => updateSettings({ businessDirectoryEnabled: e.target.checked }).catch(() => {})}
                  disabled={loading}
                />
                <span className="ml-2 text-sm font-medium text-foreground-label">
                  Business Directory: {settings.businessDirectoryEnabled ? "Visible" : "Hidden"}
                </span>
              </label>
              <p className="mt-1 ml-7 text-xs text-muted-foreground">
                When hidden, the directory link is removed from navigation and the public page is inaccessible. Admin management remains available.
              </p>
            </CardContent>
          </Card>

          <Link to="/admin/branding" className="block group">
            <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-sky">
              <CardHeader>
                <CardTitle className="flex items-center text-navy group-hover:text-sky transition-colors">
                  <Palette className="w-6 h-6 mr-2" />
                  Branding & Templates
                </CardTitle>
                <CardDescription>Club name, logo upload, colour scheme, and visual template.</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <UserPlus className="w-6 h-6 mr-2" />
                Join Page
              </CardTitle>
              <CardDescription>Membership signup page visibility and TidyHQ link.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label htmlFor="join-page-toggle" className="flex items-center cursor-pointer">
                <input
                  id="join-page-toggle"
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={!!settings.joinPageEnabled}
                  onChange={(e) => updateSettings({ joinPageEnabled: e.target.checked }).catch(() => {})}
                  disabled={loading}
                />
                <span className="ml-2 text-sm font-medium text-foreground-label">
                  Join Page: {settings.joinPageEnabled ? "Visible" : "Hidden"}
                </span>
              </label>
              <p className="ml-7 text-xs text-muted-foreground">
                When enabled, the Join page is visible to the public and appears in the Pilots dropdown menu.
              </p>
              <Link
                to="/admin/join-settings"
                className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors mt-1"
              >
                Configure Join Page Content →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
