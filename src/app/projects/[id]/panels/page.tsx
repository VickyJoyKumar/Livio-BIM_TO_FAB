"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface Panel {
  id: string;
  project_id: string;
  name: string;
  panel_type: string | null;
  qr_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const PANEL_TYPES = [
  "Wall Panel",
  "Roof Panel",
  "Floor Panel",
  "Beam",
  "Column",
  "Shear Wall",
  "Staircase",
  "Other",
];

export default function ProjectPanelsPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Wall Panel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    summary: { total: number; uploaded: number; no_match: number; errors: number; skipped: number };
    results: { file: string; status: string; message: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPanels = async () => {
    const res = await fetch(`/api/projects/${projectId}/panels`);
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setPanels(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Also fetch project name for the header
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.name) setProjectName(d.name);
      })
      .catch(() => {});
    fetchPanels();
  }, [projectId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/panels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), panel_type: newType }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setPanels((prev) => [data, ...prev]);
      setShowModal(false);
      setNewName("");
      setNewType("Wall Panel");
    }
    setSaving(false);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setBulkResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/projects/${projectId}/bulk-upload`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setBulkResult(data);
      // Refresh panel list to update model counts
      fetchPanels();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const STATUS_ICON: Record<string, string> = {
    uploaded: "✅",
    no_match: "⚠️",
    error: "❌",
    skipped: "⏭️",
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {projectName || "Project"}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Panels</h1>
              <p className="text-sm text-gray-500">{panels.length} panel{panels.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Bulk Upload ZIP
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Panel
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Empty State */}
        {!loading && panels.length === 0 && (
          <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12">
            <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">No panels yet</h3>
            <p className="mt-1 text-sm text-gray-500">Add panels to this project to start managing BIM models.</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98]"
            >
              Add First Panel
            </button>
          </div>
        )}

        {/* Panel List */}
        {loading ? (
          <div className="text-center text-gray-500">Loading panels...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {panels.map((panel) => (
              <button
                key={panel.id}
                onClick={() => router.push(`/panels/${panel.id}`)}
                className="group rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
                    {panel.name}
                  </h3>
                  {panel.panel_type && (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {panel.panel_type}
                    </span>
                  )}
                </div>
                {panel.qr_code && (
                  <p className="mt-2 text-xs text-gray-400 font-mono">QR: {panel.qr_code}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Create Panel Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Panel</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Panel Name / ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. WALL-A42 (Revit panel ID)"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Panel Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PANEL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add Panel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Bulk Upload ZIP</h2>
              <button onClick={() => { setShowBulkModal(false); setBulkResult(null); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              Upload a ZIP file containing IFC/glTF/glb files. Each file will be matched to a panel by filename.
            </p>

            {!bulkResult && (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleBulkUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {uploading ? "Processing ZIP..." : "Select ZIP File"}
                </button>
                {uploading && (
                  <p className="mt-3 text-sm text-gray-500">
                    Extracting and uploading files...
                  </p>
                )}
              </div>
            )}

            {/* Result Report */}
            {bulkResult && (
              <div>
                <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-green-50 p-2">
                    <p className="text-lg font-bold text-green-700">{bulkResult.summary.uploaded}</p>
                    <p className="text-green-600">Uploaded</p>
                  </div>
                  <div className="rounded-lg bg-yellow-50 p-2">
                    <p className="text-lg font-bold text-yellow-700">{bulkResult.summary.no_match}</p>
                    <p className="text-yellow-600">No Match</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2">
                    <p className="text-lg font-bold text-red-700">{bulkResult.summary.errors}</p>
                    <p className="text-red-600">Errors</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-lg font-bold text-gray-700">{bulkResult.summary.skipped}</p>
                    <p className="text-gray-600">Skipped</p>
                  </div>
                </div>

                <div className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
                  {bulkResult.results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <span>{STATUS_ICON[r.status] ?? "❓"}</span>
                      <span className="flex-1 truncate text-gray-700">{r.file}</span>
                      <span className="text-gray-400">{r.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end">
              <button
                onClick={() => { setShowBulkModal(false); setBulkResult(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                {bulkResult ? "Done" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}