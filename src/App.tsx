import { jsPDF } from "jspdf";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Crop,
  Eraser,
  Pencil,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEditorStore, type ScreenshotAsset } from "./store/editorStore";

type ToastItem = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const APP_TITLE = "Screenshot Clip — Crop, Edit and Save";

const ACCEPTED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/jpg"];

function formatBytes(bytes: number): string {
  if (!bytes || Number.isNaN(bytes)) {
    return "Unknown size";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function getDefaultFilename(): string {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `Screenshot-Clip-${parts.join("-")}`;
}

async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = dataUrl;
  await img.decode();
  return img;
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "png";
  }
}

function loadFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] space-y-2">
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          className={`glass-panel min-w-64 border px-4 py-2 text-sm font-medium text-zinc-200 ${
            toast.type === "error"
              ? "border-rose-500/40"
              : toast.type === "success"
                ? "border-emerald-500/40"
                : "border-cyan-500/30"
          }`}
        >
          {toast.message}
        </motion.div>
      ))}
    </div>
  );
}

function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="welcome-bg relative min-h-screen overflow-hidden text-zinc-200">
      <div className="welcome-grid absolute inset-0" />
      <motion.div
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
      >
        <motion.h1
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="chrome-title max-w-6xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
        >
          Screenshot Clip — Crop, Edit and Save
        </motion.h1>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.2 }}
          className="mt-6 text-lg font-bold italic text-zinc-300 sm:text-xl"
        >
          Capture a screenshot, paste it, perfect it, and save it instantly.
        </motion.p>
        <motion.button
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.3 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate("/dashboard")}
          className="mt-9 rounded-xl border border-cyan-400/40 bg-black/40 px-8 py-3 text-lg font-semibold text-zinc-100 shadow-[0_0_30px_rgba(34,211,238,0.22)] transition-all duration-300 hover:border-violet-400/50 hover:shadow-[0_0_40px_rgba(167,139,250,0.3)]"
        >
          Get Started
        </motion.button>
      </motion.div>
    </div>
  );
}

function DashboardPage({
  addToast,
}: {
  addToast: (message: string, type?: ToastItem["type"]) => void;
}) {
  const navigate = useNavigate();
  const [dropActive, setDropActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const screenshot = useEditorStore((s) => s.screenshot);
  const setScreenshot = useEditorStore((s) => s.setScreenshot);
  const clearScreenshot = useEditorStore((s) => s.clearScreenshot);
  const unsavedChanges = useEditorStore((s) => s.unsavedChanges);

  const prepareScreenshotFromFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_IMAGE_MIMES.includes(file.type)) {
        addToast("Unsupported file. Use PNG, JPG, JPEG, or WEBP.", "error");
        return;
      }

      try {
        const dataUrl = await loadFileAsDataUrl(file);
        const img = await dataUrlToImage(dataUrl);
        const nextAsset: ScreenshotAsset = {
          id: crypto.randomUUID(),
          dataUrl,
          mimeType: file.type,
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: file.size,
          name: file.name || `${getDefaultFilename()}.${extensionFromMime(file.type)}`,
        };
        setScreenshot(nextAsset);
        addToast("Screenshot pasted successfully.", "success");
      } catch {
        addToast("Unable to access the screenshot. Please try Ctrl + V again.", "error");
      }
    },
    [addToast, setScreenshot]
  );

  const handlePasteEvent = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items?.length) {
        return;
      }
      const fileItem = Array.from(items).find(
        (item) => item.kind === "file" && ACCEPTED_IMAGE_MIMES.includes(item.type)
      );

      if (!fileItem) {
        addToast("No screenshot image was found in your clipboard.", "error");
        return;
      }

      const file = fileItem.getAsFile();
      if (!file) {
        addToast("Unable to access the screenshot. Please try Ctrl + V again.", "error");
        return;
      }

      await prepareScreenshotFromFile(file);
    },
    [addToast, prepareScreenshotFromFile]
  );

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        await prepareScreenshotFromFile(file);
      }
      event.target.value = "";
    },
    [prepareScreenshotFromFile]
  );

  useEffect(() => {
    const listener = (event: ClipboardEvent) => {
      void handlePasteEvent(event);
    };
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, [handlePasteEvent]);

  useEffect(() => {
    const handleGlobalClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setDropActive(false);
      }
    };
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", handleGlobalClose);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", handleGlobalClose);
    };
  }, []);

  const handleManualPaste = async () => {
    setContextMenu(null);
    const clipboardReader = navigator.clipboard as Clipboard & {
      read?: () => Promise<ClipboardItem[]>;
    };

    if (!clipboardReader.read) {
      addToast("Browser clipboard access is restricted. Please press Ctrl + V to paste your screenshot.", "info");
      return;
    }

    try {
      const items = await clipboardReader.read();
      for (const item of items) {
        const type = item.types.find((candidate) => ACCEPTED_IMAGE_MIMES.includes(candidate));
        if (!type) {
          continue;
        }
        const blob = await item.getType(type);
        const file = new File([blob], `${getDefaultFilename()}.${extensionFromMime(type)}`, {
          type,
        });
        await prepareScreenshotFromFile(file);
        return;
      }
      addToast("No screenshot image was found in your clipboard.", "error");
    } catch {
      addToast("Clipboard permission was not granted. Press Ctrl + V to paste instead.", "info");
    }
  };

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  const replaceScreenshot = () => {
    if (unsavedChanges && !window.confirm("Replace screenshot and discard current edits?")) {
      return;
    }
    clearScreenshot();
  };

  return (
    <div className="app-surface min-h-screen px-4 py-5 text-zinc-100 sm:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/70 bg-black/40 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-400/60"
          >
            <ArrowLeft size={16} /> Back
          </button>
          {screenshot ? (
            <button
              onClick={replaceScreenshot}
              className="rounded-lg border border-zinc-700/70 bg-black/40 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-violet-400/60"
            >
              New Screenshot
            </button>
          ) : null}
        </div>

        {!screenshot ? (
          <div className="relative mt-10 flex min-h-[70vh] items-center justify-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              hidden
              onChange={handleFileSelection}
            />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDropActive(true);
              }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDropActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void prepareScreenshotFromFile(file);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY });
              }}
              className={`glass-panel relative flex h-[56vh] w-full max-w-4xl cursor-pointer flex-col items-center justify-center rounded-3xl border p-8 text-center transition-all ${
                dropActive
                  ? "border-cyan-400/70 shadow-[0_0_40px_rgba(34,211,238,0.23)]"
                  : "border-zinc-500/40"
              }`}
            >
              <h2 className="chrome-title text-5xl font-semibold tracking-tight">Ctrl + V</h2>
              <p className="mt-4 text-xl font-semibold text-zinc-200">Paste your screenshot</p>
              <p className="mt-1 text-sm text-zinc-400">or drag, drop, or click to upload</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="action-button"
                >
                  Choose Screenshot
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleManualPaste();
                  }}
                  className="action-button-secondary"
                >
                  Paste from Clipboard
                </button>
              </div>
              {dropActive ? (
                <div className="mt-6 rounded-lg border border-cyan-400/60 bg-black/50 px-4 py-2 text-sm font-semibold text-cyan-200">
                  Drop Screenshot Here
                </div>
              ) : null}
            </div>

            {contextMenu ? (
              <div
                style={{ left: contextMenu.x, top: contextMenu.y } as CSSProperties}
                className="glass-panel fixed z-50 min-w-44 rounded-xl border border-zinc-600/60 p-1"
              >
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-100 hover:bg-cyan-500/15"
                  onClick={() => void handleManualPaste()}
                >
                  Paste Screenshot
                </button>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700/40"
                  onClick={() => setContextMenu(null)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="glass-panel rounded-2xl border border-zinc-600/40 p-4">
              <h2 className="text-2xl font-semibold text-zinc-100">Screenshot Preview</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-700/60 bg-black/35 p-2">
                <img
                  src={screenshot.dataUrl}
                  alt="Screenshot preview"
                  className="max-h-[60vh] w-full rounded object-contain"
                  style={{ imageRendering: dpr > 1 ? "auto" : "crisp-edges" }}
                />
              </div>
            </div>
            <aside className="glass-panel rounded-2xl border border-zinc-600/40 p-4">
              <p className="text-sm text-zinc-300">Original dimensions</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {screenshot.width} x {screenshot.height}
              </p>
              <p className="mt-4 text-sm text-zinc-300">Format</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {screenshot.mimeType.replace("image/", "").toUpperCase()}
              </p>
              <p className="mt-4 text-sm text-zinc-300">Approximate size</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{formatBytes(screenshot.size)}</p>
              <p className="mt-4 text-sm text-zinc-300">Preview resolution</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">Scaled for viewport</p>
              <div className="mt-8 flex gap-2">
                <button
                  onClick={replaceScreenshot}
                  className="rounded-lg border border-zinc-700/70 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
                >
                  Replace Screenshot
                </button>
                <button
                  onClick={() => navigate("/editor")}
                  className="rounded-lg border border-cyan-400/60 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25"
                >
                  Go to Editor
                </button>
              </div>
              <p className="mt-6 text-xs text-zinc-500">Editing runs locally in your browser. No upload.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function clampCrop(rect: CropRect, width: number, height: number): CropRect {
  const x = Math.max(0, Math.min(rect.x, width - 1));
  const y = Math.max(0, Math.min(rect.y, height - 1));
  const maxWidth = width - x;
  const maxHeight = height - y;
  return {
    x,
    y,
    width: Math.max(1, Math.min(rect.width, maxWidth)),
    height: Math.max(1, Math.min(rect.height, maxHeight)),
  };
}

function EditorPage({
  addToast,
}: {
  addToast: (message: string, type?: ToastItem["type"]) => void;
}) {
  const navigate = useNavigate();
  const screenshot = useEditorStore((s) => s.screenshot);
  const baseDataUrl = useEditorStore((s) => s.baseDataUrl);
  const annotationDataUrl = useEditorStore((s) => s.annotationDataUrl);
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot);
  const undoStore = useEditorStore((s) => s.undo);
  const redoStore = useEditorStore((s) => s.redo);
  const unsavedChanges = useEditorStore((s) => s.unsavedChanges);
  const markSaved = useEditorStore((s) => s.markSaved);
  const clearScreenshot = useEditorStore((s) => s.clearScreenshot);
  const setUnsavedChanges = useEditorStore((s) => s.setUnsavedChanges);
  const setScreenshot = useEditorStore((s) => s.setScreenshot);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activePanel, setActivePanel] = useState<"crop" | "edit" | "save">("crop");
  const [activeTool, setActiveTool] = useState<"marker" | "eraser">("marker");
  const [markerColor, setMarkerColor] = useState("#ff2f6f");
  const [markerSize, setMarkerSize] = useState(8);
  const [markerOpacity, setMarkerOpacity] = useState(0.9);
  const [eraserSize, setEraserSize] = useState(28);
  const [drawing, setDrawing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [dragMode, setDragMode] = useState<
    | "idle"
    | "new"
    | "move"
    | "resize-n"
    | "resize-s"
    | "resize-e"
    | "resize-w"
    | "resize-nw"
    | "resize-ne"
    | "resize-sw"
    | "resize-se"
  >("idle");
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropRatio, setCropRatio] = useState("free");
  const [filename, setFilename] = useState(getDefaultFilename());
  const [format, setFormat] = useState<"png" | "jpg" | "webp" | "pdf">("png");
  const [quality, setQuality] = useState(95);
  const [preserveOriginal, setPreserveOriginal] = useState(true);
  const [outputWidth, setOutputWidth] = useState(1);
  const [outputHeight, setOutputHeight] = useState(1);
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);
  const [savePreviewUrl, setSavePreviewUrl] = useState("");

  const currentBaseDataUrl = baseDataUrl ?? screenshot?.dataUrl ?? null;

  const loadCanvases = useCallback(async () => {
    if (!currentBaseDataUrl || !baseCanvasRef.current || !annotationCanvasRef.current) {
      return;
    }
    const baseImage = await dataUrlToImage(currentBaseDataUrl);
    const baseCanvas = baseCanvasRef.current;
    const annotationCanvas = annotationCanvasRef.current;
    baseCanvas.width = baseImage.naturalWidth;
    baseCanvas.height = baseImage.naturalHeight;
    annotationCanvas.width = baseImage.naturalWidth;
    annotationCanvas.height = baseImage.naturalHeight;
    setImageSize({ width: baseImage.naturalWidth, height: baseImage.naturalHeight });
    setOutputWidth(baseImage.naturalWidth);
    setOutputHeight(baseImage.naturalHeight);
    const ctx = baseCanvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    ctx.drawImage(baseImage, 0, 0);
    const annCtx = annotationCanvas.getContext("2d");
    if (!annCtx) {
      return;
    }
    annCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    if (annotationDataUrl) {
      const annotationImage = await dataUrlToImage(annotationDataUrl);
      annCtx.drawImage(annotationImage, 0, 0);
    }
    setCropRect({ x: 0, y: 0, width: baseCanvas.width, height: baseCanvas.height });
  }, [annotationDataUrl, currentBaseDataUrl]);

  useEffect(() => {
    void loadCanvases();
  }, [loadCanvases]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (redoStore()) {
            addToast("Changes redone.", "info");
          }
        } else if (undoStore()) {
          addToast("Changes undone.", "info");
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (redoStore()) {
          addToast("Changes redone.", "info");
        }
      }
      if (event.code === "Space") {
        event.preventDefault();
        setSpaceDown(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [addToast, redoStore, undoStore]);

  useEffect(() => {
    if (!preserveOriginal) {
      return;
    }
    setOutputWidth(imageSize.width);
    setOutputHeight(imageSize.height);
  }, [imageSize.height, imageSize.width, preserveOriginal]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsavedChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [unsavedChanges]);

  useEffect(() => {
    if (activePanel !== "save") {
      return;
    }
    const next = composeCurrentCanvas();
    if (!next) {
      return;
    }
    setSavePreviewUrl(next.toDataURL("image/png"));
  }, [activePanel, baseDataUrl, annotationDataUrl]);

  if (!screenshot || !currentBaseDataUrl) {
    return <Navigate to="/dashboard" replace />;
  }

  const getCanvasPosition = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (cropMode || activePanel !== "edit") {
      return;
    }
    if (spaceDown) {
      setPanning(true);
      setDragStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
      return;
    }
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) {
      return;
    }
    const point = getCanvasPosition(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    if (activeTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = eraserSize;
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = markerSize;
      ctx.strokeStyle = markerColor;
      ctx.globalAlpha = markerOpacity;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setDrawing(true);
  };

  const drawMove = (event: ReactMouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (panning) {
      setPan({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
      return;
    }
    if (!drawing) {
      return;
    }
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) {
      return;
    }
    const point = getCanvasPosition(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    if (panning) {
      setPanning(false);
      return;
    }
    if (!drawing || !annotationCanvasRef.current || !baseCanvasRef.current) {
      return;
    }
    setDrawing(false);
    const annotation = annotationCanvasRef.current.toDataURL("image/png");
    const base = baseCanvasRef.current.toDataURL("image/png");
    pushSnapshot({ baseDataUrl: base, annotationDataUrl: annotation });
    addToast(activeTool === "eraser" ? "Eraser applied." : "Marker applied.", "success");
  };

  const zoomOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

  const setZoomByStep = (direction: 1 | -1) => {
    const idx = zoomOptions.findIndex((value) => value >= zoom);
    const next = direction > 0 ? Math.min(zoomOptions.length - 1, idx + 1) : Math.max(0, idx - 1);
    setZoom(zoomOptions[next]);
  };

  const fitToScreen = () => {
    const host = workspaceRef.current;
    if (!host) {
      return;
    }
    const maxWidth = host.clientWidth - 40;
    const maxHeight = host.clientHeight - 40;
    const fit = Math.min(maxWidth / imageSize.width, maxHeight / imageSize.height, 1);
    setZoom(fit);
    setPan({ x: 0, y: 0 });
  };

  const composeCurrentCanvas = (): HTMLCanvasElement | null => {
    if (!baseCanvasRef.current || !annotationCanvasRef.current) {
      return null;
    }
    const output = document.createElement("canvas");
    output.width = baseCanvasRef.current.width;
    output.height = baseCanvasRef.current.height;
    const ctx = output.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(baseCanvasRef.current, 0, 0);
    ctx.drawImage(annotationCanvasRef.current, 0, 0);
    return output;
  };

  const cropMouseDown = (event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!cropMode || !cropRect) {
      return;
    }
    const host = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - host.left) / host.width) * imageSize.width;
    const y = ((event.clientY - host.top) / host.height) * imageSize.height;

    const handleSize = 16 / zoom;
    const near = {
      nw: Math.abs(x - cropRect.x) < handleSize && Math.abs(y - cropRect.y) < handleSize,
      ne:
        Math.abs(x - (cropRect.x + cropRect.width)) < handleSize &&
        Math.abs(y - cropRect.y) < handleSize,
      sw:
        Math.abs(x - cropRect.x) < handleSize &&
        Math.abs(y - (cropRect.y + cropRect.height)) < handleSize,
      se:
        Math.abs(x - (cropRect.x + cropRect.width)) < handleSize &&
        Math.abs(y - (cropRect.y + cropRect.height)) < handleSize,
      n:
        Math.abs(x - (cropRect.x + cropRect.width / 2)) < handleSize &&
        Math.abs(y - cropRect.y) < handleSize,
      s:
        Math.abs(x - (cropRect.x + cropRect.width / 2)) < handleSize &&
        Math.abs(y - (cropRect.y + cropRect.height)) < handleSize,
      w:
        Math.abs(x - cropRect.x) < handleSize &&
        Math.abs(y - (cropRect.y + cropRect.height / 2)) < handleSize,
      e:
        Math.abs(x - (cropRect.x + cropRect.width)) < handleSize &&
        Math.abs(y - (cropRect.y + cropRect.height / 2)) < handleSize,
    };

    if (near.nw) {
      setDragMode("resize-nw");
    } else if (near.ne) {
      setDragMode("resize-ne");
    } else if (near.sw) {
      setDragMode("resize-sw");
    } else if (near.se) {
      setDragMode("resize-se");
    } else if (near.n) {
      setDragMode("resize-n");
    } else if (near.s) {
      setDragMode("resize-s");
    } else if (near.w) {
      setDragMode("resize-w");
    } else if (near.e) {
      setDragMode("resize-e");
    } else if (
      x > cropRect.x &&
      x < cropRect.x + cropRect.width &&
      y > cropRect.y &&
      y < cropRect.y + cropRect.height
    ) {
      setDragMode("move");
    } else {
      setDragMode("new");
      setCropRect({ x, y, width: 1, height: 1 });
    }
    setDragStart({ x, y });
  };

  const cropMouseMove = (event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!cropMode || dragMode === "idle" || !cropRect) {
      return;
    }
    const host = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - host.left) / host.width) * imageSize.width;
    const y = ((event.clientY - host.top) / host.height) * imageSize.height;
    const deltaX = x - dragStart.x;
    const deltaY = y - dragStart.y;
    let nextRect = { ...cropRect };

    if (dragMode === "move") {
      nextRect.x += deltaX;
      nextRect.y += deltaY;
    }
    if (dragMode === "new") {
      nextRect.width = Math.abs(deltaX);
      nextRect.height = Math.abs(deltaY);
      nextRect.x = deltaX >= 0 ? dragStart.x : x;
      nextRect.y = deltaY >= 0 ? dragStart.y : y;
    }
    if (dragMode === "resize-nw") {
      nextRect.x += deltaX;
      nextRect.y += deltaY;
      nextRect.width -= deltaX;
      nextRect.height -= deltaY;
    }
    if (dragMode === "resize-n") {
      nextRect.y += deltaY;
      nextRect.height -= deltaY;
    }
    if (dragMode === "resize-ne") {
      nextRect.y += deltaY;
      nextRect.width += deltaX;
      nextRect.height -= deltaY;
    }
    if (dragMode === "resize-e") {
      nextRect.width += deltaX;
    }
    if (dragMode === "resize-sw") {
      nextRect.x += deltaX;
      nextRect.width -= deltaX;
      nextRect.height += deltaY;
    }
    if (dragMode === "resize-w") {
      nextRect.x += deltaX;
      nextRect.width -= deltaX;
    }
    if (dragMode === "resize-s") {
      nextRect.height += deltaY;
    }
    if (dragMode === "resize-se") {
      nextRect.width += deltaX;
      nextRect.height += deltaY;
    }

    if (cropRatio !== "free") {
      const ratioMap: Record<string, number> = {
        original: imageSize.width / imageSize.height,
        "1:1": 1,
        "4:3": 4 / 3,
        "3:2": 3 / 2,
        "16:9": 16 / 9,
        "9:16": 9 / 16,
      };
      const ratio = ratioMap[cropRatio] ?? 1;
      nextRect.height = nextRect.width / ratio;
    }

    nextRect = clampCrop(nextRect, imageSize.width, imageSize.height);
    setDragStart({ x, y });
    setCropRect(nextRect);
  };

  const cropMouseUp = () => setDragMode("idle");

  const applyCrop = () => {
    if (!cropRect || !baseCanvasRef.current || !annotationCanvasRef.current) {
      return;
    }
    const rect = clampCrop(cropRect, baseCanvasRef.current.width, baseCanvasRef.current.height);
    const croppedBase = document.createElement("canvas");
    croppedBase.width = Math.round(rect.width);
    croppedBase.height = Math.round(rect.height);
    const baseCtx = croppedBase.getContext("2d");
    if (!baseCtx) {
      return;
    }
    baseCtx.drawImage(
      baseCanvasRef.current,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height
    );
    const croppedAnnotation = document.createElement("canvas");
    croppedAnnotation.width = Math.round(rect.width);
    croppedAnnotation.height = Math.round(rect.height);
    const annCtx = croppedAnnotation.getContext("2d");
    if (!annCtx) {
      return;
    }
    annCtx.drawImage(
      annotationCanvasRef.current,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height
    );
    const baseOut = croppedBase.toDataURL("image/png");
    const annOut = croppedAnnotation.toDataURL("image/png");
    pushSnapshot({ baseDataUrl: baseOut, annotationDataUrl: annOut });
    setCropRect({ x: 0, y: 0, width: croppedBase.width, height: croppedBase.height });
    setCropMode(false);
    addToast("Screenshot cropped successfully.", "success");
  };

  const resetCrop = () => {
    setCropRect({ x: 0, y: 0, width: imageSize.width, height: imageSize.height });
  };

  const clearAnnotations = () => {
    if (!annotationCanvasRef.current || !baseCanvasRef.current) {
      return;
    }
    const ctx = annotationCanvasRef.current.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, annotationCanvasRef.current.width, annotationCanvasRef.current.height);
    pushSnapshot({
      baseDataUrl: baseCanvasRef.current.toDataURL("image/png"),
      annotationDataUrl: annotationCanvasRef.current.toDataURL("image/png"),
    });
    addToast("Annotations cleared.", "info");
  };

  const resetEditor = () => {
    if (!window.confirm("Reset all edits and return to original screenshot?")) {
      return;
    }
    useEditorStore.getState().setScreenshot(screenshot);
    addToast("Editor reset to original screenshot.", "info");
  };

  const handleImportScreenshot = useCallback(
    async (file: File) => {
      if (!ACCEPTED_IMAGE_MIMES.includes(file.type)) {
        addToast("Unsupported file. Use PNG, JPG, JPEG, or WEBP.", "error");
        return;
      }

      try {
        const dataUrl = await loadFileAsDataUrl(file);
        const image = await dataUrlToImage(dataUrl);
        const nextAsset: ScreenshotAsset = {
          id: crypto.randomUUID(),
          dataUrl,
          mimeType: file.type,
          width: image.naturalWidth,
          height: image.naturalHeight,
          size: file.size,
          name: file.name || `${getDefaultFilename()}.${extensionFromMime(file.type)}`,
        };
        setScreenshot(nextAsset);
        addToast("Screenshot replaced successfully.", "success");
      } catch {
        addToast("Unable to load the selected screenshot.", "error");
      }
    },
    [addToast, setScreenshot]
  );

  const onFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        await handleImportScreenshot(file);
      }
      event.target.value = "";
    },
    [handleImportScreenshot]
  );

  const saveOutput = async (): Promise<boolean> => {
    const composite = composeCurrentCanvas();
    if (!composite) {
      addToast("Unable to save the file. Please try again.", "error");
      return false;
    }

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = preserveOriginal ? composite.width : Math.max(1, Math.floor(outputWidth));
    finalCanvas.height = preserveOriginal ? composite.height : Math.max(1, Math.floor(outputHeight));
    const ctx = finalCanvas.getContext("2d");
    if (!ctx) {
      addToast("Unable to save the file. Please try again.", "error");
      return false;
    }
    ctx.drawImage(composite, 0, 0, finalCanvas.width, finalCanvas.height);

    let blob: Blob | null = null;
    let mimeType = "image/png";
    try {
      if (format === "pdf") {
        const orientation = finalCanvas.width >= finalCanvas.height ? "landscape" : "portrait";
        const pdf = new jsPDF({
          orientation,
          unit: "pt",
          format: [finalCanvas.width, finalCanvas.height],
        });
        const imageData = finalCanvas.toDataURL("image/png");
        pdf.addImage(imageData, "PNG", 0, 0, finalCanvas.width, finalCanvas.height);
        blob = pdf.output("blob");
        mimeType = "application/pdf";
      } else {
        mimeType = format === "jpg" ? "image/jpeg" : `image/${format}`;
        blob = await new Promise((resolve) =>
          finalCanvas.toBlob(resolve, mimeType, format === "png" ? 1 : quality / 100)
        );
      }
      if (!blob) {
        throw new Error("missing-blob");
      }

      const extension = extensionFromMime(mimeType);
      const fullName = `${filename || getDefaultFilename()}.${extension}`;

      const savePicker = window as Window & {
        showSaveFilePicker?: (options: {
          suggestedName: string;
          types: Array<{ description: string; accept: Record<string, string[]> }>;
        }) => Promise<{
          createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
        }>;
      };

      if (savePicker.showSaveFilePicker) {
        try {
          const handle = await savePicker.showSaveFilePicker({
            suggestedName: fullName,
            types: [
              {
                description: format === "pdf" ? "PDF Document" : "Image File",
                accept: { [mimeType]: [`.${extension}`] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          markSaved();
          addToast("Screenshot saved successfully.", "success");
          return true;
        } catch (error) {
          const asDom = error as DOMException;
          if (asDom?.name === "AbortError") {
            return false;
          }
          throw error;
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fullName;
      link.click();
      URL.revokeObjectURL(url);
      markSaved();
      addToast("Screenshot saved successfully.", "success");
      return true;
    } catch {
      addToast("Unable to save the file. Please try again.", "error");
      return false;
    }
  };

  const promptBack = () => {
    if (unsavedChanges) {
      setConfirmBackOpen(true);
      return;
    }
    navigate("/dashboard");
  };

  const renderedWidth = Math.max(300, imageSize.width * zoom);
  const renderedHeight = Math.max(200, imageSize.height * zoom);

  return (
    <div className="app-surface min-h-screen text-zinc-100">
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800/90 px-4 py-3">
          <button
            onClick={promptBack}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/70 bg-black/35 px-3 py-2 text-sm hover:border-cyan-400/60"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="chrome-title text-lg font-semibold">{screenshot.name || APP_TITLE}</h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              hidden
              onChange={onFileSelected}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="icon-button text-xs"
              title="Open another screenshot"
            >
              Open Image
            </button>
            <button
              onClick={() => {
                if (!unsavedChanges || window.confirm("Start a new screenshot and discard current edits?")) {
                  clearScreenshot();
                  navigate("/dashboard");
                }
              }}
              className="icon-button text-xs"
              title="New Screenshot"
            >
              New Screenshot
            </button>
            <button
              onClick={() => {
                if (undoStore()) {
                  addToast("Changes undone.", "info");
                }
              }}
              className="icon-button"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={15} />
            </button>
            <button
              onClick={() => {
                if (redoStore()) {
                  addToast("Changes redone.", "info");
                }
              }}
              className="icon-button"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={15} />
            </button>
            <button onClick={() => setZoomByStep(-1)} className="icon-button" title="Zoom Out">
              <ZoomOut size={15} />
            </button>
            <button onClick={() => setZoomByStep(1)} className="icon-button" title="Zoom In">
              <ZoomIn size={15} />
            </button>
            <button onClick={fitToScreen} className="icon-button text-xs" title="Fit to Screen">
              Fit
            </button>
            <button onClick={() => setZoom(1)} className="icon-button text-xs" title="100%">
              100%
            </button>
            <button
              onClick={() => workspaceRef.current?.requestFullscreen()}
              className="icon-button text-xs"
              title="Fullscreen"
            >
              Full
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[15rem_1fr]">
          <aside className="border-b border-zinc-800/90 p-3 lg:border-r lg:border-b-0">
            <div className="hidden grid-cols-1 gap-2 lg:grid">
              <button
                onClick={() => {
                  setActivePanel("crop");
                  setCropMode(true);
                }}
                className={`sidebar-button ${activePanel === "crop" ? "sidebar-active" : ""}`}
              >
                <Crop size={18} /> Crop
              </button>
              <button
                onClick={() => {
                  setActivePanel("edit");
                  setCropMode(false);
                }}
                className={`sidebar-button ${activePanel === "edit" ? "sidebar-active" : ""}`}
              >
                <Pencil size={18} /> Edit
              </button>
              <button
                onClick={() => {
                  setActivePanel("save");
                  setCropMode(false);
                }}
                className={`sidebar-button ${activePanel === "save" ? "sidebar-active" : ""}`}
              >
                <Save size={18} /> Save
              </button>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2 lg:hidden">
              <button
                onClick={() => {
                  setActivePanel("crop");
                  setCropMode(true);
                }}
                className={`sidebar-button !justify-center ${activePanel === "crop" ? "sidebar-active" : ""}`}
              >
                Crop
              </button>
              <button
                onClick={() => {
                  setActivePanel("edit");
                  setCropMode(false);
                }}
                className={`sidebar-button !justify-center ${activePanel === "edit" ? "sidebar-active" : ""}`}
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setActivePanel("save");
                  setCropMode(false);
                }}
                className={`sidebar-button !justify-center ${activePanel === "save" ? "sidebar-active" : ""}`}
              >
                Save
              </button>
            </div>

            {activePanel === "crop" ? (
              <div className="mt-4 space-y-3 text-sm">
                <p className="font-semibold text-zinc-200">Crop Screenshot</p>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Ratio</span>
                  <select
                    value={cropRatio}
                    onChange={(event) => setCropRatio(event.target.value)}
                    className="input-dark"
                  >
                    <option value="free">Free</option>
                    <option value="original">Original</option>
                    <option value="1:1">1:1</option>
                    <option value="4:3">4:3</option>
                    <option value="3:2">3:2</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={applyCrop} className="action-button">
                    Apply Crop
                  </button>
                  <button onClick={resetCrop} className="action-button-secondary">
                    Reset
                  </button>
                  <button onClick={() => setCropMode(false)} className="action-button-secondary">
                    Cancel
                  </button>
                </div>
                {cropRect ? (
                  <p className="text-xs text-zinc-400">
                    {Math.round(cropRect.width)} x {Math.round(cropRect.height)} px
                  </p>
                ) : null}
              </div>
            ) : null}

            {activePanel === "edit" ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTool("marker")}
                    className={`action-button-secondary ${activeTool === "marker" ? "border-cyan-400/60" : ""}`}
                  >
                    <Pencil size={14} /> Marker
                  </button>
                  <button
                    onClick={() => setActiveTool("eraser")}
                    className={`action-button-secondary ${activeTool === "eraser" ? "border-cyan-400/60" : ""}`}
                  >
                    <Eraser size={14} /> Eraser
                  </button>
                </div>
                {activeTool === "marker" ? (
                  <>
                    <label className="block text-xs text-zinc-400">Color</label>
                    <input
                      type="color"
                      value={markerColor}
                      onChange={(event) => setMarkerColor(event.target.value)}
                      className="h-10 w-full rounded-md border border-zinc-700 bg-transparent"
                    />
                    <label className="block text-xs text-zinc-400">Size: {markerSize}px</label>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={markerSize}
                      onChange={(event) => setMarkerSize(Number(event.target.value))}
                      className="w-full"
                    />
                    <label className="block text-xs text-zinc-400">Opacity: {Math.round(markerOpacity * 100)}%</label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(markerOpacity * 100)}
                      onChange={(event) => setMarkerOpacity(Number(event.target.value) / 100)}
                      className="w-full"
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-xs text-zinc-400">Eraser size: {eraserSize}px</label>
                    <input
                      type="range"
                      min={4}
                      max={80}
                      value={eraserSize}
                      onChange={(event) => setEraserSize(Number(event.target.value))}
                      className="w-full"
                    />
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={clearAnnotations} className="action-button-secondary">
                    Clear Annotations
                  </button>
                  <button onClick={resetEditor} className="action-button-secondary">
                    Reset
                  </button>
                </div>
              </div>
            ) : null}

            {activePanel === "save" ? (
              <div className="mt-4 space-y-3 text-sm">
                <p className="font-semibold text-zinc-200">Save Screenshot</p>
                {savePreviewUrl ? (
                  <div className="overflow-hidden rounded-lg border border-zinc-700/70 bg-black/25 p-1">
                    <img
                      src={savePreviewUrl}
                      alt="Final screenshot preview"
                      className="max-h-36 w-full rounded object-contain"
                    />
                  </div>
                ) : null}
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Filename</span>
                  <input
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    className="input-dark"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Format</span>
                  <select
                    value={format}
                    onChange={(event) => setFormat(event.target.value as "png" | "jpg" | "webp" | "pdf")}
                    className="input-dark"
                  >
                    <option value="png">PNG</option>
                    <option value="jpg">JPEG / JPG</option>
                    <option value="webp">WEBP</option>
                    <option value="pdf">PDF</option>
                  </select>
                </label>
                {format !== "png" && format !== "pdf" ? (
                  <label className="space-y-1">
                    <span className="text-xs text-zinc-400">
                      Quality: {quality}% (Higher quality = larger file)
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={quality}
                      onChange={(event) => setQuality(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={preserveOriginal}
                    onChange={(event) => setPreserveOriginal(event.target.checked)}
                  />
                  Preserve Original Resolution
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-zinc-400">
                    Width
                    <input
                      type="number"
                      min={1}
                      value={outputWidth}
                      disabled={preserveOriginal}
                      onChange={(event) => setOutputWidth(Number(event.target.value) || 1)}
                      className="input-dark mt-1"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Height
                    <input
                      type="number"
                      min={1}
                      value={outputHeight}
                      disabled={preserveOriginal}
                      onChange={(event) => setOutputHeight(Number(event.target.value) || 1)}
                      className="input-dark mt-1"
                    />
                  </label>
                </div>
                <div className="rounded-lg border border-zinc-700/70 bg-black/25 p-2 text-xs text-zinc-300">
                  <p>
                    Original Resolution: {imageSize.width} x {imageSize.height}
                  </p>
                  <p className="mt-1">
                    Final Resolution: {preserveOriginal ? imageSize.width : outputWidth} x{" "}
                    {preserveOriginal ? imageSize.height : outputHeight}
                  </p>
                </div>
                <button onClick={() => void saveOutput()} className="action-button w-full justify-center">
                  Save
                </button>
              </div>
            ) : null}
          </aside>

          <main className="relative min-h-0 bg-black/35">
            <div ref={workspaceRef} className="relative h-full w-full overflow-hidden">
              <div
                className="absolute left-1/2 top-1/2"
                style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }}
              >
                <div
                  className="relative"
                  style={{ width: renderedWidth, height: renderedHeight, boxShadow: "0 14px 40px rgba(0,0,0,0.45)" }}
                  onMouseDown={cropMouseDown}
                  onMouseMove={cropMouseMove}
                  onMouseUp={cropMouseUp}
                  onMouseLeave={cropMouseUp}
                >
                  <canvas
                    ref={baseCanvasRef}
                    width={imageSize.width}
                    height={imageSize.height}
                    style={{ width: renderedWidth, height: renderedHeight, display: "block" }}
                  />
                  <canvas
                    ref={annotationCanvasRef}
                    width={imageSize.width}
                    height={imageSize.height}
                    onMouseDown={startDraw}
                    onMouseMove={drawMove}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    style={{
                      width: renderedWidth,
                      height: renderedHeight,
                      position: "absolute",
                      left: 0,
                      top: 0,
                      cursor: spaceDown
                        ? "grab"
                        : cropMode
                          ? "crosshair"
                          : activeTool === "eraser"
                            ? "cell"
                            : "crosshair",
                    }}
                  />
                  {cropMode && cropRect ? (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: `radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.35) 100%)`,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: (cropRect.x / imageSize.width) * renderedWidth,
                          top: (cropRect.y / imageSize.height) * renderedHeight,
                          width: (cropRect.width / imageSize.width) * renderedWidth,
                          height: (cropRect.height / imageSize.height) * renderedHeight,
                          border: "2px solid rgba(34,211,238,0.9)",
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                        }}
                      >
                        <span className="absolute -top-6 left-0 rounded bg-black/80 px-2 py-0.5 text-[11px] text-zinc-200">
                          {Math.round(cropRect.width)} x {Math.round(cropRect.height)} px
                        </span>
                        {[
                          [0, 0],
                          [50, 0],
                          [100, 0],
                          [0, 50],
                          [100, 50],
                          [0, 100],
                          [50, 100],
                          [100, 100],
                        ].map(([left, top], idx) => (
                          <span
                            key={`${left}-${top}-${idx}`}
                            className="absolute h-3 w-3 rounded-full border border-cyan-100 bg-cyan-400"
                            style={{
                              left: `calc(${left}% - 6px)`,
                              top: `calc(${top}% - 6px)`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {confirmBackOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-zinc-600/80 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">You have unsaved changes.</h3>
            <p className="mt-2 text-sm text-zinc-300">Save your screenshot before leaving the editor.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="action-button-secondary" onClick={() => setConfirmBackOpen(false)}>
                Keep Editing
              </button>
              <button
                className="action-button-secondary"
                onClick={() => {
                  setScreenshot(screenshot);
                  setUnsavedChanges(false);
                  setConfirmBackOpen(false);
                  navigate("/dashboard");
                }}
              >
                Discard Changes
              </button>
              <button
                className="action-button"
                onClick={async () => {
                  const didSave = await saveOutput();
                  if (didSave) {
                    setConfirmBackOpen(false);
                    navigate("/dashboard");
                  }
                }}
              >
                Save First
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoutedApp() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const location = useLocation();

  const addToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2800);
  }, []);

  useEffect(() => {
    document.title = APP_TITLE;
  }, [location.pathname]);

  return (
    <>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/dashboard" element={<DashboardPage addToast={addToast} />} />
        <Route path="/editor" element={<EditorPage addToast={addToast} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastViewport toasts={toasts} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  );
}
