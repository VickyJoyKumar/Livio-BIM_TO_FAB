// AR Build Mode — overlay engine
// Generates edge outlines + color-coded geometry from a 3D scene

import * as THREE from "three";

export type BuildModeMemberType = "stud" | "track" | "header" | "opening" | "reference";

export interface BuildModeOverlay {
  group: THREE.Group;
  stats: {
    studs: number;
    tracks: number;
    headers: number;
    openings: number;
    total: number;
  };
}

const COLORS = {
  stud: 0x00cc66,     // Green
  track: 0xff8800,    // Orange
  header: 0xff8800,   // Orange (same as track)
  opening: 0x4488ff,  // Blue
  reference: 0xcccccc, // White
};

/**
 * Classify a mesh by its bounding box shape and position within the panel.
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

  const height = size.y;  // Three.js Y-up (IFC Y-up)
  const width = size.x;
  const depth = size.z;

  // Classify by orientation
  // Vertical member (height is largest dimension) → stud
  if (height > width && height > depth && width > 0 && depth > 0) {
    return "stud";
  }

  // Horizontal member (width is largest dimension) → track/header
  if (width > height && width > depth) {
    // If in upper portion of panel → header
    if (center.y > panelCenter.y + panelSize.y * 0.15) {
      return "header";
    }
    return "track";
  }

  return "reference";
}

/**
 * Apply Build Mode overlays to a scene group.
 * Returns a new group with edge outlines + semi-transparent solids.
 */
export function applyBuildModeOverlay(scene: THREE.Group): BuildModeOverlay {
  const outputGroup = new THREE.Group();
  const stats = { studs: 0, tracks: 0, headers: 0, openings: 0, total: 0 };

  // Compute panel-level bounding box
  const panelBounds = new THREE.Box3().setFromObject(scene);

  // Collect all meshes
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

    // 1. Semi-transparent original geometry
    const transparentMat = (mesh.material as THREE.MeshStandardMaterial).clone();
    transparentMat.transparent = true;
    transparentMat.opacity = 0.15;
    transparentMat.color = new THREE.Color(color);
    transparentMat.depthWrite = false;

    const transparentMesh = new THREE.Mesh(mesh.geometry.clone(), transparentMat);
    transparentMesh.position.copy(mesh.position);
    transparentMesh.quaternion.copy(mesh.quaternion);
    transparentMesh.scale.copy(mesh.scale);
    outputGroup.add(transparentMesh);

    // 2. Edge outlines
    const edges = new THREE.EdgesGeometry(mesh.geometry, 30); // threshold angle
    const edgeMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      linewidth: 1,
    });
    const edgeLine = new THREE.LineSegments(edges, edgeMat);
    edgeLine.position.copy(mesh.position);
    edgeLine.quaternion.copy(mesh.quaternion);
    edgeLine.scale.copy(mesh.scale);
    outputGroup.add(edgeLine);
  }

  return { group: outputGroup, stats };
}

/**
 * Merge original model with overlays into a single group for USDZ export.
 */
export function mergeWithOverlay(
  originalScene: THREE.Group,
  overlay: BuildModeOverlay,
): THREE.Group {
  const merged = new THREE.Group();
  merged.add(originalScene.clone());
  merged.add(overlay.group);
  return merged;
}