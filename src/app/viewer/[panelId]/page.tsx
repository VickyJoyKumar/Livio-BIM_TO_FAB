"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import IfcViewer from "@/components/ifc-viewer";

interface ModelData {
  id: string;
  file_url: string;
  format: string;
  file_name: string;
}

interface PanelData {
  id: string;
  name: string;
}

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const panelId = params.panelId as string;

  const [panel, setPanel] = useState<PanelData | null>(null);
  const [models, setModels] = useState<ModelData[]>([]);
  const [activeModel, setActiveModel] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/panels/${panelId}`).then((r) => r.json()),
      fetch(`/api/panels/${panelId}/models`).then((r) => r.json()),
    ])
      .then(([panelData, modelsData]) => {
        if (panelData.error) {
          setError(panelData.error);
        } else {
          setPanel(panelData);
        }
        if (Array.isArray(modelsData) && modelsData.length > 0) {
          setModels(modelsData);
          // Auto-select first model, preferring GLB (converted from IFC server-side)
          const glb = modelsData.find((m: ModelData) => m.format === "glb");
          setActiveModel(glb ?? modelsData[0]);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load panel data");
        setLoading(false);
      });
  }, [panelId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <p className="text-slate-400">Loading viewer...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => router.back()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!activeModel) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900">
        <p className="text-slate-400">No model file found for this panel.</p>
        <p className="text-xs text-slate-500">Upload an IFC or glTF file to the panel first.</p>
        <button
          onClick={() => router.back()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-900">
      {/* Model selector (if multiple models) */}
      {models.length > 1 && (
        <div className="absolute top-4 right-4 z-10 flex gap-1.5">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => setActiveModel(model)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeModel.id === model.id
                  ? "bg-blue-600 text-white"
                  : "bg-black/40 text-white/70 backdrop-blur hover:bg-black/60 hover:text-white"
              }`}
            >
              {model.format.toUpperCase()}: {model.file_name}
            </button>
          ))}
        </div>
      )}

      <IfcViewer
        key={activeModel.id}
        modelUrl={activeModel.file_url}
        format={activeModel.format as "ifc" | "gltf" | "glb"}
        panelId={panelId}
        panelName={panel?.name ?? "Panel"}
        onBack={() => router.back()}
      />
    </div>
  );
}