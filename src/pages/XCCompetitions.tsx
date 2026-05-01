import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Trophy, MapPin, Calendar, ExternalLink, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useCompetitions, type Competition } from "@/hooks/api";

export function XCCompetitions() {
  const { settings } = useSettings();
  const { data: competitions = [], isLoading: loading } = useCompetitions();
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (settings.xcCompetitionsEnabled === false) {
    return <Navigate to="/" replace />;
  }

  const upcoming = competitions.filter(c => c.status === "upcoming" || c.status === "active");
  const past = competitions.filter(c => c.status === "completed");

  const formatDate = (d: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  };

  const formatDateRange = (start: string, end: string) => {
    const s = formatDate(start);
    const e = formatDate(end);
    if (!s && !e) return null;
    if (!e || s === e) return s;
    return `${s} — ${e}`;
  };

  return (
    <div style={{ background: "var(--tmpl-body-bg)", minHeight: "100vh" }}>
      <div
        data-hero
        className="relative overflow-hidden py-20 sm:py-28"
        style={{
          background: "linear-gradient(135deg, #0a1628 0%, #1a365d 50%, #2b6cb0 100%)",
        }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)"
          }} />
        </div>
        <div className="relative max-w-[980px] mx-auto px-6 text-center">
          <Trophy className="w-12 h-12 mx-auto mb-4 text-white/80" />
          <h1
            className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-3"
            style={{ fontFamily: "var(--tmpl-font-heading)" }}
          >
            XC Competitions
          </h1>
          <p
            className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto"
            style={{ fontFamily: "var(--tmpl-font-body)" }}
          >
            Cross-country flying competitions, seasonal series, and beginner-friendly events.
          </p>
        </div>
      </div>

      <div className="max-w-[980px] mx-auto px-6 py-12 sm:py-16">
        {loading ? (
          <div className="text-center py-16 text-[#86868b]">Loading competitions...</div>
        ) : (
          <>
            <section>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-8"
                style={{ color: "var(--tmpl-heading-color)", fontFamily: "var(--tmpl-font-heading)" }}
              >
                {upcoming.some(c => c.status === "active") ? "Current & Upcoming" : "Upcoming Competitions"}
              </h2>

              {upcoming.length === 0 ? (
                <div
                  className="text-center py-12 rounded-2xl"
                  style={{
                    background: "var(--tmpl-card-bg)",
                    border: "1px solid var(--tmpl-card-border)",
                    backdropFilter: "var(--tmpl-card-blur)",
                    WebkitBackdropFilter: "var(--tmpl-card-blur)",
                    borderRadius: "var(--tmpl-card-radius)",
                    boxShadow: "var(--tmpl-card-shadow)",
                  }}
                >
                  <Trophy className="w-10 h-10 mx-auto mb-3 text-[#86868b]/40" />
                  <p className="text-[#86868b]">No upcoming competitions at this time.</p>
                  <p className="text-sm text-[#86868b]/60 mt-1">Check back soon for new events!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {upcoming.map(c => (
                    <div
                      key={c.id}
                      className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
                      style={{
                        background: "var(--tmpl-card-bg)",
                        border: "1px solid var(--tmpl-card-border)",
                        backdropFilter: "var(--tmpl-card-blur)",
                        WebkitBackdropFilter: "var(--tmpl-card-blur)",
                        borderRadius: "var(--tmpl-card-radius)",
                        boxShadow: "var(--tmpl-card-shadow)",
                      }}
                    >
                      {c.status === "active" && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-green-500" />
                      )}
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h3
                            className="text-xl font-semibold tracking-tight"
                            style={{ color: "var(--tmpl-heading-color)", fontFamily: "var(--tmpl-font-heading)" }}
                          >
                            {c.name}
                          </h3>
                          {c.status === "active" && (
                            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Live
                            </span>
                          )}
                        </div>

                        <div className="space-y-2 mb-4">
                          {formatDateRange(c.startDate, c.endDate) && (
                            <div className="flex items-center gap-2 text-sm text-[#86868b]">
                              <Calendar className="w-4 h-4 shrink-0" />
                              <span>{formatDateRange(c.startDate, c.endDate)}</span>
                            </div>
                          )}
                          {c.location && (
                            <div className="flex items-center gap-2 text-sm text-[#86868b]">
                              <MapPin className="w-4 h-4 shrink-0" />
                              <span>{c.location}</span>
                            </div>
                          )}
                          {c.pilotRating && (
                            <div className="flex items-center gap-2 text-sm text-[#86868b]">
                              <Shield className="w-4 h-4 shrink-0" />
                              <span>{c.pilotRating}</span>
                            </div>
                          )}
                        </div>

                        {c.description && (
                          <p className="text-sm text-[#1d1d1f]/70 leading-relaxed mb-4" style={{ fontFamily: "var(--tmpl-font-body)" }}>
                            {c.description}
                          </p>
                        )}

                        {c.rulesSummary && (
                          <div className="text-xs text-[#86868b] bg-[#f5f5f7] rounded-lg p-3 mb-4">
                            <span className="font-medium text-[#1d1d1f]/60">Scoring & Rules:</span> {c.rulesSummary}
                          </div>
                        )}

                        {c.registrationUrl && (
                          <a
                            href={c.registrationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
                            style={{ background: "var(--tmpl-accent)" }}
                          >
                            Register <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section className="mt-16">
                <button
                  onClick={() => setArchiveOpen(!archiveOpen)}
                  className="flex items-center gap-2 text-xl sm:text-2xl font-semibold tracking-tight mb-6 group"
                  style={{ color: "var(--tmpl-heading-color)", fontFamily: "var(--tmpl-font-heading)" }}
                >
                  Past Competitions ({past.length})
                  {archiveOpen ? <ChevronUp className="w-5 h-5 text-[#86868b]" /> : <ChevronDown className="w-5 h-5 text-[#86868b]" />}
                </button>

                {archiveOpen && (
                  <div className="space-y-3">
                    {past.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-4 p-4 transition-all"
                        style={{
                          background: "var(--tmpl-card-bg)",
                          border: "1px solid var(--tmpl-card-border)",
                          backdropFilter: "var(--tmpl-card-blur)",
                          WebkitBackdropFilter: "var(--tmpl-card-blur)",
                          borderRadius: "var(--tmpl-card-radius)",
                          opacity: 0.85,
                        }}
                      >
                        <div className="min-w-0">
                          <h4 className="font-medium text-[#1d1d1f] truncate">{c.name}</h4>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#86868b] mt-0.5">
                            {c.location && <span>{c.location}</span>}
                            {formatDateRange(c.startDate, c.endDate) && <span>{formatDateRange(c.startDate, c.endDate)}</span>}
                          </div>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Completed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
