import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Briefcase, FileText, Users, MapPin, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  relatedSiteId: string | null;
  relatedSiteName: string | null;
  coordinatorName: string | null;
  coordinatorOrg: string | null;
  parksVic: number;
  pvContactId: string | null;
  documentCount: number;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  "on-hold": "bg-amber-100 text-amber-800",
  completed: "bg-muted text-foreground",
  archived: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  "on-hold": "On Hold",
  completed: "Completed",
  archived: "Archived",
};

export function AdminProjects() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "date">("date");

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const data = await api.get<Project[]>("/api/projects", token);
      setProjects(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await api.post<Project>("/api/projects", { name: newName.trim() }, token);
      navigate(`/admin/projects/${project.id}`);
    } catch {
    } finally {
      setCreating(false);
    }
  }

  const filtered = projects
    .filter((p) => filterStatus === "all" || p.status === filterStatus)
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-extrabold text-navy mb-2">Project Management</h1>
              <p className="text-muted-foreground">Manage site works, stakeholder relationships, and land management projects.</p>
            </div>
            <Button onClick={() => { setNewName(""); setShowModal(true); }} className="bg-sky hover:bg-navy text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-sky focus:border-sky"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="on-hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "date")}
            className="border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-sky focus:border-sky"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading projects...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-12 h-12 text-foreground-ghost mx-auto mb-4" />
            <p className="text-muted-foreground">
              {projects.length === 0 ? "No projects yet. Create your first project to get started." : "No projects match the selected filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((project) => (
              <Link key={project.id} to={`/admin/projects/${project.id}`} className="block group">
                <Card className="h-full hover:shadow-lg transition-shadow border-t-4 border-t-teal-500">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="flex items-center text-navy group-hover:text-teal-600 transition-colors">
                        <Briefcase className="w-5 h-5 mr-2 flex-shrink-0" />
                        {project.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {project.pvContactId && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                            PV
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusColors[project.status] || "bg-muted text-foreground"}`}>
                          {statusLabels[project.status] || project.status}
                        </span>
                      </div>
                    </div>
                    {project.description && (
                      <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                    )}
                    {project.coordinatorName && (
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium">Coordinator:</span> {project.coordinatorName}{project.coordinatorOrg ? ` (${project.coordinatorOrg})` : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-foreground-faint">
                      {project.relatedSiteName && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {project.relatedSiteName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {project.documentCount} doc{project.documentCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {project.contactCount} contact{project.contactCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-navy">New Project</h2>
              <button onClick={() => setShowModal(false)} className="text-foreground-faint hover:text-foreground-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground-label mb-1">Project Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="e.g. Ben Nevis Launch Repair"
                className="w-full border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-sky focus:border-sky"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={createProject} disabled={!newName.trim() || creating} className="bg-sky hover:bg-navy text-white">
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
