import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin, FileText, Activity, Home, Book, Wind, LogOut, BarChart3, ClipboardList, FolderOpen, Briefcase, Contact2, Image as ImageIcon, FileCode2, Wrench, Cpu, Plug, Users, Handshake, Clock, UserPlus, Flag, Store, Navigation, Settings, ShieldAlert, Target } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { AdminSearchBox } from "@/components/AdminSearchBox";

export function AdminDashboard() {
  const { settings } = useSettings();
  const { user, logout } = useAuth();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-extrabold text-navy mb-2">Admin Dashboard</h1>
            <p className="text-foreground-secondary">Welcome back, {user?.name}. Manage all content across the {settings.clubName || 'SkyHigh'} website.</p>
          </div>
          <Button variant="outline" onClick={logout} className="text-muted-foreground hover:text-red-600 hover:border-red-200">
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>

        <AdminSearchBox />

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">Reference & Governance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to="/admin/manual" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-emerald-600">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-emerald-600 transition-colors">
                    <Book className="w-6 h-6 mr-2" />
                    Admin Manual
                  </CardTitle>
                  <CardDescription>Detailed guide on how to use the management tools and site features.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/admin/procedures" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-orange">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-orange transition-colors">
                    <ClipboardList className="w-6 h-6 mr-2" />
                    Procedures Manual
                  </CardTitle>
                  <CardDescription>Club operating procedures — safety, site ops, governance, membership, and events.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">Management</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/admin/documents" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-indigo-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-indigo-500 transition-colors">
                    <FolderOpen className="w-6 h-6 mr-2" />
                    Documents
                  </CardTitle>
                  <CardDescription>Browse and manage the club filing system.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/projects" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-teal-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-teal-500 transition-colors">
                    <Briefcase className="w-6 h-6 mr-2" />
                    Projects
                  </CardTitle>
                  <CardDescription>Site works, stakeholders, and land management.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/contacts" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-cyan-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-cyan-500 transition-colors">
                    <Contact2 className="w-6 h-6 mr-2" />
                    Admin Contacts
                  </CardTitle>
                  <CardDescription>Committee, SSO, SO, Supplier & Stakeholder contacts.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/public-contacts" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-lime-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-lime-500 transition-colors">
                    <UserPlus className="w-6 h-6 mr-2" />
                    Public Contacts
                  </CardTitle>
                  <CardDescription>Manage pilot accounts for flight tracker and public features.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">Content Management</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/admin/sites" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-sky">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-sky transition-colors">
                    <MapPin className="w-6 h-6 mr-2" />
                    Flying Sites
                  </CardTitle>
                  <CardDescription>Manage site guides, rules, and hazards.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/home" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-navy">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-sky transition-colors">
                    <Home className="w-6 h-6 mr-2" />
                    Home Page
                  </CardTitle>
                  <CardDescription>Manage hero text, CTA buttons, cards, and background images.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/images" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-emerald-500 transition-colors">
                    <ImageIcon className="w-6 h-6 mr-2" />
                    Images
                  </CardTitle>
                  <CardDescription>Upload and manage hero and banner image library.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/pages" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-orange">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-orange transition-colors">
                    <FileText className="w-6 h-6 mr-2" />
                    News, Events & Pages
                  </CardTitle>
                  <CardDescription>Manage news articles and dynamic content pages.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/safety" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-red-500 transition-colors">
                    <ShieldAlert className="w-6 h-6 mr-2" />
                    Safety & Rules
                  </CardTitle>
                  <CardDescription>Edit safety page sections, emergency procedures, and club rules.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {settings.onlineCheckInEnabled && (
              <Link to="/admin/checkins" className="block group">
                <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-purple-500">
                  <CardHeader>
                    <CardTitle className="flex items-center text-navy group-hover:text-purple-500 transition-colors">
                      <Activity className="w-6 h-6 mr-2" />
                      Check-ins
                    </CardTitle>
                    <CardDescription>View pilot check-in metrics and history.</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}

            <Link to="/admin/weather" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-sky">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-sky transition-colors">
                    <Wind className="w-6 h-6 mr-2" />
                    Weather Management
                  </CardTitle>
                  <CardDescription>Manage weather data scraping and wind map particle settings.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/ai-models" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-emerald-500 transition-colors">
                    <Cpu className="w-6 h-6 mr-2" />
                    AI Models
                  </CardTitle>
                  <CardDescription>Configure AI text and image model fallback chains.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/pageviews" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-violet-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-violet-500 transition-colors">
                    <BarChart3 className="w-6 h-6 mr-2" />
                    Page Views
                  </CardTitle>
                  <CardDescription>Track page view analytics and visitor traffic.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/sponsors" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-amber-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-amber-600 transition-colors">
                    <Handshake className="w-6 h-6 mr-2" />
                    Sponsors
                  </CardTitle>
                  <CardDescription>Manage sponsor listings, logos, and descriptions.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/business-directory" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-emerald-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-emerald-500 transition-colors">
                    <Store className="w-6 h-6 mr-2" />
                    Business Directory
                  </CardTitle>
                  <CardDescription>Manage member business listings and categories.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">XC (Cross-Country)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/admin/xc" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-sky">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-sky transition-colors">
                    <MapPin className="w-6 h-6 mr-2" />
                    XC Settings
                  </CardTitle>
                  <CardDescription>Manage Maps, Airspace, and Competitions visibility and content.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link to="/admin/flight-tracker" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-sky">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-sky transition-colors">
                    <Navigation className="w-6 h-6 mr-2" />
                    Flight Tracker
                  </CardTitle>
                  <CardDescription>GPS breadcrumb tracking, offline maps, and pilot accounts.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">Integrations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/admin/connections" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-blue-500 transition-colors">
                    <Plug className="w-6 h-6 mr-2" />
                    API Settings
                  </CardTitle>
                  <CardDescription>Manage Google Drive, weather APIs, AI models, and other external service connections.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/admin/connections#tidyhq-group-sync" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-teal-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-teal-500 transition-colors">
                    <Users className="w-6 h-6 mr-2" />
                    TidyHQ Group Sync
                  </CardTitle>
                  <CardDescription>Configure group-to-role mappings for automatic webhook sync and view the sync log.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/admin/scheduled-tasks" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-violet-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-violet-500 transition-colors">
                    <Clock className="w-6 h-6 mr-2" />
                    Scheduled Tasks
                  </CardTitle>
                  <CardDescription>Configure timing for all automated jobs — weather, forecasts, Drive sync, and notifications.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">Site Options</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/admin/site-options" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-purple-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-purple-600 transition-colors">
                    <Settings className="w-6 h-6 mr-2" />
                    Site Options
                  </CardTitle>
                  <CardDescription>Feature visibility, check-in settings, homepage components, and branding.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-3">Specifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link to="/features" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-slate-500">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-slate-600 transition-colors">
                    <FileCode2 className="w-6 h-6 mr-2" />
                    Platform Overview
                  </CardTitle>
                  <CardDescription>All features, categories, and capabilities.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/tech-spec" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-slate-600 transition-colors">
                    <Wrench className="w-6 h-6 mr-2" />
                    Technical Specification
                  </CardTitle>
                  <CardDescription>Complete technical reference — packages, APIs, schema, setup guide.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/build-blueprint" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-emerald-600">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-emerald-600 transition-colors">
                    <FolderOpen className="w-6 h-6 mr-2" />
                    Build Blueprint
                  </CardTitle>
                  <CardDescription>Ordered prompts to recreate the entire platform from scratch — white-label ready.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/product-spec" className="block group">
              <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-indigo-600">
                <CardHeader>
                  <CardTitle className="flex items-center text-navy group-hover:text-indigo-600 transition-colors">
                    <Target className="w-6 h-6 mr-2" />
                    Product Requirements
                  </CardTitle>
                  <CardDescription>Vision, user roles, functional requirements, integrations, and non-functional standards.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
