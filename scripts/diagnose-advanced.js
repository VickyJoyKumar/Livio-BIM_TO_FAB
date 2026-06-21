// IFC diagnostic: test multiple configurations to find what causes correct geometry
const path = require("path");
const fs = require("fs");
const THREE = require("three");

const IFC_FILE = process.argv[2] || "public/1002.ifc";

// Test multiple configs
const configs = [
  { name: "A: NO transform, NO COORD_TO_ORIGIN", opts: { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001 }, applyTransform: false },
  { name: "B: WITH transform, NO COORD_TO_ORIGIN", opts: { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001 }, applyTransform: true },
  { name: "C: NO transform, WITH COORD_TO_ORIGIN", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001 }, applyTransform: false },
  { name: "D: WITH transform, WITH COORD_TO_ORIGIN", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001 }, applyTransform: true },
  { name: "E: Higher tessellation", opts: { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 64, BOOLEAN_UNION_THRESHOLD: 0.0001 }, applyTransform: true },
];

async function main() {
  const data = fs.readFileSync(path.resolve(IFC_FILE));
  console.log(`\n=== TESTING ${configs.length} CONFIGS ON: ${IFC_FILE} ===\n`);

  const { IfcAPI } = await import("web-ifc");
  const ifcApi = new IfcAPI();
  await ifcApi.Init();

  for (const cfg of configs) {
    console.log(`\n--- ${cfg.name} ---`);
    const modelID = ifcApi.OpenModel(new Uint8Array(data), cfg.opts);

    let totalElements = 0, totalVertices = 0, totalTris = 0;
    let minBounds = [Infinity, Infinity, Infinity];
    let maxBounds = [-Infinity, -Infinity, -Infinity];

    ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
      const geoms = flatMesh.geometries;
      for (let j = 0; j < geoms.size(); j++) {
        try {
          const pg = geoms.get(j);
          const ifcGeom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
          const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
          const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

          // Create geometry for bounds testing
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geometry.setIndex(new THREE.BufferAttribute(idx, 1));

          if (cfg.applyTransform && pg.flatTransformation && pg.flatTransformation.length === 16) {
            geometry.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
          }

          const posAttr = geometry.attributes.position;
          for (let v = 0; v < posAttr.count; v++) {
            const x = posAttr.getX(v), y = posAttr.getY(v), z = posAttr.getZ(v);
            if (x < minBounds[0]) minBounds[0] = x;
            if (y < minBounds[1]) minBounds[1] = y;
            if (z < minBounds[2]) minBounds[2] = z;
            if (x > maxBounds[0]) maxBounds[0] = x;
            if (y > maxBounds[1]) maxBounds[1] = y;
            if (z > maxBounds[2]) maxBounds[2] = z;
          }

          totalElements++;
          totalVertices += pos.length / 3;
          totalTris += idx.length / 3;
        } catch (err) {}
      }
    });

    ifcApi.CloseModel(modelID);

    console.log(`  Elements: ${totalElements}`);
    console.log(`  Vertices: ${totalVertices}`);
    console.log(`  Tris:     ${totalTris}`);
    console.log(`  Bounds:   [${minBounds.map(n => n.toFixed(2)).join(", ")}] → [${maxBounds.map(n => n.toFixed(2)).join(", ")}]`);
    console.log(`  Size:     ${(maxBounds[0]-minBounds[0]).toFixed(2)} × ${(maxBounds[1]-minBounds[1]).toFixed(2)} × ${(maxBounds[2]-minBounds[2]).toFixed(2)}`);
  }

  ifcApi.Dispose();
  console.log("\n=== All configs tested ===\n");

  // Also dump raw vertex data from first element (config D)
  console.log("=== RAW VERTEX DATA: First element, config D ===\n");
  const modelID = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 32, BOOLEAN_UNION_THRESHOLD: 0.001
  });

  let elementIdx = 0;
  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
    if (elementIdx > 0) return;
    elementIdx++;
    const geoms = flatMesh.geometries;
    for (let j = 0; j < geoms.size(); j++) {
      try {
        const pg = geoms.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        console.log(`Element expressID=${flatMesh.expressID} geomIndex=${j}`);
        console.log(`  Raw vertices: ${pos.length/3}, triangles: ${idx.length/3}`);

        // Apply transform and check
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geometry.setIndex(new THREE.BufferAttribute(idx, 1));

        if (pg.flatTransformation && pg.flatTransformation.length === 16) {
          geometry.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
        }

        const posAttr = geometry.attributes.position;
        
        // Dump first 20 vertices
        console.log(`  First 20 vertices (after transform):`);
        for (let v = 0; v < Math.min(20, posAttr.count); v++) {
          console.log(`    v[${v}] = (${posAttr.getX(v).toFixed(4)}, ${posAttr.getY(v).toFixed(4)}, ${posAttr.getZ(v).toFixed(4)})`);
        }

        // Dump first 10 triangles
        console.log(`\n  First 10 triangles:`);
        const indexArr = geometry.index.array;
        for (let i = 0; i < Math.min(30, indexArr.length); i += 3) {
          const i0 = indexArr[i], i1 = indexArr[i+1], i2 = indexArr[i+2];
          const v0 = `(${posAttr.getX(i0).toFixed(3)},${posAttr.getY(i0).toFixed(3)},${posAttr.getZ(i0).toFixed(3)})`;
          const v1 = `(${posAttr.getX(i1).toFixed(3)},${posAttr.getY(i1).toFixed(3)},${posAttr.getZ(i1).toFixed(3)})`;
          const v2 = `(${posAttr.getX(i2).toFixed(3)},${posAttr.getY(i2).toFixed(3)},${posAttr.getZ(i2).toFixed(3)})`;
          // Compute triangle quality (area / perimeter ratio)
          const ax=posAttr.getX(i0),ay=posAttr.getY(i0),az=posAttr.getZ(i0);
          const bx=posAttr.getX(i1),by=posAttr.getY(i1),bz=posAttr.getZ(i1);
          const cx=posAttr.getX(i2),cy=posAttr.getY(i2),cz=posAttr.getZ(i2);
          const e1=Math.sqrt((bx-ax)**2+(by-ay)**2+(bz-az)**2);
          const e2=Math.sqrt((cx-bx)**2+(cy-by)**2+(cz-bz)**2);
          const e3=Math.sqrt((ax-cx)**2+(ay-cy)**2+(az-cz)**2);
          const perimeter = e1+e2+e3;
          const x=uy=>0; // nop
          const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay);
          const ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
          const nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
          const area = Math.sqrt(nx*nx+ny*ny+nz*nz)/2;
          const quality = perimeter > 0 ? area/perimeter : 0;
          console.log(`    tri[${i/3}]: ${i0},${i1},${i2}  area=${area.toFixed(4)} quality=${quality.toFixed(3)}`);
        }
      } catch (err) { console.error(`Error: ${err.message}`); }
    }
  });

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
}

main().catch(console.error);