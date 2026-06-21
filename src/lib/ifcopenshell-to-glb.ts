// Convert IfcOpenShell JSON output to GLB
import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";
import * as path from "path";
import * as fs from "fs";

interface IfcProduct {
  expressID: number;
  type: string;
  name: string;
  vertices: number[];   // flat [x,y,z, x2,y2,z2, ...]
  indices: number[];    // flat [i0,i1,i2, i3,i4,i5, ...]
  color: [number, number, number];
}

interface IfcJsonData {
  products: IfcProduct[];
  bounds: { min: number[]; max: number[] };
  stats: { products: number; vertices: number; triangles: number };
}

/**
 * Convert IFC JSON (from IfcOpenShell) to a Three.js scene
 * IfcOpenShell uses IFC coordinate system (Y-up).
 * Three.js uses Z-up. We apply Y→Z rotation.
 */
function sceneFromIfcJson(data: IfcJsonData): THREE.Group {
  const group = new THREE.Group();

  // Y-up → Z-up rotation (-90° around X-axis)
  const yUpToZUp = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  );

  for (const product of data.products) {
    const { vertices, indices, color } = product;
    if (vertices.length < 3 || indices.length < 3) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(vertices), 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    // Apply Y-up → Z-up rotation
    geometry.applyMatrix4(yUpToZUp);

    // Compute normals
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/**
 * Convert IfcOpenShell JSON to GLB buffer
 */
export async function ifcJsonToGlb(jsonPath: string): Promise<Buffer> {
  const data: IfcJsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const group = sceneFromIfcJson(data);

  console.log(
    `[ifcJsonToGlb] ${data.stats.products} meshes, ${data.stats.triangles} triangles`,
  );

  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else {
          reject(new Error("Expected GLB binary output"));
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

// CLI support — only runs when executed directly (not via Next.js)
// Note: use `npx tsx` to run this directly for testing