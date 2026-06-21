import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";
import { extractWebIfcPositions } from "@/lib/web-ifc-geometry";

/**
 * Build a Three.js scene from IFC data (same geometry pipeline as load-ifc.ts)
 */
function buildSceneFromIfc(data: Uint8Array): Promise<THREE.Group> {
  return new Promise(async (resolve, reject) => {
    try {
      const { IfcAPI } = await import("web-ifc");
      const ifcApi = new IfcAPI();
      await ifcApi.Init();

      const modelID = ifcApi.OpenModel(data, {
        COORDINATE_TO_ORIGIN: true,
        CIRCLE_SEGMENTS: 64,
        BOOLEAN_UNION_THRESHOLD: 0.001,
      });

      const group = new THREE.Group();

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

            const rawVertexData = ifcApi.GetVertexArray(
              ifcGeom.GetVertexData(),
              ifcGeom.GetVertexDataSize(),
            );
            const pos = extractWebIfcPositions(rawVertexData);
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

            // Fix winding order
            fixWindingOrder(geometry);

            // Apply placement transform
            if (
              placedGeom.flatTransformation &&
              placedGeom.flatTransformation.length === 16
            ) {
              geometry.applyMatrix4(
                new THREE.Matrix4().fromArray(placedGeom.flatTransformation),
              );
            }

            // Compute normals AFTER transform
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
            group.add(mesh);
          } catch {
            // skip individual errors
          }
        }
      });

      ifcApi.CloseModel(modelID);
      ifcApi.Dispose();
      resolve(group);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Fix winding order per-triangle (same logic as load-ifc.ts)
 */
function fixWindingOrder(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const index = geometry.index;
  if (!index) return;

  const idx = index.array as Uint16Array | Uint32Array;

  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i] as number;
    const i1 = idx[i + 1] as number;
    const i2 = idx[i + 2] as number;

    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
    const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const area = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (area < 1e-10) {
      idx[i] = idx[i + 1] = idx[i + 2] = 0;
      continue;
    }

    const absNX = Math.abs(nx), absNY = Math.abs(ny), absNZ = Math.abs(nz);
    let signedArea: number;

    if (absNX >= absNY && absNX >= absNZ) {
      signedArea = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    } else if (absNY >= absNX && absNY >= absNZ) {
      signedArea = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    } else {
      signedArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    }

    if (signedArea < 0) {
      const v1 = idx[i + 1] as number;
      const v2 = idx[i + 2] as number;
      idx[i + 1] = v2;
      idx[i + 2] = v1;
    }
  }

  // Remove degenerates
  const newIdx: number[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] as number;
    const b = idx[i + 1] as number;
    const c = idx[i + 2] as number;
    if (a !== 0 || b !== 0 || c !== 0) {
      newIdx.push(a, b, c);
    }
  }
  geometry.setIndex(newIdx);
}

/**
 * Convert IFC binary data to GLB binary data
 */
export async function ifcToGlb(data: Uint8Array): Promise<Buffer> {
  const group = await buildSceneFromIfc(data);

  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();

    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else if (typeof result === "object" && "buffers" in result) {
          // JSON format — shouldn't happen with binary:true
          reject(new Error("Expected GLB binary output"));
        } else {
          reject(new Error("Unexpected export result type"));
        }
      },
      (error) => {
        reject(new Error(`GLTFExporter error: ${error?.message || error}`));
      },
      {
        binary: true,
        includeCustomExtensions: false,
        onlyVisible: true,
        trs: false,
      },
    );
  });
}

/**
 * Convert IFC data to GLB with progress callback
 */
export async function convertIfcToGlb(
  data: Uint8Array,
  onProgress?: (pct: number) => void,
): Promise<{ glbBuffer: Buffer; stats: { validTris: number; totalTris: number; meshCount: number } }> {
  onProgress?.(10);
  const group = await buildSceneFromIfc(data);

  // Count stats
  let validTris = 0;
  let totalTris = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geom = child.geometry;
      if (geom.index) {
        totalTris += geom.index.count / 3;
      }
    }
  });

  onProgress?.(50);
  const glbBuffer = await ifcToGlb(data);

  // Recount from the rebuilt scene (with degenerates removed)
  onProgress?.(80);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geom = child.geometry;
      if (geom.index) {
        validTris += geom.index.count / 3;
      }
    }
  });

  onProgress?.(100);
  return {
    glbBuffer,
    stats: {
      validTris,
      totalTris,
      meshCount: group.children.length,
    },
  };
}