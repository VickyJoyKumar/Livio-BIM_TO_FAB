// Direct web-ifc IFC loader with better settings and StreamAllMeshes
import * as THREE from "three";

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
  const totalEstimated = 200; // rough estimate for progress

  ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
    const placedGeometries = flatMesh.geometries;
    const numGeom = placedGeometries.size();

    for (let j = 0; j < numGeom; j++) {
      try {
        const placedGeom = placedGeometries.get(j);
        const ifcGeom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);

        const pos = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

        if (pos.length === 0 || idx.length === 0) continue;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geometry.setIndex(new THREE.BufferAttribute(idx, 1));
        geometry.computeVertexNormals();

        // Apply flat transformation directly to geometry vertices
        if (placedGeom.flatTransformation && placedGeom.flatTransformation.length === 16) {
          geometry.applyMatrix4(new THREE.Matrix4().fromArray(placedGeom.flatTransformation));
        }

        const color = new THREE.Color(placedGeom.color.x, placedGeom.color.y, placedGeom.color.z);
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
    onProgress(50 + Math.min(Math.floor((meshCount / totalEstimated) * 45), 45));
  });

  ifcApi.CloseModel(modelID);
  ifcApi.Dispose();
  onProgress(100);
}