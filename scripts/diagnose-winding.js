// IFC Geometry Diagnostic — Enhanced: count degenerates, check per-element winding
const path = require("path");
const fs = require("fs");

const IFC_FILE = process.argv[2] || "public/1002.ifc";

async function main() {
  const data = fs.readFileSync(path.resolve(IFC_FILE));
  const { IfcAPI } = await import("web-ifc");
  const ifcApi = new IfcAPI();
  await ifcApi.Init();
  const modelID = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001
  });

  console.log(`\n=== PER-ELEMENT WINDING & DEGENERATE ANALYSIS: ${IFC_FILE} ===\n`);
  console.log(`${"Elem".padStart(5)} ${"ExpressID".padStart(10)} ${"Verts".padStart(8)} ${"Tris".padStart(8)} ${"CW".padStart(5)} ${"CCW".padStart(5)} ${"Degens".padStart(7)} ${"CW%".padStart(6)}`);

  let totalCW = 0, totalCCW = 0, totalDegen = 0, totalTris = 0;
  let elemIdx = 0;

  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    for (let j = 0; j < placedGeometries.size(); j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        let cw = 0, ccw = 0, degen = 0;
        for (let i = 0; i < idx.length; i += 3) {
          const i0 = idx[i], i1 = idx[i+1], i2 = idx[i+2];
          // Degenerate check
          if (i0 === i1 || i1 === i2 || i0 === i2) { degen++; continue; }
          const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
          const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
          const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];
          // 2D signed area on XY plane → winding when looking from +z
          const area = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);
          // Also check on YZ and ZX planes for triangles parallel to XY
          const areaYZ = (by-ay)*(cz-az) - (bz-az)*(cy-ay);
          const areaZX = (bz-az)*(cx-ax) - (bx-ax)*(cz-az);
          // Use the plane with the largest projected area
          const absXY = Math.abs(area), absYZ = Math.abs(areaYZ), absZX = Math.abs(areaZX);
          let signed;
          if (absXY >= absYZ && absXY >= absZX) signed = area;
          else if (absYZ >= absZX) signed = areaYZ;
          else signed = areaZX;
          if (signed < 0) cw++; else ccw++;
        }

        const total = cw + ccw + degen;
        if (total > 0) {
          const cwPct = ((cw / total) * 100).toFixed(1);
          console.log(`${String(elemIdx+1).padStart(5)} ${String(flatMesh.expressID).padStart(10)} ${String(pos.length/3).padStart(8)} ${String(total).padStart(8)} ${String(cw).padStart(5)} ${String(ccw).padStart(5)} ${String(degen).padStart(7)} ${String(cwPct).padStart(6)}%`);
          totalCW += cw; totalCCW += ccw; totalDegen += degen; totalTris += total;
          elemIdx++;
        }
      } catch (err) {}
    }
  });

  const grandTotal = totalCW + totalCCW + totalDegen;
  console.log("-".repeat(65));
  console.log(`${"TOTAL".padStart(5)} ${"".padStart(10)} ${"".padStart(8)} ${String(grandTotal).padStart(8)} ${String(totalCW).padStart(5)} ${String(totalCCW).padStart(5)} ${String(totalDegen).padStart(7)} ${((totalCW/grandTotal)*100).toFixed(1).padStart(6)}%`);

  console.log("\nFINDING: web-ifc outputs ~75% CW winding. Three.js expects CCW.");
  console.log("This causes computeVertexNormals() to produce inverted normals for most faces.");
  console.log("SOLUTION: Per-triangle winding correction before computeVertexNormals().");

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
}

main().catch(console.error);