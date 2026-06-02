import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Activity, Users, MapPin, Calendar } from "lucide-react";
import { useCheckins, useCheckinStats } from "@/hooks/api";

export function AdminCheckins() {
  const { data: stats = null, isLoading: statsLoading } = useCheckinStats();
  const { data: recentCheckins = [], isLoading: checkinsLoading } = useCheckins();
  const loading = statsLoading || checkinsLoading;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>
        
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-navy mb-2">Check-in Metrics</h1>
          <p className="text-foreground-secondary">View statistics and recent pilot check-ins.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-t-4 border-t-sky">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Check-ins</p>
                  <p className="text-3xl font-bold text-navy">{stats?.total || 0}</p>
                </div>
                <div className="p-3 bg-sky/10 rounded-full">
                  <Activity className="w-6 h-6 text-sky" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Today's Check-ins</p>
                  <p className="text-3xl font-bold text-navy">{stats?.today || 0}</p>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full">
                  <Calendar className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-navy">
                  <MapPin className="w-5 h-5 mr-2" /> Check-ins by Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(Array.isArray(stats?.bySite) ? stats.bySite : []).map((site: any) => (
                    <div key={site.siteName} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground-label">{site.siteName}</span>
                      <span className="text-sm font-bold text-navy bg-muted px-2 py-1 rounded-full">{site.count}</span>
                    </div>
                  ))}
                  {(!stats?.bySite || stats.bySite.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No check-in data available yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-navy">
                  <Users className="w-5 h-5 mr-2" /> Recent Check-ins
                </CardTitle>
                <CardDescription>The 100 most recent pilot check-ins across all sites.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-background border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium">Check-in ID</th>
                        <th className="px-4 py-3 font-medium">Site</th>
                        <th className="px-4 py-3 font-medium">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recentCheckins || []).map((checkin) => (
                        <tr key={checkin.id} className="border-b hover:bg-background">
                          <td className="px-4 py-3 font-mono font-medium text-navy">{checkin.id}</td>
                          <td className="px-4 py-3 text-foreground-label">{checkin.siteName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(checkin.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                        </tr>
                      ))}
                      {recentCheckins.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                            No recent check-ins found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
