// Test all available web-ifc settings combinations for geometry quality
const path = require("path");
const fs = require("fs");
const THREE = require("three");

const IFC_FILE = process.argv[2] || "public/1002.ifc";

const settingsSets = [
  // Baseline
  { name: "1. Baseline (current)", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001 } },
  // Higher tessellation quality
  { name: "2. Fine tessellation", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 64, BOOLEAN_UNION_THRESHOLD: 0.0001 } },
  // With profile optimization
  { name: "3. Web-ifc default", opts: {} },
  // Just COORDINATE_TO_ORIGIN
  { name: "4. COORD_TO_ORIGIN only", opts: { COORDINATE_TO_ORIGIN: true } },
  // OPTIMIZE_PROFILES
  { name: "5. OPTIMIZE_PROFILES", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001, OPTIMIZE_PROFILES: true } },
  // MODEL_PRECISION (higher precision = more triangles)
  { name: "6. MODEL_PRECISION 0.01mm", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, MODEL_PRECISION: 0.00001 } },
  // All options combined
  { name: "7. Max quality", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 128, BOOLEAN_UNION_THRESHOLD: 0.00001, OPTIMIZE_PROFILES: true, MODEL_PRECISION: 0.00001 } },
  // No boolean ops optimization (raw)
  { name: "8. No bool threshold", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32 } },
];

async function main() {
  const data = fs.readFileSync(path.resolve(IFC_FILE));
  console.log(`\n=== TESTING ${settingsSets.length} SETTINGS ON: ${IFC_FILE} ===\n`);

  const { IfcAPI } = await import("web-ifc");
  const ifcApi = new IfcAPI();
  await ifcApi.Init();

  let bestConfig = null;
  let bestNonDegen = 0;

  for (const cfg of settingsSets) {
    const modelID = ifcApi.OpenModel(new Uint8Array(data), cfg.opts);

    let totalElements = 0, totalTris = 0, totalDegen = 0, totalValid = 0;
    let minBounds = [Infinity, Infinity, Infinity];
    let maxBounds = [-Infinity, -Infinity, -Infinity];
    let minEdgeLen = Infinity, maxEdgeLen = 0, sumEdgeLen = 0, edgeCount = 0;

    ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
      const geoms = flatMesh.geometries;
      for (let j = 0; j < geoms.size(); j++) {
        try {
          const pg = geoms.get(j);
          const ifcGeom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
          const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
          const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geometry.setIndex(new THREE.BufferAttribute(idx, 1));

          if (pg.flatTransformation && pg.flatTransformation.length === 16) {
            geometry.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
          }

          const posAttr = geometry.attributes.position;
          const indexArr = geometry.index.array;

          totalTris += indexArr.length / 3;
          totalElements++;

          for (let i = 0; i < indexArr.length; i += 3) {
            const i0 = indexArr[i], i1 = indexArr[i+1], i2 = indexArr[i+2];
            const ax=posAttr.getX(i0), ay=posAttr.getY(i0), az=posAttr.getZ(i0);
            const bx=posAttr.getX(i1), by=posAttr.getY(i1), bz=posAttr.getZ(i1);
            const cx=posAttr.getX(i2), cy=posAttr.getY(i2), cz=posAttr.getZ(i2);
            
            const e1 = Math.sqrt((bx-ax)**2+(by-ay)**2+(bz-az)**2);
            const e2 = Math.sqrt((cx-bx)**2+(cy-by)**2+(cz-bz)**2);
            const e3 = Math.sqrt((ax-cx)**2+(ay-cy)**2+(az-cz)**2);
            
            const ux=bx-ax, uy=by-ay, uz=bz-az;
            const vx=cx-ax, vy=cy-ay, vz=cz-az;
            const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
            const area = Math.sqrt(nx*nx+ny*ny+nz*nz)/2;

            if (area < 1e-10) { totalDegen++; continue; }
            
            totalValid++;
            if (e1 > 0.001) { minEdgeLen = Math.min(minEdgeLen, e1); maxEdgeLen = Math.max(maxEdgeLen, e1); sumEdgeLen += e1; edgeCount++; }
            if (e2 > 0.001) { minEdgeLen = Math.min(minEdgeLen, e2); maxEdgeLen = Math.max(maxEdgeLen, e2); sumEdgeLen += e2; edgeCount++; }
            if (e3 > 0.001) { minEdgeLen = Math.min(minEdgeLen, e3); maxEdgeLen = Math.max(maxEdgeLen, e3); sumEdgeLen += e3; edgeCount++; }

            for (let vi = 0; vi < 3; vi++) {
              const v = [i0, i1, i2][vi];
              const x=posAttr.getX(v), y=posAttr.getY(v), z=posAttr.getZ(v);
              if (x < minBounds[0]) minBounds[0]=x; if (y < minBounds[1]) minBounds[1]=y; if (z < minBounds[2]) minBounds[2]=z;
              if (x > maxBounds[0]) maxBounds[0]=x; if (y > maxBounds[1]) maxBounds[1]=y; if (z > maxBounds[2]) maxBounds[2]=z;
            }
          }
        } catch (err) {}
      }
    });

    ifcApi.CloseModel(modelID);

    const avgEdge = edgeCount > 0 ? (sumEdgeLen / edgeCount) : 0;
    const degenPct = totalTris > 0 ? ((totalDegen / totalTris) * 100).toFixed(1) : "0";
    const quality = totalValid; // higher valid triangle count = better

    console.log(`${cfg.name}`);
    console.log(`  Valid tris: ${totalValid}, Degenerate: ${totalDegen} (${degenPct}%)`);
    console.log(`  Edge lengths: avg=${avgEdge.toFixed(3)} min=${minEdgeLen.toFixed(4)} max=${maxEdgeLen.toFixed(3)}`);
    console.log(`  Bounds: [${minBounds.map(n=>n.toFixed(2)).join(", ")}] → [${maxBounds.map(n=>n.toFixed(2)).join(", ")}]`);
    console.log(`  Size: ${(maxBounds[0]-minBounds[0]).toFixed(2)} × ${(maxBounds[1]-minBounds[1]).toFixed(2)} × ${(maxBounds[2]-minBounds[2]).toFixed(2)}`);
    console.log("");

    if (quality > bestNonDegen) {
      bestNonDegen = quality;
      bestConfig = cfg;
    }
  }

  console.log(`Best config: ${bestConfig.name} (${bestNonDegen} valid triangles)`);
  
  // Now try StreamAllMeshesWithTypes to see if we get type info
  console.log("\n=== Testing StreamAllMeshesWithTypes ===\n");
  const modelID = ifcApi.OpenModel(new Uint8Array(data), settingsSets[5].opts); // MODEL_PRECISION
  let sysTypes = new Set();
  ifcApi.StreamAllMeshesWithTypes(modelID, (flatMesh) => {
    sysTypes.add(flatMesh.type);
  });
  console.log(`Element types: ${[...sysTypes].join(", ")}`);
  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
}

main().catch(console.error);