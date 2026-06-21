// Custom CAD-style view cube rendered as HTML overlay
// Matches the Revit/AutoCAD-style cube from Screenshot-5

import * as THREE from "three";

interface ViewCubeOptions {
  camera: THREE.PerspectiveCamera;
  controls: any; // OrbitControls
  domElement: HTMLCanvasElement;
}

interface FaceConfig {
  label: string;
  direction: THREE.Vector3;
  up: THREE.Vector3;
}

const FACES: FaceConfig[] = [
  { label: "F", direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { label: "B", direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  { label: "L", direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { label: "R", direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { label: "T", direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  { label: "Bt", direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, -1) },
];

export class ViewCube {
  private camera: THREE.PerspectiveCamera;
  private controls: any;
  private container: HTMLDivElement;
  private animating = false;
  private animStart: number | null = null;
  private animDuration = 300;
  private startPos = new THREE.Vector3();
  private endPos = new THREE.Vector3();
  private startTarget = new THREE.Vector3();
  private endTarget = new THREE.Vector3();
  private startUp = new THREE.Vector3();
  private endUp = new THREE.Vector3();

  constructor({ camera, controls, domElement }: ViewCubeOptions) {
    this.camera = camera;
    this.controls = controls;

    // Create container
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: absolute;
      top: 92px;
      right: 20px;
      z-index: 15;
      user-select: none;
      cursor: pointer;
    `;

    // Create cube faces using CSS 3D transforms
    const cubeWrapper = document.createElement("div");
    cubeWrapper.style.cssText = `
      width: 100px;
      height: 100px;
      perspective: 300px;
      transform-style: preserve-3d;
    `;

    // Each face is positioned in 3D space via CSS transforms
    const faceSize = 40;
    const halfSize = faceSize / 2;

    for (const face of FACES) {
      const el = document.createElement("div");
      const isTopOrBottom = face.label === "T" || face.label === "Bt";
      el.style.cssText = `
        position: absolute;
        width: ${faceSize}px;
        height: ${faceSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 700;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #e6edf5;
        background: ${isTopOrBottom ? "#3d5063" : "#2f3d4b"};
        border: 1px solid #51606f;
        border-radius: 2px;
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s;
        backface-visibility: hidden;
        transform-style: preserve-3d;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
      `;
      el.textContent = face.label;

      // Position using CSS 3D transforms
      const dx = face.direction.x * halfSize;
      const dy = face.direction.y * halfSize;
      const dz = face.direction.z * halfSize;

      // Determine rotation based on face
      let rotateX = 0, rotateY = 0;
      if (face.label === "F") rotateY = 0;
      else if (face.label === "B") rotateY = 180;
      else if (face.label === "L") rotateY = -90;
      else if (face.label === "R") rotateY = 90;
      else if (face.label === "T") rotateX = -90;
      else if (face.label === "Bt") rotateX = 90;

      el.style.transform = `translate3d(${50 + dx - halfSize}px, ${50 - dy - halfSize}px, ${dz}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

      el.addEventListener("mouseenter", () => {
        el.style.background = isTopOrBottom ? "#5a738c" : "#4a6178";
        el.style.borderColor = "#7e97af";
      });
      el.addEventListener("mouseleave", () => {
        el.style.background = isTopOrBottom ? "#3d5063" : "#2f3d4b";
        el.style.borderColor = "#51606f";
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.animateToView(face);
      });

      cubeWrapper.appendChild(el);
    }

    // Add edge/corner decorators
    this.addCorners(cubeWrapper, faceSize, halfSize);

    this.container.appendChild(cubeWrapper);

    // Insert into DOM after the canvas
    domElement.parentElement?.appendChild(this.container);
  }

  private addCorners(wrapper: HTMLDivElement, size: number, half: number) {
    // Small corner dots at each cube vertex
    const corners = [
      [-1, 1, 1], [1, 1, 1], [-1, -1, 1], [1, -1, 1],
      [-1, 1, -1], [1, 1, -1], [-1, -1, -1], [1, -1, -1],
    ];

    for (const [cx, cy, cz] of corners) {
      const dot = document.createElement("div");
      dot.style.cssText = `
        position: absolute;
        width: 4px;
        height: 4px;
        background: #8ea5bb;
        border-radius: 50%;
        pointer-events: none;
      `;
      const px = 50 + (cx as number) * half - 2;
      const py = 50 - (cy as number) * half - 2;
      const pz = (cz as number) * half;
      dot.style.transform = `translate3d(${px}px, ${py}px, ${pz}px)`;
      wrapper.appendChild(dot);
    }
  }

  private animateToView(face: FaceConfig) {
    const center = this.controls?.target || new THREE.Vector3(0, 0, 0);
    const distance = this.camera.position.distanceTo(center) || 8;

    this.startPos.copy(this.camera.position);
    this.startTarget.copy(this.controls?.target || new THREE.Vector3(0, 0, 0));
    this.startUp.copy(this.camera.up);

    this.endPos.copy(face.direction).multiplyScalar(distance).add(center);
    this.endTarget.copy(center);
    this.endUp.copy(face.up);

    this.animating = true;
    this.animStart = performance.now();
  }

  update(/* delta: number */) {
    if (!this.animating) return;

    const elapsed = performance.now() - (this.animStart ?? performance.now());
    const t = Math.min(elapsed / this.animDuration, 1);

    // Smooth step
    const smoothT = t * t * (3 - 2 * t);

    this.camera.position.lerpVectors(this.startPos, this.endPos, smoothT);
    this.camera.up.lerpVectors(this.startUp, this.endUp, smoothT).normalize();
    if (this.controls) {
      this.controls.target.lerpVectors(this.startTarget, this.endTarget, smoothT);
      this.controls.update();
    }
    this.camera.lookAt(this.endTarget);

    if (t >= 1) {
      this.animating = false;
      this.animStart = null;
    }
  }

  dispose() {
    this.container?.remove();
  }
}