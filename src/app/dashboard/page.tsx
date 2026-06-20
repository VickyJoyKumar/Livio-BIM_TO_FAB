"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "@/lib/format-date";

interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  client_name: string | null;
  project_number: string | null;
  due_date: string | null;
  square_footage: number | null;
  status: "active" | "completed" | "archived";
  created_by: string;
  created_at: string;
}

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-500",
};

const NEW_PROJECT_DEFAULTS = {
  name: "",
  description: "",
  address: "",
  client_name: "",
  project_number: "",
  due_date: "",
  square_footage: "",
};

type FormErrors = Partial<Record<keyof typeof NEW_PROJECT_DEFAULTS, string>>;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...NEW_PROJECT_DEFAULTS });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setProjects(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Project name is required";
    if (form.square_footage && isNaN(Number(form.square_footage))) {
      errs.square_footage = "Must be a number";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        square_footage: form.square_footage ? Number(form.square_footage) : null,
        due_date: form.due_date || null,
      }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setProjects((prev) => [data, ...prev]);
      setShowModal(false);
      setForm({ ...NEW_PROJECT_DEFAULTS });
      setFormErrors({});
    }
    setSaving(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.status !== "archived");
  const archivedProjects = projects.filter((p) => p.status === "archived");

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500">
              {activeProjects.length} active project{activeProjects.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty State */}
        {activeProjects.length === 0 && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12">
            <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">No projects yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Create your first BIM project to get started.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98]"
            >
              Create Your First Project
            </button>
          </div>
        )}

        {/* Active Project Cards */}
        {activeProjects.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}`)}
                className="group rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md active:scale-[0.98]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
                    {project.name}
                  </h3>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      STATUS_BADGES[project.status]
                    }`}
                  >
                    {project.status}
                  </span>
                </div>

                {project.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-gray-500">
                    {project.description}
                  </p>
                )}

                <div className="space-y-1 text-xs text-gray-400">
                  {project.client_name && (
                    <p><span className="font-medium text-gray-500">Client:</span> {project.client_name}</p>
                  )}
                  {project.project_number && (
                    <p><span className="font-medium text-gray-500">Project #:</span> {project.project_number}</p>
                  )}
                  {project.address && (
                    <p className="truncate"><span className="font-medium text-gray-500">Address:</span> {project.address}</p>
                  )}
                  {project.due_date && (
                    <p><span className="font-medium text-gray-500">Due:</span> {format(project.due_date)}</p>
                  )}
                  {project.square_footage && (
                    <p><span className="font-medium text-gray-500">SF:</span> {Number(project.square_footage).toLocaleString()}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Archived Section */}
        {archivedProjects.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700">
              Archived Projects ({archivedProjects.length})
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archivedProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-left opacity-60 transition hover:opacity-100"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">{project.name}</h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 capitalize">
                      archived
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </details>
        )}
      </main>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Project</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {/* Name (required) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 123 Main St ADU"
                />
                {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Brief project description"
                />
              </div>

              {/* Client + Project Number row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Client Name</label>
                  <input
                    type="text"
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Client"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Project #</label>
                  <input
                    type="text"
                    value={form.project_number}
                    onChange={(e) => setForm({ ...form, project_number: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. LIV-2024-001"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Project address"
                />
              </div>

              {/* Due date + Square footage row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Sq. Footage</label>
                  <input
                    type="number"
                    value={form.square_footage}
                    onChange={(e) => setForm({ ...form, square_footage: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. 1000"
                  />
                  {formErrors.square_footage && <p className="mt-1 text-xs text-red-500">{formErrors.square_footage}</p>}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}