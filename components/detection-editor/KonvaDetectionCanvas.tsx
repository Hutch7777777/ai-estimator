'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import type {
  ExtractionPage,
  ExtractionDetection,
  DetectionClass,
  ToolMode,
  PolygonPoint,
} from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS } from '@/lib/types/extraction';
import KonvaDetectionPolygon, { type PolygonUpdatePayload } from './KonvaDetectionPolygon';
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

export interface KonvaDetectionCanvasProps {
  page: ExtractionPage;
  detections: ExtractionDetection[];
  selectedDetectionId: string | null;
  toolMode: ToolMode;
  activeClass: DetectionClass;
  onSelectionChange: (id: string | null) => void;
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
  }) => void;
  onDetectionPolygonUpdate?: (
    detection: ExtractionDetection,
    updates: PolygonUpdatePayload
  ) => void;
  containerWidth: number;
  containerHeight: number;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 1.1;
const CLOSE_THRESHOLD = 15; // Pixels to detect "near starting point"
const MIN_POLYGON_POINTS = 3;

// =============================================================================
// Component
// =============================================================================

export default function KonvaDetectionCanvas({
  page,
  detections,
  selectedDetectionId,
  toolMode,
  activeClass,
  onSelectionChange,
  onDetectionMove,
  onDetectionResize,
  onDetectionCreate,
  onDetectionPolygonUpdate,
  containerWidth,
  containerHeight,
}: KonvaDetectionCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const imageRef = useRef<Konva.Image>(null);

  // Image state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Viewport state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Point-by-point polygon drawing state
  const [drawingPoints, setDrawingPoints] = useState<PolygonPoint[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [mousePosition, setMousePosition] = useState<PolygonPoint | null>(null);
  const [isNearStart, setIsNearStart] = useState(false);

  // Hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Get image dimensions
  const imageWidth = page.original_width || 1920;
  const imageHeight = page.original_height || 1080;
  const imageUrl = page.original_image_url || page.image_url;

  // ==========================================================================
  // Load Image
  // ==========================================================================

  useEffect(() => {
    if (!imageUrl) return;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setImageLoaded(true);

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

  // Cancel drawing
  const cancelDrawing = useCallback(() => {
    setDrawingPoints([]);
    setIsDrawingPolygon(false);
    setMousePosition(null);
    setIsNearStart(false);
  }, []);

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Only handle clicks on the stage/image itself
      if (e.target !== stageRef.current && e.target !== imageRef.current) {
        return;
      }

      // Clear selection when clicking on empty space (in select mode)
      if (toolMode === 'select') {
        onSelectionChange(null);
        return;
      }

      // Point-by-point polygon drawing in create mode
      if (toolMode === 'create') {
        const stage = stageRef.current;
        if (!stage) return;

        // Use getRelativePointerPosition() which returns coordinates in the Stage's
        // local coordinate system (accounts for scale and position transforms)
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        // Pointer is now directly in image-pixel coordinates
        const clickPoint = { x: pointer.x, y: pointer.y };

        if (!isDrawingPolygon) {
          // Start new polygon
          setIsDrawingPolygon(true);
          setDrawingPoints([clickPoint]);
        } else {
          // Check if clicking near start point to close
          if (drawingPoints.length >= MIN_POLYGON_POINTS && isNearStart) {
            completePolygon();
          } else {
            // Add point to polygon
            setDrawingPoints((prev) => [...prev, clickPoint]);
          }
        }
      }
    },
    [toolMode, onSelectionChange, isDrawingPolygon, drawingPoints.length, isNearStart, completePolygon]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (toolMode !== 'create') return;

      const stage = stageRef.current;
      if (!stage) return;

      // Use getRelativePointerPosition() for consistent coordinate system
      const pointer = stage.getRelativePointerPosition();
      if (!pointer) return;

      // Pointer is now directly in image-pixel coordinates
      const currentPoint = { x: pointer.x, y: pointer.y };

      setMousePosition(currentPoint);

      // Check if near starting point
      if (isDrawingPolygon && drawingPoints.length >= MIN_POLYGON_POINTS) {
        setIsNearStart(isPointNearStart(currentPoint, drawingPoints[0]));
      } else {
        setIsNearStart(false);
      }
    },
    [toolMode, isDrawingPolygon, drawingPoints, isPointNearStart]
  );

  const handleStageDoubleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (toolMode !== 'create' || !isDrawingPolygon) return;

      e.evt.preventDefault();

      if (drawingPoints.length >= MIN_POLYGON_POINTS) {
        completePolygon();
      }
    },
    [toolMode, isDrawingPolygon, drawingPoints.length, completePolygon]
  );

  // Escape key to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawingPolygon) {
        e.preventDefault();
        cancelDrawing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingPolygon, cancelDrawing]);

  // ==========================================================================
  // Detection Handlers
  // ==========================================================================

  const handleDetectionSelect = useCallback(
    (id: string) => {
      if (toolMode === 'select' || toolMode === 'verify') {
        onSelectionChange(id);
      }
    },
    [toolMode, onSelectionChange]
  );

  const handlePolygonUpdate = useCallback(
    (detection: ExtractionDetection, updates: PolygonUpdatePayload) => {
      onDetectionPolygonUpdate?.(detection, updates);
    },
    [onDetectionPolygonUpdate]
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
    switch (toolMode) {
      case 'pan':
        return 'grab';
      case 'create':
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
      className="w-full h-full overflow-hidden bg-neutral-900"
      style={{ cursor: getCursor() }}
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
        onDblClick={handleStageDoubleClick}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
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

          {/* Detection Polygons */}
          {sortedDetections.map((detection) => (
            <KonvaDetectionPolygon
              key={detection.id}
              detection={detection}
              isSelected={detection.id === selectedDetectionId}
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
