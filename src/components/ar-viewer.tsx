"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { USDZExporter } from "three-stdlib";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modelGroupRef = useRef<THREE.Group>(new THREE.Group());

  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [placed, setPlaced] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [debugInfo, setDebugInfo] = useState<Record<string, any> | null>(null);

  const scaleRef = useRef(1);
  const rotationRef = useRef(0);
  const isIOSRef = useRef(false);
  const isWebXRRef = useRef(false);

  // Every AR session object we need to clean up
  const arSessionRef = useRef<any>(null);

  // --- Detect platform & decide AR path ---
  useEffect(() => {
    const ua = navigator.userAgent;
    isIOSRef.current = /iPad|iPhone|iPod/.test(ua);
    isWebXRRef.current = typeof navigator !== "undefined" && "xr" in navigator && !!navigator.xr;

    console.log("[AR] Platform:", {
      userAgent: ua,
      isIOS: isIOSRef.current,
      hasWebXR: isWebXRRef.current,
      isSecureContext: window.isSecureContext,
    });

    setDebugInfo({
      userAgent: ua.substring(0, 120),
      hasXR: "xr" in navigator,
      xrValue: String((navigator as any).xr),
      isSecureContext: window.isSecureContext,
      isIOS: isIOSRef.current,
      platform: (navigator as any).platform,
      vendor: navigator.vendor,
    });

    if (isIOSRef.current) {
      // iOS → AR Quick Look via USDZ
      setArSupported(true);
      setStatus("Preparing AR...");
      setLoading(false);
    } else if (isWebXRRef.current) {
      // WebXR-capable → immersive AR
      setArSupported(true);
      setStatus("Tap 'Start AR' to place the model");
      setLoading(false);
    } else {
      setArSupported(false);
      setStatus("AR is not supported on this device.");
      setLoading(false);
    }
  }, []);

  // --- Load model: GLB preferred, IFC fallback ---
  const loadModel = useCallback(async (): Promise<THREE.Group> => {
    const group = modelGroupRef.current;
    group.clear();

    if (format === "glb" || format === "gltf") {
      await loadGltf(group);
    } else if (format === "ifc") {
      await loadIfc(group);
    }

    return group;
  }, [modelUrl, format]);

  const loadGltf = (group: THREE.Group): Promise<void> =>
    new Promise((resolve, reject) => {
      setProgress(20);
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          group.add(gltf.scene);
          setProgress(100);
          resolve();
        },
        (xhr) => setProgress(20 + Math.floor((xhr.loaded / xhr.total) * 70)),
        (err) => reject(err),
      );
    });

  const loadIfc = async (group: THREE.Group) => {
    setProgress(10);
    const resp = await fetch(modelUrl);
    const buf = await resp.arrayBuffer();
    setProgress(30);

    const { IfcAPI } = await import("web-ifc");
    const ifcApi = new IfcAPI();
    await ifcApi.Init(() => "/web-ifc.wasm");
    setProgress(50);

    const mid = ifcApi.OpenModel(new Uint8Array(buf), { COORDINATE_TO_ORIGIN: true });
    const flatMeshes = ifcApi.LoadAllGeometry(mid);
    const total = flatMeshes.size();

    for (let i = 0; i < total; i++) {
      const fm = flatMeshes.get(i);
      const gs = fm.geometries;
      for (let j = 0; j < gs.size(); j++) {
        const pg = gs.get(j);
        const g = ifcApi.GetGeometry(mid, pg.geometryExpressID);
        const raw = ifcApi.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const pos = extractWebIfcPositions(raw);
        const idx = ifcApi.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        if (pos.length === 0 || idx.length === 0) continue;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geom.setIndex(new THREE.BufferAttribute(idx, 1));
        geom.computeVertexNormals();

        const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geom, mat);
        if (pg.flatTransformation && pg.flatTransformation.length === 16) {
          mesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
        }
        group.add(mesh);
      }
      setProgress(50 + Math.floor((i / total) * 40));
    }

    ifcApi.CloseModel(mid);
    ifcApi.Dispose();
    setProgress(100);
  };

  // ═══════════════════════════════════════════════
  // PATH A — iOS: AR Quick Look with USDZ
  // ═══════════════════════════════════════════════
  const launchArQuickLook = useCallback(async () => {
    setStatus("Loading model for AR...");
    try {
      const scene = await loadModel();
      setStatus("Converting to USDZ...");

      const exporter = new USDZExporter();
      const usdzBuffer = await exporter.parse(scene);

      const blob = new Blob([usdzBuffer as unknown as ArrayBuffer], { type: "model/vnd.usdz+zip" as string });
      const blobUrl = URL.createObjectURL(blob);

      setStatus("Opening AR Quick Look...");

      // AR Quick Look via anchor with rel=ar
      const link = document.createElement("a");
      link.rel = "ar";
      link.href = blobUrl;
      link.download = `${panelName || "model"}.usdz`;
      document.body.appendChild(link);

      // Some iOS version respond to click(), others need location change
      link.click();

      // Fallback: also try window redirect
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(link);
      }, 5000);
    } catch (err) {
      setStatus(`AR Quick Look failed: ${(err as Error).message}`);
    }
  }, [loadModel, panelName]);

  // ═══════════════════════════════════════════════
  // PATH B — Android: WebXR immersive AR
  // ═══════════════════════════════════════════════
  const startAr = useCallback(async () => {
    if (!canvasRef.current) return;

    setStatus("Starting AR...");
    const canvas = canvasRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);

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
      const session = await (navigator as any).xr?.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test", "local-floor"],
      });
      if (!session) throw new Error("WebXR not available");

      arSessionRef.current = session;

      session.addEventListener("end", () => {
        setSessionStarted(false);
        setPlaced(false);
        setStatus("AR ended");
        arSessionRef.current = null;
      });

      await renderer.xr.setSession(session);
      setSessionStarted(true);
      setStatus("Move your device to detect surfaces");

      const viewerSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await (session as any).requestHitTestSource?.({ space: viewerSpace });
      const referenceSpace = await session.requestReferenceSpace("local-floor");

      let modelPlaced = false;

      renderer.setAnimationLoop((_timestamp: number, xrFrame: any) => {
        if (!xrFrame || !camera || !renderer) return;

        const pose = xrFrame.getViewerPose(referenceSpace);
        if (pose) {
          camera.matrixAutoUpdate = false;
          camera.matrix.fromArray(pose.transform.matrix);
          camera.updateMatrixWorld(true);
        }

        if (hitTestSource) {
          const hitResults = xrFrame.getHitTestResults(hitTestSource);
          if (hitResults.length > 0) {
            const hit = hitResults[0];
            const pose2 = hit?.getPose(referenceSpace);
            if (pose2) {
              reticle.visible = true;
              reticle.position.fromArray([pose2.transform.position.x, pose2.transform.position.y, pose2.transform.position.z]);
              reticle.quaternion.fromArray([pose2.transform.orientation.x, pose2.transform.orientation.y, pose2.transform.orientation.z, pose2.transform.orientation.w]);
            }
          } else {
            reticle.visible = false;
          }
        }

        renderer.render(scene, camera);
      });

      const onTap = () => {
        if (modelPlaced || !reticle.visible) return;
        modelGroup.position.copy(reticle.position);
        modelGroup.quaternion.copy(reticle.quaternion);
        modelGroup.visible = true;
        modelPlaced = true;
        setPlaced(true);
        setStatus("Model placed. Pinch to scale, drag to rotate.");
      };
      renderer.domElement.addEventListener("pointerdown", onTap);

      let lastPinchDist = 0;
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const [t0, t1] = [e.touches[0]!, e.touches[1]!];
          const dx = t0.clientX - t1.clientX;
          const dy = t1.clientY - t0.clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (lastPinchDist > 0) {
            scaleRef.current *= dist / lastPinchDist;
            scaleRef.current = Math.max(0.1, Math.min(10, scaleRef.current));
            modelGroup.scale.setScalar(scaleRef.current);
          }
          lastPinchDist = dist;
        } else {
          lastPinchDist = 0;
        }
        if (e.touches.length === 1 && modelPlaced) {
          rotationRef.current += e.touches[0]!.clientX > window.innerWidth / 2 ? 0.01 : -0.01;
          modelGroup.rotation.y = rotationRef.current;
        }
      };
      renderer.domElement.addEventListener("touchmove", onTouchMove);

    } catch (err) {
      setStatus(`AR error: ${(err as Error).message}`);
    }
  }, [loadModel]);

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      if (arSessionRef.current) {
        try { arSessionRef.current.end(); } catch {}
        arSessionRef.current = null;
      }
    };
  }, []);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" />

      {/* Back button */}
      {!sessionStarted && (
        <button onClick={onBack}
          className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-2 text-sm text-white backdrop-blur transition hover:bg-black/70"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}

      {/* Status */}
      <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 text-center">
        <div className="inline-block rounded-xl bg-black/60 px-5 py-3 text-sm text-white backdrop-blur-lg">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-white/70">Loading...</span>
            </div>
          ) : (
            <span>{status}</span>
          )}
        </div>
      </div>

      {/* iOS — AR Quick Look button */}
      {arSupported && isIOSRef.current && !loading && (
        <div className="absolute bottom-32 left-1/2 z-10 -translate-x-1/2">
          <button onClick={launchArQuickLook}
            className="flex items-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 text-base font-medium text-white shadow-xl transition hover:bg-blue-700 active:scale-[0.97]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            View in AR
          </button>
        </div>
      )}

      {/* Android/WebXR — Start AR button */}
      {arSupported && !isIOSRef.current && isWebXRRef.current && !sessionStarted && !loading && (
        <div className="absolute bottom-32 left-1/2 z-10 -translate-x-1/2">
          <button onClick={startAr}
            className="flex items-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 text-base font-medium text-white shadow-xl transition hover:bg-blue-700 active:scale-[0.97]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            Start AR
          </button>
        </div>
      )}

      {/* Unsupported */}
      {arSupported === false && !loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <div className="max-w-sm rounded-2xl bg-white/10 p-8 text-center backdrop-blur">
            <p className="text-lg font-semibold text-white mb-2">AR Not Available</p>
            <p className="text-sm text-white/70">
              {isIOSRef.current
                ? "This iOS device does not support AR Quick Look."
                : "AR is not supported on this device or browser."}
            </p>
            <button onClick={onBack}
              className="mt-4 rounded-lg bg-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/30"
            >
              Back to Viewer
            </button>
          </div>
        </div>
      )}

      {/* WebXR controls hint */}
      {placed && (
        <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/50 px-4 py-2 text-center text-xs text-white/80 backdrop-blur">
          ✨ Pinch to scale · Drag to rotate · Tap to reposition
        </div>
      )}

      {/* Debug overlay */}
      {debugInfo && (
        <div className="absolute bottom-4 left-4 z-20 max-w-xs rounded-lg bg-black/80 p-3 text-[10px] font-mono text-green-400 backdrop-blur">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-white/50">AR Diagnostics</div>
          <div>hasXR: {String(debugInfo.hasXR)}</div>
          <div>xr: {debugInfo.xrValue}</div>
          <div>secure: {String(debugInfo.isSecureContext)}</div>
          <div>iOS: {String(debugInfo.isIOS)}</div>
          <div className="mt-1 truncate text-white/40">{debugInfo.userAgent}</div>
        </div>
      )}
    </div>
  );
}