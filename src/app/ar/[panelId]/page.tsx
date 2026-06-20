"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ArViewer from "@/components/ar-viewer";

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

export default function ArPage() {
  const params = useParams();
  const router = useRouter();
  const panelId = params.panelId as string;

  const [panel, setPanel] = useState<PanelData | null>(null);
  const [models, setModels] = useState<ModelData[]>([]);
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
          const ifc = modelsData.find((m: ModelData) => m.format === "ifc");
          setModels(ifc ? [ifc] : [modelsData[0]]);
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
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-white/60">Loading AR...</p>
      </div>
    );
  }

  if (error || models.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-red-400">{error || "No model found for this panel"}</p>
        <button onClick={() => router.back()} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white">
          Go Back
        </button>
      </div>
    );
  }

  const activeModel = models[0]!;

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <ArViewer
        modelUrl={activeModel.file_url}
        format={activeModel.format as "ifc" | "gltf" | "glb"}
        panelName={panel?.name ?? "Panel"}
        onBack={() => router.back()}
      />
    </div>
  );
}