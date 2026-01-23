'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from 'react-konva';
import type Konva from 'konva';
import type {
  ExtractionPage,
  ExtractionDetection,
  DetectionClass,
  ToolMode,
  PolygonPoint,
  MarkupType,
} from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS } from '@/lib/types/extraction';
import KonvaDetectionPolygon, { type PolygonUpdatePayload } from './KonvaDetectionPolygon';
import KonvaDetectionLine, { type LineUpdatePayload } from './KonvaDetectionLine';
import KonvaDetectionPoint, { type PointUpdatePayload } from './KonvaDetectionPoint';
import {
  calculateFitScale,
  calculateCenterOffset,
  constrainScale,
} from '@/lib/utils/coordinates';
import {
  getPolygonBoundingBox,
  flattenPoints,
  calculatePolygonMeasurements,
} from '@/lib/utils/polygonUtils';

// =============================================================================
// Types
// =============================================================================

export interface CalibrationPoint {
  x: number;
  y: number;
}

export interface CalibrationData {
  pointA: CalibrationPoint;
  pointB: CalibrationPoint;
  pixelDistance: number;
}

interface CalibrationState {
  isCalibrating: boolean;
  pointA: CalibrationPoint | null;
  pointB: CalibrationPoint | null;
  pixelDistance: number | null;
}

export interface KonvaDetectionCanvasProps {
  page: ExtractionPage;
  detections: ExtractionDetection[];
  selectedDetectionId: string | null;
  selectedIds: Set<string>;
  toolMode: ToolMode;
  activeClass: DetectionClass;
  onSelectionChange: (id: string | null, addToSelection?: boolean) => void;
  onDetectionMove: (
    detection: ExtractionDetection,
    newPosition: { pixel_x: number; pixel_y: number }
  ) => void;
  onDetectionResize: (
    detection: ExtractionDetection,
    newBounds: {
      pixel_x: number;
      pixel_y: number;
      pixel_width: number;
      pixel_height: number;
    }
  ) => void;
  onDetectionCreate: (bounds: {
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
    class: DetectionClass;
    polygon_points?: PolygonPoint[];
    area_sf?: number;
    perimeter_lf?: number;
    real_width_ft?: number;
    real_height_ft?: number;
    markup_type?: MarkupType;
  }) => void;
  onDetectionPolygonUpdate?: (
    detection: ExtractionDetection,
    updates: PolygonUpdatePayload
  ) => void;
  onDetectionLineUpdate?: (
    detection: ExtractionDetection,
    updates: LineUpdatePayload
  ) => void;
  onDetectionPointUpdate?: (
    detection: ExtractionDetection,
    updates: PointUpdatePayload
  ) => void;
  onCalibrationComplete?: (data: CalibrationData) => void;
  /** Called when user right-clicks to exit point/line mode */
  onExitDrawingMode?: () => void;
  /** Multi-select mode - clicks add to selection instead of replacing */
  multiSelectMode?: boolean;
  containerWidth: number;
  containerHeight: number;
  /** Called when user completes a split operation with a polygon */
  onSplitDetection?: (
    originalDetection: ExtractionDetection,
    splitPolygon: PolygonPoint[]
  ) => void;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 1.1;
const CLOSE_THRESHOLD = 15; // Pixels to detect "near starting point"
const MIN_POLYGON_POINTS = 3;

// Classes appropriate for linear measurements (lines) - measured in LF, not SF
const LINEAR_CLASSES: DetectionClass[] = ['trim', 'fascia', 'gutter', 'eave', 'rake', 'ridge', 'soffit', 'valley'];

// =============================================================================
// Component
// =============================================================================

export default function KonvaDetectionCanvas({
  page,
  detections,
  selectedDetectionId,
  selectedIds,
  toolMode,
  activeClass,
  onSelectionChange,
  onDetectionMove,
  onDetectionResize,
  onDetectionCreate,
  onDetectionPolygonUpdate,
  onDetectionLineUpdate,
  onDetectionPointUpdate,
  onCalibrationComplete,
  onExitDrawingMode,
  multiSelectMode = false,
  containerWidth,
  containerHeight,
  onSplitDetection,
}: KonvaDetectionCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const imageRef = useRef<Konva.Image>(null);

  // Image state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Viewport state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Point-by-point polygon drawing state (create mode)
  const [drawingPoints, setDrawingPoints] = useState<PolygonPoint[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [mousePosition, setMousePosition] = useState<PolygonPoint | null>(null);
  const [isNearStart, setIsNearStart] = useState(false);
  // Rectangle mode for create tool: click and drag to draw rectangle
  const [createRectStart, setCreateRectStart] = useState<PolygonPoint | null>(null);
  const [createRectEnd, setCreateRectEnd] = useState<PolygonPoint | null>(null);
  const [isDraggingCreateRect, setIsDraggingCreateRect] = useState(false);

  // Hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Calibration state
  const [calibrationState, setCalibrationState] = useState<CalibrationState>({
    isCalibrating: false,
    pointA: null,
    pointB: null,
    pixelDistance: null,
  });
  const [calibrationMousePos, setCalibrationMousePos] = useState<CalibrationPoint | null>(null);

  // Line drawing state (2-point line for LF measurements)
  const [lineStartPoint, setLineStartPoint] = useState<PolygonPoint | null>(null);

  // Split tool state - supports both polygon click and rectangle drag modes
  // Polygon mode: click sequential points to draw custom shape
  const [splitPolygonPoints, setSplitPolygonPoints] = useState<PolygonPoint[]>([]);
  const [isSplitDrawing, setIsSplitDrawing] = useState(false);
  const [splitMousePos, setSplitMousePos] = useState<PolygonPoint | null>(null);
  const [isSplitNearStart, setIsSplitNearStart] = useState(false);
  // Rectangle mode: click and drag to draw rectangle
  const [splitRectStart, setSplitRectStart] = useState<PolygonPoint | null>(null);
  const [splitRectEnd, setSplitRectEnd] = useState<PolygonPoint | null>(null);
  const [isDraggingRect, setIsDraggingRect] = useState(false);

  // Get image dimensions
  const imageWidth = page.original_width || 1920;
  const imageHeight = page.original_height || 1080;
  const imageUrl = page.original_image_url || page.image_url;

  // Debug: Log detections by markup_type
  React.useEffect(() => {
    const pointDetections = detections?.filter(d => d.markup_type === 'point') || [];
    const lineDetections = detections?.filter(d => d.markup_type === 'line') || [];
    const polygonDetections = detections?.filter(d => d.markup_type !== 'line' && d.markup_type !== 'point') || [];
    const cornerDetections = detections?.filter(d => d.class === 'corner_inside' || d.class === 'corner_outside') || [];

    console.log('[KonvaCanvas] Detection breakdown:', {
      total: detections?.length || 0,
      polygons: polygonDetections.length,
      lines: lineDetections.length,
      points: pointDetections.length,
      corners: cornerDetections.length,
      cornerClasses: cornerDetections.map(d => ({ class: d.class, markup_type: d.markup_type, id: d.id.slice(0, 8) })),
    });
  }, [detections]);

  // Track which image we've positioned for to avoid resetting on container resize
  const positionedForImageRef = useRef<string | null>(null);

  // ==========================================================================
  // Load Image
  // ==========================================================================

  useEffect(() => {
    if (!imageUrl) return;

    // Check if we're loading a NEW image (page change) vs same image
    const isNewImage = positionedForImageRef.current !== imageUrl;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setImageLoaded(true);

      // Only reset viewport position when loading a different image (page change)
      // This preserves zoom/pan when tool or selection changes
      if (isNewImage) {
        // Calculate initial fit scale and position
        const fitScale = calculateFitScale(
          img.naturalWidth || imageWidth,
          img.naturalHeight || imageHeight,
          containerWidth,
          containerHeight
        );
        const centerOffset = calculateCenterOffset(
          img.naturalWidth || imageWidth,
          img.naturalHeight || imageHeight,
          containerWidth,
          containerHeight,
          fitScale
        );

        setScale(fitScale);
        setPosition(centerOffset);
        positionedForImageRef.current = imageUrl;
      }
    };
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl);
    };
    img.src = imageUrl;
  }, [imageUrl, imageWidth, imageHeight, containerWidth, containerHeight]);

  // ==========================================================================
  // Scale Ratio for Measurements
  // ==========================================================================

  // Get scale ratio from page (pixels per foot) - default to 64 if not set
  const scaleRatio = page.scale_ratio ?? 64;

  // ==========================================================================
  // Wheel Zoom
  // ==========================================================================

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // Calculate new scale
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = constrainScale(
        direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR,
        MIN_SCALE,
        MAX_SCALE
      );

      // Calculate new position to zoom toward pointer
      const mousePointTo = {
        x: (pointer.x - position.x) / oldScale,
        y: (pointer.y - position.y) / oldScale,
      };

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };

      setScale(newScale);
      setPosition(newPos);
    },
    [scale, position]
  );

  // ==========================================================================
  // Stage Drag (Pan Mode)
  // ==========================================================================

  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (toolMode !== 'pan') return;
    setPosition({
      x: e.target.x(),
      y: e.target.y(),
    });
  }, [toolMode]);

  // ==========================================================================
  // Point-by-Point Polygon Drawing (Create Mode)
  // ==========================================================================

  // Check if a point is near the starting point
  const isPointNearStart = useCallback(
    (point: PolygonPoint, startPoint: PolygonPoint): boolean => {
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      // Scale threshold by zoom level so it feels consistent
      return Math.sqrt(dx * dx + dy * dy) < CLOSE_THRESHOLD / scale;
    },
    [scale]
  );

  // Complete the polygon and create detection
  const completePolygon = useCallback(() => {
    if (drawingPoints.length < MIN_POLYGON_POINTS) return;

    // Calculate measurements using scale ratio for accurate real-world values
    const measurements = calculatePolygonMeasurements(drawingPoints, scaleRatio);

    onDetectionCreate({
      pixel_x: measurements.pixel_x,
      pixel_y: measurements.pixel_y,
      pixel_width: measurements.pixel_width,
      pixel_height: measurements.pixel_height,
      class: activeClass,
      polygon_points: drawingPoints,
      area_sf: measurements.area_sf,
      perimeter_lf: measurements.perimeter_lf,
      real_width_ft: measurements.real_width_ft,
      real_height_ft: measurements.real_height_ft,
    });

    // Reset drawing state
    setDrawingPoints([]);
    setIsDrawingPolygon(false);
    setMousePosition(null);
    setIsNearStart(false);
  }, [drawingPoints, activeClass, onDetectionCreate, scaleRatio]);

  // Cancel drawing (both polygon and rectangle modes for create tool)
  const cancelDrawing = useCallback(() => {
    setDrawingPoints([]);
    setIsDrawingPolygon(false);
    setMousePosition(null);
    setIsNearStart(false);
    // Also reset rectangle state
    setCreateRectStart(null);
    setCreateRectEnd(null);
    setIsDraggingCreateRect(false);
  }, []);

  // Complete a rectangle drawing and create detection (create tool)
  const completeRectangleCreate = useCallback(() => {
    if (!createRectStart || !createRectEnd) return;

    const minX = Math.min(createRectStart.x, createRectEnd.x);
    const maxX = Math.max(createRectStart.x, createRectEnd.x);
    const minY = Math.min(createRectStart.y, createRectEnd.y);
    const maxY = Math.max(createRectStart.y, createRectEnd.y);

    // Convert rectangle to 4 polygon points (clockwise from top-left)
    const rectPolygon: PolygonPoint[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];

    console.log('[completeRectangleCreate] Rectangle as polygon:', rectPolygon);

    // Calculate measurements
    const measurements = calculatePolygonMeasurements(rectPolygon, scaleRatio);

    onDetectionCreate({
      pixel_x: measurements.pixel_x,
      pixel_y: measurements.pixel_y,
      pixel_width: measurements.pixel_width,
      pixel_height: measurements.pixel_height,
      class: activeClass,
      polygon_points: rectPolygon,
      area_sf: measurements.area_sf,
      perimeter_lf: measurements.perimeter_lf,
      real_width_ft: measurements.real_width_ft,
      real_height_ft: measurements.real_height_ft,
    });

    // Reset rectangle state
    setCreateRectStart(null);
    setCreateRectEnd(null);
    setIsDraggingCreateRect(false);
  }, [createRectStart, createRectEnd, activeClass, onDetectionCreate, scaleRatio]);

  // Complete split polygon and execute split
  const completeSplitPolygon = useCallback(() => {
    console.log('[completeSplitPolygon] Called with points:', splitPolygonPoints.length);

    if (splitPolygonPoints.length < MIN_POLYGON_POINTS) {
      console.log('[completeSplitPolygon] Not enough points, need at least', MIN_POLYGON_POINTS);
      return;
    }

    // Get the selected detection
    const selectedId = Array.from(selectedIds)[0];
    const selectedDetection = detections.find(d => d.id === selectedId);

    console.log('[completeSplitPolygon] Selected detection:', selectedDetection?.id);

    if (selectedDetection && onSplitDetection) {
      console.log('[completeSplitPolygon] Calling onSplitDetection with', splitPolygonPoints.length, 'points');
      onSplitDetection(selectedDetection, splitPolygonPoints);
    } else {
      console.log('[completeSplitPolygon] Missing selectedDetection or onSplitDetection');
    }

    // Reset split state
    setSplitPolygonPoints([]);
    setIsSplitDrawing(false);
    setSplitMousePos(null);
    setIsSplitNearStart(false);
  }, [splitPolygonPoints, selectedIds, detections, onSplitDetection]);

  // Cancel split drawing (both polygon and rectangle modes)
  const cancelSplitDrawing = useCallback(() => {
    setSplitPolygonPoints([]);
    setIsSplitDrawing(false);
    setSplitMousePos(null);
    setIsSplitNearStart(false);
    // Also reset rectangle state
    setSplitRectStart(null);
    setSplitRectEnd(null);
    setIsDraggingRect(false);
  }, []);

  // Execute split with a rectangle (converted to polygon points)
  const executeSplitWithRect = useCallback(() => {
    if (!splitRectStart || !splitRectEnd) return;

    const minX = Math.min(splitRectStart.x, splitRectEnd.x);
    const maxX = Math.max(splitRectStart.x, splitRectEnd.x);
    const minY = Math.min(splitRectStart.y, splitRectEnd.y);
    const maxY = Math.max(splitRectStart.y, splitRectEnd.y);

    // Convert rectangle to polygon points (clockwise from top-left)
    const rectPolygon: PolygonPoint[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];

    console.log('[executeSplitWithRect] Rectangle as polygon:', rectPolygon);

    // Get the selected detection
    const selectedId = Array.from(selectedIds)[0];
    const selectedDetection = detections.find(d => d.id === selectedId);

    if (selectedDetection && onSplitDetection) {
      console.log('[executeSplitWithRect] Calling onSplitDetection');
      onSplitDetection(selectedDetection, rectPolygon);
    }

    // Reset all split state
    setSplitRectStart(null);
    setSplitRectEnd(null);
    setIsDraggingRect(false);
    setSplitPolygonPoints([]);
    setIsSplitDrawing(false);
  }, [splitRectStart, splitRectEnd, selectedIds, detections, onSplitDetection]);

  // Reset calibration state
  const resetCalibration = useCallback(() => {
    setCalibrationState({
      isCalibrating: false,
      pointA: null,
      pointB: null,
      pixelDistance: null,
    });
    setCalibrationMousePos(null);
  }, []);

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // IMPORTANT: Check drawing tool modes FIRST before checking if we clicked on a detection
      // This allows placing points, lines, and polygons ON TOP of existing markups

      // Point mode - single click to place a marker (works over existing detections)
      if (toolMode === 'point') {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;

        // Create point detection
        onDetectionCreate({
          pixel_x: imageX,
          pixel_y: imageY,
          pixel_width: 0,
          pixel_height: 0,
          class: activeClass,
          markup_type: 'point',
        });
        return;
      }

      // Split mode - supports both polygon click and rectangle drag
      // Click and release = add polygon vertex
      // Click and drag = draw rectangle
      if (toolMode === 'split' && selectedIds.size === 1) {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const newPoint = { x: imageX, y: imageY };

        console.log('[Split MouseDown] Point:', newPoint);
        console.log('[Split MouseDown] Polygon points:', splitPolygonPoints.length);
        console.log('[Split MouseDown] isSplitDrawing:', isSplitDrawing);

        // If we're already drawing a polygon, check for close
        if (isSplitDrawing && splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
          const firstPoint = splitPolygonPoints[0];
          const dx = newPoint.x - firstPoint.x;
          const dy = newPoint.y - firstPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const threshold = CLOSE_THRESHOLD;

          console.log('[Split MouseDown] Distance to first:', distance.toFixed(1), 'Threshold:', threshold);

          if (distance < threshold) {
            console.log('[Split MouseDown] CLOSING POLYGON');
            completeSplitPolygon();
            return;
          }
        }

        // Record start position for potential rectangle drag
        // We'll decide between polygon and rectangle mode on mouse up
        setSplitRectStart(newPoint);
        setSplitRectEnd(newPoint);
        setIsDraggingRect(false); // Not dragging yet, will become true on move
        return;
      }

      // Line mode - two clicks to draw a line (works over existing detections)
      if (toolMode === 'line') {
        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform to image coordinates
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const imagePoint = { x: imageX, y: imageY };

        if (!lineStartPoint) {
          // First click - set start point
          setLineStartPoint(imagePoint);
        } else {
          // Second click - create line detection
          const dx = imagePoint.x - lineStartPoint.x;
          const dy = imagePoint.y - lineStartPoint.y;
          const pixelLength = Math.sqrt(dx * dx + dy * dy);
          const lengthLf = pixelLength / scaleRatio;

          // For lines, use activeClass if it's a linear class, otherwise default to 'trim'
          const lineClass = LINEAR_CLASSES.includes(activeClass) ? activeClass : 'trim';

          onDetectionCreate({
            pixel_x: (lineStartPoint.x + imagePoint.x) / 2,
            pixel_y: (lineStartPoint.y + imagePoint.y) / 2,
            pixel_width: Math.abs(dx),
            pixel_height: Math.abs(dy),
            class: lineClass,
            polygon_points: [lineStartPoint, imagePoint],
            markup_type: 'line',
            perimeter_lf: lengthLf,
            area_sf: 0,
            real_width_ft: Math.abs(dx) / scaleRatio,
            real_height_ft: Math.abs(dy) / scaleRatio,
          });

          setLineStartPoint(null);
        }
        return;
      }

      // Create (polygon) mode - supports both polygon click and rectangle drag
      // Click and release = add polygon vertex
      // Click and drag = draw rectangle
      if (toolMode === 'create') {
        const stage = stageRef.current;
        if (!stage) return;

        // Use getRelativePointerPosition() which returns coordinates in the Stage's
        // local coordinate system (accounts for scale and position transforms)
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        // Pointer is now directly in image-pixel coordinates
        const clickPoint = { x: pointer.x, y: pointer.y };

        console.log('[Create MouseDown] Point:', clickPoint);
        console.log('[Create MouseDown] Polygon points:', drawingPoints.length);
        console.log('[Create MouseDown] isDrawingPolygon:', isDrawingPolygon);

        // If we're already drawing a polygon, check for close
        if (isDrawingPolygon && drawingPoints.length >= MIN_POLYGON_POINTS) {
          const firstPoint = drawingPoints[0];
          const dx = clickPoint.x - firstPoint.x;
          const dy = clickPoint.y - firstPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const threshold = CLOSE_THRESHOLD;

          console.log('[Create MouseDown] Distance to first:', distance.toFixed(1), 'Threshold:', threshold);

          if (distance < threshold) {
            console.log('[Create MouseDown] CLOSING POLYGON');
            completePolygon();
            return;
          }
        }

        // Record start position for potential rectangle drag
        // We'll decide between polygon and rectangle mode on mouse up
        setCreateRectStart(clickPoint);
        setCreateRectEnd(clickPoint);
        setIsDraggingCreateRect(false); // Not dragging yet, will become true on move
        return;
      }

      // Calibration mode - click two points to measure pixel distance (works over existing detections)
      if (toolMode === 'calibrate') {
        const stage = stageRef.current;
        if (!stage) return;

        // Get pointer position in screen/canvas coordinates
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Transform screen coordinates to image coordinates
        // Formula: imageCoord = (screenCoord - stagePosition) / scale
        const imageX = (pointer.x - position.x) / scale;
        const imageY = (pointer.y - position.y) / scale;
        const imagePoint = { x: imageX, y: imageY };

        console.log('[Calibration] Screen point:', pointer);
        console.log('[Calibration] Scale:', scale, 'Position:', position);
        console.log('[Calibration] Image point:', imagePoint);

        if (!calibrationState.pointA) {
          // First click - store point A in IMAGE coordinates
          setCalibrationState({
            isCalibrating: true,
            pointA: imagePoint,
            pointB: null,
            pixelDistance: null,
          });
        } else {
          // Second click - calculate distance in IMAGE coordinates
          const dx = imagePoint.x - calibrationState.pointA.x;
          const dy = imagePoint.y - calibrationState.pointA.y;
          const pixelDistance = Math.sqrt(dx * dx + dy * dy);

          console.log('[Calibration] Distance in IMAGE pixels:', pixelDistance);

          // Update state with final values
          setCalibrationState({
            isCalibrating: true,
            pointA: calibrationState.pointA,
            pointB: imagePoint,
            pixelDistance,
          });

          // Call the completion callback with IMAGE pixel distance
          onCalibrationComplete?.({
            pointA: calibrationState.pointA,
            pointB: imagePoint,
            pixelDistance,
          });

          // Reset calibration state after callback
          resetCalibration();
        }
        return;
      }

      // For select/pan/verify modes, check if we clicked on a detection
      // Walk up the parent chain to find if any parent is a detection
      let target = e.target;
      let isDetectionShape = false;
      while (target && target !== stageRef.current) {
        const targetName = target.name?.() || '';
        if (targetName.startsWith('detection-')) {
          isDetectionShape = true;
          break;
        }
        target = target.parent as typeof target;
      }

      // If clicking on a detection shape (or child of one), let its own handler deal with it
      if (isDetectionShape) {
        return;
      }

      // Only handle clicks on the stage/image itself (empty space)
      const isStageOrImage = e.target === stageRef.current || e.target === imageRef.current;

      // Clear selection when clicking on empty space (in select mode)
      if (toolMode === 'select' && isStageOrImage) {
        onSelectionChange(null, false);
        return;
      }

      // Pan mode handled by Konva's draggable property
      // Verify mode handled by detection click handlers
    },
    [toolMode, onSelectionChange, isDrawingPolygon, drawingPoints.length, isNearStart, completePolygon, calibrationState.pointA, onCalibrationComplete, resetCalibration, position, scale, lineStartPoint, scaleRatio, activeClass, onDetectionCreate, selectedIds, splitPolygonPoints, isSplitDrawing, completeSplitPolygon]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      // Handle calibration mode mouse move - use screen coords + manual transform
      // to match the click handler (must use same coordinate system)
      if (toolMode === 'calibrate' && calibrationState.pointA) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          // Transform to image coordinates (same formula as click handler)
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          setCalibrationMousePos({ x: imageX, y: imageY });
        }
        return;
      }

      // Handle line mode mouse move
      if (toolMode === 'line' && lineStartPoint) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          setCalibrationMousePos({ x: imageX, y: imageY }); // Reuse for line preview
        }
        return;
      }

      // Handle split mode mouse move
      if (toolMode === 'split') {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          const imageX = (pointer.x - position.x) / scale;
          const imageY = (pointer.y - position.y) / scale;
          const currentPoint = { x: imageX, y: imageY };

          // Check if we're dragging a rectangle (mouse button down and moved > 5 pixels)
          // Use 'buttons' for MouseEvent, assume button down for TouchEvent
          const isMouseDown = 'buttons' in e.evt ? e.evt.buttons === 1 : true;
          if (splitRectStart && isMouseDown) {
            const dx = Math.abs(currentPoint.x - splitRectStart.x);
            const dy = Math.abs(currentPoint.y - splitRectStart.y);
            // Only consider it a drag if moved more than 5 pixels in image coords
            if (dx > 5 || dy > 5) {
              setIsDraggingRect(true);
              setSplitRectEnd(currentPoint);
            }
          }

          // Track cursor for polygon preview when actively drawing polygon
          if (isSplitDrawing) {
            setSplitMousePos(currentPoint);

            // Check if near starting point for polygon completion
            if (splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
              setIsSplitNearStart(isPointNearStart(currentPoint, splitPolygonPoints[0]));
            } else {
              setIsSplitNearStart(false);
            }
          }
        }
        return;
      }

      // Handle create mode mouse move
      if (toolMode === 'create') {
        const pointer = stage.getRelativePointerPosition();
        if (pointer) {
          const currentPoint = { x: pointer.x, y: pointer.y };

          // Check if we're dragging a rectangle (mouse button down and moved > 5 pixels)
          const isMouseDown = 'buttons' in e.evt ? e.evt.buttons === 1 : true;
          if (createRectStart && isMouseDown) {
            const dx = Math.abs(currentPoint.x - createRectStart.x);
            const dy = Math.abs(currentPoint.y - createRectStart.y);
            // Only consider it a drag if moved more than 5 pixels
            if (dx > 5 || dy > 5) {
              setIsDraggingCreateRect(true);
              setCreateRectEnd(currentPoint);
            }
          }

          // Track cursor for polygon preview when actively drawing polygon
          if (isDrawingPolygon) {
            setMousePosition(currentPoint);

            // Check if near starting point for polygon completion
            if (drawingPoints.length >= MIN_POLYGON_POINTS) {
              setIsNearStart(isPointNearStart(currentPoint, drawingPoints[0]));
            } else {
              setIsNearStart(false);
            }
          }
        }
        return;
      }

      // For other modes, use getRelativePointerPosition (works for polygon drawing)
      const pointer = stage.getRelativePointerPosition();
      if (!pointer) return;

      const currentPoint = { x: pointer.x, y: pointer.y };
      setMousePosition(currentPoint);
    },
    [toolMode, isDrawingPolygon, drawingPoints, isPointNearStart, calibrationState.pointA, position, scale, lineStartPoint, isSplitDrawing, splitPolygonPoints, splitRectStart, createRectStart]
  );

  const handleStageMouseUp = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Handle create mode - distinguish between rectangle drag and polygon click
      if (toolMode === 'create' && createRectStart) {
        if (isDraggingCreateRect && createRectEnd) {
          // User was dragging - create detection with rectangle
          console.log('[Create MouseUp] Executing rectangle create');
          completeRectangleCreate();
        } else {
          // User clicked (no drag) - add polygon vertex
          console.log('[Create MouseUp] Adding polygon point at', createRectStart);

          if (!isDrawingPolygon) {
            // Start new polygon
            setIsDrawingPolygon(true);
            setDrawingPoints([createRectStart]);
            setMousePosition(createRectStart);
          } else {
            // Add point to existing polygon
            setDrawingPoints(prev => [...prev, createRectStart]);
          }

          // Reset rectangle state but keep polygon drawing active
          setCreateRectStart(null);
          setCreateRectEnd(null);
          setIsDraggingCreateRect(false);
        }
      }

      // Handle split mode - distinguish between rectangle drag and polygon click
      if (toolMode === 'split' && splitRectStart) {
        if (isDraggingRect && splitRectEnd) {
          // User was dragging - execute split with rectangle
          console.log('[Split MouseUp] Executing rectangle split');
          executeSplitWithRect();
        } else {
          // User clicked (no drag) - add polygon vertex
          console.log('[Split MouseUp] Adding polygon point at', splitRectStart);

          if (!isSplitDrawing) {
            // Start new polygon
            setIsSplitDrawing(true);
            setSplitPolygonPoints([splitRectStart]);
            setSplitMousePos(splitRectStart);
          } else {
            // Add point to existing polygon
            setSplitPolygonPoints(prev => [...prev, splitRectStart]);
          }

          // Reset rectangle state but keep polygon drawing active
          setSplitRectStart(null);
          setSplitRectEnd(null);
          setIsDraggingRect(false);
        }
      }
    },
    [toolMode, createRectStart, createRectEnd, isDraggingCreateRect, isDrawingPolygon, completeRectangleCreate, splitRectStart, splitRectEnd, isDraggingRect, isSplitDrawing, executeSplitWithRect]
  );

  const handleStageDoubleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Handle double-click to complete split polygon
      if (toolMode === 'split' && isSplitDrawing && splitPolygonPoints.length >= MIN_POLYGON_POINTS) {
        e.evt.preventDefault();
        completeSplitPolygon();
        return;
      }

      // Handle double-click to complete create polygon
      if (toolMode !== 'create' || !isDrawingPolygon) return;

      e.evt.preventDefault();

      if (drawingPoints.length >= MIN_POLYGON_POINTS) {
        completePolygon();
      }
    },
    [toolMode, isDrawingPolygon, drawingPoints.length, completePolygon, isSplitDrawing, splitPolygonPoints.length, completeSplitPolygon]
  );

  // Right-click to exit point/line mode or cancel polygon drawing
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();

      // Cancel polygon drawing
      if (isDrawingPolygon) {
        cancelDrawing();
        return;
      }

      // Cancel line drawing
      if (lineStartPoint) {
        setLineStartPoint(null);
        setCalibrationMousePos(null);
        return;
      }

      // Cancel split polygon drawing
      if (isSplitDrawing) {
        cancelSplitDrawing();
        return;
      }

      // Exit point mode or split mode
      if (toolMode === 'point' || toolMode === 'line' || toolMode === 'split') {
        onExitDrawingMode?.();
        return;
      }
    },
    [isDrawingPolygon, cancelDrawing, lineStartPoint, toolMode, onExitDrawingMode, isSplitDrawing, cancelSplitDrawing]
  );

  // Escape key to cancel drawing, calibration, line drawing, or split
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingPolygon || isDraggingCreateRect || createRectStart) {
          e.preventDefault();
          cancelDrawing();
        }
        if (calibrationState.isCalibrating || calibrationState.pointA) {
          e.preventDefault();
          resetCalibration();
        }
        if (lineStartPoint) {
          e.preventDefault();
          setLineStartPoint(null);
          setCalibrationMousePos(null);
        }
        if (isSplitDrawing || isDraggingRect || splitRectStart) {
          e.preventDefault();
          cancelSplitDrawing();
        }
        // Exit split mode on escape
        if (toolMode === 'split') {
          e.preventDefault();
          onExitDrawingMode?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingPolygon, isDraggingCreateRect, createRectStart, cancelDrawing, calibrationState.isCalibrating, calibrationState.pointA, resetCalibration, lineStartPoint, isSplitDrawing, isDraggingRect, splitRectStart, cancelSplitDrawing, toolMode, onExitDrawingMode]);

  // ==========================================================================
  // Detection Handlers
  // ==========================================================================

  const handleDetectionSelect = useCallback(
    (id: string, addToSelection: boolean) => {
      if (toolMode === 'select' || toolMode === 'verify') {
        // If multiSelectMode is enabled, always add to selection
        // (OR with modifier key check from child components)
        onSelectionChange(id, addToSelection || multiSelectMode);
      }
    },
    [toolMode, onSelectionChange, multiSelectMode]
  );

  const handlePolygonUpdate = useCallback(
    (detection: ExtractionDetection, updates: PolygonUpdatePayload) => {
      onDetectionPolygonUpdate?.(detection, updates);
    },
    [onDetectionPolygonUpdate]
  );

  const handleLineUpdate = useCallback(
    (detection: ExtractionDetection, updates: LineUpdatePayload) => {
      onDetectionLineUpdate?.(detection, updates);
    },
    [onDetectionLineUpdate]
  );

  const handlePointUpdate = useCallback(
    (detection: ExtractionDetection, updates: PointUpdatePayload) => {
      onDetectionPointUpdate?.(detection, updates);
    },
    [onDetectionPointUpdate]
  );

  // ==========================================================================
  // Drawing Color for Polygon Preview
  // ==========================================================================

  const drawingColor = DETECTION_CLASS_COLORS[activeClass] || DETECTION_CLASS_COLORS[''];

  // ==========================================================================
  // Cursor Style
  // ==========================================================================

  const getCursor = () => {
    if (isDrawingPolygon) return 'crosshair';
    if (lineStartPoint) return 'crosshair';
    if (isSplitDrawing) return 'crosshair';
    switch (toolMode) {
      case 'pan':
        return 'grab';
      case 'create':
        return 'crosshair';
      case 'line':
        return 'crosshair';
      case 'point':
        return 'crosshair';
      case 'calibrate':
        return 'crosshair';
      case 'split':
        return 'crosshair';
      case 'verify':
        return 'pointer';
      default:
        return 'default';
    }
  };

  // ==========================================================================
  // Sort Detections for Rendering
  // ==========================================================================

  const sortedDetections = [...detections]
    .filter((d) => d.status !== 'deleted')
    .sort((a, b) => {
      // Selected items render on top
      const aSelected = a.id === selectedDetectionId;
      const bSelected = b.id === selectedDetectionId;
      if (aSelected !== bSelected) {
        return aSelected ? 1 : -1;
      }
      // Within same selection state, larger areas render first (smaller on top)
      const aArea = a.pixel_width * a.pixel_height;
      const bArea = b.pixel_width * b.pixel_height;
      return bArea - aArea;
    });

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{
        cursor: getCursor(),
        backgroundColor: '#1a1a2e',
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
      }}
    >
      <Stage
        ref={stageRef}
        width={containerWidth}
        height={containerHeight}
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        draggable={toolMode === 'pan'}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
        onTouchEnd={handleStageMouseUp}
      >
        <Layer>
          {/* Background Image */}
          {image && (
            <KonvaImage
              ref={imageRef}
              image={image}
              width={imageWidth}
              height={imageHeight}
            />
          )}

          {/* Detection Polygons (filter out lines and points) */}
          {sortedDetections
            .filter((d) => d.markup_type !== 'line' && d.markup_type !== 'point')
            .map((detection) => (
              <KonvaDetectionPolygon
                key={detection.id}
                detection={detection}
                isSelected={selectedIds.has(detection.id)}
                isHovered={detection.id === hoveredId}
                scale={scale}
                scaleRatio={scaleRatio}
                onSelect={handleDetectionSelect}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
                onPolygonUpdate={handlePolygonUpdate}
                showArea={true}
                draggable={toolMode === 'select'}
              />
            ))}

          {/* Detection Lines */}
          {sortedDetections
            .filter((d) => d.markup_type === 'line')
            .map((detection) => (
              <KonvaDetectionLine
                key={detection.id}
                detection={detection}
                isSelected={selectedIds.has(detection.id)}
                isHovered={detection.id === hoveredId}
                scale={scale}
                scaleRatio={scaleRatio}
                onSelect={handleDetectionSelect}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
                onLineUpdate={handleLineUpdate}
                showLength={true}
                draggable={toolMode === 'select'}
              />
            ))}

          {/* Detection Points (Count Markers) */}
          {/* Note: corner_inside and corner_outside are excluded - they come from floor plan analysis with unreliable pixel coordinates */}
          {sortedDetections
            .filter((d) => d.markup_type === 'point' && d.class !== 'corner_inside' && d.class !== 'corner_outside')
            .map((detection) => (
              <KonvaDetectionPoint
                key={detection.id}
                detection={detection}
                isSelected={selectedIds.has(detection.id)}
                isHovered={detection.id === hoveredId}
                scale={scale}
                onSelect={handleDetectionSelect}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
                onPointUpdate={handlePointUpdate}
                draggable={toolMode === 'select'}
              />
            ))}

          {/* Point-by-Point Polygon Drawing Preview */}
          {isDrawingPolygon && drawingPoints.length > 0 && (
            <>
              {/* Lines between placed points */}
              <Line
                points={flattenPoints(drawingPoints)}
                stroke={drawingColor}
                strokeWidth={2 / scale}
                dash={[5 / scale, 5 / scale]}
                closed={false}
                listening={false}
              />

              {/* Preview line from last point to mouse */}
              {mousePosition && (
                <Line
                  points={[
                    drawingPoints[drawingPoints.length - 1].x,
                    drawingPoints[drawingPoints.length - 1].y,
                    mousePosition.x,
                    mousePosition.y,
                  ]}
                  stroke={drawingColor}
                  strokeWidth={1 / scale}
                  dash={[3 / scale, 3 / scale]}
                  opacity={0.5}
                  listening={false}
                />
              )}

              {/* Closing line preview when near start */}
              {mousePosition && isNearStart && drawingPoints.length >= MIN_POLYGON_POINTS && (
                <Line
                  points={[
                    mousePosition.x,
                    mousePosition.y,
                    drawingPoints[0].x,
                    drawingPoints[0].y,
                  ]}
                  stroke="#22c55e"
                  strokeWidth={2 / scale}
                  dash={[4 / scale, 4 / scale]}
                  opacity={0.8}
                  listening={false}
                />
              )}

              {/* Placed points */}
              {drawingPoints.map((point, idx) => (
                <Circle
                  key={idx}
                  x={point.x}
                  y={point.y}
                  radius={(idx === 0 ? 6 : 4) / scale}
                  fill={idx === 0 && isNearStart ? '#22c55e' : drawingColor}
                  stroke="#ffffff"
                  strokeWidth={1.5 / scale}
                  listening={false}
                  shadowColor={idx === 0 && isNearStart ? '#22c55e' : undefined}
                  shadowBlur={idx === 0 && isNearStart ? 8 / scale : 0}
                  shadowOpacity={idx === 0 && isNearStart ? 0.8 : 0}
                />
              ))}
            </>
          )}

          {/* Create Rectangle Preview (when dragging in create mode) */}
          {isDraggingCreateRect && createRectStart && createRectEnd && (
            <Rect
              x={Math.min(createRectStart.x, createRectEnd.x)}
              y={Math.min(createRectStart.y, createRectEnd.y)}
              width={Math.abs(createRectEnd.x - createRectStart.x)}
              height={Math.abs(createRectEnd.y - createRectStart.y)}
              stroke={drawingColor}
              strokeWidth={2 / scale}
              dash={[8 / scale, 4 / scale]}
              fill={`${drawingColor}26`}
              listening={false}
            />
          )}

          {/* Calibration Line Overlay */}
          {toolMode === 'calibrate' && calibrationState.pointA && (
            <>
              {/* Point A marker */}
              <Circle
                x={calibrationState.pointA.x}
                y={calibrationState.pointA.y}
                radius={6 / scale}
                fill="#FF00FF"
                stroke="#FFFFFF"
                strokeWidth={2 / scale}
                listening={false}
              />

              {/* Preview line from Point A to mouse position */}
              {calibrationMousePos && !calibrationState.pointB && (
                <Line
                  points={[
                    calibrationState.pointA.x,
                    calibrationState.pointA.y,
                    calibrationMousePos.x,
                    calibrationMousePos.y,
                  ]}
                  stroke="#FF00FF"
                  strokeWidth={3 / scale}
                  dash={[10 / scale, 5 / scale]}
                  listening={false}
                />
              )}

              {/* Final line and Point B (when completed) */}
              {calibrationState.pointB && (
                <>
                  <Line
                    points={[
                      calibrationState.pointA.x,
                      calibrationState.pointA.y,
                      calibrationState.pointB.x,
                      calibrationState.pointB.y,
                    ]}
                    stroke="#FF00FF"
                    strokeWidth={3 / scale}
                    dash={[10 / scale, 5 / scale]}
                    listening={false}
                  />
                  <Circle
                    x={calibrationState.pointB.x}
                    y={calibrationState.pointB.y}
                    radius={6 / scale}
                    fill="#FF00FF"
                    stroke="#FFFFFF"
                    strokeWidth={2 / scale}
                    listening={false}
                  />
                </>
              )}
            </>
          )}

          {/* Line Drawing Preview */}
          {toolMode === 'line' && lineStartPoint && (
            <>
              {/* Start point marker */}
              <Circle
                x={lineStartPoint.x}
                y={lineStartPoint.y}
                radius={6 / scale}
                fill={drawingColor}
                stroke="#FFFFFF"
                strokeWidth={2 / scale}
                listening={false}
              />

              {/* Preview line from start to mouse position */}
              {calibrationMousePos && (
                <>
                  <Line
                    points={[
                      lineStartPoint.x,
                      lineStartPoint.y,
                      calibrationMousePos.x,
                      calibrationMousePos.y,
                    ]}
                    stroke={drawingColor}
                    strokeWidth={3 / scale}
                    dash={[10 / scale, 5 / scale]}
                    lineCap="round"
                    listening={false}
                  />
                  <Circle
                    x={calibrationMousePos.x}
                    y={calibrationMousePos.y}
                    radius={5 / scale}
                    fill={drawingColor}
                    stroke="#FFFFFF"
                    strokeWidth={1.5 / scale}
                    opacity={0.7}
                    listening={false}
                  />
                </>
              )}
            </>
          )}

          {/* Split Polygon Preview */}
          {isSplitDrawing && splitPolygonPoints.length > 0 && (
            <>
              {/* Completed edges (solid red) */}
              {splitPolygonPoints.length >= 2 && (
                <Line
                  points={splitPolygonPoints.flatMap(p => [p.x, p.y])}
                  stroke="#ef4444"
                  strokeWidth={2 / scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              )}

              {/* Preview line to cursor (dashed red) */}
              {splitMousePos && splitPolygonPoints.length >= 1 && (
                <Line
                  points={[
                    splitPolygonPoints[splitPolygonPoints.length - 1].x,
                    splitPolygonPoints[splitPolygonPoints.length - 1].y,
                    splitMousePos.x,
                    splitMousePos.y,
                  ]}
                  stroke="#ef4444"
                  strokeWidth={2 / scale}
                  dash={[5 / scale, 5 / scale]}
                  lineCap="round"
                  listening={false}
                />
              )}

              {/* Closing line preview (when near start) */}
              {splitMousePos && isSplitNearStart && (
                <Line
                  points={[
                    splitMousePos.x,
                    splitMousePos.y,
                    splitPolygonPoints[0].x,
                    splitPolygonPoints[0].y,
                  ]}
                  stroke="#22c55e"
                  strokeWidth={2 / scale}
                  dash={[5 / scale, 5 / scale]}
                  lineCap="round"
                  listening={false}
                />
              )}

              {/* Vertex points */}
              {splitPolygonPoints.map((point, idx) => (
                <Circle
                  key={`split-point-${idx}`}
                  x={point.x}
                  y={point.y}
                  radius={idx === 0 ? 8 / scale : 5 / scale}
                  fill={idx === 0 ? (isSplitNearStart ? '#22c55e' : '#ef4444') : '#ef4444'}
                  stroke="#FFFFFF"
                  strokeWidth={2 / scale}
                  listening={false}
                />
              ))}

              {/* Cursor position indicator */}
              {splitMousePos && !isSplitNearStart && (
                <Circle
                  x={splitMousePos.x}
                  y={splitMousePos.y}
                  radius={4 / scale}
                  fill="#ef4444"
                  opacity={0.5}
                  listening={false}
                />
              )}
            </>
          )}

          {/* Split Rectangle Preview (when dragging) */}
          {isDraggingRect && splitRectStart && splitRectEnd && (
            <Rect
              x={Math.min(splitRectStart.x, splitRectEnd.x)}
              y={Math.min(splitRectStart.y, splitRectEnd.y)}
              width={Math.abs(splitRectEnd.x - splitRectStart.x)}
              height={Math.abs(splitRectEnd.y - splitRectStart.y)}
              stroke="#ef4444"
              strokeWidth={2 / scale}
              dash={[8 / scale, 4 / scale]}
              fill="rgba(239, 68, 68, 0.15)"
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Scale Indicator */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-md text-sm font-mono">
        {Math.round(scale * 100)}%
      </div>

      {/* Loading State */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <div className="text-gray-400">Loading image...</div>
        </div>
      )}
    </div>
  );
}
