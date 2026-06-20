"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "@/lib/format-date";

interface Panel {
  id: string;
  project_id: string;
  name: string;
  panel_type: string | null;
  qr_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ModelFile {
  id: string;
  file_name: string;
  file_url: string;
  format: string;
  file_size_bytes: number;
  created_at: string;
}

const FORMAT_ICONS: Record<string, string> = {
  ifc: "🏗️",
  gltf: "🧊",
  glb: "🧊",
};

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"];

function formatFileSize(bytes: number): string {
  let u = 0;
  let size = bytes;
  while (size >= 1024 && u < FILE_SIZE_UNITS.length - 1) {
    size /= 1024;
    u++;
  }
  return `${size.toFixed(u === 0 ? 0 : 1)} ${FILE_SIZE_UNITS[u]}`;
}

export default function PanelDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const panelId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [models, setModels] = useState<ModelFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [qrImgSrc, setQrImgSrc] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const fetchPanel = async () => {
    const res = await fetch(`/api/panels/${panelId}`);
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setPanel(data);
      // Fetch project name
      fetch(`/api/projects/${data.project_id}`)
        .then((r) => r.json())
        .then((p) => {
          if (p.name) setProjectName(p.name);
        })
        .catch(() => {});
    }
  };

  const fetchModels = async () => {
    const res = await fetch(`/api/panels/${panelId}/models`);
    const data = await res.json();
    if (!data.error) setModels(data);
  };

  useEffect(() => {
    Promise.all([fetchPanel(), fetchModels()]).finally(() => setLoading(false));
  }, [panelId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("panel_id", panelId);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setModels((prev) => [data, ...prev]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm("Delete this model file?")) return;

    const res = await fetch(`/api/panels/${panelId}/models?model_id=${modelId}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setModels((prev) => prev.filter((m) => m.id !== modelId));
    }
  };

  const generateQrCode = useCallback(async () => {
    if (!panel?.qr_code) return;
    setQrLoading(true);
    try {
      const QRCode = (await import("qrcode")).default;
      // Use the origin of the current page for the URL
      const baseUrl = window.location.origin;
      // QR encodes a string that the scanner reads — encode the panel lookup URL
      const url = `${baseUrl}/api/qr/lookup?code=${encodeURIComponent(panel.qr_code!)}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      });
      setQrImgSrc(dataUrl);
    } catch (err) {
      setError("Failed to generate QR code");
    }
    setQrLoading(false);
  }, [panel]);

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

  if (!panel) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="mx-auto max-w-2xl px-4 py-12 text-center text-gray-500">Panel not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push(`/projects/${panel.project_id}/panels`)}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {projectName || "Project"} Panels
        </button>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Panel Info Card */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{panel.name}</h1>
              {panel.panel_type && (
                <span className="mt-1 inline-block rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
                  {panel.panel_type}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {panel.qr_code && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">QR Code</p>
                <p className="mt-0.5 font-mono text-xs text-gray-700 break-all">{panel.qr_code}</p>
                <button
                  onClick={generateQrCode}
                  disabled={qrLoading}
                  className="mt-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {qrLoading ? "Generating..." : "Print QR Code"}
                </button>
                {qrImgSrc && (
                  <div className="mt-2">
                    <img src={qrImgSrc} alt="QR Code" className="w-32 h-32 rounded-lg border border-gray-200" />
                    <a
                      href={qrImgSrc}
                      download={`qr-${panel.name}.png`}
                      className="mt-1 inline-block text-xs text-blue-600 hover:text-blue-800"
                    >
                      Download PNG
                    </a>
                  </div>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
              <p className="mt-0.5 text-gray-700">{format(panel.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Model Files Section */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              Model Files ({models.length})
            </h2>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ifc,.gltf,.glb"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload Model"}
              </button>
            </div>
          </div>

          {models.length === 0 && !uploading && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
              No model files uploaded yet. Click "Upload Model" to add an IFC, glTF, or glb file.
            </div>
          )}

          {uploading && (
            <div className="mb-3 rounded-lg bg-blue-50 p-3 text-center text-sm text-blue-600">
              Uploading model file...
            </div>
          )}

          {models.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {models.map((model) => (
                <li key={model.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg">{FORMAT_ICONS[model.format] ?? "📄"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{model.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {model.format.toUpperCase()} · {formatFileSize(model.file_size_bytes ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={model.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => handleDeleteModel(model.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}