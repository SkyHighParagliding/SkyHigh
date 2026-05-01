/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, useLocation, useParams, Link } from "react-router-dom";
import { useEffect, useState, Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/apiClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "./lib/queryClient";
import { usePageView } from "./hooks/usePageView";
import { Layout } from "./components/Layout";
import { LocationConsentBanner } from "./components/LocationConsentBanner";
const Home = lazy(() => import("./pages/Home").then(m => ({ default: m.Home })));
const Sites = lazy(() => import("./pages/Sites").then(m => ({ default: m.Sites })));
const SiteDetail = lazy(() => import("./pages/SiteDetail").then(m => ({ default: m.SiteDetail })));
import { SettingsProvider } from "./contexts/SettingsContext";
import { AuthProvider } from "./contexts/AuthContext";
import { PilotAuthProvider } from "./contexts/PilotAuthContext";
import { TemplateProvider } from "./contexts/TemplateContext";
import { AdminRoute } from "./components/AdminRoute";
const SOProximityDetector = lazy(() => import("./components/SOProximityDetector").then(m => ({ default: m.SOProximityDetector })));

const CheckIn = lazy(() => import("./pages/CheckIn").then(m => ({ default: m.CheckIn })));
const Safety = lazy(() => import("./pages/Safety").then(m => ({ default: m.Safety })));
const News = lazy(() => import("./pages/News").then(m => ({ default: m.News })));
const NewsDetail = lazy(() => import("./pages/NewsDetail").then(m => ({ default: m.NewsDetail })));
const Events = lazy(() => import("./pages/Events").then(m => ({ default: m.Events })));
const Page = lazy(() => import("./pages/Page").then(m => ({ default: m.Page })));
const Features = lazy(() => import("./pages/Features").then(m => ({ default: m.Features })));
const TechSpec = lazy(() => import("./pages/TechSpec").then(m => ({ default: m.TechSpec })));
const BuildBlueprint = lazy(() => import("./pages/BuildBlueprint").then(m => ({ default: m.BuildBlueprint })));
const ProductSpec = lazy(() => import("./pages/ProductSpec").then(m => ({ default: m.ProductSpec })));
const SiteFieldView = lazy(() => import("./pages/SiteFieldView").then(m => ({ default: m.SiteFieldView })));
const ClubPhotos = lazy(() => import("./pages/ClubPhotos").then(m => ({ default: m.ClubPhotos })));
const VideoWall = lazy(() => import("./pages/VideoWall").then(m => ({ default: m.VideoWall })));
const InstaWall = lazy(() => import("./pages/InstaWall").then(m => ({ default: m.InstaWall })));
const GroundHandling = lazy(() => import("./pages/GroundHandling").then(m => ({ default: m.GroundHandling })));
const XCCompetitions = lazy(() => import("./pages/XCCompetitions").then(m => ({ default: m.XCCompetitions })));
const Shop = lazy(() => import("./pages/Shop").then(m => ({ default: m.Shop })));
const Join = lazy(() => import("./pages/Join").then(m => ({ default: m.Join })));
const Sponsors = lazy(() => import("./pages/Sponsors").then(m => ({ default: m.Sponsors })));
const ResetPassword = lazy(() => import("./pages/ResetPassword").then(m => ({ default: m.ResetPassword })));
const Airspace = lazy(() => import("./pages/Airspace").then(m => ({ default: m.Airspace })));
const XCMaps = lazy(() => import("./pages/XCMaps").then(m => ({ default: m.XCMaps })));
const FlightHistory = lazy(() => import("./pages/FlightHistory").then(m => ({ default: m.FlightHistory })));
const RetrievalMap = lazy(() => import("./pages/RetrievalMap").then(m => ({ default: m.RetrievalMap })));
const XCMapsDemo = lazy(() => import("./pages/XCMapsDemo").then(m => ({ default: m.XCMapsDemo })));
const DutyPilotMap = lazy(() => import("./pages/DutyPilotMap").then(m => ({ default: m.DutyPilotMap })));
const BusinessDirectory = lazy(() => import("./pages/BusinessDirectory").then(m => ({ default: m.BusinessDirectory })));

const AdminDashboard = lazy(() => import("./pages/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminSites = lazy(() => import("./pages/AdminSites").then(m => ({ default: m.AdminSites })));
const AdminSiteEdit = lazy(() => import("./pages/AdminSiteEdit").then(m => ({ default: m.AdminSiteEdit })));
const AdminPages = lazy(() => import("./pages/AdminPages").then(m => ({ default: m.AdminPages })));
const AdminPageEdit = lazy(() => import("./pages/AdminPageEdit").then(m => ({ default: m.AdminPageEdit })));
const AdminCheckins = lazy(() => import("./pages/AdminCheckins").then(m => ({ default: m.AdminCheckins })));
const AdminHomeSettings = lazy(() => import("./pages/AdminHomeSettings").then(m => ({ default: m.AdminHomeSettings })));
const AdminManual = lazy(() => import("./pages/AdminManual").then(m => ({ default: m.AdminManual })));
const AdminWeather = lazy(() => import("./pages/AdminWeather").then(m => ({ default: m.AdminWeather })));
const AdminPageViews = lazy(() => import("./pages/AdminPageViews").then(m => ({ default: m.AdminPageViews })));
const AdminDocuments = lazy(() => import("./pages/AdminDocuments").then(m => ({ default: m.AdminDocuments })));
const AdminContacts = lazy(() => import("./pages/AdminContacts").then(m => ({ default: m.AdminContacts })));
const ProceduresManual = lazy(() => import("./pages/ProceduresManual").then(m => ({ default: m.ProceduresManual })));
const AdminProjects = lazy(() => import("./pages/AdminProjects").then(m => ({ default: m.AdminProjects })));
const AdminProjectEdit = lazy(() => import("./pages/AdminProjectEdit").then(m => ({ default: m.AdminProjectEdit })));
const AdminNewsEdit = lazy(() => import("./pages/AdminNewsEdit").then(m => ({ default: m.AdminNewsEdit })));
const WindMapLab = lazy(() => import("./pages/WindMapLab").then(m => ({ default: m.WindMapLab })));
const AdminImages = lazy(() => import("./pages/AdminImages").then(m => ({ default: m.AdminImages })));
const AdminAIModels = lazy(() => import("./pages/AdminAIModels").then(m => ({ default: m.AdminAIModels })));
const AdminBranding = lazy(() => import("./pages/AdminBranding").then(m => ({ default: m.AdminBranding })));
const AdminConnections = lazy(() => import("./pages/AdminConnections").then(m => ({ default: m.AdminConnections })));
const AdminSponsors = lazy(() => import("./pages/AdminSponsors").then(m => ({ default: m.AdminSponsors })));
const AdminBusinessDirectory = lazy(() => import("./pages/AdminBusinessDirectory").then(m => ({ default: m.AdminBusinessDirectory })));
const AdminScheduledTasks = lazy(() => import("./pages/AdminScheduledTasks").then(m => ({ default: m.AdminScheduledTasks })));
const AdminJoinSettings = lazy(() => import("./pages/AdminJoinSettings").then(m => ({ default: m.AdminJoinSettings })));
const AdminCompetitions = lazy(() => import("./pages/AdminCompetitions").then(m => ({ default: m.AdminCompetitions })));
const AdminXC = lazy(() => import("./pages/AdminXC").then(m => ({ default: m.AdminXC })));
const AdminFlightTracker = lazy(() => import("./pages/AdminFlightTracker").then(m => ({ default: m.AdminFlightTracker })));
const AdminSafety = lazy(() => import("./pages/AdminSafety").then(m => ({ default: m.AdminSafety })));
const AdminPublicContacts = lazy(() => import("./pages/AdminPublicContacts").then(m => ({ default: m.AdminPublicContacts })));
const AdminSiteOptions = lazy(() => import("./pages/AdminSiteOptions").then(m => ({ default: m.AdminSiteOptions })));

function SlugFallback() {
  const { slug } = useParams();
  const { data: page, isLoading, error } = useQuery({
    queryKey: ['pages', slug],
    queryFn: () => api.get<Record<string, any>>(`/api/pages/${slug}`),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!error && page) {
    return <Page />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] px-4">
      <div className="text-6xl font-bold text-gray-200 mb-2">404</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Page not found</h1>
      <p className="text-gray-500 mb-6 text-center">The page you're looking for doesn't exist or may have been moved.</p>
      <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors">
        Go to Home
      </Link>
    </div>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  usePageView();

  useEffect(() => {
    if (hash) {
      const id = hash.substring(1);
      let attempts = 0;
      const tryScroll = () => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        } else if (attempts < 10) {
          attempts++;
          setTimeout(tryScroll, 200);
        }
      };
      setTimeout(tryScroll, 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return null;
}

function PageLoader() {
  return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" /></div>;
}

function DevModeBanner() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    fetch("/api/dev-mode").then(r => r.json()).then(d => setActive(d.active)).catch(() => {});
  }, []);
  if (!active) return null;
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[10001] pointer-events-none">
      <span className="inline-block bg-amber-500 text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-md opacity-80">
        DEV MODE
      </span>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <SettingsProvider>
      <TemplateProvider>
      <AuthProvider>
        <PilotAuthProvider>
        <Router>
          <DevModeBanner />
          <ScrollToTop />
          <LocationConsentBanner />
          <Suspense fallback={null}><SOProximityDetector /></Suspense>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="sites/:id/field" element={<SiteFieldView />} />
            <Route path="xc/demo/pilot" element={<Suspense fallback={<PageLoader />}><XCMaps /></Suspense>} />
            <Route path="xc/demo/driver" element={<Suspense fallback={<PageLoader />}><RetrievalMap /></Suspense>} />
            <Route path="xc/demo/duty" element={<Suspense fallback={<PageLoader />}><DutyPilotMap /></Suspense>} />
            <Route path="xc/duty-pilot" element={<Suspense fallback={<PageLoader />}><DutyPilotMap /></Suspense>} />
            <Route path="xc/maps/demo" element={<Suspense fallback={<PageLoader />}><XCMapsDemo /></Suspense>} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="sites" element={<Sites />} />
              <Route path="sites/:id" element={<SiteDetail />} />
              <Route path="news" element={<News />} />
              <Route path="news/:id" element={<NewsDetail />} />
              <Route path="events" element={<Events />} />
              <Route path="shop" element={<Shop />} />
              <Route path="sponsors" element={<Sponsors />} />
              <Route path="ground-handling" element={<GroundHandling />} />
              <Route path="xc/maps" element={<XCMaps />} />
              <Route path="xc/flights" element={<FlightHistory />} />
              <Route path="xc/retrieval" element={<RetrievalMap />} />
              <Route path="xc/airspace" element={<Airspace />} />
              <Route path="xc/competitions" element={<XCCompetitions />} />
              <Route path="check-in" element={<CheckIn />} />
              <Route path="safety" element={<Safety />} />
              <Route path="club-photos" element={<ClubPhotos />} />
              <Route path="video-wall" element={<VideoWall />} />
              <Route path="insta-wall" element={<InstaWall />} />
              <Route path="business-directory" element={<BusinessDirectory />} />

              <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="admin/home" element={<AdminRoute><AdminHomeSettings /></AdminRoute>} />
              <Route path="admin/weather" element={<AdminRoute><AdminWeather /></AdminRoute>} />
              <Route path="admin/pageviews" element={<AdminRoute><AdminPageViews /></AdminRoute>} />
              <Route path="admin/documents" element={<AdminRoute><AdminDocuments /></AdminRoute>} />
              <Route path="admin/contacts" element={<AdminRoute><AdminContacts /></AdminRoute>} />
              <Route path="admin/manual" element={<AdminRoute><AdminManual /></AdminRoute>} />
              <Route path="admin/procedures" element={<AdminRoute><ProceduresManual /></AdminRoute>} />
              <Route path="admin/sites" element={<AdminRoute><AdminSites /></AdminRoute>} />
              <Route path="admin/sites/:id/edit" element={<AdminRoute><AdminSiteEdit /></AdminRoute>} />
              <Route path="admin/sites/new" element={<AdminRoute><AdminSiteEdit /></AdminRoute>} />
              <Route path="admin/pages" element={<AdminRoute><AdminPages /></AdminRoute>} />
              <Route path="admin/pages/:slug/edit" element={<AdminRoute><AdminPageEdit /></AdminRoute>} />
              <Route path="admin/pages/new" element={<AdminRoute><AdminPageEdit /></AdminRoute>} />
              <Route path="admin/checkins" element={<AdminRoute><AdminCheckins /></AdminRoute>} />
              <Route path="admin/news/:id/edit" element={<AdminRoute><AdminNewsEdit /></AdminRoute>} />
              <Route path="admin/news/new" element={<AdminRoute><AdminNewsEdit /></AdminRoute>} />
              <Route path="admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />
              <Route path="admin/projects/:id" element={<AdminRoute><AdminProjectEdit /></AdminRoute>} />
              <Route path="admin/images" element={<AdminRoute><AdminImages /></AdminRoute>} />
              <Route path="admin/windmap-lab" element={<AdminRoute><WindMapLab /></AdminRoute>} />
              <Route path="admin/ai-models" element={<AdminRoute><AdminAIModels /></AdminRoute>} />
              <Route path="admin/branding" element={<AdminRoute><AdminBranding /></AdminRoute>} />
              <Route path="admin/connections" element={<AdminRoute><AdminConnections /></AdminRoute>} />
              <Route path="admin/sponsors" element={<AdminRoute><AdminSponsors /></AdminRoute>} />
              <Route path="admin/business-directory" element={<AdminRoute><AdminBusinessDirectory /></AdminRoute>} />
              <Route path="admin/scheduled-tasks" element={<AdminRoute><AdminScheduledTasks /></AdminRoute>} />
              <Route path="admin/join-settings" element={<AdminRoute><AdminJoinSettings /></AdminRoute>} />
              <Route path="admin/competitions" element={<AdminRoute><AdminCompetitions /></AdminRoute>} />
              <Route path="admin/xc" element={<AdminRoute><AdminXC /></AdminRoute>} />
              <Route path="admin/flight-tracker" element={<AdminRoute><AdminFlightTracker /></AdminRoute>} />
              <Route path="admin/safety" element={<AdminRoute><AdminSafety /></AdminRoute>} />
              <Route path="admin/public-contacts" element={<AdminRoute><AdminPublicContacts /></AdminRoute>} />
              <Route path="admin/site-options" element={<AdminRoute><AdminSiteOptions /></AdminRoute>} />

              <Route path="page/:slug" element={<Page />} />
              <Route path="features" element={<Features />} />
              <Route path="tech-spec" element={<TechSpec />} />
              <Route path="build-blueprint" element={<BuildBlueprint />} />
              <Route path="product-spec" element={<ProductSpec />} />
              <Route path="reset-password" element={<ResetPassword />} />

              <Route path="contact" element={<div className="p-20 text-center text-2xl">Contact - Coming Soon</div>} />
              <Route path="join" element={<Join />} />
              <Route path=":slug" element={<SlugFallback />} />
            </Route>
          </Routes>
          </Suspense>
        </Router>
        </PilotAuthProvider>
      </AuthProvider>
      </TemplateProvider>
    </SettingsProvider>
    <Toaster position="top-right" richColors closeButton duration={3000} />
    </QueryClientProvider>
  );
}
