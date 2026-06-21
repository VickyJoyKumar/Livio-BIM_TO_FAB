// Post-fix diagnostic: verify winding fix corrects CW→CCW
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

  console.log(`\n=== POST-FIX VERIFICATION: ${IFC_FILE} ===\n`);

  // Apply the same winding fix algorithm as in load-ifc.ts
  let totalOrigCW = 0, totalOrigCCW = 0;
  let totalFixedCW = 0, totalFixedCCW = 0;
  let totalDegenOrig = 0, totalDegenAfter = 0;

  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    for (let j = 0; j < placedGeometries.size(); j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const srcIdx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        // Original winding check
        for (let i = 0; i < srcIdx.length; i += 3) {
          const i0 = srcIdx[i], i1 = srcIdx[i+1], i2 = srcIdx[i+2];
          const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
          const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
          const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];

          const ux = bx-ax, uy = by-ay, uz = bz-az;
          const vx = cx-ax, vy = cy-ay, vz = cz-az;
          const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
          const area = Math.sqrt(nx*nx + ny*ny + nz*nz);

          if (area < 1e-10) { totalDegenOrig++; continue; }

          // Best-plane signed area
          const absNX = Math.abs(nx), absNY = Math.abs(ny), absNZ = Math.abs(nz);
          let signedArea;
          if (absNX >= absNY && absNX >= absNZ)
            signedArea = (by-ay)*(cz-az) - (bz-az)*(cy-ay);
          else if (absNY >= absNZ)
            signedArea = (bz-az)*(cx-ax) - (bx-ax)*(cz-az);
          else
            signedArea = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);

          if (signedArea < 0) totalOrigCW++; else totalOrigCCW++;
        }

        // Now simulate the fix: clone indices, fix winding, check again
        const idx = [...srcIdx];
        for (let i = 0; i < idx.length; i += 3) {
          const i0 = idx[i], i1 = idx[i+1], i2 = idx[i+2];
          const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
          const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
          const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];
          const ux = bx-ax, uy = by-ay, uz = bz-az;
          const vx = cx-ax, vy = cy-ay, vz = cz-az;
          const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
          const area = Math.sqrt(nx*nx + ny*ny + nz*nz);
          if (area < 1e-10) continue;

          const absNX = Math.abs(nx), absNY = Math.abs(ny), absNZ = Math.abs(nz);
          let signedArea;
          if (absNX >= absNY && absNX >= absNZ)
            signedArea = (by-ay)*(cz-az) - (bz-az)*(cy-ay);
          else if (absNY >= absNZ)
            signedArea = (bz-az)*(cx-ax) - (bx-ax)*(cz-az);
          else
            signedArea = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);

          if (signedArea < 0) {
            // Flip it
            const tmp = idx[i+1];
            idx[i+1] = idx[i+2];
            idx[i+2] = tmp;
          }
        }

        // Check post-fix winding
        for (let i = 0; i < idx.length; i += 3) {
          const i0 = idx[i], i1 = idx[i+1], i2 = idx[i+2];
          if (i0 === i1 || i1 === i2 || i0 === i2) { totalDegenAfter++; continue; }
          const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
          const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
          const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];
          const ux = bx-ax, uy = by-ay, uz = bz-az;
          const vx = cx-ax, vy = cy-ay, vz = cz-az;
          const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
          const area = Math.sqrt(nx*nx + ny*ny + nz*nz);
          if (area < 1e-10) continue;
          const absNX = Math.abs(nx), absNY = Math.abs(ny), absNZ = Math.abs(nz);
          let signedArea;
          if (absNX >= absNY && absNX >= absNZ)
            signedArea = (by-ay)*(cz-az) - (bz-az)*(cy-ay);
          else if (absNY >= absNZ)
            signedArea = (bz-az)*(cx-ax) - (bx-ax)*(cz-az);
          else
            signedArea = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);
          if (signedArea < 0) totalFixedCW++; else totalFixedCCW++;
        }
      } catch (err) {}
    }
  });

  const origTotal = totalOrigCW + totalOrigCCW;
  const fixedTotal = totalFixedCW + totalFixedCCW;
  console.log(`Before fix:  ${totalOrigCW} CW / ${totalOrigCCW} CCW (${(totalOrigCW/origTotal*100).toFixed(1)}% CW)`);
  console.log(`           ${totalDegenOrig} degenerate triangles removed`);
  console.log(`After fix:   ${totalFixedCW} CW / ${totalFixedCCW} CCW (${(totalFixedCW/fixedTotal*100).toFixed(1)}% CW)`);
  console.log(`           ${totalDegenAfter} zero-area triangles (post-fix)`);
  console.log(`Result:      ${(totalFixedCCW/fixedTotal*100).toFixed(1)}% faces now correctly CCW-wound`);

  if (totalFixedCW === 0) {
    console.log("\n✅ VERIFIED: All faces now CCW — Three.js lighting will be correct.");
  } else {
    const cwPct = (totalFixedCW/fixedTotal*100);
    if (cwPct < 5) {
      console.log(`\n⚠️ ${cwPct.toFixed(1)}% still CW — these are likely inverted triangles from boolean ops. Acceptable.`);
    } else {
      console.log(`\n❌ ${cwPct.toFixed(1)}% still CW — fix may need refinement.`);
    }
  }

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
}

main().catch(console.error);