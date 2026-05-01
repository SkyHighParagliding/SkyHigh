import { Link, Navigate } from "react-router-dom";
import { motion } from "motion/react";
import { Download, ExternalLink, Shield, Map, Radio, FileText, ArrowLeft } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { MarkdownWithWidgets } from "@/components/ContentWidgets";
import { usePage, usePageAttachments } from "@/hooks/api";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Airspace() {
  const { settings, loading: settingsLoading } = useSettings();
  const enabled = settings.xcAirspaceEnabled;
  const { data: page = null, isLoading: pageLoading } = usePage(enabled ? 'airspace' : undefined);
  const { data: attachments = [], isLoading: attsLoading } = usePageAttachments(enabled ? 'airspace' : undefined);
  const clubName = settings.clubName || "SkyHigh";
  const loading = pageLoading || attsLoading;

  if (!settingsLoading && !enabled) {
    return <Navigate to="/" replace />;
  }

  if (settingsLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--tmpl-body-bg)" }}>
        <div className="animate-pulse text-[#86868b] text-lg">Loading...</div>
      </div>
    );
  }

  const resources = [
    {
      icon: Shield,
      title: "AirCheck",
      description: "Check airspace restrictions and NOTAMs before flying. Essential pre-flight tool from Airservices Australia.",
      url: "https://www.airservicesaustralia.com/aircheck/",
      color: "#007aff",
    },
    {
      icon: Map,
      title: "OzRunways",
      description: "Aviation mapping and flight planning app with real-time airspace overlays, weather, and NOTAMs for Australian pilots.",
      url: "https://www.ozrunways.com/",
      color: "#34c759",
    },
    {
      icon: Radio,
      title: "Airservices Australia",
      description: "Official airspace charts, NOTAM briefings, and controlled airspace information for all Australian aviation.",
      url: "https://www.airservicesaustralia.com/",
      color: "#ff9500",
    },
    {
      icon: FileText,
      title: "CASA Advisory Circulars",
      description: "Civil Aviation Safety Authority guidance on airspace classifications, rules, and requirements for all aircraft.",
      url: "https://www.casa.gov.au/search-centre/advisory-circulars",
      color: "#af52de",
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--tmpl-body-bg)" }}>
      <div data-hero className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, #1d1d1f 0%, #2c3e50 40%, #0c4a6e 70%, #007aff 100%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>
        <div className="max-w-[980px] mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Link
              to="/"
              className="inline-flex items-center text-white/60 hover:text-white mb-6 text-[14px] transition-colors"
              style={{ fontFamily: "var(--tmpl-font-body)" }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
            </Link>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-4"
              style={{ fontFamily: "var(--tmpl-font-heading)" }}
            >
              Airspace Resources
            </h1>
            <p
              className="text-lg sm:text-xl text-white/70 max-w-2xl"
              style={{ fontFamily: "var(--tmpl-font-body)" }}
            >
              Essential airspace information and tools for safe cross-country flying in Victorian airspace.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-[980px] mx-auto px-6 -mt-12 relative z-20 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl p-6 sm:p-8 mb-8"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.3)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <h2
            className="text-2xl font-semibold mb-3"
            style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}
          >
            Understanding Airspace
          </h2>
          <div
            className="text-[15px] leading-relaxed space-y-3"
            style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-body)" }}
          >
            <p>
              As paraglider and hang glider pilots, we share the sky with other aviation. Understanding controlled airspace
              is critical for safe XC flying, particularly when flying near airports, military zones, and restricted areas.
            </p>
            <p>
              Victorian airspace includes Class C airspace around Melbourne's major airports (Tullamarine and Avalon),
              Class D around regional airports like Moorabbin, Essendon, and Latrobe Valley, plus various restricted
              and danger areas. Always check NOTAMs and airspace status before flying cross-country.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          <h2
            className="text-2xl font-semibold mb-5"
            style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}
          >
            Key Tools & Resources
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {resources.map((resource, i) => (
              <motion.a
                key={resource.title}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 + i * 0.08 }}
                className="group rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] flex flex-col"
                style={{
                  background: "rgba(255,255,255,0.65)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${resource.color}15` }}
                  >
                    <resource.icon className="w-5 h-5" style={{ color: resource.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className="text-[17px] font-semibold"
                        style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}
                      >
                        {resource.title}
                      </h3>
                      <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "#86868b" }} />
                    </div>
                    <p
                      className="text-[14px] leading-relaxed"
                      style={{ color: "#86868b", fontFamily: "var(--tmpl-font-body)" }}
                    >
                      {resource.description}
                    </p>
                  </div>
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>

        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="rounded-2xl p-6 sm:p-8 mb-8"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.3)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}
          >
            <h2
              className="text-2xl font-semibold mb-5"
              style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}
            >
              Downloads
            </h2>
            <div className="space-y-3">
              {attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/pages/airspace/attachments/${att.id}/download`}
                  className="group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 hover:scale-[1.01]"
                  style={{
                    background: "rgba(0,122,255,0.04)",
                    border: "1px solid rgba(0,122,255,0.1)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(0,122,255,0.1)" }}
                  >
                    <Download className="w-5 h-5" style={{ color: "#007aff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[15px] font-medium truncate"
                      style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-body)" }}
                    >
                      {att.originalFilename}
                    </p>
                    <p className="text-[13px]" style={{ color: "#86868b" }}>
                      {formatFileSize(att.fileSize)}
                      {att.downloadCount > 0 && ` · ${att.downloadCount} download${att.downloadCount !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-white shrink-0 group-hover:opacity-90 transition-opacity"
                    style={{ background: "#007aff" }}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {page?.content && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.3)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}
          >
            <MarkdownWithWidgets content={page.content} />
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8 rounded-2xl p-6 sm:p-8"
          style={{
            background: "rgba(255, 149, 0, 0.06)",
            border: "1px solid rgba(255, 149, 0, 0.15)",
            borderRadius: "1.25rem",
          }}
        >
          <div className="flex gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255, 149, 0, 0.12)" }}
            >
              <Shield className="w-5 h-5" style={{ color: "#ff9500" }} />
            </div>
            <div>
              <h3
                className="text-[17px] font-semibold mb-1"
                style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}
              >
                Important Reminder
              </h3>
              <p
                className="text-[14px] leading-relaxed"
                style={{ color: "#86868b", fontFamily: "var(--tmpl-font-body)" }}
              >
                Always check NOTAMs and airspace status before every XC flight. Airspace boundaries and restrictions
                can change at short notice. It is each pilot's responsibility to ensure they are flying legally
                and safely within the rules.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
