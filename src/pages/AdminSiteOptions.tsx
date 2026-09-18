import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, QrCode, Star, Flag, Store, UserPlus, Palette, ExternalLink, Shield } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { Switch } from "@/components/ui/Switch";

export function AdminSiteOptions() {
  const { settings, updateSettings, loading } = useSettings();

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-ink mb-2">Site Options</h1>
          <p className="text-foreground-secondary">Manage feature visibility, check-in settings, and homepage components.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-purple-500">
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <QrCode className="w-6 h-6 mr-2" />
                Check-in & QR Codes
              </CardTitle>
              <CardDescription>Manage online check-in and QR code site cards for flying sites.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Switch
                checked={!!settings.onlineCheckInEnabled}
                onChange={(v) => updateSettings({ onlineCheckInEnabled: v }).catch(() => {})}
                disabled={loading}
                label="Mandatory Check-in"
                description="When enabled, pilots must check in online before flying."
              />
              <div className="border-t border-border-faint pt-3">
                <label htmlFor="qr-code-mode" className="block text-sm font-medium text-foreground-label mb-1.5">QR Code Site Cards</label>
                <select
                  id="qr-code-mode"
                  className="w-full p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-accent focus:border-accent"
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

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-amber-500">
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <Shield className="w-6 h-6 mr-2" />
                Safety Officer Login Prompt
              </CardTitle>
              <CardDescription>Controls the automatic on-site SO login popup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Switch
                checked={settings.soProximityPromptEnabled !== "false"}
                onChange={(v) => updateSettings({ soProximityPromptEnabled: v ? "true" : "false" }).catch(() => {})}
                disabled={loading}
                label="Auto-prompt"
                description="When on, anyone within 500m of a flying site is automatically shown an SO login prompt. Turn this off if you want SO and committee members to log in manually via the admin menu link instead."
              />
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-accent">
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <Star className="w-6 h-6 mr-2" />
                Home Page Options
              </CardTitle>
              <CardDescription>Show or hide sections on the home page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Switch
                checked={!!settings.featuredSiteEnabled}
                onChange={(v) => updateSettings({ featuredSiteEnabled: v }).catch(() => {})}
                disabled={loading}
                label="Featured Sites"
              />
              <div>
                <Switch
                  checked={!!settings.photoSliderEnabled}
                  onChange={(v) => updateSettings({ photoSliderEnabled: v }).catch(() => {})}
                  disabled={loading}
                  label="Photo Carousel"
                />
                {settings.photoSliderEnabled && (
                  <div className="ml-12 mt-2 flex gap-5">
                    <Switch checked={!!settings.photoSliderAutoScroll} onChange={(v) => updateSettings({ photoSliderAutoScroll: v }).catch(() => {})} disabled={loading} label="Auto-scroll" />
                    <Switch checked={!!settings.photoSliderReverse} onChange={(v) => updateSettings({ photoSliderReverse: v }).catch(() => {})} disabled={loading} label="Reverse direction" />
                  </div>
                )}
              </div>
              <div>
                <Switch
                  checked={!!settings.youtubeCarouselEnabled}
                  onChange={(v) => updateSettings({ youtubeCarouselEnabled: v }).catch(() => {})}
                  disabled={loading}
                  label="YouTube Carousel"
                />
                {settings.youtubeCarouselEnabled && (
                  <div className="ml-12 mt-2 flex gap-5">
                    <Switch checked={!!settings.youtubeCarouselAutoScroll} onChange={(v) => updateSettings({ youtubeCarouselAutoScroll: v }).catch(() => {})} disabled={loading} label="Auto-scroll" />
                    <Switch checked={!!settings.youtubeCarouselReverse} onChange={(v) => updateSettings({ youtubeCarouselReverse: v }).catch(() => {})} disabled={loading} label="Reverse direction" />
                  </div>
                )}
              </div>
              {/* These toggles only show/hide the sections. Their content — which site
                  is featured, and the carousel images/videos — is set in Home Settings. */}
              <Link to="/admin/home" className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors pt-1">
                Configure home page content (featured site, carousel images &amp; videos) →
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <Flag className="w-6 h-6 mr-2" />
                Ground Handling Map
              </CardTitle>
              <CardDescription>Manage the embedded Google My Maps ground handling sites page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Switch
                checked={!!settings.groundHandlingEnabled}
                onChange={(v) => updateSettings({ groundHandlingEnabled: v }).catch(() => {})}
                disabled={loading}
                label="Ground Handling Page"
                description="When enabled, the ground handling map appears in the Pilots nav menu and at /ground-handling."
              />

              <div className="border-t border-border-faint pt-4">
                <h4 className="text-sm font-semibold text-ink mb-2">Edit Map Sites</h4>
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
                <h4 className="text-sm font-semibold text-ink mb-2">How to Add a New Site</h4>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>
                    Open the{" "}
                    <a
                      href="https://www.google.com/maps/d/edit?mid=12KBoOkwtN3J9IR97C7RqUwM1ajNR7Lxu&usp=sharing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline font-medium"
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
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View public ground handling page
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <Store className="w-6 h-6 mr-2" />
                Business Directory
              </CardTitle>
              <CardDescription>Show or hide the member business directory on the public site.</CardDescription>
            </CardHeader>
            <CardContent>
              <Switch
                checked={!!settings.businessDirectoryEnabled}
                onChange={(v) => updateSettings({ businessDirectoryEnabled: v }).catch(() => {})}
                disabled={loading}
                label="Business Directory"
                description="When hidden, the directory link is removed from navigation and the public page is inaccessible. Admin management remains available."
              />
            </CardContent>
          </Card>

          <Link to="/admin/branding" className="block group">
            <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-accent">
              <CardHeader>
                <CardTitle className="flex items-center text-ink group-hover:text-accent transition-colors">
                  <Palette className="w-6 h-6 mr-2" />
                  Branding & Templates
                </CardTitle>
                <CardDescription>Club name, logo upload, colour scheme, and visual template.</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Card className="hover:shadow-lg transition-shadow border-t-4 border-t-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <UserPlus className="w-6 h-6 mr-2" />
                Join Page
              </CardTitle>
              <CardDescription>Membership signup page visibility and TidyHQ link.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Switch
                checked={!!settings.joinPageEnabled}
                onChange={(v) => updateSettings({ joinPageEnabled: v }).catch(() => {})}
                disabled={loading}
                label="Join Page"
                description="When enabled, the Join page is visible to the public and appears in the Pilots dropdown menu."
              />
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
