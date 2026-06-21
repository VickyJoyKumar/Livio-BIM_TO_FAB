import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const IfcAPI = (await import("web-ifc")).IfcAPI;
  const ifcApi = new IfcAPI();
  await ifcApi.Init(() => "/web-ifc.wasm");
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
    const IFC_TYPES = {
      IFCWALL: 2676461603,
      IFCWALLSTANDARDCASE: 895430483,
      IFCCOLUMN: 2740243338,
      IFCBEAM: 3957062903,
      IFCSLAB: 2698910889,
      IFCROOF: 3670745774,
      IFCDOOR: 2492281259,
      IFCWINDOW: 4187091399,
    };

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

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
  props["Model Format"] = "IFC4";
  return props;
}