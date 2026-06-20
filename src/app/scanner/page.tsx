"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function ScannerPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [mode, setMode] = useState<"camera" | "file" | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setCameraActive(false);
  }, []);

  const scanImageData = useCallback(
    async (imageData: ImageData) => {
      const jsQR = (await import("jsqr")).default;
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && scanning) {
        setScanning(false);
        setDecodedText(code.data);
        setLookingUp(true);

        try {
          const res = await fetch(`/api/qr/lookup?code=${encodeURIComponent(code.data)}`);
          const data = await res.json();

          if (data.error) {
            setLookupError(data.error);
            setLookingUp(false);
            // Resume scanning after 2s
            setTimeout(() => {
              setScanning(true);
              setDecodedText(null);
              setLookupError(null);
            }, 3000);
          } else {
            // Redirect to panel
            stopCamera();
            router.push(`/panels/${data.id}`);
          }
        } catch {
          setLookupError("Network error looking up QR code");
          setLookingUp(false);
          setTimeout(() => {
            setScanning(true);
            setDecodedText(null);
            setLookupError(null);
          }, 3000);
        }
      }
    },
    [scanning, stopCamera, router],
  );

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use a lower resolution for performance
    const scanWidth = 320;
    const scale = scanWidth / video.videoWidth;
    const scanHeight = Math.floor(video.videoHeight * scale);

    canvas.width = scanWidth;
    canvas.height = scanHeight;
    ctx.drawImage(video, 0, 0, scanWidth, scanHeight);

    const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
    scanImageData(imageData);

    if (scanning) {
      animationRef.current = requestAnimationFrame(processFrame);
    }
  }, [scanning, scanImageData]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setMode("camera");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user", // front camera for laptop
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
          animationRef.current = requestAnimationFrame(processFrame);
        };
      }
    } catch (err) {
      const msg = (err as Error).message || "Unknown error";
      if (msg.includes("Permission") || msg.includes("denied")) {
        setCameraError("Camera access denied. Please allow camera access in your browser settings, or use the Upload Image option below.");
      } else if (msg.includes("NotFound") || msg.includes("NotReadable")) {
        setCameraError("No camera detected. Please use the Upload Image option below.");
      } else {
        setCameraError(`Camera error: ${msg}. Try the Upload Image option below.`);
      }
    }
  }, [processFrame]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setMode("file");
      setScanning(false);
      setDecodedText(null);
      setLookupError(null);

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        const jsQR = (await import("jsqr")).default;
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (!code) {
          setLookupError("No QR code found in the image. Try a clearer photo.");
          setTimeout(() => {
            if (fileInputRef.current) fileInputRef.current.value = "";
          }, 2000);
          return;
        }

        setDecodedText(code.data);
        setLookingUp(true);

        const res = await fetch(`/api/qr/lookup?code=${encodeURIComponent(code.data)}`);
        const data = await res.json();

        if (data.error) {
          setLookupError(data.error);
          setLookingUp(false);
        } else {
          router.push(`/panels/${data.id}`);
        }
      };

      img.src = url;
    },
    [router],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-6">
        {/* Camera Viewfinder */}
        {mode === null && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12">
            <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900">Scan QR Code</h2>
            <p className="text-center text-sm text-gray-500">
              Use your camera to scan a panel QR code, or upload a QR code image.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={startCamera}
                className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98]"
              >
                Open Camera
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Upload Image
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        )}

        {/* Camera Active */}
        {mode === "camera" && (
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-lg">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-auto w-full"
            />

            {/* Viewfinder overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-48 rounded-xl border-2 border-white/60" />
            </div>

            {/* Controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/60 to-transparent p-4">
              <button
                onClick={() => { stopCamera(); setMode(null); }}
                className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/30"
              >
                Stop Camera
              </button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {/* Status Messages */}
        {scanning && mode === "camera" && (
          <p className="mt-3 text-center text-sm text-gray-500">
            Hold a QR code steady in the viewfinder...
          </p>
        )}

        {cameraError && (
          <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">{cameraError}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-lg border border-yellow-300 px-4 py-2 text-xs font-medium text-yellow-700 transition hover:bg-yellow-100"
            >
              Upload QR Code Image Instead
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        )}

        {decodedText && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Decoded: <span className="font-mono">{decodedText}</span>
          </div>
        )}

        {lookupError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {lookupError}
          </div>
        )}

        {lookingUp && (
          <div className="mt-4 rounded-xl bg-blue-50 p-4 text-center text-sm text-blue-700">
            Looking up panel...
          </div>
        )}

        {mode === "file" && !decodedText && !lookupError && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Processing image...
          </div>
        )}
      </main>
    </div>
  );
}