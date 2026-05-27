import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, Globe, Store, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/contexts/SettingsContext";
import { useBusinessDirectory, type BusinessListing } from "@/hooks/api";

export function BusinessDirectory() {
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();
  const enabled = !settingsLoading && !!settings.businessDirectoryEnabled;
  const { data: listings = [], isLoading: loading } = useBusinessDirectory(enabled);
  const [filter, setFilter] = useState("All");
  const categories = useMemo(() => {
    const cats = Array.from(new Set(listings.map((l) => l.category).filter(Boolean))) as string[];
    return cats.sort();
  }, [listings]);

  useEffect(() => {
    if (!settingsLoading && !settings.businessDirectoryEnabled) {
      navigate("/", { replace: true });
      return;
    }
    window.scrollTo(0, 0);
  }, [settings.businessDirectoryEnabled, settingsLoading, navigate]);

  const filteredListings = filter === "All"
    ? listings
    : listings.filter(l => l.category === filter);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--tmpl-body-bg)" }} className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center text-sky hover:text-sky-light mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <div className="mb-10">
          <h1
            className="text-4xl md:text-5xl font-extrabold mb-4"
            style={{ color: "var(--tmpl-heading-color)", fontFamily: "var(--tmpl-font-heading)" }}
          >
            Business Directory
          </h1>
          <p
            className="text-lg max-w-3xl mb-8"
            style={{ color: "#86868b", fontFamily: "var(--tmpl-font-body)" }}
          >
            Products and services offered by our club members. Support your fellow pilots by checking out their businesses.
          </p>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge
                variant={filter === "All" ? "default" : "outline"}
                className={`px-4 py-2 text-sm cursor-pointer ${filter === "All" ? "" : "bg-card hover:bg-muted"}`}
                onClick={() => setFilter("All")}
              >
                All
              </Badge>
              {categories.map(cat => (
                <Badge
                  key={cat}
                  variant={filter === cat ? "default" : "outline"}
                  className={`px-4 py-2 text-sm cursor-pointer ${filter === cat ? "" : "bg-card hover:bg-muted"}`}
                  onClick={() => setFilter(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {filteredListings.length === 0 ? (
          <div className="text-center py-20">
            <Store className="w-16 h-16 mx-auto mb-4" style={{ color: "#86868b", opacity: 0.4 }} />
            <p className="text-lg" style={{ color: "#86868b" }}>
              {filter !== "All" ? `No listings in the "${filter}" category.` : "No business listings yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map(listing => (
              <div
                key={listing.id}
                className="group rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg"
                style={{
                  background: "var(--tmpl-card-bg)",
                  border: "1px solid var(--tmpl-card-border)",
                  borderRadius: "var(--tmpl-card-radius)",
                  boxShadow: "var(--tmpl-card-shadow)",
                  backdropFilter: "var(--tmpl-card-blur)",
                  WebkitBackdropFilter: "var(--tmpl-card-blur)",
                }}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    {listing.imagePath && listing.imagePath.trim() ? (
                      <div className="shrink-0 w-14 h-14 rounded-xl bg-white/80 border border-black/5 shadow-sm flex items-center justify-center overflow-hidden">
                        <img
                          src={listing.imagePath}
                          alt={`${listing.businessName} logo`}
                          className="w-full h-full object-contain p-1.5"
                        />
                      </div>
                    ) : (
                      <div
                        className="shrink-0 w-14 h-14 rounded-xl shadow-sm flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, rgba(0,122,255,0.08), rgba(0,122,255,0.16))" }}
                      >
                        <span
                          className="text-xl font-extrabold"
                          style={{ color: "var(--tmpl-accent)", opacity: 0.7 }}
                        >
                          {listing.businessName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-lg font-bold truncate"
                        style={{ color: "var(--tmpl-heading-color)", fontFamily: "var(--tmpl-font-heading)" }}
                      >
                        {listing.businessName}
                      </h3>
                      {listing.memberName && (
                        <p className="text-sm mt-0.5" style={{ color: "#86868b" }}>
                          {listing.memberName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <Badge
                      className="text-xs px-2.5 py-0.5"
                      style={{
                        background: "var(--tmpl-badge-bg)",
                        color: "var(--tmpl-badge-text)",
                      }}
                    >
                      {listing.category}
                    </Badge>
                  </div>

                  {listing.description && (
                    <p
                      className="text-sm mb-4 line-clamp-3"
                      style={{ color: "#6e6e73", fontFamily: "var(--tmpl-font-body)" }}
                    >
                      {listing.description}
                    </p>
                  )}

                  <div className="space-y-2 pt-3 border-t" style={{ borderColor: "var(--tmpl-card-border)" }}>
                    {listing.phone && (
                      <a
                        href={`tel:${listing.phone}`}
                        className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
                        style={{ color: "var(--tmpl-accent)" }}
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{listing.phone}</span>
                      </a>
                    )}
                    {listing.email && (
                      <a
                        href={`mailto:${listing.email}`}
                        className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
                        style={{ color: "var(--tmpl-accent)" }}
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>{listing.email}</span>
                      </a>
                    )}
                    {listing.websiteUrl && (
                      <a
                        href={listing.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
                        style={{ color: "var(--tmpl-accent)" }}
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{listing.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
