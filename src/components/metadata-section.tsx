"use client";

import { useEffect, useState, useCallback } from "react";

interface MetadataData {
  manual: Record<string, unknown>;
  ifc: Record<string, string>;
  hasIfc: boolean;
}

interface MetadataSectionProps {
  panelId: string;
}

export default function MetadataSection({ panelId }: MetadataSectionProps) {
  const [data, setData] = useState<MetadataData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [manualKeys, setManualKeys] = useState<{ key: string; value: string }[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMetadata = useCallback(async () => {
    const res = await fetch(`/api/panels/${panelId}/metadata`);
    const d = await res.json();
    if (!d.error) {
      setData(d);
      setManualKeys(
        Object.entries(d.manual as Record<string, unknown>).map(([k, v]) => ({
          key: k,
          value: String(v ?? ""),
        })),
      );
    }
    setLoading(false);
  }, [panelId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  const handleSave = async () => {
    setSaving(true);
    const metadata: Record<string, string> = {};
    manualKeys.forEach(({ key, value }) => {
      if (key.trim()) metadata[key.trim()] = value;
    });

    const res = await fetch(`/api/panels/${panelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata }),
    });

    const result = await res.json();
    if (!result.error) {
      setEditing(false);
      fetchMetadata();
    }
    setSaving(false);
  };

  const addField = () => {
    if (!newKey.trim()) return;
    setManualKeys((prev) => [...prev, { key: newKey.trim(), value: newValue }]);
    setNewKey("");
    setNewValue("");
  };

  const removeField = (index: number) => {
    setManualKeys((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: "key" | "value", val: string) => {
    setManualKeys((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: val } : item)));
  };

  if (loading) return null;

  const ifcEntries = data?.ifc ? Object.entries(data.ifc) : [];
  const hasContent = manualKeys.length > 0 || ifcEntries.length > 0 || data?.hasIfc;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Panel Metadata</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Edit Metadata
          </button>
        )}
      </div>

      {!hasContent && !editing && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          No metadata yet. Click &quot;Edit Metadata&quot; to add dimensions, weight, and notes.
        </div>
      )}

      {/* Manual Metadata (Editable) */}
      {manualKeys.length > 0 && (
        <div className="mb-4">
          {editing ? (
            <div className="space-y-2">
              {manualKeys.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={item.key}
                    onChange={(e) => updateField(i, "key", e.target.value)}
                    className="w-2/5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    placeholder="Key"
                  />
                  <input
                    value={item.value}
                    onChange={(e) => updateField(i, "value", e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    placeholder="Value"
                  />
                  <button onClick={() => removeField(i)} className="p-1 text-red-400 hover:text-red-600" title="Remove">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {manualKeys.map((item, i) => (
                <div key={i} className="flex px-4 py-2 text-sm">
                  <span className="w-2/5 text-xs font-medium text-gray-500 uppercase tracking-wide">{item.key}</span>
                  <span className="flex-1 text-gray-800">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add new field (edit mode only) */}
      {editing && (
        <div className="mb-4 flex items-center gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Field name"
            className="w-2/5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Value"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={addField}
            disabled={!newKey.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {/* IFC Properties (Read-only) */}
      {ifcEntries.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            IFC Properties {data?.hasIfc ? "" : "(no IFC file)"}
          </h3>
          <div className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-blue-100 bg-blue-50/50">
            {ifcEntries.map(([key, value], i) => (
              <div key={i} className="flex px-4 py-1.5 text-sm">
                <span className="w-2/5 truncate text-xs font-medium text-gray-500">{key}</span>
                <span className="flex-1 text-gray-700">{value}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            IFC properties are read-only and extracted from the uploaded model file.
          </p>
        </div>
      )}

      {/* No IFC and no manual + editing mode */}
      {manualKeys.length === 0 && ifcEntries.length === 0 && editing && (
        <div className="mb-4 text-center text-sm text-gray-500">
          Add your first metadata field using the form above.
        </div>
      )}

      {/* Edit mode actions */}
      {editing && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            onClick={() => { setEditing(false); fetchMetadata(); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}