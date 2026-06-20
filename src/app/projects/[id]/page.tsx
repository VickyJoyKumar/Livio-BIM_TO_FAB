"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  updated_at: string;
}

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-500",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Project Name",
  description: "Description",
  address: "Address",
  client_name: "Client Name",
  project_number: "Project #",
  due_date: "Due Date",
  square_footage: "Sq. Footage",
};

export default function ProjectDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [panelsCount, setPanelsCount] = useState(0);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    address: "",
    client_name: "",
    project_number: "",
    due_date: "",
    square_footage: "",
  });

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setMessage({ type: "error", text: data.error });
        } else {
          setProject(data);
          setEditForm({
            name: data.name ?? "",
            description: data.description ?? "",
            address: data.address ?? "",
            client_name: data.client_name ?? "",
            project_number: data.project_number ?? "",
            due_date: data.due_date ?? "",
            square_footage: data.square_footage?.toString() ?? "",
          });
        }
        setLoading(false);
      })
      .catch(() => {
        setMessage({ type: "error", text: "Failed to load project" });
        setLoading(false);
      });

    // Fetch panel count
    fetch(`/api/projects/${projectId}/panels`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPanelsCount(data.length);
      })
      .catch(() => {});
  }, [projectId]);

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      setMessage({ type: "error", text: "Project name is required" });
      return;
    }
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      address: editForm.address.trim() || null,
      client_name: editForm.client_name.trim() || null,
      project_number: editForm.project_number.trim() || null,
      due_date: editForm.due_date || null,
      square_footage: editForm.square_footage ? Number(editForm.square_footage) : null,
    };

    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error) {
      setMessage({ type: "error", text: data.error });
    } else {
      setProject(data);
      setEditing(false);
      setMessage({ type: "success", text: "Project updated!" });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  const handleArchive = async () => {
    setArchiving(true);
    setMessage(null);

    const res = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (data.error) {
      setMessage({ type: "error", text: data.error });
    } else {
      setProject(data);
      setShowArchiveConfirm(false);
      setMessage({ type: "success", text: "Project archived" });
      setTimeout(() => router.push("/dashboard"), 1500);
    }
    setArchiving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="mx-auto max-w-2xl px-4 py-12">
          <p className="text-center text-gray-500">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Breadcrumb + Actions */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Projects
          </button>

          {project.status !== "archived" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(!editing)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              >
                {editing ? "Cancel" : "Edit"}
              </button>
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
              >
                Archive
              </button>
            </div>
          )}
        </div>

        {/* Status + Name Header */}
        <div className="mb-6">
          <span
            className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium capitalize ${
              STATUS_BADGES[project.status]
            }`}
          >
            {project.status}
          </span>
          {!editing && (
            <h1 className="mt-2 text-2xl font-bold text-gray-900">{project.name}</h1>
          )}
        </div>

        {message && (
          <div
            className={`mb-4 rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Detail Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {editing ? (
            // Edit Mode
            <div className="space-y-4">
              {["name", "description", "address", "client_name", "project_number"].map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {FIELD_LABELS[field]}
                    {field === "name" && <span className="text-red-500"> *</span>}
                  </label>
                  {field === "description" ? (
                    <textarea
                      value={editForm[field as keyof typeof editForm]}
                      onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <input
                      type="text"
                      value={editForm[field as keyof typeof editForm]}
                      onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</label>
                  <input
                    type="date"
                    value={editForm.due_date}
                    onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">Sq. Footage</label>
                  <input
                    type="number"
                    value={editForm.square_footage}
                    onChange={(e) => setEditForm({ ...editForm, square_footage: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          ) : (
            // View Mode
            <div className="space-y-4">
              {project.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</p>
                  <p className="mt-1 text-sm text-gray-700">{project.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {project.client_name && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client</p>
                    <p className="mt-1 text-sm text-gray-700">{project.client_name}</p>
                  </div>
                )}
                {project.project_number && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Project #</p>
                    <p className="mt-1 text-sm text-gray-700">{project.project_number}</p>
                  </div>
                )}
                {project.address && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address</p>
                    <p className="mt-1 text-sm text-gray-700">{project.address}</p>
                  </div>
                )}
                {project.due_date && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</p>
                    <p className="mt-1 text-sm text-gray-700">{format(project.due_date)}</p>
                  </div>
                )}
                {project.square_footage && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sq. Footage</p>
                    <p className="mt-1 text-sm text-gray-700">{Number(project.square_footage).toLocaleString()} SF</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
                  <p className="mt-1 text-sm text-gray-700">{format(project.created_at)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Future Phase Placeholders */}
        {project.status !== "archived" && !editing && (
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Project Features</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push(`/projects/${project.id}/panels`)}
                className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center text-sm font-medium text-blue-700 transition hover:bg-blue-100 hover:shadow-sm"
              >
                🧩 Panels ({panelsCount})
              </button>
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
                📦 Models
              </div>
              <button
                onClick={() => router.push("/scanner")}
                className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center text-sm font-medium text-blue-700 transition hover:bg-blue-100 hover:shadow-sm"
              >
                📸 Scan QR Code
              </button>
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
                ⚠️ Issues (Phase 09)
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Archive Project?</h3>
            <p className="mt-2 text-sm text-gray-600">
              "{project.name}" will be archived and hidden from the main project list. You can view it in the archived section.
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {archiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}