import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, Trash2, Palette, Type, Image as ImageIcon, LayoutTemplate, Check, AlertCircle, Sun, Moon, Save, Smartphone } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getTemplateList } from "@/templates/registry";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { api } from "@/lib/apiClient";

export function AdminBranding() {
  const { settings, updateSettings, refreshSettings } = useSettings();
  const { token } = useAuth();
  const [clubName, setClubName] = useState("");
  const [clubTagline, setClubTagline] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [uploadingPwa, setUploadingPwa] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [logoModeSaved, setLogoModeSaved] = useState<string | null>(null);
  const fileLightRef = useRef<HTMLInputElement>(null);
  const fileDarkRef = useRef<HTMLInputElement>(null);
  const filePwaRef = useRef<HTMLInputElement>(null);
  const { isDirty, markDirty, blocker, saving, justSaved, saveError, setSaveError, save } = useAdminForm({ successMessage: "Branding saved" });

  useEffect(() => {
    setClubName(settings.clubName || "SkyHigh");
    setClubTagline(settings.clubTagline || "");
  }, [settings.clubName, settings.clubTagline]);

  useEffect(() => {
    setSelectedTemplate(settings.activeTemplate || "classic");
  }, [settings.activeTemplate]);

  useEffect(() => {
    setPrimaryColor(settings.clubPrimaryColor || "");
  }, [settings.clubPrimaryColor]);

  const saveAll = useCallback(async () => {
    await save(async () => {
      await updateSettings({
        clubName,
        clubTagline,
        activeTemplate: selectedTemplate,
        clubPrimaryColor: primaryColor,
      });
    });
  }, [clubName, clubTagline, selectedTemplate, primaryColor, updateSettings, save]);

  async function handleResetColor() {
    setSaveError("");
    setPrimaryColor("");
    markDirty();
  }

  async function handleLogoUpload(variant: "light" | "dark", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const setUploading = variant === "light" ? setUploadingLight : setUploadingDark;
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const endpoint = variant === "light" ? "/api/branding/logo" : "/api/branding/logo-dark";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(data.error || "Upload failed");
      }
      await res.json();
      await refreshSettings();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      const ref = variant === "light" ? fileLightRef : fileDarkRef;
      if (ref.current) ref.current.value = "";
    }
  }

  async function handleLogoDelete(variant: "light" | "dark") {
    try {
      const endpoint = variant === "light" ? "/api/branding/logo" : "/api/branding/logo-dark";
      await api.delete(endpoint, token);
      await refreshSettings();
    } catch {}
  }

  async function handlePwaIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPwa(true);
    setUploadError("");
    const formData = new FormData();
    formData.append("logo", file);
    try {
      const res = await fetch("/api/branding/pwa-icon", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(data.error || "Upload failed");
      }
      await refreshSettings();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploadingPwa(false);
      if (filePwaRef.current) filePwaRef.current.value = "";
    }
  }

  async function handlePwaIconDelete() {
    try {
      await api.delete("/api/branding/pwa-icon", token);
      await refreshSettings();
    } catch {}
  }

  async function handleLogoModeChange(templateId: string, mode: string) {
    setSaveError("");
    setLogoModeSaved(templateId);
    try {
      await updateSettings({ [`logoMode_${templateId}`]: mode });
      setTimeout(() => setLogoModeSaved(null), 2000);
    } catch (err: any) {
      setSaveError(err.message);
      setLogoModeSaved(null);
    }
  }

  const templateList = getTemplateList();

  const SaveButton = () => (
    <Button
      onClick={saveAll}
      className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
    >
      {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
    </Button>
  );

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:underline text-sm mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy">Branding & Templates</h1>
          <p className="text-foreground-secondary mt-1">Customise your club's identity and visual template.</p>
        </div>

        {saveError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex justify-end mb-6">
          <SaveButton />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <Type className="w-5 h-5 mr-2" />
                Club Identity
              </CardTitle>
              <CardDescription>Set your club name and tagline. These appear throughout the site.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground-label block mb-1">Club Name</label>
                <Input
                  value={clubName}
                  onChange={(e) => { setClubName(e.target.value); markDirty(); }}
                  placeholder="e.g. SkyHigh Paragliding Club"
                  className="border border-border focus:ring-1 focus:ring-sky focus:border-sky"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground-label block mb-1">Tagline</label>
                <Input
                  value={clubTagline}
                  onChange={(e) => { setClubTagline(e.target.value); markDirty(); }}
                  placeholder="e.g. Soar above the rest"
                  className="border border-border focus:ring-1 focus:ring-sky focus:border-sky"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <ImageIcon className="w-5 h-5 mr-2" />
                Club Logos
              </CardTitle>
              <CardDescription>Upload light and dark versions of your logo. Assign which version each template uses below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-navy">Light Logo</h3>
                  </div>
                  {settings.clubLogoOriginal && (
                    <div className="p-3 bg-card border border-border-subtle rounded-lg">
                      <div className="flex items-center justify-center p-4 bg-white rounded-md border border-border-subtle mb-2">
                        <img src={settings.clubLogoNav} alt="Light logo" className="h-12 w-auto" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-foreground-faint">
                        <span>Nav</span>
                        <img src={settings.clubLogoNav} alt="" className="h-6 w-auto" />
                        <span>Footer</span>
                        <img src={settings.clubLogoFooter} alt="" className="h-8 w-auto" />
                        <span>Favicon</span>
                        <img src={settings.clubLogoFavicon} alt="" className="h-5 w-auto" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileLightRef}
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={(e) => handleLogoUpload("light", e)}
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileLightRef.current?.click()}
                      variant="outline"
                      size="sm"
                      disabled={uploadingLight}
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      {uploadingLight ? "Uploading..." : settings.clubLogoOriginal ? "Replace" : "Upload"}
                    </Button>
                    {settings.clubLogoOriginal && (
                      <Button onClick={() => handleLogoDelete("light")} variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:border-red-200">
                        <Trash2 className="w-4 h-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-navy">Dark Logo</h3>
                  </div>
                  {settings.clubLogoDarkOriginal && (
                    <div className="p-3 bg-card border border-border-subtle rounded-lg">
                      <div className="flex items-center justify-center p-4 rounded-md border border-border-subtle mb-2" style={{ background: '#1a2b3c' }}>
                        <img src={settings.clubLogoDarkNav} alt="Dark logo" className="h-12 w-auto" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-foreground-faint">
                        <span>Nav</span>
                        <img src={settings.clubLogoDarkNav} alt="" className="h-6 w-auto" />
                        <span>Footer</span>
                        <img src={settings.clubLogoDarkFooter} alt="" className="h-8 w-auto" />
                        <span>Favicon</span>
                        <img src={settings.clubLogoDarkFavicon} alt="" className="h-5 w-auto" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileDarkRef}
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={(e) => handleLogoUpload("dark", e)}
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileDarkRef.current?.click()}
                      variant="outline"
                      size="sm"
                      disabled={uploadingDark}
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      {uploadingDark ? "Uploading..." : settings.clubLogoDarkOriginal ? "Replace" : "Upload"}
                    </Button>
                    {settings.clubLogoDarkOriginal && (
                      <Button onClick={() => handleLogoDelete("dark")} variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:border-red-200">
                        <Trash2 className="w-4 h-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
              <p className="text-xs text-muted-foreground">Recommended: Square PNG or SVG, at least 512x512px. Max 5MB.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <Smartphone className="w-5 h-5 mr-2" />
                Home Screen Icon
              </CardTitle>
              <CardDescription>Upload a custom icon that appears when someone adds the site to their phone's home screen. Square image recommended (512×512px or larger).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-6">
                {settings.pwaIcon192 ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-card border border-border-subtle rounded-lg">
                      <div className="flex items-center justify-center p-2 bg-gray-100 rounded-xl border border-border-subtle" style={{ width: 80, height: 80 }}>
                        <img src={settings.pwaIcon192} alt="Home screen icon" className="w-16 h-16 rounded-xl" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">192×192</p>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 border-2 border-dashed border-border-subtle rounded-lg flex items-center justify-center" style={{ width: 80, height: 80 }}>
                    <Smartphone className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={filePwaRef}
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handlePwaIconUpload}
                      className="hidden"
                    />
                    <Button
                      onClick={() => filePwaRef.current?.click()}
                      variant="outline"
                      size="sm"
                      disabled={uploadingPwa}
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      {uploadingPwa ? "Uploading..." : settings.pwaIcon192 ? "Replace" : "Upload Icon"}
                    </Button>
                    {settings.pwaIcon192 && (
                      <Button onClick={handlePwaIconDelete} variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:border-red-200">
                        <Trash2 className="w-4 h-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                  {!settings.pwaIcon192 && settings.clubLogoFavicon && (
                    <p className="text-xs text-muted-foreground">No custom icon set — the club favicon will be used as a fallback.</p>
                  )}
                  <p className="text-xs text-muted-foreground">This icon is used on both iPhone and Android when a user saves the site to their home screen.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <LayoutTemplate className="w-5 h-5 mr-2" />
                Visual Template
              </CardTitle>
              <CardDescription>Choose the overall look and feel of your site, and assign which logo each template uses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templateList.map((tmpl) => {
                  const isSelected = selectedTemplate === tmpl.id;
                  const currentLogoMode = (settings as any)[`logoMode_${tmpl.id}`] || "light";
                  const hasLight = !!settings.clubLogoOriginal;
                  const hasDark = !!settings.clubLogoDarkOriginal;
                  return (
                    <div key={tmpl.id} className="space-y-2">
                      <button
                        onClick={() => { setSelectedTemplate(tmpl.id); markDirty(); }}
                        className={`relative text-left p-4 rounded-xl border-2 transition-all w-full ${
                          isSelected
                            ? "border-sky bg-sky/5 shadow-md"
                            : "border-border hover:border-sky/40 hover:shadow-sm"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-sky flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div
                          className="w-full h-24 rounded-lg mb-3 border"
                          style={{
                            background: tmpl.id === "classic"
                              ? "linear-gradient(135deg, #1a2b3c 0%, #1a2b3c 50%, #ff6b35 50%, #ff6b35 100%)"
                              : "linear-gradient(135deg, #f5f5f7 0%, #ffffff 50%, #007aff 50%, #007aff 100%)",
                          }}
                        />
                        <h3 className="font-semibold text-navy text-sm">{tmpl.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
                      </button>
                      {(hasLight || hasDark) && (
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-xs text-foreground-faint font-medium whitespace-nowrap">Logo:</span>
                          <div className="flex rounded-lg border border-border overflow-hidden">
                            <button
                              onClick={() => handleLogoModeChange(tmpl.id, "light")}
                              disabled={!hasLight}
                              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                                currentLogoMode === "light"
                                  ? "bg-sky text-white"
                                  : "bg-card text-foreground-secondary hover:bg-sky/10"
                              } ${!hasLight ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                              <Sun className="w-3 h-3" /> Light
                            </button>
                            <button
                              onClick={() => handleLogoModeChange(tmpl.id, "dark")}
                              disabled={!hasDark}
                              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                                currentLogoMode === "dark"
                                  ? "bg-sky text-white"
                                  : "bg-card text-foreground-secondary hover:bg-sky/10"
                              } ${!hasDark ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                              <Moon className="w-3 h-3" /> Dark
                            </button>
                          </div>
                          {logoModeSaved === tmpl.id && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-navy">
                <Palette className="w-5 h-5 mr-2" />
                Primary Colour
              </CardTitle>
              <CardDescription>Override the accent colour used across the site. Leave blank to use the template default.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor || "#00a8e8"}
                  onChange={(e) => { setPrimaryColor(e.target.value); markDirty(); }}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => { setPrimaryColor(e.target.value); markDirty(); }}
                  placeholder="#00a8e8"
                  className="w-32 border border-border focus:ring-1 focus:ring-sky focus:border-sky font-mono text-sm"
                />
                {primaryColor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetColor}
                    className="text-muted-foreground text-xs"
                  >
                    Reset to default
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end mt-6">
          <SaveButton />
        </div>
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={saveAll} />
    </div>
  );
}
