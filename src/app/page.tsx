"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Upload,
  X,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Download,
  FileImage,
  Info,
  MousePointer,
  Keyboard,
  Zap,
} from "lucide-react";

interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WireframeTool: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // full undo/redo history
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const [currentCanvasState, setCurrentCanvasState] =
    useState<ImageData | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("Ready to process images");
  const [processedOnce, setProcessedOnce] = useState(false);

  const updateStatus = useCallback((text: string) => {
    setStatus(text);
  }, []);

  // Calculate canvas-relative coordinates
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  // Sobel edge-detection kernel
  const edgeDetect = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const gray = new Uint8ClampedArray(width * height);

      // convert to grayscale
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
      }

      const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      const out = new Uint8ClampedArray(gray.length);

      // apply Sobel
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let gx = 0,
            gy = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const val = gray[(y + ky) * width + (x + kx)];
              const idx = (ky + 1) * 3 + (kx + 1);
              gx += val * kernelX[idx];
              gy += val * kernelY[idx];
            }
          }
          const mag = Math.hypot(gx, gy);
          out[y * width + x] = mag > 100 ? 0 : 255;
        }
      }

      // write back
      for (let i = 0; i < out.length; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = out[i];
        data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
    },
    []
  );

  // Draw current canvas state + selection overlay
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const imgd = currentCanvasState;
    if (!canvas || !imgd) return;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imgd, 0, 0);

    if (selection) {
      ctx.save();
      ctx.setLineDash([6]);
      ctx.strokeStyle = "#007bff";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(0,123,255,0.2)";
      ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
      ctx.restore();
    }
  }, [currentCanvasState, selection]);

  // Initial processing: grayscale + edge + seed undoStack
  const processImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = img.width;
    canvas.height = img.height;

    // draw original
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // grayscale
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const avg =
        (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
      imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = avg;
    }
    ctx.putImageData(imageData, 0, 0);

    // edge detect
    edgeDetect(ctx, canvas.width, canvas.height);

    // seed history
    const base = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack([base]);
    setRedoStack([]);
    setCurrentCanvasState(base);
    setProcessedOnce(true);
    updateStatus("Image processed – ready for wireframe");
  }, [img, edgeDetect, updateStatus]);

  useEffect(() => {
    if (img) processImage();
  }, [img, processImage]);

  useEffect(() => {
    if (processedOnce) draw();
  }, [draw, processedOnce]);

  // handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    updateStatus("Loading image...");
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setSelection(null);
      setUndoStack([]);
      setRedoStack([]);
      setCurrentCanvasState(null);
      setProcessedOnce(false);
      setTimeout(() => {
        setIsLoading(false);
        updateStatus("Image loaded successfully");
      }, 100);
    };
    i.onerror = () => {
      setIsLoading(false);
      updateStatus("Failed to load image");
    };
    i.src = URL.createObjectURL(file);
  };

  // selection mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!processedOnce) return;
    const canvas = canvasRef.current!;
    const pt = getCanvasCoords(e, canvas);
    setDragStart(pt);
    setSelection({ ...pt, w: 0, h: 0 });
    setIsDragging(true);
    updateStatus("Creating selection…");
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selection) return;
    const canvas = canvasRef.current!;
    const pt = getCanvasCoords(e, canvas);
    setSelection({
      x: selection.x,
      y: selection.y,
      w: pt.x - dragStart.x,
      h: pt.y - dragStart.y,
    });
  };
  const handleMouseUp = () => {
    if (!isDragging || !selection) return;
    setIsDragging(false);
    let { x, y, w, h } = selection;
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    setSelection({ x, y, w, h });
    updateStatus("Selection ready – click Replace with Crossbox");
  };

  // apply crossbox and record history
  const replaceWithCrossbox = useCallback(() => {
    if (!selection || !currentCanvasState) {
      alert("Please select an area first.");
      return;
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // draw from last state
    ctx.putImageData(currentCanvasState, 0, 0);
    const { x, y, w, h } = selection;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();

    // snapshot new state
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack((u) => [...u, snap]);
    setRedoStack([]);
    setCurrentCanvasState(snap);
    setSelection(null);
    updateStatus("Crossbox applied");
  }, [selection, currentCanvasState, updateStatus]);

  // undo one step
  const undo = useCallback(() => {
    if (undoStack.length < 2) return; // keep base
    const newUndo = [...undoStack];
    const last = newUndo.pop()!;
    setRedoStack((r) => [last, ...r]);
    const prev = newUndo[newUndo.length - 1];
    canvasRef.current!.getContext("2d")!.putImageData(prev, 0, 0);
    setUndoStack(newUndo);
    setCurrentCanvasState(prev);
    setSelection(null);
    updateStatus("Undo");
  }, [undoStack, updateStatus]);

  // redo one step
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    canvasRef.current!.getContext("2d")!.putImageData(next, 0, 0);
    setUndoStack((u) => [...u, next]);
    setRedoStack((r) => r.slice(1));
    setCurrentCanvasState(next);
    setSelection(null);
    updateStatus("Redo");
  }, [redoStack, updateStatus]);

  // download PNG
  const downloadPNG = () => {
    const canvas = canvasRef.current!;
    const link = document.createElement("a");
    link.download = "sketch-wireframe.png";
    link.href = canvas.toDataURL();
    link.click();
    updateStatus("Image downloaded");
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const ctrl = isMac ? e.metaKey : e.ctrlKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (e.key.toLowerCase() === "y" || (e.shiftKey && e.key === "Z")) {
        e.preventDefault();
        redo();
      }
      if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        replaceWithCrossbox();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo, replaceWithCrossbox]);

  const selectionText = selection
    ? `Selection: ${Math.round(selection.w)}×${Math.round(
        selection.h
      )} at (${Math.round(selection.x)}, ${Math.round(selection.y)})`
    : "No selection";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-purple-700 p-5">
      <div className="max-w-6xl mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-400 p-8 text-white text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><pattern id='grid' width='10' height='10' patternUnits='userSpaceOnUse'><path d='M 10 0 L 0 0 0 10' fill='none' stroke='white' stroke-width='0.5'/></pattern></defs><rect width='100' height='100' fill='url(%23grid)'/></svg>")`,
            }}
          />
          <div className="relative z-10">
            <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
              <Zap className="w-10 h-10" />
              UI to Sketch Wireframe
            </h1>
            <p className="text-lg opacity-90">
              Transform your UI designs into clean wireframe sketches with
              intelligent edge detection
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-50 p-6 border-b border-gray-200 flex flex-wrap items-center justify-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> Upload Image
          </button>
          <button
            onClick={replaceWithCrossbox}
            disabled={!selection}
            className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <X className="w-4 h-4" /> Replace with Crossbox
          </button>
          <button
            onClick={undo}
            disabled={undoStack.length < 2}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <UndoIcon className="w-4 h-4" /> Undo
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <RedoIcon className="w-4 h-4" /> Redo
          </button>
          <button
            onClick={downloadPNG}
            disabled={!img}
            className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download PNG
          </button>
        </div>

        {/* Canvas Area */}
        <div className="p-8 bg-white flex justify-center items-center min-h-[60vh] relative">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="block max-w-full max-h-[70vh] cursor-crosshair"
          />
          {!img && (
            <div className="absolute text-center text-gray-500 animate-pulse p-16">
              <FileImage className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Image Loaded</h3>
              <p className="text-lg">
                Upload an image to start creating wireframes
              </p>
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-3" />
              <div>Processing image...</div>
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts */}
        <div className="bg-gray-50 p-5 border-t border-gray-200">
          <h4 className="flex items-center gap-2 mb-4 font-semibold text-black">
            <Keyboard className="w-4 h-4" /> Keyboard Shortcuts
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { action: "Replace with Crossbox", key: "Ctrl+X" },
              { action: "Undo", key: "Ctrl+Z" },
              { action: "Redo", key: "Ctrl+Y / Ctrl+Shift+Z" },
            ].map(({ action, key }) => (
              <div
                key={action}
                className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-200"
              >
                <span className="text-sm text-black">{action}</span>
                <span className="bg-gray-200 text-black px-2 py-1 rounded text-xs font-mono">
                  {key}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-gray-800 text-white p-4 flex flex-col md:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span className="text-sm">{status}</span>
          </div>
          <div className="flex items-center gap-2">
            <MousePointer className="w-4 h-4" />
            <span className="text-sm">{selectionText}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WireframeTool;
