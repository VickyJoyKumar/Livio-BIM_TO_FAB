"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { extractWebIfcPositions } from "@/lib/web-ifc-geometry";

interface IfcViewerProps {
  modelUrl: string;
  format: "ifc" | "gltf" | "glb";
  panelId: string;
  panelName: string;
  onBack: () => void;
}

type MeasureUnitSystem = "metric" | "imperial";
type MeasureSnapMode = "vertex" | "edge-midpoint" | "face-center" | "surface";
type CameraPreset = "front" | "back" | "left" | "right" | "top" | "bottom";

interface MeasurementSegment {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
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
  const lastFrameTimeRef = useRef<number | null>(null);
  const viewHelperRef = useRef<ViewHelper | null>(null);
  const viewHelperHandledClickRef = useRef(false);
  const hoverSphereRef = useRef<THREE.Mesh | null>(null);
  const pendingMeasureMarkerRef = useRef<THREE.Mesh | null>(null);
  const previewMeasureObjectsRef = useRef<THREE.Object3D[]>([]);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [measureSegments, setMeasureSegments] = useState<MeasurementSegment[]>([]);
  const [measureObjects, setMeasureObjects] = useState<THREE.Object3D[]>([]);
  const [measureStatus, setMeasureStatus] = useState("");
  const [measureUnitSystem, setMeasureUnitSystem] = useState<MeasureUnitSystem>("metric");
  const [measurePrecision, setMeasurePrecision] = useState(2);
  const [measureSnapMode, setMeasureSnapMode] = useState<MeasureSnapMode>("vertex");
  const [modelLoaded, setModelLoaded] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);

  // --- Collect meshes for raycaster ---
  const getMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    meshGroupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    return meshes;
  }, []);

  const clearPendingMeasureMarker = useCallback(() => {
    const scene = sceneRef.current;
    const marker = pendingMeasureMarkerRef.current;
    if (!scene || !marker) return;

    scene.remove(marker);
    disposeObject3D(marker);
    pendingMeasureMarkerRef.current = null;
  }, []);

  const clearPreviewMeasurement = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    previewMeasureObjectsRef.current.forEach((obj) => {
      scene.remove(obj);
      disposeObject3D(obj);
    });
    previewMeasureObjectsRef.current = [];
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    measureObjects.forEach((obj) => {
      scene.remove(obj);
      disposeObject3D(obj);
    });

    if (measureSegments.length === 0) {
      if (measureObjects.length > 0) {
        setMeasureObjects([]);
      }
      return;
    }

    const nextObjects = measureSegments.flatMap((segment) =>
      createMeasurementObjects(
        new THREE.Vector3(...segment.start),
        new THREE.Vector3(...segment.end),
        false,
      ),
    );

    nextObjects.forEach((obj) => scene.add(obj));
    setMeasureObjects(nextObjects);
  }, [measureSegments, measureUnitSystem, measurePrecision]);

  const getModelFrame = useCallback(() => {
    const group = meshGroupRef.current;
    if (group.children.length === 0) return null;

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    return { box, center, size, maxDim };
  }, []);

  // --- Initialize Three.js Scene ---
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb7c1cc);
    scene.fog = new THREE.Fog(0xb7c1cc, 24, 90);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(8, 6, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const canvas = canvasRef.current;
    const webglContext =
      canvas?.getContext("webgl2") ??
      canvas?.getContext("webgl") ??
      canvas?.getContext("experimental-webgl");

    if (!canvas || !webglContext) {
      setViewerError("WebGL is unavailable in this browser tab. Open the 3D viewer in Brave or another full browser window to render the model.");
      setLoading(false);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, canvas, context: webglContext as WebGLRenderingContext });
    } catch {
      setViewerError("WebGL is unavailable in this browser tab. Open the 3D viewer in Brave or another full browser window to render the model.");
      setLoading(false);
      return;
    }
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
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
    viewHelper.setLabels("R", "T", "F");
    viewHelper.location.top = 16;
    viewHelper.location.right = 16;
    viewHelper.location.bottom = 0;
    viewHelperRef.current = viewHelper;

    // Lights
    const ambient = new THREE.AmbientLight(0xf4f7fb, 1.05);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.55);
    dirLight.position.set(6, 10, 8);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xd9e4f0, 0.8);
    fillLight.position.set(-8, 5, 6);
    scene.add(fillLight);
    const backLight = new THREE.DirectionalLight(0x8ea5bb, 0.45);
    backLight.position.set(-4, -3, -8);
    scene.add(backLight);

    const grid = new THREE.GridHelper(80, 80, 0x708090, 0x98a7b6);
    grid.material.transparent = true;
    grid.material.opacity = 0.26;
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const axes = new THREE.AxesHelper(1.8);
    axes.position.set(-6.5, -5.5, -1.5);
    scene.add(axes);

    // Hover sphere for measure mode (hidden by default)
    const sphereGeom = new THREE.SphereGeometry(0.03, 12, 12);
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
      const now = performance.now();
      const delta = lastFrameTimeRef.current === null ? 0 : (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      controls.update();
      if (viewHelper.animating) {
        viewHelper.update(delta);
      }
      renderer.clear();
      renderer.render(scene, camera);
      viewHelper.render(renderer);
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
      lastFrameTimeRef.current = null;
      window.removeEventListener("resize", handleResize);
      clearPendingMeasureMarker();
      clearPreviewMeasurement();
      viewHelper.dispose();
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [clearPendingMeasureMarker, clearPreviewMeasurement]);

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
        const rawVertexData = ifcApi.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
        const pos = extractWebIfcPositions(rawVertexData);
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
    const frame = getModelFrame();
    if (!frame) return;
    const { center, maxDim } = frame;
    const distance = maxDim * 1.8;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      camera.position.set(center.x + distance * 0.7, center.y + distance * 0.55, center.z + distance * 1.05);
      controls.target.copy(center);
      controls.update();
    }
  };

  const handlePresetView = useCallback((preset: CameraPreset) => {
    const frame = getModelFrame();
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!frame || !camera || !controls) return;

    const directionByPreset: Record<CameraPreset, THREE.Vector3> = {
      front: new THREE.Vector3(0, 1, 0),
      back: new THREE.Vector3(0, -1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 0, 1),
      bottom: new THREE.Vector3(0, 0, -1),
    };

    const upByPreset: Record<CameraPreset, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, 1),
      left: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(0, 0, 1),
      top: new THREE.Vector3(0, 1, 0),
      bottom: new THREE.Vector3(0, -1, 0),
    };

    const distance = Math.max(frame.maxDim * 1.8, 1);
    const direction = directionByPreset[preset].clone().normalize();
    camera.position.copy(frame.center.clone().addScaledVector(direction, distance));
    camera.up.copy(upByPreset[preset]);
    camera.lookAt(frame.center);
    controls.target.copy(frame.center);
    controls.update();
    setMeasureStatus(`${(preset as string)[0]!.toUpperCase()}${(preset as string).slice(1)} view applied. Continue snapping points for measurement.`);
  }, [getModelFrame]);

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
        clearPendingMeasureMarker();
          clearPreviewMeasurement();
        setMeasurePoints([]);
        setMeasureStatus("");
        document.body.style.cursor = "default";
      } else {
          setMeasureStatus("Click first point on the model. Use the cube or presets to align the view if needed.");
        document.body.style.cursor = "crosshair";
      }
      return !prev;
    });
  }, [clearPendingMeasureMarker, clearPreviewMeasurement]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const viewHelper = viewHelperRef.current;
    if (!viewHelper) return;

    if (viewHelper.handleClick(e.nativeEvent)) {
      viewHelperHandledClickRef.current = true;
      setMeasureStatus("View cube applied. Click points on the model to measure from the chosen view.");
    }
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
          const snapPoint = resolveSnapPoint(intersects[0]!, measureSnapMode);
          hoverSphereRef.current.position.copy(snapPoint);
          hoverSphereRef.current.visible = true;

          if (measurePoints.length === 1) {
            clearPreviewMeasurement();
            const previewObjects = createMeasurementObjects(measurePoints[0]!, snapPoint, true);
            previewObjects.forEach((obj) => sceneRef.current?.add(obj));
            previewMeasureObjectsRef.current = previewObjects;
            setMeasureStatus(`Preview: ${formatDistance(measurePoints[0]!.distanceTo(snapPoint), measureUnitSystem, measurePrecision)} (${formatSnapModeLabel(measureSnapMode)})`);
          }
        } else {
          hoverSphereRef.current.visible = false;
          clearPreviewMeasurement();
          if (measurePoints.length === 1) {
            setMeasureStatus("Move over the model and click the second point.");
          }
        }
      }
    },
    [measureMode, modelLoaded, getMeshes, measurePoints, measurePrecision, measureSnapMode, measureUnitSystem, clearPreviewMeasurement],
  );

  // --- Click for measure ---
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (viewHelperHandledClickRef.current) {
        viewHelperHandledClickRef.current = false;
        return;
      }

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

      const point = resolveSnapPoint(intersects[0]!, measureSnapMode);

      setMeasurePoints((prev) => {
        const newPoints = [...prev, point];
        if (newPoints.length === 1) {
          setMeasureStatus(`First point snapped using ${formatSnapModeLabel(measureSnapMode)} mode. Click second point.`);
          clearPendingMeasureMarker();
          pendingMeasureMarkerRef.current = placeMarker(point, 0x00ff88, true);
        }
        if (newPoints.length === 2) {
          clearPendingMeasureMarker();
          clearPreviewMeasurement();
          const distance = newPoints[0]!.distanceTo(newPoints[1]!);
          setMeasureSegments((prevSegments) => [
            ...prevSegments,
            {
              id: crypto.randomUUID(),
              start: newPoints[0]!.toArray() as [number, number, number],
              end: newPoints[1]!.toArray() as [number, number, number],
            },
          ]);
          setMeasureStatus(`Distance: ${formatDistance(distance, measureUnitSystem, measurePrecision)}. Click first point for another measurement.`);
          document.body.style.cursor = "default";
          if (hoverSphereRef.current) hoverSphereRef.current.visible = false;
          return [];
        }
        return newPoints;
      });
    },
    [measureMode, modelLoaded, getMeshes, clearPendingMeasureMarker, clearPreviewMeasurement, measurePrecision, measureSnapMode, measureUnitSystem],
  );

  const placeMarker = (point: THREE.Vector3, color: number, persistent = false) => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const sphereGeom = new THREE.SphereGeometry(0.035, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.copy(point);
    scene.add(sphere);
    if (!persistent) {
      setMeasureObjects((prev) => [...prev, sphere]);
    }
    return sphere;
  };

  const createMeasurementObjects = (p1: THREE.Vector3, p2: THREE.Vector3, preview = false): THREE.Object3D[] => {
    const objects: THREE.Object3D[] = [];
    const camera = cameraRef.current;
    const distance = p1.distanceTo(p2);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
    const viewDirection = camera
      ? new THREE.Vector3().subVectors(camera.position, mid).normalize()
      : new THREE.Vector3(0, 0, 1);

    let offsetDirection = new THREE.Vector3().crossVectors(direction, viewDirection);
    if (offsetDirection.lengthSq() < 1e-6) {
      offsetDirection = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
    }
    if (offsetDirection.lengthSq() < 1e-6) {
      offsetDirection = new THREE.Vector3(0, 0, 1);
    }
    offsetDirection.normalize();

    const offsetDistance = Math.max(distance * 0.08, 0.18);
    const labelLift = Math.max(distance * 0.03, 0.12);
    const dimensionStart = p1.clone().addScaledVector(offsetDirection, offsetDistance);
    const dimensionEnd = p2.clone().addScaledVector(offsetDirection, offsetDistance);

    objects.push(...createLineObjects(p1, dimensionStart, 0x94a3b8, preview ? 0.4 : 1));
    objects.push(...createLineObjects(p2, dimensionEnd, 0x94a3b8, preview ? 0.4 : 1));
    objects.push(...createLineObjects(dimensionStart, dimensionEnd, 0xef4444, preview ? 0.6 : 1));

    [p1, p2].forEach((point) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: preview, opacity: preview ? 0.6 : 1 }),
      );
      marker.position.copy(point);
      objects.push(marker);
    });

    const arrowSize = Math.max(distance * 0.04, 0.08);
    const arrowInset = arrowSize * 0.45;
    objects.push(
      createArrowHead(dimensionStart.clone().addScaledVector(direction, arrowInset), direction, arrowSize, preview ? 0.6 : 1),
      createArrowHead(dimensionEnd.clone().addScaledVector(direction, -arrowInset), direction.clone().multiplyScalar(-1), arrowSize, preview ? 0.6 : 1),
    );

    const label = makeTextSprite(formatDistance(distance, measureUnitSystem, measurePrecision), preview);
    label.position.copy(mid.clone().addScaledVector(offsetDirection, offsetDistance + labelLift));
    objects.push(label);

    return objects;
  };

  const createLineObjects = (start: THREE.Vector3, end: THREE.Vector3, color: number, opacity = 1): THREE.Object3D[] => {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    return [new THREE.Line(geometry, material)];
  };

  const createArrowHead = (position: THREE.Vector3, direction: THREE.Vector3, size: number, opacity = 1) => {
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.45, size, 16),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: opacity < 1, opacity }),
    );
    arrow.position.copy(position);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return arrow;
  };

  const makeTextSprite = (text: string, preview = false): THREE.Sprite => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 72;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = preview ? "rgba(15,23,42,0.55)" : "rgba(15,23,42,0.78)";
    ctx.beginPath();
    ctx.roundRect?.(10, 10, 300, 52, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 160, 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.6, 0.58, 1);
    return sprite;
  };

  const clearMeasurements = useCallback(() => {
    const scene = sceneRef.current;
    clearPendingMeasureMarker();
    if (scene) {
      measureObjects.forEach((obj) => {
        scene.remove(obj);
        disposeObject3D(obj);
      });
    }
    setMeasureObjects([]);
    setMeasureSegments([]);
    setMeasurePoints([]);
    setMeasureStatus("");
  }, [clearPendingMeasureMarker, measureObjects]);

  const handleReportIssue = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const screenshot = renderer.domElement.toDataURL("image/png");
    const params = new URLSearchParams({ panel_id: panelId, panel_name: panelName, screenshot });
    window.open(`/issues/new?${params.toString()}`, "_blank");
  }, [panelId, panelName]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#9ea9b5]">
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        className={`h-full w-full ${measureMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_38%),linear-gradient(180deg,rgba(16,24,33,0.16),transparent_18%,transparent_82%,rgba(16,24,33,0.24))]" />

      <div className="absolute inset-x-0 top-0 z-10 border-b border-[#51606f] bg-[#2f3a46]/95 shadow-[0_12px_36px_rgba(0,0,0,0.24)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-3 text-[#e6edf5]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9eb0c2]">Model Workspace</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="max-w-[28rem] truncate text-base font-semibold text-white">{panelName}</p>
              <span className="rounded-sm border border-[#617181] bg-[#1f2831] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b8c7d6]">{format.toUpperCase()}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#b8c7d6]">
            <StatusChip label="Navigation" value="Orbit + Cube" />
            <StatusChip label="Snap" value={formatSnapModeLabel(measureSnapMode)} active={measureMode} />
            <StatusChip label="Units" value={measureUnitSystem === "metric" ? "m" : "ft/in"} active={measureMode} />
            <StatusChip label="Dimensions" value={measureSegments.length.toString()} active={measureSegments.length > 0} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#44515e] px-5 py-2.5">
          <ToolbarGroup title="File">
            <ToolButton label="Back" onClick={onBack} compact />
            <ToolButton label="Capture" onClick={handleScreenshot} compact />
            <ToolButton label="Report" onClick={handleReportIssue} compact />
          </ToolbarGroup>

          <ToolbarGroup title="View">
            <ToolButton label="Reset" onClick={handleResetView} compact />
            <ToolButton label={wireframe ? "Solid" : "Wireframe"} onClick={handleToggleWireframe} active={wireframe} compact />
            <ToolButton label="AR" onClick={() => window.open(`/ar/${panelId}`, "_self")} compact />
          </ToolbarGroup>

          <ToolbarGroup title="Measure">
            <ToolButton label={measureMode ? "Stop" : "Measure"} onClick={handleMeasure} active={measureMode} compact />
            {measureSegments.length > 0 && <ToolButton label="Clear" onClick={clearMeasurements} compact />}
          </ToolbarGroup>
        </div>
      </div>

      {/* Measure status */}
      {measureStatus && (
        <div className="absolute left-1/2 top-28 z-10 max-w-[44rem] -translate-x-1/2 rounded-md border border-[#4f5f6f] bg-[#25303b]/96 px-4 py-2 text-sm text-[#e8eef5] shadow-[0_16px_36px_rgba(0,0,0,0.22)] backdrop-blur">
          {measureStatus}
        </div>
      )}

      <div className="absolute left-4 top-28 z-10 w-72 rounded-md border border-[#536273] bg-[#27313b]/94 text-[#d8e2ec] shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur">
        <PanelSection title="Project Browser" eyebrow="Active Panel">
          <div className="space-y-2 text-sm">
            <div className="rounded-md border border-[#455362] bg-[#1f2831] px-3 py-2">
              <p className="truncate font-medium text-white">{panelName}</p>
              <p className="mt-1 text-xs text-[#9eb0c2]">Primary model loaded in the coordination workspace.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#b7c4d1]">
              <InfoCell label="Format" value={format.toUpperCase()} />
              <InfoCell label="Measures" value={measureSegments.length.toString()} />
              <InfoCell label="Units" value={measureUnitSystem === "metric" ? "Meters" : "Feet / Inches"} />
              <InfoCell label="Snap" value={formatSnapModeLabel(measureSnapMode)} />
            </div>
          </div>
        </PanelSection>

        <PanelSection title="Navigation" eyebrow="Orientation">
          <p className="text-xs leading-5 text-[#b7c4d1]">Use the cube in the upper-right corner or the preset buttons in the measurement palette for orthogonal views before placing dimensions.</p>
        </PanelSection>
      </div>

      {measureMode && (
        <div className="absolute right-4 top-28 z-10 w-80 rounded-md border border-[#536273] bg-[#27313b]/95 p-4 text-sm text-[#dce6ef] shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur">
          <PanelSection title="Measurement" eyebrow="Annotate" flush>
            <p className="text-xs leading-5 text-[#b7c4d1]">Set orientation, snap discipline, and display precision before placing dimension points.</p>
          </PanelSection>

          <PanelSection title="View Presets" eyebrow="Camera" flush>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ["Front", "front"],
                ["Top", "top"],
                ["Right", "right"],
                ["Back", "back"],
                ["Bottom", "bottom"],
                ["Left", "left"],
              ] as Array<[string, CameraPreset]>).map(([label, preset]) => (
                <button
                  key={preset}
                  onClick={() => handlePresetView(preset)}
                  className="rounded-sm border border-[#526171] bg-[#1f2831] px-3 py-2 text-xs font-semibold text-[#dce6ef] transition hover:border-[#77879a] hover:bg-[#34414f]"
                >
                  {label}
                </button>
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Units" eyebrow="Display" flush>
            <div className="flex rounded-md border border-[#4f5f6f] bg-[#1f2831] p-1">
              {(["metric", "imperial"] as MeasureUnitSystem[]).map((unit) => (
                <button
                  key={unit}
                  id={unit === "metric" ? "measure-unit-system" : undefined}
                  onClick={() => setMeasureUnitSystem(unit)}
                  className={`flex-1 rounded-sm px-3 py-2 text-xs font-semibold transition ${
                    measureUnitSystem === unit
                      ? "bg-[#5b748d] text-white shadow-sm"
                      : "text-[#9eb0c2] hover:bg-[#2b3641] hover:text-white"
                  }`}
                >
                  {unit === "metric" ? "Metric (m)" : "Imperial (ft/in)"}
                </button>
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Snap Mode" eyebrow="Precision" flush>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ["Vertex", "vertex"],
                ["Edge Mid", "edge-midpoint"],
                ["Face Center", "face-center"],
                ["Surface", "surface"],
              ] as Array<[string, MeasureSnapMode]>).map(([label, mode]) => (
                <button
                  key={mode}
                  onClick={() => setMeasureSnapMode(mode)}
                  className={`rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                    measureSnapMode === mode
                      ? "border-[#7e96ac] bg-[#5b748d] text-white"
                      : "border-[#526171] bg-[#1f2831] text-[#dce6ef] hover:border-[#77879a] hover:bg-[#34414f]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Accuracy" eyebrow="Formatting" flush>
            <select
              id="measure-precision"
              value={measurePrecision}
              onChange={(event) => setMeasurePrecision(Number(event.target.value))}
              className="w-full rounded-sm border border-[#526171] bg-[#1f2831] px-3 py-2 text-sm text-[#e7eef6] outline-none transition focus:border-[#8aa0b4]"
            >
              {[0, 1, 2, 3].map((precision) => (
                <option key={precision} value={precision}>
                  {precision} decimal place{precision === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </PanelSection>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#1e2731]/82 backdrop-blur-sm">
          <div className="w-80 rounded-md border border-[#4f5f6f] bg-[#27313b] p-5 shadow-[0_22px_48px_rgba(0,0,0,0.28)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8fa2b5]">Loading Model</p>
            <p className="mt-2 text-sm text-[#e7eef6]">
              {progress < 30 ? "Downloading model package" : progress < 60 ? "Parsing IFC geometry" : "Building viewer scene"}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-sm bg-[#182029]">
              <div className="h-full rounded-sm bg-[#78a6d1] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {(viewerError || errorRef.current) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1e2731]/90 backdrop-blur-sm">
          <div className="rounded-md border border-[#7e4d4d] bg-[#3a2525] p-6 text-center shadow-[0_24px_50px_rgba(0,0,0,0.32)]">
            <p className="text-sm text-[#ffd2d2]">{viewerError ?? errorRef.current}</p>
            <button onClick={onBack} className="mt-4 rounded-sm border border-[#ad6a6a] bg-[#8f4f4f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9d5a5a]">Go Back</button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-[#465463] bg-[#26313c]/96 px-4 py-2 text-xs text-[#c8d3df] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold uppercase tracking-[0.18em] text-[#8ea1b5]">Status</span>
            <span>Orbit, pan, and cube navigation enabled</span>
            <span className="h-3 w-px bg-[#51606f]" />
            <span>Measure mode: {measureMode ? "active" : "idle"}</span>
            <span className="h-3 w-px bg-[#51606f]" />
            <span>Snap: {formatSnapModeLabel(measureSnapMode)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[#9eb0c2]">
            <span>Units: {measureUnitSystem === "metric" ? "Metric" : "Imperial"}</span>
            <span>Precision: {measurePrecision} dp</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDistance(distanceMeters: number, unitSystem: MeasureUnitSystem, precision: number): string {
  if (unitSystem === "imperial") {
    const totalInches = distanceMeters * 39.3700787402;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;
    if (feet === 0) {
      return `${inches.toFixed(precision)} in`;
    }
    return `${feet}' ${inches.toFixed(precision)}\"`;
  }

  return `${distanceMeters.toFixed(precision)} m`;
}

function resolveSnapPoint(intersection: THREE.Intersection<THREE.Object3D>, snapMode: MeasureSnapMode): THREE.Vector3 {
  const point = intersection.point.clone();
  const object = intersection.object;

  if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry) || !intersection.face) {
    return point;
  }

  const positionAttribute = object.geometry.getAttribute("position");
  if (!positionAttribute || positionAttribute.itemSize < 3) {
    return point;
  }

  const faceVertices = [intersection.face.a, intersection.face.b, intersection.face.c].map((index) => {
    const candidate = new THREE.Vector3(
      positionAttribute.getX(index),
      positionAttribute.getY(index),
      positionAttribute.getZ(index),
    );
    object.localToWorld(candidate);
    return candidate;
  });

  if (snapMode === "surface") {
    return point;
  }

  if (snapMode === "face-center") {
    return faceVertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).multiplyScalar(1 / faceVertices.length);
  }

  const candidates =
    snapMode === "edge-midpoint"
      ? [
          faceVertices[0]!.clone().add(faceVertices[1]!).multiplyScalar(0.5),
          faceVertices[1]!.clone().add(faceVertices[2]!).multiplyScalar(0.5),
          faceVertices[2]!.clone().add(faceVertices[0]!).multiplyScalar(0.5),
        ]
      : faceVertices;

  let bestPoint = point;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = candidate.distanceTo(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

function formatSnapModeLabel(snapMode: MeasureSnapMode): string {
  switch (snapMode) {
    case "vertex":
      return "vertex";
    case "edge-midpoint":
      return "edge midpoint";
    case "face-center":
      return "face center";
    case "surface":
      return "surface";
    default:
      return "snap";
  }
}

function disposeObject3D(object: THREE.Object3D): void {
  if (object instanceof THREE.Mesh) {
    object.geometry.dispose();
    disposeMaterial(object.material);
  }

  if (object instanceof THREE.Line) {
    object.geometry.dispose();
    disposeMaterial(object.material);
  }

  if (object instanceof THREE.Sprite) {
    disposeMaterial(object.material);
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

function ToolButton({
  label, onClick, active, compact,
}: {
  label: string; onClick: () => void; active?: boolean; compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`rounded-sm border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition active:scale-95 ${
        compact ? "min-w-[5.25rem]" : ""
      } ${
        active
          ? "border-[#89a0b7] bg-[#6f88a0] text-white"
          : "border-[#556473] bg-[#1f2831] text-[#d8e2ec] hover:border-[#76879a] hover:bg-[#33414e]"
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-r border-[#475462] pr-3 last:border-r-0 last:pr-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8ea1b5]">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function PanelSection({ title, eyebrow, children, flush }: { title: string; eyebrow: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className={`${flush ? "" : "border-t border-[#41505f]"} px-4 py-3 first:border-t-0`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ea1b5]">{eyebrow}</p>
      <h3 className="mt-1 text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#455362] bg-[#1f2831] px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ea1b5]">{label}</p>
      <p className="mt-1 truncate text-[11px] text-[#e7eef6]">{value}</p>
    </div>
  );
}

function StatusChip({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-sm border px-2.5 py-1 ${
      active ? "border-[#7a90a5] bg-[#26323d] text-white" : "border-[#4f5f6f] bg-[#1f2831] text-[#b8c7d6]"
    }`}>
      <span className="font-semibold uppercase tracking-[0.18em] text-[#8ea1b5]">{label}</span>
      <span>{value}</span>
    </div>
  );
}