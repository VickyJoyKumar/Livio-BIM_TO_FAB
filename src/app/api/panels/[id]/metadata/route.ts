import { type NextRequest, NextResponse } from "next/server";
import { resolve } from "path";
import * as THREE from "three";
import { createClient } from "@/lib/supabase/server";
import { extractWebIfcPositions } from "@/lib/web-ifc-geometry";

const IFC_TYPES = {
  IFCCOLUMN: 2740243338,
  IFCWALL: 2676461603,
  IFCWALLSTANDARDCASE: 895430483,
  IFCBEAM: 3957062903,
  IFCSLAB: 1529196076,
  IFCPLATE: 3493046030,
  IFCMEMBER: 1073191201,
  IFCBUILDINGELEMENTPROXY: 1940820710,
  IFCWINDOW: 3304561284,
  IFCDOOR: 395920057,
  IFCFASTENER: 647756555,
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id: panelId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [panelRes, modelsRes] = await Promise.all([
    supabase.from("panels").select("metadata").eq("id", panelId).single(),
    supabase.from("model_files").select("*").eq("panel_id", panelId),
  ]);

  if (panelRes.error) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  const manualMetadata = (panelRes.data.metadata as Record<string, unknown>) ?? {};
  const ifcFile = (modelsRes.data ?? []).find((m) => m.format === "ifc");

  let ifcProperties: Record<string, string> = {};

  if (ifcFile) {
    try {
      ifcProperties = await extractIfcProperties(ifcFile.file_url);
    } catch (err) {
      console.log("IFC extraction error:", (err as Error).message);
    }
  }

  return NextResponse.json({ manual: manualMetadata, ifc: ifcProperties, hasIfc: !!ifcFile });
}

async function extractIfcProperties(fileUrl: string): Promise<Record<string, string>> {
  const response = await fetch(fileUrl);
  const buffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  const { IfcAPI } = await import("web-ifc");
  const wasmPath = resolve(process.cwd(), "node_modules", "web-ifc", "web-ifc-node.wasm");
  const ifcApi = new IfcAPI();
  await ifcApi.Init(() => wasmPath);
  const modelID = ifcApi.OpenModel(uint8, {});

  const props: Record<string, string> = {};

  try {
    // Get all property sets in the model
    const psets = await ifcApi.properties.getPropertySets(modelID, 0, true);

    for (const pset of psets) {
      if (!pset || !pset.Name) continue;
      const psetName = pset.Name.value ?? "Properties";

      // HasProperties contains the individual properties
      if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
        for (const propRef of pset.HasProperties) {
          const propId = typeof propRef === "number" ? propRef : propRef?.value;
          if (!propId) continue;

          try {
            const propData = await ifcApi.properties.getItemProperties(modelID, propId, false);
            if (!propData || !propData.Name) continue;

            const propName = propData.Name.value ?? "Unknown";
            let value = "";

            // Extract value from NominalValue
            if (propData.NominalValue) {
              const nv = propData.NominalValue;
              // The value might be nested
              value = String(nv.value ?? nv);
            } else if (propData.EnumerationValues) {
              const ev = propData.EnumerationValues;
              value = Array.isArray(ev) ? ev.map((v: any) => v?.value ?? "").join(", ") : String(ev?.value ?? "");
            }

            if (propName && value) {
              const key = `${psetName} - ${propName}`;
              props[key] = value;
            }
          } catch {
            // skip individual prop errors
          }
        }
      }
    }
  } catch (err) {
    // If property extraction fails, still return what we have
    console.log("Pset extraction error:", (err as Error).message);
  }

  // Also try to get element-level properties for major building elements
  try {
    for (const [, typeId] of Object.entries(IFC_TYPES)) {
      const lines = ifcApi.GetLineIDsWithType(modelID, typeId);
      const count = lines.size();
      for (let i = 0; i < count && i < 10; i++) {
        const lineId = lines.get(i);
        try {
          const item = await ifcApi.properties.getItemProperties(modelID, lineId, true);
          if (item?.Name?.value) {
            const elName = item.Name.value;
            // Get psets for this specific element
            const elPsets = await ifcApi.properties.getPropertySets(modelID, lineId, true);
            for (const pset of elPsets) {
              if (!pset?.HasProperties) continue;
              for (const propRef of pset.HasProperties) {
                const propId = typeof propRef === "number" ? propRef : propRef?.value;
                if (!propId) continue;
                try {
                  const pd = await ifcApi.properties.getItemProperties(modelID, propId, false);
                  if (pd?.Name?.value && pd?.NominalValue?.value) {
                    props[`${elName} - ${pd.Name.value}`] = String(pd.NominalValue.value);
                  }
                } catch { /* skip */ }
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  if (Object.keys(props).length === 0) {
    try {
      Object.assign(props, extractIfcModelSummary(ifcApi, modelID));
    } catch (err) {
      console.log("IFC summary extraction error:", (err as Error).message);
    }
  }

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
  props["Model Format"] = "IFC4";
  return props;
}

function extractIfcModelSummary(ifcApi: any, modelID: number): Record<string, string> {
  const props: Record<string, string> = {};
  const typeCounts = Object.entries(IFC_TYPES)
    .map(([typeName, typeId]) => ({ typeName, count: ifcApi.GetLineIDsWithType(modelID, typeId).size() as number }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);

  if (typeCounts.length > 0) {
    const primaryType = typeCounts[0]!;
    props["Primary Element Type"] = primaryType.typeName.replace(/^IFC/, "");
    props["Primary Element Count"] = String(primaryType.count);
    props["Detected Element Types"] = typeCounts
      .map((entry) => `${entry.typeName.replace(/^IFC/, "")}: ${entry.count}`)
      .join(", ");
  }

  const bounds = computeModelBounds(ifcApi, modelID);
  if (bounds) {
    const size = bounds.max.clone().sub(bounds.min);
    props["Approx Width"] = formatMeters(size.x);
    props["Approx Height"] = formatMeters(size.z);
    props["Approx Depth"] = formatMeters(size.y);
    props["Model Center"] = `${bounds.center.x.toFixed(3)}, ${bounds.center.y.toFixed(3)}, ${bounds.center.z.toFixed(3)}`;
  }

  return props;
}

function computeModelBounds(ifcApi: any, modelID: number): { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 } | null {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const point = new THREE.Vector3();
  let hasPoints = false;

  ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
    const placedGeometries = flatMesh.geometries;
    for (let geomIndex = 0; geomIndex < placedGeometries.size(); geomIndex++) {
      const placedGeom = placedGeometries.get(geomIndex);
      const ifcGeometry = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
      const rawVertexData = ifcApi.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
      const positions = extractWebIfcPositions(rawVertexData);
      const matrix =
        placedGeom.flatTransformation && placedGeom.flatTransformation.length === 16
          ? new THREE.Matrix4().fromArray(placedGeom.flatTransformation)
          : null;

      for (let index = 0; index < positions.length; index += 3) {
        point.set(positions[index]!, positions[index + 1]!, positions[index + 2]!);
        if (matrix) point.applyMatrix4(matrix);
        min.min(point);
        max.max(point);
        hasPoints = true;
      }
    }
  });

  if (!hasPoints) {
    return null;
  }

  return {
    min,
    max,
    center: min.clone().add(max).multiplyScalar(0.5),
  };
}

function formatMeters(value: number): string {
  return `${value.toFixed(3)} m`;
}