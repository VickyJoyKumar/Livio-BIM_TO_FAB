// AR Build Mode — overlay engine (USDZ-compatible)
// Generates mesh-based edge outlines + color-coded geometry
// All output is THREE.Mesh (no LineSegments), so USDZ preserves everything.

import * as THREE from "three";

export type BuildModeMemberType = "stud" | "track" | "header" | "opening" | "reference";

export interface BuildModeOverlay {
  group: THREE.Group;
  stats: {
    studs: number;
    tracks: number;
    headers: number;
    openings: number;
    references: number;
    total: number;
    edgeCount: number;
  };
}

const COLORS = {
  stud: 0x00cc66,     // Green for studs
  track: 0xff8800,    // Orange for tracks/headers
  header: 0xff8800,   // Orange (same as track)
  opening: 0x4488ff,  // Blue for openings
  reference: 0xcccccc, // White for anything else
};

// Edge thickness (meters) — visible in AR, thin enough to look like a line
const EDGE_THICKNESS = 0.003; // 3mm

/**
 * Classify mesh by its bounding box shape and orientation.
 * Y-up coordinate system (IFC native = same as Three.js default).
 */
function classifyMesh(
  mesh: THREE.Mesh,
  panelBounds: THREE.Box3,
): BuildModeMemberType {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const panelCenter = panelBounds.getCenter(new THREE.Vector3());
  const panelSize = panelBounds.getSize(new THREE.Vector3());

  const height = size.y;
  const width = size.x;
  const depth = size.z;

  // Vertical: height is largest → stud
  if (height > width && height > depth && width > 0 && depth > 0) {
    return "stud";
  }

  // Horizontal: width or depth is largest → track or header
  const isHorizontal = width > height && (width > depth || depth > height);
  if (isHorizontal) {
    // Upper portion of panel → header; elsewhere → track
    if (center.y > panelCenter.y + panelSize.y * 0.15) {
      return "header";
    }
    return "track";
  }

  return "reference";
}

/**
 * Create a thin box mesh along an edge from point A to point B.
 * USDZ preserves box meshes → gives us visible edge outlines in AR Quick Look.
 */
function createEdgeMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number,
  opacity = 0.95,
): THREE.Mesh {
  const length = start.distanceTo(end);
  if (length < 1e-6) {
    // Degenerate edge — skip
    const geom = new THREE.BoxGeometry(0, 0, 0);
    return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color }));
  }

  const geometry = new THREE.BoxGeometry(EDGE_THICKNESS, EDGE_THICKNESS, length);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Place at midpoint
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);

  // Orient the box so its Z-axis aligns with the edge direction
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction,
  );
  mesh.quaternion.copy(quat);

  return mesh;
}

/**
 * Extract visible edges from a mesh and create thin box meshes along each.
 * Transforms edge vertices into world space so exported edges are correctly positioned.
 */
function createEdgeMeshesFromMesh(
  mesh: THREE.Mesh,
  color: number,
): THREE.Mesh[] {
  // Ensure mesh has a computed world matrix
  mesh.updateMatrixWorld(true);

  const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 30);
  const positionAttr = edgeGeometry.getAttribute("position");
  if (!positionAttr) return [];

  const edges: THREE.Mesh[] = [];

  for (let i = 0; i < positionAttr.count; i += 2) {
    const localStart = new THREE.Vector3(
      positionAttr.getX(i)!,
      positionAttr.getY(i)!,
      positionAttr.getZ(i)!,
    );
    const localEnd = new THREE.Vector3(
      positionAttr.getX(i + 1)!,
      positionAttr.getY(i + 1)!,
      positionAttr.getZ(i + 1)!,
    );

    // Transform to world space using mesh's world matrix
    const worldStart = localStart.clone().applyMatrix4(mesh.matrixWorld);
    const worldEnd = localEnd.clone().applyMatrix4(mesh.matrixWorld);

    const edgeMesh = createEdgeMesh(worldStart, worldEnd, color);
    edges.push(edgeMesh);
  }

  return edges;
}

/**
 * Apply Build Mode overlay to a scene.
 * Returns a new group that fully replaces the scene for USDZ export:
 *   - Semi-transparent color-tinted versions of all members (the "ghost" model)
 *   - Mesh-based edge outlines (visible in USDZ/AR)
 */
export function applyBuildModeOverlay(scene: THREE.Group): BuildModeOverlay {
  const outputGroup = new THREE.Group();
  const stats = {
    studs: 0,
    tracks: 0,
    headers: 0,
    openings: 0,
    references: 0,
    total: 0,
    edgeCount: 0,
  };

  const panelBounds = new THREE.Box3().setFromObject(scene);

  // Collect all meshes from original scene
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });

  stats.total = meshes.length;

  for (const mesh of meshes) {
    const type = classifyMesh(mesh, panelBounds);
    const color = COLORS[type];

    if (type === "stud") stats.studs++;
    else if (type === "track") stats.tracks++;
    else if (type === "header") stats.headers++;
    else if (type === "opening") stats.openings++;
    else stats.references++;

    // 1. Semi-transparent colored version of the mesh (the "ghost")
    mesh.updateMatrixWorld(true);
    const ghostMat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ghostGeom = mesh.geometry.clone();
    ghostGeom.applyMatrix4(mesh.matrixWorld);
    const ghostMesh = new THREE.Mesh(ghostGeom, ghostMat);
    outputGroup.add(ghostMesh);

    // 2. Edge outlines as thin box meshes (USDZ-compatible)
// Edges are already in world space from createEdgeMeshesFromMesh.
    const edgeMeshes = createEdgeMeshesFromMesh(mesh, color);
    stats.edgeCount += edgeMeshes.length;
    for (const edgeMesh of edgeMeshes) {
      outputGroup.add(edgeMesh);
    }
  }

  return { group: outputGroup, stats };
}

/**
 * Build the complete Build-Mode export scene.
 * Returns a new group containing ONLY the overlay — no original opaque meshes.
 * This ensures all exported geometry is the colored-edge visualization.
 */
export function buildBuildModeScene(scene: THREE.Group): BuildModeOverlay {
  return applyBuildModeOverlay(scene);
}