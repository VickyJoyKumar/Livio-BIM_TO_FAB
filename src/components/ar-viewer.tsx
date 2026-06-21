"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { extractWebIfcPositions } from "@/lib/web-ifc-geometry";

interface ArViewerProps {
  modelUrl: string;
  format: "ifc" | "gltf" | "glb";
  panelName: string;
  onBack: () => void;
}

export default function ArViewer({ modelUrl, format, panelName, onBack }: ArViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group>(new THREE.Group());
  const modelLoadedRef = useRef(false);

  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [placed, setPlaced] = useState(false);
  const [status, setStatus] = useState("Checking AR support...");

  // Scale state for pinch gesture
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);

  // --- iOS detection ---
  const isIOSRef = useRef(false);

  // --- Log runtime info for debugging ---
  const logRuntimeInfo = useCallback(() => {
    const info = {
      userAgent: navigator.userAgent,
      hasXR: "xr" in navigator,
      isSecureContext: window.isSecureContext,
      platform: (navigator as any).platform,
      vendor: navigator.vendor,
    };
    console.log("[AR Debug] Runtime info:", info);
    return info;
  }, []);

  // --- Check AR support with iOS fallback ---
  useEffect(() => {
    const info = logRuntimeInfo();
    isIOSRef.current = /iPad|iPhone|iPod/.test(navigator.userAgent);

    async function checkArSupport() {
      try {
        // Standard WebXR check
        if (typeof navigator !== "undefined" && "xr" in navigator) {
          const supported = await navigator.xr!.isSessionSupported("immersive-ar");
          if (supported) {
            setArSupported(true);
            setStatus("Tap 'Start AR' to place the model");
            setLoading(false);
            return;
          }
          // WebXR says unsupported — but this is common on iOS Safari
          // even when ARKit is fully functional. Fall through to iOS fallback.
          console.log("[AR Debug] WebXR reports immersive-ar unsupported, trying iOS fallback");
        }

        // iOS fallback: requestSession directly without prior check
        // On iOS Safari, isSessionSupported often returns false but
        // requestSession("immersive-ar") can still succeed.
        if (isIOSRef.current) {
          console.log("[AR Debug] iOS device detected — allowing AR attempt");
          setArSupported(true);
          setStatus("Tap 'Start AR' to place the model");
          setLoading(false);
          return;
        }

        // Not iOS and WebXR says unsupported — show error
        setArSupported(false);
        setStatus("AR not supported on this device/browser.");
        setLoading(false);
      } catch (err) {
        // Promise rejected — try iOS fallback
        console.log("[AR Debug] WebXR detection error:", (err as Error).message);
        if (isIOSRef.current) {
          setArSupported(true);
          setStatus("Tap 'Start AR' to place the model");
        } else {
          setArSupported(false);
          setStatus("AR not supported on this device/browser.");
        }
        setLoading(false);
      }
    }

    checkArSupport();
  }, [logRuntimeInfo]);

  // --- Load model (convert IFC → geometry for AR) ---
  const loadModel = useCallback(async () => {
    try {
      // Prefer GLB for AR (lighter, no web-ifc needed browser-side)
      if (format === "glb" || format === "gltf") {
        await loadGltfForAr();
      } else if (format === "ifc") {
        await loadIfcForAr();
      }
      modelLoadedRef.current = true;
    } catch (err) {
      setStatus(`Failed to load model: ${(err as Error).message}`);
    }
  }, [modelUrl, format]);

  const loadIfcForAr = async () => {
    setProgress(10);
    const response = await fetch(modelUrl);
    const buffer = await response.arrayBuffer();
    setProgress(30);

    const IfcAPI = (await import("web-ifc")).IfcAPI;
    const ifcApi = new IfcAPI();
    await ifcApi.Init(() => "/web-ifc.wasm");
    setProgress(50);

    const uint8 = new Uint8Array(buffer);
    const modelID = ifcApi.OpenModel(uint8, { COORDINATE_TO_ORIGIN: true });
    const flatMeshes = ifcApi.LoadAllGeometry(modelID);
    const total = flatMeshes.size();
    const group = modelGroupRef.current;

    for (let i = 0; i < total; i++) {
      const flatMesh = flatMeshes.get(i);
      const placedGeometries = flatMesh.geometries;
      const numGeom = placedGeometries.size();

      for (let j = 0; j < numGeom; j++) {
        const placedGeom = placedGeometries.get(j);
        const geom = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        const rawVertexData = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const pos = extractWebIfcPositions(rawVertexData);
        const idx = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geometry.setIndex(new THREE.BufferAttribute(idx, 1));
        geometry.computeVertexNormals();

        const color = new THREE.Color(placedGeom.color.x, placedGeom.color.y, placedGeom.color.z);
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);

        if (placedGeom.flatTransformation && placedGeom.flatTransformation.length === 16) {
          mesh.applyMatrix4(new THREE.Matrix4().fromArray(placedGeom.flatTransformation));
        }

        group.add(mesh);
      }
      setProgress(50 + Math.floor((i / total) * 40));
    }

    ifcApi.CloseModel(modelID);
    ifcApi.Dispose();
    setProgress(100);
  };

  const loadGltfForAr = async () => {
    setProgress(20);
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const group = modelGroupRef.current;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        group.add(gltf.scene);
        setProgress(100);
      },
      (xhr) => setProgress(20 + Math.floor((xhr.loaded / xhr.total) * 70)),
      (err: unknown) => setStatus(`Failed to load: ${(err as Error).message}`),
    );
  };

  // --- Start AR session ---
  const startAr = useCallback(async () => {
    if (!canvasRef.current) { return; }

    setStatus("Starting AR...");

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    const modelGroup = modelGroupRef.current;
    modelGroup.visible = false;
    scene.add(modelGroup);

    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.12, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    reticle.rotation.x = -Math.PI / 2;
    reticle.visible = false;
    scene.add(reticle);

    setStatus("Loading model...");
    await loadModel();

    try {
      // On iOS Safari, navigator.xr may not be exposed but requestSession
      // can still work when called from a secure context.
      // Skip the feature-detect check and try the session request directly.
      let session: XRSession;
      try {
        session = await (navigator as any).xr?.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test", "local-floor"],
        });
        if (!session) throw new Error("WebXR not available");
      } catch {
        // If WebXR fails, try without hit-test (simpler fallback)
        session = await (navigator as any).xr?.requestSession("immersive-ar", {
          requiredFeatures: [],
        });
        if (!session) throw new Error("WebXR not available");
      }

      session.addEventListener("end", () => {
        setSessionStarted(false);
        setPlaced(false);
        setStatus("AR ended");
      });

      await renderer.xr.setSession(session);
      setSessionStarted(true);
      setStatus("Move your device to detect surfaces");

      const viewerSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await (session as any).requestHitTestSource({ space: viewerSpace });
      const referenceSpace = await session.requestReferenceSpace("local-floor");

      let modelPlaced = false;

      renderer.setAnimationLoop((_timestamp, xrFrame) => {
        if (!xrFrame || !camera || !renderer) return;

        const pose = xrFrame.getViewerPose(referenceSpace);
        if (pose) {
          camera.matrixAutoUpdate = false;
          camera.matrix.fromArray(pose.transform.matrix);
          camera.updateMatrixWorld(true);
        }

        const hitResults = xrFrame.getHitTestResults(hitTestSource);
        if (hitResults.length > 0) {
          const hit = hitResults[0]!;
          const pose2 = hit.getPose(referenceSpace);
          if (pose2) {
            reticle.visible = true;
            reticle.position.fromArray([pose2.transform.position.x, pose2.transform.position.y, pose2.transform.position.z]);
            reticle.quaternion.fromArray([pose2.transform.orientation.x, pose2.transform.orientation.y, pose2.transform.orientation.z, pose2.transform.orientation.w]);
          }
        } else {
          reticle.visible = false;
        }

        renderer.render(scene, camera);
      });

      const sessionCanvas = renderer.domElement;
      const onTap = (e: PointerEvent | TouchEvent) => {
        if (modelPlaced) return;
        if (reticle.visible) {
          modelGroup.position.copy(reticle.position);
          modelGroup.quaternion.copy(reticle.quaternion);
          modelGroup.visible = true;
          modelPlaced = true;
          setPlaced(true);
          setStatus("Model placed. Pinch to scale, drag to rotate.");
        }
      };
      sessionCanvas.addEventListener("pointerdown", onTap);

      let lastPinchDist = 0;
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const t0 = e.touches[0]!;
          const t1 = e.touches[1]!;
          const dx = t0.clientX - t1.clientX;
          const dy = t1.clientY - t0.clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (lastPinchDist > 0) {
            const delta = dist / lastPinchDist;
            scaleRef.current *= delta;
            scaleRef.current = Math.max(0.1, Math.min(10, scaleRef.current));
            modelGroup.scale.setScalar(scaleRef.current);
          }
          lastPinchDist = dist;
        } else {
          lastPinchDist = 0;
        }

        if (e.touches.length === 1 && modelPlaced) {
          rotationRef.current += e.touches[0]!.clientX > (window.innerWidth / 2) ? 0.01 : -0.01;
          modelGroup.rotation.y = rotationRef.current;
        }
      };
      sessionCanvas.addEventListener("touchmove", onTouchMove);

    } catch (err) {
      setStatus(`AR error: ${(err as Error).message}`);
    }
  }, [loadModel]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" />

      {/* Back button */}
      {!sessionStarted && (
        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-2 text-sm text-white backdrop-blur transition hover:bg-black/70"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}

      {/* Status overlay */}
      <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 text-center">
        <div className="inline-block rounded-xl bg-black/60 px-5 py-3 text-sm text-white backdrop-blur-lg">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-white/70">Loading...</span>
            </div>
          ) : sessionStarted ? (
            <span>{status}</span>
          ) : (
            <span>{status}</span>
          )}
        </div>
      </div>

      {/* Start AR button — shown when supported OR on iOS (try anyway) */}
      {arSupported && !sessionStarted && !loading && (
        <div className="absolute bottom-32 left-1/2 z-10 -translate-x-1/2">
          <button
            onClick={startAr}
            className="flex items-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 text-base font-medium text-white shadow-xl transition hover:bg-blue-700 active:scale-[0.97]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            Start AR
          </button>
        </div>
      )}

      {/* AR unsupported message — only for non-iOS devices where WebXR truly doesn't exist */}
      {arSupported === false && !loading && !isIOSRef.current && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <div className="max-w-sm rounded-2xl bg-white/10 p-8 text-center backdrop-blur">
            <p className="text-lg font-semibold text-white mb-2">AR Not Available</p>
            <p className="text-sm text-white/70">
              Augmented Reality is not supported on this device or browser.
            </p>
            <button
              onClick={onBack}
              className="mt-4 rounded-lg bg-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/30"
            >
              Back to Viewer
            </button>
          </div>
        </div>
      )}

      {/* AR controls hint */}
      {placed && (
        <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/50 px-4 py-2 text-center text-xs text-white/80 backdrop-blur">
          ✨ Pinch to scale · Drag to rotate · Tap to reposition
        </div>
      )}
    </div>
  );
}