import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { MapPin, Wind, ChevronRight, ArrowLeft, Search, Menu as MenuIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { prefetchWindGrids } from "@/lib/windGridCache";
import { useSites } from "@/hooks/api";

const SitesWindMapLazy = lazy(() => import('@/components/SitesWindMap').then(m => ({ default: m.SitesWindMapProto })));

export function Sites() {
  const { data: sites = [], isLoading: loading } = useSites(true);
  const [filter, setFilter] = useState("All Sites");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (sites.length > 0) {
      const liveIds = sites.filter((s: any) => s.useLiveWeather === 'true' && s.lat && s.lon).map((s: any) => s.id);
      if (liveIds.length > 0) prefetchWindGrids(liveIds);
    }
  }, [sites]);

  const filteredSites = sites.filter(site => {
    if (searchQuery && !site.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    if (filter === "All Sites") return true;
    if (filter === "Coastal") return (site.type || "").toLowerCase().includes("coastal");
    if (filter === "Inland") return (site.type || "").toLowerCase().includes("inland");
    if (filter === "PG2 Friendly") return (site.pgRating || "").includes("PG2");
    
    const windDir = (site.windDir || "").toUpperCase();
    if (filter === "North") return windDir.includes("N");
    if (filter === "South") return windDir.includes("S");
    if (filter === "East") return windDir.includes("E");
    if (filter === "West") return windDir.includes("W");
    
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const mappableSites = useMemo(() => sites.filter(s => s.lat && s.lon), [sites]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div></div>;
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center text-sky hover:text-sky-light mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-navy mb-4">Flying Sites</h1>
          <p className="text-lg text-foreground-secondary max-w-3xl mb-8">
            Explore our local flying sites. Always check current weather conditions, read the site rules, and ensure you have the appropriate rating before flying.
          </p>

          {mappableSites.length > 0 && (
            <div className="mb-8 rounded-xl overflow-hidden shadow-sm relative aspect-video">
              <Suspense fallback={
                <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a] rounded-xl">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400"></div>
                </div>
              }>
                <SitesWindMapLazy
                  sites={mappableSites.map(s => ({
                    id: s.id,
                    name: s.name,
                    lat: s.lat,
                    lon: s.lon,
                    status: s.status,
                    isSkyHighSite: s.isSkyHighSite,
                    type: s.type,
                    windDir: s.windDir,
                  }))}
                  isAuthenticated={isAuthenticated}
                />
              </Suspense>
            </div>
          )}

          <div className="relative max-w-md mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-faint pointer-events-none" />
            <input
              type="text"
              placeholder="Search sites by name..."
              className="w-full pl-10 pr-3 h-12 rounded-xl border border-border-subtle bg-card text-sm focus:border-sky focus:ring-2 focus:ring-sky focus:outline-none shadow-sm placeholder:text-foreground-faint"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="hidden lg:flex flex-wrap gap-2 mb-8">
          {["All Sites", "Coastal", "Inland", "PG2 Friendly", "North", "South", "East", "West"].map((f) => (
            <Badge
              key={f}
              variant={filter === f ? "default" : "outline"}
              className={`px-4 py-2 text-sm cursor-pointer ${filter === f ? "" : "bg-card hover:bg-muted"}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </Badge>
          ))}
        </div>

        <div className="lg:hidden mb-8 relative">
          <button
            type="button"
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle bg-card text-sm font-medium text-foreground-secondary hover:border-sky transition-colors shadow-sm"
          >
            <MenuIcon className="w-4 h-4" />
            <span>Filter: {filter}</span>
          </button>
          {filterMenuOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-border rounded-xl shadow-lg py-1 min-w-[180px]">
              {["All Sites", "Coastal", "Inland", "PG2 Friendly", "North", "South", "East", "West"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setFilter(f); setFilterMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${filter === f ? "bg-navy text-white font-medium" : "text-foreground-secondary hover:bg-muted"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredSites.map((site) => (
            <Link key={site.id} to={`/sites/${site.id}`} className="group block">
              <Card className="h-full overflow-hidden hover:shadow-xl transition-all duration-300 border-transparent hover:border-sky/30">
                <div className="relative h-48 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300">
                  {site.image && site.image.trim() ? (
                    <img
                      src={site.image}
                      alt={site.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                      No image available
                    </div>
                  )}
                  <div className="absolute top-4 right-4 flex gap-2">
                    {site.temporarilyClosed === 1 ? (
                      <Badge className="bg-amber-500 text-white shadow-sm">Temporarily Closed</Badge>
                    ) : site.status === 'closed' ? (
                      <Badge variant="destructive" className="shadow-sm">Closed</Badge>
                    ) : (
                      <Badge variant="default" className="bg-emerald-500 shadow-sm">Open</Badge>
                    )}
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-xl font-bold text-navy group-hover:text-sky transition-colors">{site.name}</h2>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {site.type}</span>
                    <span className="flex items-center gap-1"><Wind className="w-4 h-4" /> {site.windDir}</span>
                  </div>
                  
                  <p className="text-foreground-secondary text-sm mb-6 line-clamp-2">
                    {site.description}
                  </p>

                  <div className="mt-auto pt-4 border-t border-border-faint">
                    {(() => {
                      const pg = site.pgRating || "";
                      const hg = site.hgRating || "";
                      const hasBadges = !!(pg || hg);
                      return (
                        <>
                          {hasBadges && (
                            <div className="flex flex-col gap-1 mb-2">
                              {pg && (
                                <span className="inline-flex items-baseline gap-1.5 text-[11px] leading-tight">
                                  <span className="font-semibold text-sky whitespace-nowrap">PG:</span>
                                  <span className="text-foreground-secondary">{pg}</span>
                                </span>
                              )}
                              {hg && (
                                <span className="inline-flex items-baseline gap-1.5 text-[11px] leading-tight">
                                  <span className="font-semibold text-sky whitespace-nowrap">HG:</span>
                                  <span className="text-foreground-secondary">{hg}</span>
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center justify-end text-sky font-semibold text-sm group-hover:translate-x-1 transition-transform">
                            Details <ChevronRight className="w-4 h-4 ml-1" />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
