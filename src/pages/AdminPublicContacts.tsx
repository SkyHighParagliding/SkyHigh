import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, X, Search, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { usePublicContacts, useSaveContactMutation, useDeleteContactMutation, useSendResetMutation } from "@/hooks/api";
import type { PublicContact } from "@/types/api";

export function AdminPublicContacts() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const { data: contacts = [], isLoading: loading } = usePublicContacts(search, token);
  const saveMutation = useSaveContactMutation(token);
  const deleteMutation = useDeleteContactMutation(token);
  const resetMutation = useSendResetMutation(token);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PublicContact | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const openNew = () => {
    setEditing(null);
    setForm({ firstName: "", lastName: "", email: "", password: "" });
    setError("");
    setShowForm(true);
  };

  const openEdit = (c: PublicContact) => {
    setEditing(c);
    setForm({ firstName: c.firstName || "", lastName: c.lastName || "", email: c.email, password: "" });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = editing ? `/api/public-contacts/${editing.id}` : "/api/public-contacts";
      const method = editing ? "PUT" : "POST";
      const body: any = { firstName: form.firstName, lastName: form.lastName, email: form.email };
      if (form.password) body.password = form.password;
      else if (!editing) {
        setError("Password is required for new accounts");
        setSaving(false);
        return;
      }

      await saveMutation.mutateAsync({ id: editing?.id, data: body });
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: PublicContact) => {
    const displayName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
    if (!confirm(`Delete pilot "${displayName}"? This will also remove all their flights and sessions.`)) return;
    try {
      await deleteMutation.mutateAsync(c.id);
    } catch {}
  };

  const handleSendReset = async (c: PublicContact) => {
    try {
      await resetMutation.mutateAsync(c.id);
    } catch {
      setError("Network error");
    }
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link to="/admin" className="text-sky hover:text-navy text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-navy">Public Contacts</h1>
              <p className="text-sm text-foreground-secondary mt-1">
                Manage pilot accounts for the flight tracker and public features.
              </p>
            </div>
            <Button onClick={openNew} className="gap-2">
              <Plus className="w-4 h-4" /> Add Pilot
            </Button>
          </div>
        </div>

        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{successMsg}</div>
        )}
        {error && !showForm && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search pilots by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {search ? "No pilots match your search." : "No pilot accounts yet."}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">First Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {(c.firstName as string) || <span className="text-gray-400 italic">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(c.lastName as string) || <span className="text-gray-400 italic">-</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.email}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono hidden lg:table-cell" title={c.id}>
                      {c.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.createdAt ? new Date(c.createdAt as string).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSendReset(c)}
                          title="Send password reset email"
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-500 hover:text-blue-700"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          title="Edit"
                          className="p-1.5 hover:bg-sky-50 rounded text-sky-500 hover:text-sky-700"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          title="Delete"
                          className="p-1.5 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
              {contacts.length} pilot{contacts.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-lg">{editing ? "Edit Pilot" : "Add Pilot"}</h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {editing ? "New Password (leave blank to keep current)" : "Password"}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={6}
                    placeholder={editing ? "Leave blank to keep current" : "Min 6 characters"}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : editing ? "Update" : "Create"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
