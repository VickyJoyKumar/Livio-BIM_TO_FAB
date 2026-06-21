// IFC Geometry Diagnostic Tool — Step 1-6
// Run: node scripts/diagnose-ifc.js <path-to-ifc>
//
// Dumps per-element geometry stats, validates buffers, checks transforms

const path = require("path");
const fs = require("fs");

const IFC_FILE = process.argv[2] || "public/1002.ifc";

async function main() {
  console.log("=".repeat(72));
  console.log("IFC GEOMETRY DIAGNOSTIC");
  console.log("=".repeat(72));

  // --- Load IFC ---
  const data = fs.readFileSync(path.resolve(IFC_FILE));
  console.log(`File: ${IFC_FILE}`);
  console.log(`Size: ${(data.length / 1024).toFixed(1)} KB`);

  const { IfcAPI } = await import("web-ifc");
  const ifcApi = new IfcAPI();
  await ifcApi.Init();

  const modelID = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 32,
    BOOLEAN_UNION_THRESHOLD: 0.001,
  });

  console.log(`Model ID: ${modelID}`);
  console.log("");

  // --- Step 1: Raw Geometry Statistics ---
  console.log("--- STEP 1: RAW GEOMETRY STATISTICS ---");

  let totalElements = 0;
  let totalVertices = 0;
  let totalTriangles = 0;
  let totalGeomErrors = 0;
  const elementStats = [];

  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    const numGeom = placedGeometries.size();

    let elemVertices = 0;
    let elemTriangles = 0;
    let elemErrors = 0;
    let elemBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

    for (let j = 0; j < numGeom; j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);

        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        const vertCount = pos.length / 3;
        const triCount = idx.length / 3;

        elemVertices += vertCount;
        elemTriangles += triCount;

        // Compute bounding box from raw vertices
        for (let v = 0; v < pos.length; v += 3) {
          const x = pos[v], y = pos[v+1], z = pos[v+2];
          if (x < elemBounds.min[0]) elemBounds.min[0] = x;
          if (y < elemBounds.min[1]) elemBounds.min[1] = y;
          if (z < elemBounds.min[2]) elemBounds.min[2] = z;
          if (x > elemBounds.max[0]) elemBounds.max[0] = x;
          if (y > elemBounds.max[1]) elemBounds.max[1] = y;
          if (z > elemBounds.max[2]) elemBounds.max[2] = z;
        }
      } catch (err) {
        elemErrors++;
        totalGeomErrors++;
      }
    }

    const expressID = flatMesh.expressID;
    elementStats.push({
      expressID,
      vertices: elemVertices,
      triangles: elemTriangles,
      errors: elemErrors,
      bounds: elemBounds,
    });
    totalElements++;
    totalVertices += elemVertices;
    totalTriangles += elemTriangles;
  });

  console.log(`Total Elements (flat meshes): ${totalElements}`);
  console.log(`Total Vertices: ${totalVertices}`);
  console.log(`Total Triangles: ${totalTriangles}`);
  console.log(`Geometry Errors (skipped): ${totalGeomErrors}`);
  console.log("");

  // Print top elements by triangle count
  elementStats.sort((a, b) => b.triangles - a.triangles);
  console.log("Top 10 elements by triangle count:");
  console.log(`${"ExpressID".padStart(10)}  ${"Verts".padStart(8)}  ${"Tris".padStart(8)}  Bounding Box`);
  console.log("-".repeat(72));
  for (let i = 0; i < Math.min(10, elementStats.length); i++) {
    const e = elementStats[i];
    const b = e.bounds;
    const bx = `${b.min[0].toFixed(1)},${b.min[1].toFixed(1)},${b.min[2].toFixed(1)} → ${b.max[0].toFixed(1)},${b.max[1].toFixed(1)},${b.max[2].toFixed(1)}`;
    console.log(`${String(e.expressID).padStart(10)}  ${String(e.vertices).padStart(8)}  ${String(e.triangles).padStart(8)}  [${bx}]`);
  }
  console.log("");

  // --- Step 2: Validate Geometry Construction ---
  console.log("--- STEP 2: GEOMETRY CONSTRUCTION VALIDATION ---");

  let validationPass = true;
  let totalVertexArrays = 0;
  let totalIndexArrays = 0;
  let indexOutOfRange = 0;
  let degenerateTriangles = 0;

  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    const numGeom = placedGeometries.size();

    for (let j = 0; j < numGeom; j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);

        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        totalVertexArrays++;
        totalIndexArrays++;

        // Check position array
        if (pos.length % 3 !== 0) {
          console.log(`  WARN: expressID=${flatMesh.expressID} geom=${j} — position length ${pos.length} not multiple of 3`);
          validationPass = false;
        }

        // Check index array
        if (idx.length % 3 !== 0) {
          console.log(`  WARN: expressID=${flatMesh.expressID} geom=${j} — index length ${idx.length} not multiple of 3`);
          validationPass = false;
        }

        // Check index range
        const vertCount = pos.length / 3;
        for (let i = 0; i < idx.length; i++) {
          if (idx[i] >= vertCount) {
            indexOutOfRange++;
            if (indexOutOfRange <= 5) {
              console.log(`  WARN: expressID=${flatMesh.expressID} geom=${j} — index ${idx[i]} >= vertexCount ${vertCount}`);
            }
          }
        }

        // Check for degenerate triangles (two vertices identical)
        for (let i = 0; i < idx.length; i += 3) {
          if (idx[i] === idx[i+1] || idx[i] === idx[i+2] || idx[i+1] === idx[i+2]) {
            degenerateTriangles++;
          }
        }
      } catch (err) {
        // already counted in step 1
      }
    }
  });

  console.log(`Vertex arrays: ${totalVertexArrays}`);
  console.log(`Index arrays: ${totalIndexArrays}`);
  console.log(`Index out-of-range errors: ${indexOutOfRange} ${indexOutOfRange > 0 ? '*** FAIL ***' : 'OK'}`);
  console.log(`Degenerate triangles: ${degenerateTriangles} ${degenerateTriangles > 0 ? '*** WARN ***' : 'OK'}`);
  if (validationPass) console.log("> All arrays well-formed.");
  console.log("");

  // --- Step 3 & 4: Validate winding order / face orientation ---
  console.log("--- STEP 4: FACE ORIENTATION (WINDING ORDER) ---");

  let cwFaces = 0;
  let ccwFaces = 0;
  let firstSampleFaces = [];

  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    const numGeom = placedGeometries.size();

    for (let j = 0; j < numGeom; j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        for (let i = 0; i < idx.length; i += 3) {
          const i0 = idx[i], i1 = idx[i+1], i2 = idx[i+2];
          const v0 = [pos[i0*3], pos[i0*3+1], pos[i0*3+2]];
          const v1 = [pos[i1*3], pos[i1*3+1], pos[i1*3+2]];
          const v2 = [pos[i2*3], pos[i2*3+1], pos[i2*3+2]];

          // Edge vectors
          const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
          const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];

          // Cross product (normal)
          const nx = e1[1]*e2[2] - e1[2]*e2[1];
          const ny = e1[2]*e2[0] - e1[0]*e2[2];
          const nz = e1[0]*e2[1] - e1[1]*e2[0];

          // Dot with view direction (z-up convention: look from +z)
          // If z component of normal > 0, it's CCW from the front
          const winding = nx * 0 + ny * 0 + nz * 1;
          
          if (winding > 0) ccwFaces++;
          else cwFaces++;

          // Collect first few faces for sampling
          if (firstSampleFaces.length < 3) {
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            firstSampleFaces.push({
              expressID: flatMesh.expressID,
              geomIndex: j,
              i0, i1, i2,
              v0, v1, v2,
              normal: len > 0 ? [nx/len, ny/len, nz/len] : [0, 0, 0],
              winding: winding > 0 ? "CCW" : "CW",
            });
          }
        }
      } catch (err) {}
    }
  });

  const totalFaces = cwFaces + ccwFaces;
  const cwPct = ((cwFaces / totalFaces) * 100).toFixed(1);
  const ccwPct = ((ccwFaces / totalFaces) * 100).toFixed(1);
  console.log(`Total faces checked: ${totalFaces}`);
  console.log(`Clockwise (CW) faces: ${cwFaces} (${cwPct}%)`);
  console.log(`Counter-clockwise (CCW) faces: ${ccwFaces} (${ccwPct}%)`);

  if (cwPct > 50) {
    console.log("> *** CW dominant — faces likely inverted (winding order issue)");
  } else {
    console.log("> CCW dominant — expected winding order");
  }
  console.log("");

  console.log("Sample faces:");
  for (const f of firstSampleFaces) {
    console.log(`  expressID=${f.expressID} geom=${f.geomIndex} winding=${f.winding} normal=(${f.normal.map(n => n.toFixed(3)).join(", ")})`);
    console.log(`    v0=(${f.v0.map(n => n.toFixed(2)).join(", ")}) v1=(${f.v1.map(n => n.toFixed(2)).join(", ")}) v2=(${f.v2.map(n => n.toFixed(2)).join(", ")})`);
  }
  console.log("");

  // --- Step 5: Validate Transform ---
  console.log("--- STEP 5: PLACEMENT TRANSFORM VALIDATION ---");

  let transformStats = [];
  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    const numGeom = placedGeometries.size();

    for (let j = 0; j < numGeom; j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        if (placedGeom.flatTransformation && placedGeom.flatTransformation.length === 16) {
          const m = placedGeom.flatTransformation;
          // Extract translation, scale, rotation from 4x4 matrix (column-major)
          const tx = m[12], ty = m[13], tz = m[14];
          const sx = Math.sqrt(m[0]*m[0] + m[1]*m[1] + m[2]*m[2]);
          const sy = Math.sqrt(m[4]*m[4] + m[5]*m[5] + m[6]*m[6]);
          const sz = Math.sqrt(m[8]*m[8] + m[9]*m[9] + m[10]*m[10]);
          const det = m[0]*(m[5]*m[10]-m[6]*m[9]) - m[4]*(m[1]*m[10]-m[2]*m[9]) + m[8]*(m[1]*m[6]-m[2]*m[5]);

          transformStats.push({
            expressID: flatMesh.expressID,
            translation: [tx, ty, tz],
            scale: [sx, sy, sz],
            determinant: det,
            hasNegativeScale: sx < 0 || sy < 0 || sz < 0,
          });
          break; // just first geometry per element
        }
      } catch (err) {}
    }
  });

  let negScaleCount = 0;
  let uniformScaleCount = 0;
  let nonUniformScaleCount = 0;
  let zeroTransCount = 0;

  for (const t of transformStats) {
    if (t.hasNegativeScale) negScaleCount++;
    const [sx, sy, sz] = t.scale.map(Math.abs);
    const ratio1 = Math.abs(sx - sy);
    const ratio2 = Math.abs(sy - sz);
    const ratio3 = Math.abs(sz - sx);
    if (ratio1 < 0.01 && ratio2 < 0.01 && ratio3 < 0.01) uniformScaleCount++;
    else nonUniformScaleCount++;
    const [tx, ty, tz] = t.translation;
    if (Math.abs(tx) < 0.001 && Math.abs(ty) < 0.001 && Math.abs(tz) < 0.001) zeroTransCount++;
  }

  console.log(`Elements with transforms: ${transformStats.length}`);
  console.log(`Mirrored (negative scale): ${negScaleCount}`);
  console.log(`Uniform scale: ${uniformScaleCount}`);
  console.log(`Non-uniform scale: ${nonUniformScaleCount}`);
  console.log(`Zero translation (at origin): ${zeroTransCount}`);

  if (nonUniformScaleCount > 0) {
    console.log("> *** Non-uniform scale detected — can cause distorted normals if not handled");
  }

  // Print first 5 transforms
  console.log("");
  console.log("First 5 transforms:");
  for (let i = 0; i < Math.min(5, transformStats.length); i++) {
    const t = transformStats[i];
    const detStr = t.determinant < 0 ? "MIRRORED" : "ok";
    console.log(`  expressID=${t.expressID} t=(${t.translation.map(n => n.toFixed(2)).join(", ")}) s=(${t.scale.map(n => n.toFixed(3)).join(", ")}) [${detStr}]`);
  }
  console.log("");

  // --- Step 6: Coordinate System Check ---
  console.log("--- STEP 6: COORDINATE SYSTEM CHECK ---");
  
  // Reload without COORDINATE_TO_ORIGIN to compare
  console.log("Re-loading WITHOUT COORDINATE_TO_ORIGIN for comparison...");
  const modelID2 = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: false,
    CIRCLE_SEGMENTS: 32,
    BOOLEAN_UNION_THRESHOLD: 0.001,
  });

  let minZ = Infinity, maxZ = -Infinity;
  let minZ2 = Infinity, maxZ2 = -Infinity;
  let firstBounds = null, secondBounds = null;

  // Get bounds WITH COORDINATE_TO_ORIGIN
  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    for (let j = 0; j < placedGeometries.size(); j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        if (!firstBounds) {
          firstBounds = { min: [Infinity,Infinity,Infinity], max: [-Infinity,-Infinity,-Infinity] };
        }
        for (let v = 0; v < pos.length; v += 3) {
          const z = pos[v+1]; // IFC uses Y-up, web-ifc rotates to Z-up
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
          if (pos[v] < firstBounds.min[0]) firstBounds.min[0] = pos[v];
          if (pos[v+1] < firstBounds.min[1]) firstBounds.min[1] = pos[v+1];
          if (pos[v+2] < firstBounds.min[2]) firstBounds.min[2] = pos[v+2];
          if (pos[v] > firstBounds.max[0]) firstBounds.max[0] = pos[v];
          if (pos[v+1] > firstBounds.max[1]) firstBounds.max[1] = pos[v+1];
          if (pos[v+2] > firstBounds.max[2]) firstBounds.max[2] = pos[v+2];
        }
      } catch (err) {}
    }
  });

  // Get bounds WITHOUT COORDINATE_TO_ORIGIN
  ifcApi.StreamAllMeshes(modelID2, (flatMesh) => {
    const placedGeometries = flatMesh.geometries;
    for (let j = 0; j < placedGeometries.size(); j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID2, placedGeom.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        if (!secondBounds) {
          secondBounds = { min: [Infinity,Infinity,Infinity], max: [-Infinity,-Infinity,-Infinity] };
        }
        for (let v = 0; v < pos.length; v += 3) {
          if (pos[v] < secondBounds.min[0]) secondBounds.min[0] = pos[v];
          if (pos[v+1] < secondBounds.min[1]) secondBounds.min[1] = pos[v+1];
          if (pos[v+2] < secondBounds.min[2]) secondBounds.min[2] = pos[v+2];
          if (pos[v] > secondBounds.max[0]) secondBounds.max[0] = pos[v];
          if (pos[v+1] > secondBounds.max[1]) secondBounds.max[1] = pos[v+1];
          if (pos[v+2] > secondBounds.max[2]) secondBounds.max[2] = pos[v+2];
        }
      } catch (err) {}
    }
  });

  if (firstBounds && secondBounds) {
    console.log("WITH COORDINATE_TO_ORIGIN:");
    console.log(`  Bounds: [${firstBounds.min.map(n => n.toFixed(2)).join(", ")}] → [${firstBounds.max.map(n => n.toFixed(2)).join(", ")}]`);
    const size1 = firstBounds.max.map((n,i) => n - firstBounds.min[i]);
    console.log(`  Size: ${size1.map(n => n.toFixed(2)).join(" × ")}`);

    console.log("WITHOUT COORDINATE_TO_ORIGIN:");
    console.log(`  Bounds: [${secondBounds.min.map(n => n.toFixed(2)).join(", ")}] → [${secondBounds.max.map(n => n.toFixed(2)).join(", ")}]`);
    const size2 = secondBounds.max.map((n,i) => n - secondBounds.min[i]);
    console.log(`  Size: ${size2.map(n => n.toFixed(2)).join(" × ")}`);

    // Compare sizes
    const sizeDiff = size1.map((n, i) => Math.abs(n - size2[i]));
    console.log(`Size difference: ${sizeDiff.map(n => n.toFixed(4)).join(" × ")}`);
    if (sizeDiff.some(d => d > 0.01)) {
      console.log("> *** Size difference detected — COORDINATE_TO_ORIGIN affects geometry scaling/distortion!");
    } else {
      console.log("> Sizes match — COORDINATE_TO_ORIGIN does not distort geometry.");
    }
  }
  console.log("");

  // Close models
  ifcApi.CloseModel(modelID);
  ifcApi.CloseModel(modelID2);
  ifcApi.Dispose();

  // --- Summary ---
  console.log("=".repeat(72));
  console.log("DIAGNOSTIC SUMMARY");
  console.log("=".repeat(72));
  console.log(`Total elements: ${totalElements}`);
  console.log(`Total vertices: ${totalVertices}`);
  console.log(`Total triangles: ${totalTriangles}`);
  console.log(`Geometry errors: ${totalGeomErrors}`);
  console.log(`Index OOB errors: ${indexOutOfRange}`);
  console.log(`Degenerate triangles: ${degenerateTriangles}`);
  console.log(`Face winding: ${cwPct}% CW / ${ccwPct}% CCW`);
  console.log(`Negative scale (mirrored): ${negScaleCount}`);
  console.log(`Non-uniform scale: ${nonUniformScaleCount}`);
  console.log(`Zero translation elements: ${zeroTransCount}`);
  console.log("=".repeat(72));
}

main().catch(console.error);