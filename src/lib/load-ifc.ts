// Direct web-ifc IFC loader with correct winding order and robust geometry pipeline
import * as THREE from "three";

// Fix winding order per-triangle: web-ifc can output mixed-wound triangles
// Uses best-projection-plane signed area test for 3D robustness
function fixWindingOrder(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const index = geometry.index;
  if (!index) return;

  const idx = index.array as Uint16Array | Uint32Array;
  let flipped = 0;
  let removed = 0;

  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i]!, i1 = idx[i + 1]!, i2 = idx[i + 2]!;

    // Extract vertex positions
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
    const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);

    // Edge vectors
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;

    // Cross product (face normal)
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const area = Math.sqrt(nx * nx + ny * ny + nz * nz);

    // Skip degenerate (near-zero area) triangles — they contribute zero/near-zero normals
    if (area < 1e-10) {
      // Mark for removal by setting vertices to NaN (will be filtered)
      idx[i] = idx[i + 1] = idx[i + 2] = 0;
      removed++;
      continue;
    }

    // Determine winding: project onto the plane with the largest area component
    const absNX = Math.abs(nx), absNY = Math.abs(ny), absNZ = Math.abs(nz);
    let signedArea: number;

    if (absNX >= absNY && absNX >= absNZ) {
      // Project onto YZ plane
      signedArea = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    } else if (absNY >= absNX && absNY >= absNZ) {
      // Project onto ZX plane
      signedArea = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    } else {
      // Project onto XY plane
      signedArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    }

    // Negative signed area = CW winding. Three.js expects CCW (positive).
    if (signedArea < 0) {
      // Swap last two indices to flip winding
      const t1 = idx[i + 1] as number;
      const t2 = idx[i + 2] as number;
      idx[i + 1] = t2;
      idx[i + 2] = t1;
      flipped++;
    }
  }

  // Remove degenerate triangles (marked with index 0,0,0) by building new index array
  if (removed > 0) {
    const newIndices: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] as number;
      const b = idx[i + 1] as number;
      const c = idx[i + 2] as number;
      if (a !== 0 || b !== 0 || c !== 0) {
        newIndices.push(a, b, c);
      }
    }
    geometry.setIndex(newIndices);
  }

  if (flipped > 0 || removed > 0) {
    console.log(
      `[IFC] Winding fix: ${flipped} flipped, ${removed} degenerate removed`,
    );
  }
}

export async function loadIfcGeometry(
  data: Uint8Array,
  group: THREE.Group,
  onProgress: (pct: number) => void,
): Promise<void> {
  const IfcAPI = (await import("web-ifc")).IfcAPI;
  const ifcApi = new IfcAPI();
  await ifcApi.Init(() => "/web-ifc.wasm");

  // Use COORDINATE_TO_ORIGIN to avoid precision issues with large coordinates
  const modelID = ifcApi.OpenModel(data, {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 32,
    BOOLEAN_UNION_THRESHOLD: 0.001,
  });

  onProgress(50);

  // Use StreamAllMeshes callback approach for better geometry handling
  let meshCount = 0;
  const totalEstimated = 200;

  ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
    const placedGeometries = flatMesh.geometries;
    const numGeom = placedGeometries.size();

    for (let j = 0; j < numGeom; j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(
          modelID,
          placedGeom.geometryExpressID,
        );

        const pos = ifcApi.GetVertexArray(
          ifcGeom.GetVertexData(),
          ifcGeom.GetVertexDataSize(),
        );
        const idx = ifcApi.GetIndexArray(
          ifcGeom.GetIndexData(),
          ifcGeom.GetIndexDataSize(),
        );

        if (pos.length === 0 || idx.length === 0) continue;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(pos, 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(idx, 1));

        // Step 1: Fix winding order BEFORE any normal computation or transform
        // web-ifc can output mixed CW/CCW triangles — Three.js expects CCW
        fixWindingOrder(geometry);

        // Step 2: Apply flat transformation to vertex positions
        // This includes the IFC object placement (location/rotation/scale)
        if (
          placedGeom.flatTransformation &&
          placedGeom.flatTransformation.length === 16
        ) {
          geometry.applyMatrix4(
            new THREE.Matrix4().fromArray(placedGeom.flatTransformation),
          );
        }

        // Step 3: Compute vertex normals from correctly-wound, world-space geometry
        // applyMatrix4 transforms both position AND normal attributes correctly
        // using the normal matrix (inverse-transpose of upper 3x3)
        geometry.computeVertexNormals();

        const color = new THREE.Color(
          placedGeom.color.x,
          placedGeom.color.y,
          placedGeom.color.z,
        );
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      } catch (err) {
        // Skip individual geometry errors
        console.warn("Skipping geometry element:", err);
      }
    }

    meshCount++;
    onProgress(
      50 + Math.min(Math.floor((meshCount / totalEstimated) * 45), 45),
    );
  });

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
  onProgress(100);
}