"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

interface IfcViewerProps {
  modelUrl: string;
  format: "ifc" | "gltf" | "glb";
  panelId: string;
  panelName: string;
  onBack: () => void;
}

export default function IfcViewer({ modelUrl, format, panelId, panelName, onBack }: IfcViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshGroupRef = useRef<THREE.Group>(new THREE.Group());
  const animationRef = useRef<number>(0);
  const viewHelperRef = useRef<ViewHelper | null>(null);
  const hoverSphereRef = useRef<THREE.Mesh | null>(null);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [measureLines, setMeasureLines] = useState<THREE.Line[]>([]);
  const [measureSprites, setMeasureSprites] = useState<THREE.Sprite[]>([]);
  const [measureStatus, setMeasureStatus] = useState("");
  const [modelLoaded, setModelLoaded] = useState(false);
  const errorRef = useRef<string | null>(null);

  // --- Collect meshes for raycaster ---
  const getMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    meshGroupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    return meshes;
  }, []);

  // --- Initialize Three.js Scene ---
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e293b);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(8, 6, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvasRef.current! });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 0.5;
    controls.maxDistance = 50;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // View Helper (View Cube)
    const viewHelper = new ViewHelper(camera, renderer.domElement);
    viewHelperRef.current = viewHelper;

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);
    const backLight = new THREE.DirectionalLight(0xffaa88, 0.3);
    backLight.position.set(0, -5, -10);
    scene.add(backLight);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x4a5568, 0x2d3748);
    scene.add(grid);

    // Hover sphere for measure mode (hidden by default)
    const sphereGeom = new THREE.SphereGeometry(0.08, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.7 });
    const hoverSphere = new THREE.Mesh(sphereGeom, sphereMat);
    hoverSphere.visible = false;
    scene.add(hoverSphere);
    hoverSphereRef.current = hoverSphere;

    // Model group
    scene.add(meshGroupRef.current);

    // Load model
    loadModel();

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // --- Load Model ---
  const loadModel = async () => {
    try {
      if (format === "ifc") {
        await loadIfc();
      } else {
        await loadGltf();
      }
      setModelLoaded(true);
    } catch (err) {
      errorRef.current = `Failed to load model: ${(err as Error).message}`;
      setLoading(false);
    }
  };

  const loadIfc = async () => {
    setProgress(10);
    const response = await fetch(modelUrl);
    const buffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    setProgress(40);

    const IfcAPI = (await import("web-ifc")).IfcAPI;
    const ifcApi = new IfcAPI();
    await ifcApi.Init(() => "/web-ifc.wasm");
    setProgress(60);

    const modelID = ifcApi.OpenModel(uint8, {});
    setProgress(75);

    const flatMeshes = ifcApi.LoadAllGeometry(modelID);
    const group = meshGroupRef.current;
    const total = flatMeshes.size();

    for (let i = 0; i < total; i++) {
      const flatMesh = flatMeshes.get(i);
      const placedGeometries = flatMesh.geometries;
      const numGeom = placedGeometries.size();

      for (let j = 0; j < numGeom; j++) {
        const placedGeom = placedGeometries.get(j);
        const ifcGeometry = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        const pos = ifcApi.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
        const idx = ifcApi.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize());

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geometry.setIndex(new THREE.BufferAttribute(idx, 1));
        geometry.computeVertexNormals();

        const color = new THREE.Color(placedGeom.color.x, placedGeom.color.y, placedGeom.color.z);
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide, // prevents back-face culling issues
        });
        const threeMesh = new THREE.Mesh(geometry, material);
        threeMesh.castShadow = true;
        threeMesh.receiveShadow = true;

        // Apply flat transformation directly to geometry vertices (more reliable)
        if (placedGeom.flatTransformation && placedGeom.flatTransformation.length === 16) {
          const matrix = new THREE.Matrix4().fromArray(placedGeom.flatTransformation);
          geometry.applyMatrix4(matrix);
        }

        group.add(threeMesh);
      }
      setProgress(75 + Math.floor((i / total) * 20));
    }

    ifcApi.CloseModel(modelID);
    ifcApi.Dispose();
    setProgress(100);
    setLoading(false);
    fitCameraToGroup();
  };

  const loadGltf = async () => {
    setProgress(30);
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const group = meshGroupRef.current;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        group.add(gltf.scene);
        setProgress(100);
        setLoading(false);
        fitCameraToGroup();
      },
      (xhr) => setProgress(30 + Math.floor((xhr.loaded / xhr.total) * 60)),
      (err: unknown) => {
        errorRef.current = `Failed to load glTF: ${(err as Error).message}`;
        setLoading(false);
      },
    );
  };

  const fitCameraToGroup = () => {
    const group = meshGroupRef.current;
    if (group.children.length === 0) return;
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.8;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      camera.position.set(center.x + distance * 0.6, center.y + distance * 0.5, center.z + distance);
      controls.target.copy(center);
      controls.update();
    }
  };

  // --- Toolbar Handlers ---
  const handleResetView = useCallback(() => fitCameraToGroup(), []);
  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const link = document.createElement("a");
    link.download = `${panelName}-view.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  }, [panelName]);

  const handleToggleWireframe = useCallback(() => {
    setWireframe((prev) => {
      const next = !prev;
      meshGroupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          if (Array.isArray(child.material)) {
            (child.material as THREE.MeshStandardMaterial[]).forEach((m) => (m.wireframe = next));
          } else {
            (child.material as THREE.MeshStandardMaterial).wireframe = next;
          }
        }
      });
      return next;
    });
  }, []);

  const handleMeasure = useCallback(() => {
    setMeasureMode((prev) => {
      if (prev) {
        // Exiting — clear hover & status
        if (hoverSphereRef.current) hoverSphereRef.current.visible = false;
        setMeasurePoints([]);
        setMeasureStatus("");
        document.body.style.cursor = "default";
      } else {
        setMeasureStatus("Click first point on the model");
        document.body.style.cursor = "crosshair";
      }
      return !prev;
    });
  }, []);

  // --- Mouse move (hover indicator for measure) ---
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!measureMode || !modelLoaded) return;
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const meshes = getMeshes();
      const intersects = raycaster.intersectObjects(meshes);

      if (hoverSphereRef.current) {
        if (intersects.length > 0) {
          hoverSphereRef.current.position.copy(intersects[0]!.point);
          hoverSphereRef.current.visible = true;
        } else {
          hoverSphereRef.current.visible = false;
        }
      }
    },
    [measureMode, modelLoaded, getMeshes],
  );

  // --- Click for measure ---
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!measureMode || !modelLoaded) return;
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const meshes = getMeshes();
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length === 0) return;

      const point = intersects[0]!.point.clone();

      setMeasurePoints((prev) => {
        const newPoints = [...prev, point];
        if (newPoints.length === 1) {
          setMeasureStatus("Click second point");
          // Place a temporary marker at the first point
          placeMarker(point, 0x00ff88);
        }
        if (newPoints.length === 2) {
          drawMeasurement(newPoints[0]!, newPoints[1]!);
          setMeasureStatus(`Distance: ${newPoints[0]!.distanceTo(newPoints[1]!).toFixed(2)} m`);
          document.body.style.cursor = "default";
          if (hoverSphereRef.current) hoverSphereRef.current.visible = false;
          return [];
        }
        return newPoints;
      });
    },
    [measureMode, modelLoaded, getMeshes],
  );

  const placeMarker = (point: THREE.Vector3, color: number) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const sphereGeom = new THREE.SphereGeometry(0.1, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.copy(point);
    scene.add(sphere);
  };

  const drawMeasurement = (p1: THREE.Vector3, p2: THREE.Vector3) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const points = [p1, p2];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    setMeasureLines((prev) => [...prev, line]);

    // Sphere markers
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const sphereGeom = new THREE.SphereGeometry(0.1, 8, 8);
    [p1, p2].forEach((p) => {
      const s = new THREE.Mesh(sphereGeom, sphereMat);
      s.position.copy(p);
      scene.add(s);
    });

    // Distance label
    const dist = p1.distanceTo(p2);
    const text = `${dist.toFixed(2)} m`;
    const sprite = makeTextSprite(text);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    sprite.position.copy(mid);
    sprite.position.y += 0.3;
    scene.add(sprite);
    setMeasureSprites((prev) => [...prev, sprite]);
  };

  const makeTextSprite = (text: string): THREE.Sprite => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect?.(10, 10, 236, 44, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  };

  const clearMeasurements = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    measureLines.forEach((l) => scene.remove(l));
    measureSprites.forEach((s) => scene.remove(s));
    setMeasureLines([]);
    setMeasureSprites([]);
    setMeasurePoints([]);
    setMeasureStatus("");
  }, [measureLines, measureSprites]);

  const handleReportIssue = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const screenshot = renderer.domElement.toDataURL("image/png");
    const params = new URLSearchParams({ panel_id: panelId, panel_name: panelName, screenshot });
    window.open(`/issues/new?${params.toString()}`, "_blank");
  }, [panelId, panelName]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        className={`h-full w-full ${measureMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      />

      {/* Back button */}
      <button onClick={onBack} className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-2 text-sm text-white backdrop-blur transition hover:bg-black/70">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Panel name */}
      <div className="absolute left-4 top-16 z-10 max-w-xs rounded-lg bg-black/50 px-3 py-2 text-sm text-white backdrop-blur">
        <p className="truncate font-medium">{panelName}</p>
      </div>

      {/* Measure status */}
      {measureStatus && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white backdrop-blur">
          {measureStatus}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80">
          <div className="h-2 w-64 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {progress < 30 ? "Downloading model..." : progress < 60 ? "Parsing IFC..." : "Building scene..."}
          </p>
        </div>
      )}

      {errorRef.current && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80">
          <div className="rounded-xl bg-red-900/80 p-6 text-center">
            <p className="text-sm text-red-200">{errorRef.current}</p>
            <button onClick={onBack} className="mt-4 rounded-lg bg-white/20 px-4 py-2 text-sm text-white">Go Back</button>
          </div>
        </div>
      )}

      {/* Floating toolbar */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-black/60 px-3 py-2 backdrop-blur-lg">
        <ToolButton icon="⟳" label="Reset view" onClick={handleResetView} />
        <ToolButton icon={wireframe ? "⬡" : "◇"} label={wireframe ? "Solid" : "Wireframe"} onClick={handleToggleWireframe} active={wireframe} />
        <ToolButton icon="📷" label="Screenshot" onClick={handleScreenshot} />
        <div className="mx-1 h-6 w-px bg-white/20" />
        <ToolButton icon={measureMode ? "✕" : "📏"} label={measureMode ? "Stop" : "Measure"} onClick={handleMeasure} active={measureMode} />
        {measureLines.length > 0 && <ToolButton icon="🗑" label="Clear" onClick={clearMeasurements} />}
        <div className="mx-1 h-6 w-px bg-white/20" />
        <ToolButton icon="🐛" label="Report" onClick={handleReportIssue} />
        <div className="mx-1 h-6 w-px bg-white/20" />
        <ToolButton icon="🕶️" label="AR" onClick={() => window.open(`/ar/${panelId}`, "_self")} />
      </div>
    </div>
  );
}

function ToolButton({
  icon, label, onClick, active,
}: {
  icon: string; label: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
        active ? "bg-blue-600 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}