"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileImage,
  X,
  Loader2,
  Save,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Pentagon as PolygonIcon,
  Circle,
  Ruler,
  List,
  ClipboardList,
} from "lucide-react";
import { CADViewer } from "./CADViewer";
import { MarkupToolbar } from "./MarkupToolbar";
import { MarkupLegend } from "./MarkupLegend";
import { MarkupsList } from "./MarkupsList";
import { PageNavigation } from "./PageNavigation";
import { PageThumbnails } from "./PageThumbnails";
import { ProjectGrid } from "./ProjectGrid";
import { SaveStatus, SyncStatus } from "./SaveStatus";
import { CadDataPanel } from "./CadDataPanel";
import { useHistory } from "./useHistory";
import { exportToCSV, exportToExcel, exportToJSON, downloadFile } from "./exportUtils";
import { saveMarkups, loadMarkups } from "@/lib/supabase/cadMarkups";
import { BluebeamProject, updateProject } from "@/lib/supabase/bluebeamProjects";
import { uploadProjectPdf, downloadProjectPdf } from "@/lib/supabase/pdfStorage";
import {
  Point,
  Polygon,
  CountMarker,
  LinearMeasurement,
  ToolMode,
  MarkupMaterial,
  DEFAULT_MARKUP_COLOR,
  ViewTransform,
  CADMarkupData,
  MarkupSelection,
} from "./types";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Render a specific PDF page to a data URL
async function renderPdfPageToDataUrl(
  pdfDoc: any,
  pageNumber: number
): Promise<string> {
  const page = await pdfDoc.getPage(pageNumber);

  const scale = 2; // Higher scale = better quality
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // pdfjs-dist v5 requires canvas element in render parameters
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  await page.render(renderContext).promise;

  const dataUrl = canvas.toDataURL("image/png");
  console.log("[CADMarkup] PDF page", pageNumber, "converted:", viewport.width, "x", viewport.height);

  return dataUrl;
}

// Load PDF document and return it with page count
async function loadPdfDocument(file: File): Promise<{ pdfDoc: any; numPages: number }> {
  console.log("[CADMarkup] Loading PDF document...");

  // Dynamic import to avoid SSR issues with DOMMatrix
  const pdfjsLib = await import("pdfjs-dist");

  // Set worker source - using local file since CDN may not have matching version
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  console.log("[CADMarkup] PDF loaded:", pdfDoc.numPages, "pages");
  return { pdfDoc, numPages: pdfDoc.numPages };
}

interface CADMarkupStepProps {
  data?: Partial<CADMarkupData>;
  onUpdate?: (data: Partial<CADMarkupData>) => void;
  onValidationChange?: (isValid: boolean) => void;
}

interface MarkupState {
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
}

export function CADMarkupStep({ data, onUpdate, onValidationChange }: CADMarkupStepProps) {
  // State
  const [imageUrl, setImageUrl] = useState<string>(data?.imageUrl || "");
  const [imageName, setImageName] = useState<string>(data?.imageName || "");
  const [pixelsPerFoot, setPixelsPerFoot] = useState<number>(data?.pixelsPerFoot || 100);

  // History-managed markup state
  const {
    state: markupState,
    setState: setMarkupState,
    undo: historyUndo,
    redo: historyRedo,
    canUndo,
    canRedo,
    clear: clearHistory,
  } = useHistory<MarkupState>({
    initialState: {
      polygons: data?.polygons || [],
      markers: data?.markers || [],
      measurements: data?.measurements || [],
    },
  });

  // Destructure for easier access
  const { polygons, markers, measurements } = markupState;

  const [currentTool, setCurrentTool] = useState<ToolMode>("select");
  const [selectedMaterial, setSelectedMaterial] = useState<MarkupMaterial>({
    trade: "",
    category: "",
    color: DEFAULT_MARKUP_COLOR,
  });
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [viewTransform, setViewTransform] = useState<ViewTransform>(
    data?.viewTransform || {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    }
  );

  // File loading state
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Multi-page PDF state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const pdfDocRef = useRef<any>(null);
  const pageImageCache = useRef<Record<number, string>>({});

  // Calibration state
  const [calibrationData, setCalibrationData] = useState<{
    pixelDistance: number;
    startPoint: Point;
    endPoint: Point;
  } | null>(null);
  const [calibrationFeet, setCalibrationFeet] = useState("");
  const [calibrationInches, setCalibrationInches] = useState("");

  // Project & Save state
  const [selectedProject, setSelectedProject] = useState<BluebeamProject | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialMarkupStateRef = useRef<string>("");

  // PDF storage state
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Browse/Edit mode state
  const [mode, setMode] = useState<"browse" | "edit">("browse");

  // Panel collapse state
  const [isToolsCollapsed, setIsToolsCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  // Ref to track blob URL for proper cleanup (prevents GC of blob URLs)
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URL and PDF doc on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        console.log("[CADMarkup] Cleanup: revoking blob URL on unmount");
        URL.revokeObjectURL(blobUrlRef.current);
      }
      pdfDocRef.current = null;
    };
  }, []);

  // Load panel collapse state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("pdfMarkup.panelState");
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setIsToolsCollapsed(state.tools ?? false);
        setIsRightPanelCollapsed(state.rightPanel ?? false);
      } catch {
        // Ignore invalid JSON
      }
    }
  }, []);

  // Save panel collapse state to localStorage when changed
  useEffect(() => {
    localStorage.setItem(
      "pdfMarkup.panelState",
      JSON.stringify({
        tools: isToolsCollapsed,
        rightPanel: isRightPanelCollapsed,
      })
    );
  }, [isToolsCollapsed, isRightPanelCollapsed]);

  // Keyboard shortcuts for panel toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "[") setIsToolsCollapsed((prev) => !prev);
      if (e.key === "]") setIsRightPanelCollapsed((prev) => !prev);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // File upload handler - only called when a project is selected (State 2)
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Safety check - should always have a project since dropzone only shows in State 2
    if (!selectedProject) {
      toast.error("Please select a project first");
      return;
    }

    const file = acceptedFiles[0];
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];

    if (!validTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, or PDF files.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be less than 50MB");
      return;
    }

    setIsLoadingFile(true);
    console.log("[CADMarkup] Processing file:", file.name, file.type);

    try {
      let url: string;
      let numPages = 1;

      // Revoke previous blob URL if exists (cleanup)
      if (blobUrlRef.current) {
        console.log("[CADMarkup] Revoking previous blob URL");
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      // Clear previous page cache
      pageImageCache.current = {};

      if (file.type === "application/pdf") {
        // Load PDF document for multi-page support
        toast.info("Loading PDF...");
        const { pdfDoc, numPages: pages } = await loadPdfDocument(file);
        numPages = pages;
        pdfDocRef.current = pdfDoc;
        setTotalPages(numPages);
        setCurrentPage(1);

        // Render first page
        url = await renderPdfPageToDataUrl(pdfDoc, 1);

        // Cache first page
        pageImageCache.current[1] = url;

        toast.success(`PDF loaded: ${numPages} page${numPages > 1 ? "s" : ""}`);
        // PDF uses data URL, no need to store in ref
      } else {
        // Regular image - single page
        pdfDocRef.current = null;
        setTotalPages(1);
        setCurrentPage(1);
        // Regular image - create blob URL
        url = URL.createObjectURL(file);
        blobUrlRef.current = url; // Store ref to prevent GC and allow cleanup
        console.log("[CADMarkup] Created blob URL for image, stored in ref");
      }

      setImageUrl(url);
      setImageName(file.name);

      // Reset view transform for new image
      setViewTransform({
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });

      // Upload PDF to storage and link to project
      if (file.type === "application/pdf") {
        setIsUploadingPdf(true);
        const { url: pdfUrl, error: uploadError } = await uploadProjectPdf(
          selectedProject.id,
          file
        );

        if (uploadError) {
          console.error("Failed to upload PDF:", uploadError);
          toast.error("PDF loaded locally but failed to save to cloud");
        } else if (pdfUrl) {
          // Update project with PDF URL and page count
          await updateProject(selectedProject.id, {
            source_pdf_path: pdfUrl,
            total_pages: numPages,
            pixels_per_foot: pixelsPerFoot,
          });
          toast.success("PDF uploaded and linked to project");
        }
        setIsUploadingPdf(false);
      } else {
        toast.success("Drawing loaded successfully");
      }
    } catch (error) {
      console.error("[CADMarkup] Failed to process file:", error);
      toast.error("Failed to process file. Please try a different file.");
    } finally {
      setIsLoadingFile(false);
    }
  }, [selectedProject, pixelsPerFoot]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    multiple: false,
  });

  // Page navigation for multi-page PDFs
  const handlePageChange = useCallback(
    async (pageNumber: number) => {
      if (pageNumber < 1 || pageNumber > totalPages || pageNumber === currentPage) return;

      // Check cache first
      if (pageImageCache.current[pageNumber]) {
        setImageUrl(pageImageCache.current[pageNumber]);
        setCurrentPage(pageNumber);
        setViewTransform({ scale: 1, offsetX: 0, offsetY: 0 });
        return;
      }

      const pdfDoc = pdfDocRef.current;
      if (!pdfDoc) {
        console.error("[CADMarkup] No PDF document reference");
        return;
      }

      setIsLoadingPage(true);
      try {
        const url = await renderPdfPageToDataUrl(pdfDoc, pageNumber);

        // Cache the page
        pageImageCache.current[pageNumber] = url;

        setImageUrl(url);
        setCurrentPage(pageNumber);

        // Reset view transform for new page
        setViewTransform({
          scale: 1,
          offsetX: 0,
          offsetY: 0,
        });
      } catch (error) {
        console.error("[CADMarkup] Failed to load page:", error);
        toast.error("Failed to load page");
      } finally {
        setIsLoadingPage(false);
      }
    },
    [totalPages, currentPage]
  );

  // Filter markups for current page
  const currentPagePolygons = useMemo(
    () => polygons.filter((p) => p.pageNumber === currentPage),
    [polygons, currentPage]
  );

  const currentPageMarkers = useMemo(
    () => markers.filter((m) => m.pageNumber === currentPage),
    [markers, currentPage]
  );

  const currentPageMeasurements = useMemo(
    () => measurements.filter((m) => m.pageNumber === currentPage),
    [measurements, currentPage]
  );

  // Handlers - useHistory manages history automatically
  // Add pageNumber to each markup when adding
  const handlePolygonAdd = useCallback(
    (polygon: Polygon) => {
      const polygonWithPage = { ...polygon, pageNumber: currentPage };
      setMarkupState((prev) => ({ ...prev, polygons: [...prev.polygons, polygonWithPage] }));
      toast.success(`Area added: ${polygon.area} SF`);
    },
    [setMarkupState, currentPage]
  );

  const handleMarkerAdd = useCallback(
    (marker: CountMarker) => {
      const markerWithPage = { ...marker, pageNumber: currentPage };
      setMarkupState((prev) => ({ ...prev, markers: [...prev.markers, markerWithPage] }));
      toast.success("Count marker added");
    },
    [setMarkupState, currentPage]
  );

  const handleMeasurementAdd = useCallback(
    (measurement: LinearMeasurement) => {
      const measurementWithPage = { ...measurement, pageNumber: currentPage };
      setMarkupState((prev) => ({ ...prev, measurements: [...prev.measurements, measurementWithPage] }));
      toast.success(`Measurement added: ${measurement.lengthFeet} LF`);
    },
    [setMarkupState, currentPage]
  );

  const handleDeletePolygon = useCallback(
    (id: string) => {
      setMarkupState((prev) => ({ ...prev, polygons: prev.polygons.filter((p) => p.id !== id) }));
      if (selectedPolygonId === id) {
        setSelectedPolygonId(null);
      }
      toast.success("Area deleted");
    },
    [setMarkupState, selectedPolygonId]
  );

  const handleDeleteMarker = useCallback(
    (id: string) => {
      setMarkupState((prev) => ({ ...prev, markers: prev.markers.filter((m) => m.id !== id) }));
      if (selectedMarkerId === id) {
        setSelectedMarkerId(null);
      }
      toast.success("Marker deleted");
    },
    [setMarkupState, selectedMarkerId]
  );

  const handleDeleteMeasurement = useCallback(
    (id: string) => {
      setMarkupState((prev) => ({ ...prev, measurements: prev.measurements.filter((m) => m.id !== id) }));
      if (selectedMeasurementId === id) {
        setSelectedMeasurementId(null);
      }
      toast.success("Measurement deleted");
    },
    [setMarkupState, selectedMeasurementId]
  );

  // Update handlers for MarkupsList inline editing
  const handleUpdatePolygon = useCallback(
    (id: string, updates: Partial<Polygon>) => {
      setMarkupState((prev) => ({
        ...prev,
        polygons: prev.polygons.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    },
    [setMarkupState]
  );

  const handleUpdateMarker = useCallback(
    (id: string, updates: Partial<CountMarker>) => {
      setMarkupState((prev) => ({
        ...prev,
        markers: prev.markers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      }));
    },
    [setMarkupState]
  );

  const handleUpdateMeasurement = useCallback(
    (id: string, updates: Partial<LinearMeasurement>) => {
      setMarkupState((prev) => ({
        ...prev,
        measurements: prev.measurements.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      }));
    },
    [setMarkupState]
  );

  const handleUndo = useCallback(() => {
    historyUndo();
  }, [historyUndo]);

  const handleRedo = useCallback(() => {
    historyRedo();
  }, [historyRedo]);

  const handleClearAll = useCallback(() => {
    if (polygons.length === 0 && markers.length === 0 && measurements.length === 0) {
      return;
    }

    if (confirm("Are you sure you want to clear all markups? This cannot be undone.")) {
      setMarkupState({ polygons: [], markers: [], measurements: [] });
      clearHistory();
      setSelectedPolygonId(null);
      setSelectedMarkerId(null);
      setSelectedMeasurementId(null);
      toast.success("All markups cleared");
    }
  }, [polygons, markers, measurements, setMarkupState, clearHistory]);

  // Export handlers
  const handleExportCSV = useCallback(() => {
    const csv = exportToCSV({
      polygons,
      markers,
      measurements,
      projectName: imageName,
      exportDate: new Date().toISOString(),
    });
    downloadFile(csv, `${imageName || "markups"}-export.csv`, "text/csv");
    toast.success("CSV exported successfully");
  }, [polygons, markers, measurements, imageName]);

  const handleExportExcel = useCallback(async () => {
    try {
      const blob = await exportToExcel({
        polygons,
        markers,
        measurements,
        projectName: imageName,
        exportDate: new Date().toISOString(),
      });
      downloadFile(
        blob,
        `${imageName || "markups"}-export.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      toast.success("Excel exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel");
      console.error(error);
    }
  }, [polygons, markers, measurements, imageName]);

  const handleExportJSON = useCallback(() => {
    const json = exportToJSON({
      polygons,
      markers,
      measurements,
      projectName: imageName,
      exportDate: new Date().toISOString(),
    });
    downloadFile(json, `${imageName || "markups"}-export.json`, "application/json");
    toast.success("JSON exported successfully");
  }, [polygons, markers, measurements, imageName]);

  // Save markups to database
  const handleSave = useCallback(async () => {
    if (!selectedProject) {
      toast.error("Please select a project first");
      return;
    }

    setSyncStatus("saving");
    setSaveError(null);

    const { success, error } = await saveMarkups(selectedProject.id, {
      polygons,
      markers,
      measurements,
    });

    if (success) {
      // Also save calibration and page count to project
      await updateProject(selectedProject.id, {
        total_pages: totalPages,
        pixels_per_foot: pixelsPerFoot,
      });

      setSyncStatus("saved");
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      initialMarkupStateRef.current = JSON.stringify({ polygons, markers, measurements });
      toast.success("Markups saved");
    } else {
      setSyncStatus("error");
      setSaveError(error || "Failed to save");
      toast.error(error || "Failed to save markups");
    }
  }, [selectedProject, polygons, markers, measurements, totalPages, pixelsPerFoot]);

  // Handle project selection - load markups and PDF
  const handleProjectSelect = useCallback(
    async (project: BluebeamProject | null) => {
      setSelectedProject(project);

      // Always clear PDF state when switching projects
      setImageUrl("");
      setImageName("");
      pdfDocRef.current = null;
      pageImageCache.current = {};
      setTotalPages(1);
      setCurrentPage(1);

      // Revoke any existing blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      if (!project) {
        // Clear all state when no project selected
        setSyncStatus("idle");
        setLastSaved(null);
        setHasUnsavedChanges(false);
        setMarkupState({ polygons: [], markers: [], measurements: [] });
        clearHistory();
        return;
      }

      // Load markups for selected project
      setSyncStatus("saving"); // Use saving status for loading indicator
      const { data, error } = await loadMarkups(project.id);

      if (error) {
        setSyncStatus("error");
        setSaveError(error);
        toast.error(`Failed to load markups: ${error}`);
        return;
      }

      if (data) {
        setMarkupState({
          polygons: data.polygons,
          markers: data.markers,
          measurements: data.measurements,
        });
        initialMarkupStateRef.current = JSON.stringify(data);
        clearHistory();

        const markupCount = data.polygons.length + data.markers.length + data.measurements.length;
        if (markupCount > 0) {
          toast.success(`Loaded ${markupCount} markups`);
        }
      } else {
        // No markups yet, clear state
        setMarkupState({ polygons: [], markers: [], measurements: [] });
        initialMarkupStateRef.current = JSON.stringify({ polygons: [], markers: [], measurements: [] });
        clearHistory();
      }

      // Restore calibration from project
      if (project.pixels_per_foot) {
        setPixelsPerFoot(project.pixels_per_foot);
      }

      // Load the project's PDF if it has one
      if (project.source_pdf_path) {
        setIsLoadingPdf(true);
        try {
          const { blob, error: pdfError } = await downloadProjectPdf(project.source_pdf_path);

          if (pdfError) {
            toast.error(`Failed to load PDF: ${pdfError}`);
          } else if (blob) {
            // Dynamic import pdfjs
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

            // Process the PDF blob
            const arrayBuffer = await blob.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pdfDocRef.current = pdfDoc;
            setTotalPages(pdfDoc.numPages);

            // Clear previous cache
            pageImageCache.current = {};

            // Render first page
            const dataUrl = await renderPdfPageToDataUrl(pdfDoc, 1);
            pageImageCache.current[1] = dataUrl;
            setImageUrl(dataUrl);
            setCurrentPage(1);
            setImageName(project.project_name + ".pdf");

            // Reset view transform
            setViewTransform({ scale: 1, offsetX: 0, offsetY: 0 });

            toast.success("PDF loaded from project");
          }
        } catch (err) {
          console.error("Error loading PDF:", err);
          toast.error("Failed to load PDF from project");
        } finally {
          setIsLoadingPdf(false);
        }
      }
      // If project has no PDF, imageUrl stays empty → shows State 2 (upload UI)

      setSyncStatus("saved");
      setLastSaved(new Date());
      setHasUnsavedChanges(false);

      // Switch to edit mode after loading project
      setMode("edit");
    },
    [setMarkupState, clearHistory]
  );

  // Handle back to projects (browse mode)
  const handleBackToProjects = useCallback(() => {
    setSelectedProject(null);
    setImageUrl("");
    setImageName("");
    pdfDocRef.current = null;
    pageImageCache.current = {};
    setTotalPages(1);
    setCurrentPage(1);
    setMarkupState({ polygons: [], markers: [], measurements: [] });
    clearHistory();
    setSyncStatus("idle");
    setLastSaved(null);
    setHasUnsavedChanges(false);
    setMode("browse");
  }, [setMarkupState, clearHistory]);

  // Track unsaved changes
  useEffect(() => {
    if (!selectedProject) return;

    const currentState = JSON.stringify({ polygons, markers, measurements });
    const hasChanges = currentState !== initialMarkupStateRef.current;

    if (hasChanges && !hasUnsavedChanges) {
      setHasUnsavedChanges(true);
      setSyncStatus("unsaved");
    } else if (!hasChanges && hasUnsavedChanges) {
      setHasUnsavedChanges(false);
      setSyncStatus(lastSaved ? "saved" : "idle");
    }
  }, [polygons, markers, measurements, selectedProject, hasUnsavedChanges, lastSaved]);

  // Keyboard shortcut: Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (selectedProject && hasUnsavedChanges) {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProject, hasUnsavedChanges, handleSave]);

  // Calibration helper functions
  const calculateAreaWithScale = useCallback((points: Point[], ppf: number): number => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    const areaPixels = Math.abs(area / 2);
    return Math.round((areaPixels / (ppf * ppf)) * 100) / 100;
  }, []);

  const calculateDistanceWithScale = useCallback((p1: Point, p2: Point, ppf: number): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distancePixels = Math.sqrt(dx * dx + dy * dy);
    return Math.round((distancePixels / ppf) * 100) / 100;
  }, []);

  // Handle calibration complete from CADViewer
  const handleCalibrationComplete = useCallback(
    (pixelDistance: number, startPoint: Point, endPoint: Point) => {
      setCalibrationData({ pixelDistance, startPoint, endPoint });
      setCurrentTool("select"); // Exit calibrate mode
    },
    []
  );

  // Handle calibration dialog confirm
  const handleCalibrationConfirm = useCallback(() => {
    if (!calibrationData) return;

    const feet = parseFloat(calibrationFeet) || 0;
    const inches = parseFloat(calibrationInches) || 0;

    // Validate at least one value is entered
    if (feet === 0 && inches === 0) {
      toast.error("Please enter a distance");
      return;
    }

    // Calculate total feet: feet + (inches / 12)
    const totalFeet = feet + (inches / 12);
    const newPixelsPerFoot = calibrationData.pixelDistance / totalFeet;
    const roundedPpf = Math.round(newPixelsPerFoot);

    // Update scale
    setPixelsPerFoot(roundedPpf);

    // Recalculate all polygon areas and measurement lengths with new scale
    setMarkupState((prev) => ({
      ...prev,
      polygons: prev.polygons.map((polygon) => ({
        ...polygon,
        area: calculateAreaWithScale(polygon.points, newPixelsPerFoot),
      })),
      measurements: prev.measurements.map((m) => ({
        ...m,
        lengthFeet: calculateDistanceWithScale(m.start, m.end, newPixelsPerFoot),
      })),
    }));

    // Clear calibration state
    setCalibrationData(null);
    setCalibrationFeet("");
    setCalibrationInches("");
    toast.success(`Scale calibrated: ${roundedPpf} pixels/foot`);
  }, [
    calibrationData,
    calibrationFeet,
    calibrationInches,
    setMarkupState,
    calculateAreaWithScale,
    calculateDistanceWithScale,
  ]);

  // Handle calibration dialog cancel
  const handleCalibrationCancel = useCallback(() => {
    setCalibrationData(null);
    setCalibrationFeet("");
    setCalibrationInches("");
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (confirm("Remove the current image? All markups will be cleared.")) {
      setImageUrl("");
      setImageName("");
      setMarkupState({ polygons: [], markers: [], measurements: [] });
      clearHistory();

      // Clear PDF-related state
      pdfDocRef.current = null;
      pageImageCache.current = {};
      setTotalPages(1);
      setCurrentPage(1);

      toast.success("Image removed");
    }
  }, [setMarkupState, clearHistory]);

  // Handle delete selected markup (called from CADViewer on Delete key)
  const handleDeleteSelected = useCallback(() => {
    if (selectedPolygonId) {
      setMarkupState((prev) => ({
        ...prev,
        polygons: prev.polygons.filter((p) => p.id !== selectedPolygonId),
      }));
      setSelectedPolygonId(null);
      toast.success("Area deleted");
    } else if (selectedMarkerId) {
      setMarkupState((prev) => ({
        ...prev,
        markers: prev.markers.filter((m) => m.id !== selectedMarkerId),
      }));
      setSelectedMarkerId(null);
      toast.success("Count marker deleted");
    } else if (selectedMeasurementId) {
      setMarkupState((prev) => ({
        ...prev,
        measurements: prev.measurements.filter((m) => m.id !== selectedMeasurementId),
      }));
      setSelectedMeasurementId(null);
      toast.success("Measurement deleted");
    }
  }, [selectedPolygonId, selectedMarkerId, selectedMeasurementId, setMarkupState]);

  // Selection handler for MarkupsList
  const handleMarkupsListSelect = useCallback((selection: MarkupSelection | null) => {
    if (!selection) {
      setSelectedPolygonId(null);
      setSelectedMarkerId(null);
      setSelectedMeasurementId(null);
    } else if (selection.type === "polygon") {
      setSelectedPolygonId(selection.id);
      setSelectedMarkerId(null);
      setSelectedMeasurementId(null);
    } else if (selection.type === "marker") {
      setSelectedPolygonId(null);
      setSelectedMarkerId(selection.id);
      setSelectedMeasurementId(null);
    } else if (selection.type === "measurement") {
      setSelectedPolygonId(null);
      setSelectedMarkerId(null);
      setSelectedMeasurementId(selection.id);
    }
  }, []);

  // Compute current selection for MarkupsList
  const currentSelection = useMemo((): MarkupSelection | null => {
    if (selectedPolygonId) return { id: selectedPolygonId, type: "polygon" };
    if (selectedMarkerId) return { id: selectedMarkerId, type: "marker" };
    if (selectedMeasurementId) return { id: selectedMeasurementId, type: "measurement" };
    return null;
  }, [selectedPolygonId, selectedMarkerId, selectedMeasurementId]);

  // Update parent component
  useEffect(() => {
    if (onUpdate) {
      onUpdate({
        imageUrl,
        imageName,
        pixelsPerFoot,
        polygons,
        markers,
        measurements,
        viewTransform,
      });
    }
  }, [imageUrl, imageName, pixelsPerFoot, polygons, markers, measurements, viewTransform, onUpdate]);

  // Validation
  useEffect(() => {
    const isValid = !!imageUrl && pixelsPerFoot > 0 && polygons.length > 0;
    onValidationChange?.(isValid);
  }, [imageUrl, pixelsPerFoot, polygons, onValidationChange]);

  return (
    <div className="space-y-2">
      {/* BROWSE MODE: Show project grid */}
      {mode === "browse" ? (
        <ProjectGrid onProjectSelect={handleProjectSelect} />
      ) : (
        /* EDIT MODE: Show editor */
        <>
          {/* Header bar with back button, project name, save status */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBackToProjects}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              All Projects
            </Button>
            <div className="flex-1">
              <h2 className="font-semibold">{selectedProject?.project_name}</h2>
              {selectedProject?.client_name && (
                <p className="text-sm text-muted-foreground">{selectedProject.client_name}</p>
              )}
            </div>
            <SaveStatus status={syncStatus} lastSaved={lastSaved} error={saveError} />
            <Button
              onClick={handleSave}
              disabled={!selectedProject || syncStatus === "saving" || !hasUnsavedChanges}
              size="sm"
            >
              {syncStatus === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>

          {/* No PDF yet - show upload dropzone */}
          {!imageUrl && !isLoadingPdf ? (
            <Card className="shadow-soft rounded-xl">
              <CardContent className="p-0">
                <div
                  {...getRootProps()}
                  className={`flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed rounded-lg m-4 p-8 cursor-pointer transition-colors ${
                    isLoadingFile
                      ? "border-blue-500 bg-blue-50 cursor-wait"
                      : isDragActive
                        ? "border-[#00cc6a] bg-[#dcfce7]"
                        : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
                  }`}
                >
                  <input {...getInputProps()} disabled={isLoadingFile} />
                  {isLoadingFile ? (
                    <>
                      <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-4" />
                      <p className="text-blue-600 font-medium mb-2">Processing file...</p>
                      <p className="text-sm text-muted-foreground">
                        Converting PDF to image may take a moment
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Upload Project PDF</h3>
                      {isDragActive ? (
                        <p className="text-[#00cc6a] font-medium">Drop the file here...</p>
                      ) : (
                        <>
                          <p className="text-muted-foreground text-center mb-2">
                            Drag and drop a PDF here, or click to browse
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Supports PDF, PNG, JPG up to 50MB
                          </p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : isLoadingPdf ? (
            /* Loading PDF overlay */
            <Card className="shadow-soft rounded-xl">
              <CardContent className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="text-sm text-muted-foreground">Loading PDF...</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Full editor */
            <>
              {/* Page Navigation for multi-page PDFs */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center">
                  <PageNavigation
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                    disabled={isLoadingPage}
                  />
                </div>
              )}

              {/* Main Markup Interface */}
              <div className={`grid grid-cols-1 gap-2 h-[calc(100vh-200px)] min-h-[600px] transition-all duration-200 ${
                  isToolsCollapsed && isRightPanelCollapsed
                    ? "lg:grid-cols-[40px_1fr_40px]"
                    : isToolsCollapsed
                      ? "lg:grid-cols-[40px_1fr_300px]"
                      : isRightPanelCollapsed
                        ? "lg:grid-cols-[160px_1fr_40px]"
                        : "lg:grid-cols-[160px_1fr_300px]"
                }`}>
                {/* Left Toolbar - Collapsible */}
                <div className="h-full transition-all duration-200">
                  {isToolsCollapsed ? (
                    <Card className="h-full shadow-soft rounded-xl flex flex-col items-center py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mb-2"
                        onClick={() => setIsToolsCollapsed(false)}
                        title="Expand Tools (press [)"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {/* Mini tool icons when collapsed */}
                      <div className="flex flex-col gap-1">
                        <Button
                          variant={currentTool === "select" ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentTool("select")}
                          title="Select"
                        >
                          <MousePointer2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={currentTool === "draw" ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentTool("draw")}
                          title="Draw Area"
                        >
                          <PolygonIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={currentTool === "count" ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentTool("count")}
                          title="Count"
                        >
                          <Circle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={currentTool === "linear" ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentTool("linear")}
                          title="Linear"
                        >
                          <Ruler className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <div className="relative h-full">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-1 top-2 z-10 h-6 w-6 hover:bg-muted rounded"
                        onClick={() => setIsToolsCollapsed(true)}
                        title="Collapse Tools (press [)"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <MarkupToolbar
                        currentTool={currentTool}
                        selectedMaterial={selectedMaterial}
                        onToolChange={setCurrentTool}
                        onMaterialChange={setSelectedMaterial}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onClearAll={handleClearAll}
                        onExportCSV={handleExportCSV}
                        onExportExcel={handleExportExcel}
                        onExportJSON={handleExportJSON}
                        canUndo={canUndo}
                        canRedo={canRedo}
                      />
                    </div>
                  )}
                </div>

                {/* Center Canvas */}
                <Card className="shadow-soft rounded-xl overflow-hidden flex flex-col relative">
                  {/* PDF Uploading Indicator */}
                  {isUploadingPdf && (
                    <div className="absolute top-2 right-2 z-10 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading to cloud...
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <CADViewer
                      imageUrl={imageUrl}
                      polygons={currentPagePolygons}
                      markers={currentPageMarkers}
                      measurements={currentPageMeasurements}
                      currentTool={currentTool}
                      selectedMaterial={selectedMaterial}
                      pixelsPerFoot={pixelsPerFoot}
                      viewTransform={viewTransform}
                      onPolygonAdd={handlePolygonAdd}
                      onMarkerAdd={handleMarkerAdd}
                      onMeasurementAdd={handleMeasurementAdd}
                      onViewTransformChange={setViewTransform}
                      onPolygonSelect={setSelectedPolygonId}
                      selectedPolygonId={selectedPolygonId}
                      onMarkerSelect={setSelectedMarkerId}
                      selectedMarkerId={selectedMarkerId}
                      onMeasurementSelect={setSelectedMeasurementId}
                      selectedMeasurementId={selectedMeasurementId}
                      onDeleteSelected={handleDeleteSelected}
                      onCalibrationComplete={handleCalibrationComplete}
                      pdfDocument={pdfDocRef.current}
                      pdfPageNumber={currentPage}
                      onImageUrlChange={setImageUrl}
                    />
                  </div>

                  {/* Page Thumbnails Strip */}
                  {totalPages > 1 && pdfDocRef.current && (
                    <PageThumbnails
                      pdfDocument={pdfDocRef.current}
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageSelect={handlePageChange}
                    />
                  )}
                </Card>

                {/* Right Panel - MarkupsList and Legend - Collapsible Sidebar */}
                <div className="h-full transition-all duration-200">
                  {isRightPanelCollapsed ? (
                    <Card className="h-full shadow-soft rounded-xl flex flex-col items-center py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mb-4"
                        onClick={() => setIsRightPanelCollapsed(false)}
                        title="Expand Panel (press ])"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {/* Mini icons when collapsed */}
                      <div className="flex flex-col gap-2 items-center">
                        <div className="flex flex-col items-center gap-1" title="Markups">
                          <List className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">List</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 mt-2" title="Takeoff Summary">
                          <ClipboardList className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Summary</span>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <div className="relative h-full flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -left-1 top-2 z-10 h-6 w-6 hover:bg-muted rounded"
                        onClick={() => setIsRightPanelCollapsed(true)}
                        title="Collapse Panel (press ])"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      {/* Markups Panel */}
                      <Card className="flex-1 min-h-0 shadow-soft rounded-xl flex flex-col">
                        <CardHeader className="pb-2 pt-3 pl-8">
                          <CardTitle className="text-base">Markups</CardTitle>
                        </CardHeader>
                        <div className="flex-1 min-h-0 overflow-hidden">
                          <MarkupsList
                            polygons={currentPagePolygons}
                            markers={currentPageMarkers}
                            measurements={currentPageMeasurements}
                            selection={currentSelection}
                            onSelect={handleMarkupsListSelect}
                            onUpdatePolygon={handleUpdatePolygon}
                            onUpdateMarker={handleUpdateMarker}
                            onUpdateMeasurement={handleUpdateMeasurement}
                            onDeletePolygon={handleDeletePolygon}
                            onDeleteMarker={handleDeleteMarker}
                            onDeleteMeasurement={handleDeleteMeasurement}
                            hideCard
                          />
                        </div>
                      </Card>

                      {/* Takeoff Summary Panel */}
                      <Card className="h-[220px] flex-shrink-0 shadow-soft rounded-xl flex flex-col">
                        <CardHeader className="pb-2 pt-3">
                          <CardTitle className="text-base">Takeoff Summary</CardTitle>
                        </CardHeader>
                        <div className="flex-1 overflow-y-auto">
                          {/* MarkupLegend shows totals across ALL pages */}
                          <MarkupLegend
                            polygons={polygons}
                            markers={markers}
                            measurements={measurements}
                            onDeletePolygon={handleDeletePolygon}
                            onDeleteMarker={handleDeleteMarker}
                            onDeleteMeasurement={handleDeleteMeasurement}
                            onExportSummary={handleExportCSV}
                            hideCard
                          />
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              </div>

              {/* Scale Input */}
              <Card className="shadow-soft rounded-xl">
                <CardHeader>
                  <CardTitle className="font-heading">Scale Settings</CardTitle>
                  <CardDescription>
                    Set the scale for accurate area calculations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label htmlFor="pixels-per-foot">Pixels per Foot</Label>
                      <Input
                        id="pixels-per-foot"
                        type="number"
                        min="1"
                        step="1"
                        value={pixelsPerFoot}
                        onChange={(e) => setPixelsPerFoot(Number(e.target.value))}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Measure a known dimension on the drawing to calibrate
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <FileImage className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium">{imageName}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveImage}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CAD Extraction Data Panel */}
              {selectedProject && (
                <CadDataPanel projectId={selectedProject.id} />
              )}
            </>
          )}
        </>
      )}

      {/* Calibration Dialog */}
      <Dialog open={calibrationData !== null} onOpenChange={(open) => !open && handleCalibrationCancel()}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Set Scale</DialogTitle>
            <DialogDescription>
              Enter the real-world distance between the two points you selected on the drawing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Distance</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={calibrationFeet}
                  onChange={(e) => setCalibrationFeet(e.target.value)}
                  className="w-20"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">ft</span>
                <Input
                  type="number"
                  min="0"
                  max="11"
                  step="1"
                  placeholder="0"
                  value={calibrationInches}
                  onChange={(e) => setCalibrationInches(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">in</span>
              </div>
            </div>
            {calibrationData && (
              <p className="text-sm text-muted-foreground">
                Measured pixel distance: {Math.round(calibrationData.pixelDistance)} px
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCalibrationCancel}>
              Cancel
            </Button>
            <Button onClick={handleCalibrationConfirm} disabled={!calibrationFeet && !calibrationInches}>
              Apply Scale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
