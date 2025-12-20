"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  Point,
  Polygon,
  CountMarker,
  LinearMeasurement,
  ToolMode,
  ViewTransform,
  MarkupMaterial,
} from "./types";
import { hitTestAll } from "./hitTesting";

interface CADViewerProps {
  imageUrl: string;
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
  currentTool: ToolMode;
  selectedMaterial: MarkupMaterial;
  pixelsPerFoot: number;
  viewTransform: ViewTransform;
  onPolygonAdd: (polygon: Polygon) => void;
  onMarkerAdd: (marker: CountMarker) => void;
  onMeasurementAdd: (measurement: LinearMeasurement) => void;
  onViewTransformChange: (transform: ViewTransform) => void;
  onPolygonSelect: (id: string | null) => void;
  selectedPolygonId: string | null;
  onMarkerSelect: (id: string | null) => void;
  selectedMarkerId: string | null;
  onMeasurementSelect: (id: string | null) => void;
  selectedMeasurementId: string | null;
  onDeleteSelected?: () => void;
  onCalibrationComplete?: (pixelDistance: number, startPoint: Point, endPoint: Point) => void;
}

export function CADViewer({
  imageUrl,
  polygons,
  markers,
  measurements,
  currentTool,
  selectedMaterial,
  pixelsPerFoot,
  viewTransform,
  onPolygonAdd,
  onMarkerAdd,
  onMeasurementAdd,
  onViewTransformChange,
  onPolygonSelect,
  selectedPolygonId,
  onMarkerSelect,
  selectedMarkerId,
  onMeasurementSelect,
  selectedMeasurementId,
  onDeleteSelected,
  onCalibrationComplete,
}: CADViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Image state - React manages the img element naturally
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  // Drawing state
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [measurementStart, setMeasurementStart] = useState<Point | null>(null);
  const [calibrationStart, setCalibrationStart] = useState<Point | null>(null);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Handle image load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    console.log("[CADViewer] Image loaded via <img> element:", img.naturalWidth, "x", img.naturalHeight);
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
    setIsLoading(false);
    setLoadError(null);
  }, []);

  // Handle image error
  const handleImageError = useCallback(() => {
    console.error("[CADViewer] Image failed to load");
    setImageLoaded(false);
    setLoadError("Failed to load image. Please try a different file.");
    setIsLoading(false);
  }, []);

  // Reset state when imageUrl changes
  useEffect(() => {
    if (imageUrl) {
      setIsLoading(true);
      setImageLoaded(false);
      setLoadError(null);
    } else {
      setIsLoading(false);
      setImageLoaded(false);
      setLoadError(null);
      setImageDimensions({ width: 0, height: 0 });
    }
  }, [imageUrl]);

  // Calculate area using Shoelace formula
  const calculateArea = useCallback(
    (points: Point[]): number => {
      if (points.length < 3) return 0;

      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
      }

      const areaPixels = Math.abs(area / 2);
      const areaSquareFeet = areaPixels / (pixelsPerFoot * pixelsPerFoot);
      return Math.round(areaSquareFeet * 100) / 100; // Round to 2 decimals
    },
    [pixelsPerFoot]
  );

  // Calculate distance
  const calculateDistance = useCallback(
    (p1: Point, p2: Point): number => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distancePixels = Math.sqrt(dx * dx + dy * dy);
      const distanceFeet = distancePixels / pixelsPerFoot;
      return Math.round(distanceFeet * 100) / 100;
    },
    [pixelsPerFoot]
  );

  // Transform screen coordinates to image coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const rect = container.getBoundingClientRect();
      const x = (screenX - rect.left - viewTransform.offsetX) / viewTransform.scale;
      const y = (screenY - rect.top - viewTransform.offsetY) / viewTransform.scale;
      return { x, y };
    },
    [viewTransform]
  );

  // Get polygon centroid for label placement
  const getPolygonCentroid = (points: Point[]): Point => {
    const n = points.length;
    let cx = 0;
    let cy = 0;
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    return { x: cx / n, y: cy / n };
  };

  // Check if point is near first point (for closing polygon)
  const isNearFirstPoint = (point: Point, firstPoint: Point): boolean => {
    const threshold = 10 / viewTransform.scale; // 10 pixels in canvas space
    const dx = point.x - firstPoint.x;
    const dy = point.y - firstPoint.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  };

  // Draw an arrowhead pointing from 'from' to 'to'
  const drawArrowhead = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    size: number,
    color: string
  ) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const arrowAngle = Math.PI / 6; // 30 degrees

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - size * Math.cos(angle - arrowAngle),
      to.y - size * Math.sin(angle - arrowAngle)
    );
    ctx.lineTo(
      to.x - size * Math.cos(angle + arrowAngle),
      to.y - size * Math.sin(angle + arrowAngle)
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Render canvas - ONLY draws markups, NOT the image
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Clear canvas (transparent background)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply transforms to match the image transform
    ctx.save();
    ctx.translate(viewTransform.offsetX, viewTransform.offsetY);
    ctx.scale(viewTransform.scale, viewTransform.scale);

    // Draw completed polygons
    polygons.forEach((polygon) => {
      if (polygon.points.length < 2) return;

      const color = polygon.material.color;
      const isSelected = polygon.id === selectedPolygonId;

      // Draw fill (25% opacity)
      ctx.beginPath();
      ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
      for (let i = 1; i < polygon.points.length; i++) {
        ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = color + "40";
      ctx.fill();

      // Draw outline
      ctx.strokeStyle = isSelected ? "#000000" : color;
      ctx.lineWidth = isSelected ? 3 / viewTransform.scale : 2 / viewTransform.scale;
      ctx.stroke();

      // Draw area label
      if (polygon.isComplete && polygon.area > 0) {
        const centroid = getPolygonCentroid(polygon.points);
        ctx.save();
        ctx.font = `${16 / viewTransform.scale}px sans-serif`;
        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${polygon.area} SF`, centroid.x, centroid.y);
        ctx.restore();
      }
    });

    // Draw current polygon being drawn
    if (currentPoints.length > 0 && currentTool === "draw") {
      const color = selectedMaterial.color;

      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      }
      if (hoverPoint) {
        ctx.lineTo(hoverPoint.x, hoverPoint.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / viewTransform.scale;
      ctx.stroke();

      // Draw points
      currentPoints.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4 / viewTransform.scale, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? "#00FF00" : color;
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1 / viewTransform.scale;
        ctx.stroke();
      });
    }

    // Draw count markers
    markers.forEach((marker) => {
      const color = marker.material.color;
      const isSelected = marker.id === selectedMarkerId;

      // Draw selection ring if selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(marker.position.x, marker.position.y, 12 / viewTransform.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3 / viewTransform.scale;
        ctx.stroke();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5 / viewTransform.scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(marker.position.x, marker.position.y, 8 / viewTransform.scale, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5 / viewTransform.scale;
      ctx.stroke();

      // Draw count number
      ctx.save();
      ctx.font = `bold ${9 / viewTransform.scale}px sans-serif`;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(marker.count.toString(), marker.position.x, marker.position.y);
      ctx.restore();
    });

    // Draw measurements
    measurements.forEach((measurement) => {
      const color = measurement.material.color;
      const isSelected = measurement.id === selectedMeasurementId;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(measurement.start.x, measurement.start.y);
      ctx.lineTo(measurement.end.x, measurement.end.y);
      ctx.strokeStyle = isSelected ? "#000000" : color;
      ctx.lineWidth = isSelected ? 4 / viewTransform.scale : 2 / viewTransform.scale;
      ctx.stroke();

      // Draw colored line on top if selected
      if (isSelected) {
        ctx.beginPath();
        ctx.moveTo(measurement.start.x, measurement.start.y);
        ctx.lineTo(measurement.end.x, measurement.end.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / viewTransform.scale;
        ctx.stroke();
      }

      // Draw arrow endpoints (arrows point outward from midpoint)
      const arrowSize = isSelected ? 12 / viewTransform.scale : 10 / viewTransform.scale;

      // Arrow at start pointing away from end
      drawArrowhead(ctx, measurement.end, measurement.start, arrowSize, color);

      // Arrow at end pointing away from start
      drawArrowhead(ctx, measurement.start, measurement.end, arrowSize, color);

      // Selection rings around arrow tips if selected
      if (isSelected) {
        [measurement.start, measurement.end].forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 8 / viewTransform.scale, 0, Math.PI * 2);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 3 / viewTransform.scale;
          ctx.stroke();
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1 / viewTransform.scale;
          ctx.stroke();
        });
      }

      // Draw length label
      const midX = (measurement.start.x + measurement.end.x) / 2;
      const midY = (measurement.start.y + measurement.end.y) / 2;
      ctx.save();
      ctx.font = `${isSelected ? "bold " : ""}${14 / viewTransform.scale}px sans-serif`;
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${measurement.lengthFeet} LF`, midX, midY - 5 / viewTransform.scale);
      ctx.restore();
    });

    // Draw measurement preview
    if (currentTool === "linear" && measurementStart && hoverPoint) {
      const color = selectedMaterial.color;
      ctx.beginPath();
      ctx.moveTo(measurementStart.x, measurementStart.y);
      ctx.lineTo(hoverPoint.x, hoverPoint.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / viewTransform.scale;
      ctx.setLineDash([5 / viewTransform.scale, 5 / viewTransform.scale]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw arrow at hover point
      const arrowSize = 10 / viewTransform.scale;
      drawArrowhead(ctx, measurementStart, hoverPoint, arrowSize, color);
    }

    // Draw calibration preview (orange color for distinction)
    if (currentTool === "calibrate") {
      const calibrationColor = "#F97316"; // Orange

      // Draw start point if set
      if (calibrationStart) {
        ctx.beginPath();
        ctx.arc(calibrationStart.x, calibrationStart.y, 6 / viewTransform.scale, 0, Math.PI * 2);
        ctx.fillStyle = calibrationColor;
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2 / viewTransform.scale;
        ctx.stroke();

        // Draw line to hover point
        if (hoverPoint) {
          ctx.beginPath();
          ctx.moveTo(calibrationStart.x, calibrationStart.y);
          ctx.lineTo(hoverPoint.x, hoverPoint.y);
          ctx.strokeStyle = calibrationColor;
          ctx.lineWidth = 2 / viewTransform.scale;
          ctx.setLineDash([5 / viewTransform.scale, 5 / viewTransform.scale]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw end point preview
          ctx.beginPath();
          ctx.arc(hoverPoint.x, hoverPoint.y, 6 / viewTransform.scale, 0, Math.PI * 2);
          ctx.fillStyle = calibrationColor;
          ctx.globalAlpha = 0.5;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 2 / viewTransform.scale;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [
    polygons,
    markers,
    measurements,
    currentPoints,
    hoverPoint,
    measurementStart,
    calibrationStart,
    viewTransform,
    selectedMaterial,
    currentTool,
    selectedPolygonId,
    selectedMarkerId,
    selectedMeasurementId,
  ]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToCanvas(e.clientX, e.clientY);

    if (currentTool === "select") {
      const tolerance = 15 / viewTransform.scale; // 15 pixels in screen space
      const hit = hitTestAll(point, polygons, markers, measurements, tolerance);

      if (hit) {
        if (hit.type === "polygon") {
          onPolygonSelect(hit.id);
          onMarkerSelect(null);
          onMeasurementSelect(null);
        } else if (hit.type === "marker") {
          onPolygonSelect(null);
          onMarkerSelect(hit.id);
          onMeasurementSelect(null);
        } else if (hit.type === "measurement") {
          onPolygonSelect(null);
          onMarkerSelect(null);
          onMeasurementSelect(hit.id);
        }
      } else {
        // Click on empty space - deselect all
        onPolygonSelect(null);
        onMarkerSelect(null);
        onMeasurementSelect(null);
      }
      return;
    }

    if (currentTool === "draw") {
      // Check if clicking near first point to close polygon
      if (currentPoints.length >= 3 && isNearFirstPoint(point, currentPoints[0])) {
        completePolygon();
        return;
      }

      // Add point to current polygon
      setCurrentPoints([...currentPoints, point]);
    } else if (currentTool === "count") {
      // Add count marker (pageNumber will be set by parent component)
      const marker: CountMarker = {
        id: `marker-${Date.now()}`,
        pageNumber: 1, // Placeholder - parent will override
        position: point,
        material: selectedMaterial,
        label: selectedMaterial.productName || selectedMaterial.category || selectedMaterial.trade,
        count: 1,
      };
      onMarkerAdd(marker);
    } else if (currentTool === "linear") {
      if (!measurementStart) {
        setMeasurementStart(point);
      } else {
        // Complete measurement (pageNumber will be set by parent component)
        const lengthFeet = calculateDistance(measurementStart, point);
        const measurement: LinearMeasurement = {
          id: `measurement-${Date.now()}`,
          pageNumber: 1, // Placeholder - parent will override
          start: measurementStart,
          end: point,
          lengthFeet,
          material: selectedMaterial,
        };
        onMeasurementAdd(measurement);
        setMeasurementStart(null);
      }
    } else if (currentTool === "calibrate") {
      if (!calibrationStart) {
        // First click - set start point
        setCalibrationStart(point);
      } else {
        // Second click - calculate pixel distance and callback
        const dx = point.x - calibrationStart.x;
        const dy = point.y - calibrationStart.y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);

        if (onCalibrationComplete) {
          onCalibrationComplete(pixelDistance, calibrationStart, point);
        }
        setCalibrationStart(null);
      }
    }
  };

  // Handle double click (complete polygon)
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (currentTool === "draw" && currentPoints.length >= 3) {
      completePolygon();
    }
  };

  // Complete polygon (pageNumber will be set by parent component)
  const completePolygon = () => {
    if (currentPoints.length < 3) return;

    const area = calculateArea(currentPoints);
    const polygon: Polygon = {
      id: `polygon-${Date.now()}`,
      pageNumber: 1, // Placeholder - parent will override
      points: [...currentPoints],
      material: selectedMaterial,
      area,
      isComplete: true,
    };

    onPolygonAdd(polygon);
    setCurrentPoints([]);
    setHoverPoint(null);
  };

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToCanvas(e.clientX, e.clientY);

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      onViewTransformChange({
        ...viewTransform,
        offsetX: viewTransform.offsetX + dx,
        offsetY: viewTransform.offsetY + dy,
      });
      setPanStart({ x: e.clientX, y: e.clientY });
    } else if (currentTool === "draw" || currentTool === "linear" || currentTool === "calibrate") {
      setHoverPoint(point);
    }
  };

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.altKey || e.button === 1) {
      // Alt+click or middle mouse button for panning
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Resize canvas to container using ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width || 800;
      const height = rect.height || 600;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        console.log("[CADViewer] Canvas resized:", width, "x", height);
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle wheel (zoom) with non-passive listener to properly prevent default
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate point in image coordinates before zoom
      const imageX = (mouseX - viewTransform.offsetX) / viewTransform.scale;
      const imageY = (mouseY - viewTransform.offsetY) / viewTransform.scale;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(10, viewTransform.scale * delta));

      // Adjust offset to keep the point under the mouse in the same position
      const newOffsetX = mouseX - imageX * newScale;
      const newOffsetY = mouseY - imageY * newScale;

      console.log("[CADViewer] Wheel zoom - scale:", newScale.toFixed(2));

      onViewTransformChange({
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY,
      });
    };

    container.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => container.removeEventListener("wheel", handleWheelEvent);
  }, [viewTransform, onViewTransformChange]);

  // Handle Delete key for removing selected markup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Check for Delete or Backspace key
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPolygonId || selectedMarkerId || selectedMeasurementId) {
          e.preventDefault();
          if (onDeleteSelected) {
            onDeleteSelected();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPolygonId, selectedMarkerId, selectedMeasurementId, onDeleteSelected]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-100 min-h-[400px] overflow-hidden"
    >
      {/* Image as background - React manages this naturally */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt="CAD drawing"
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            transform: `translate(${viewTransform.offsetX}px, ${viewTransform.offsetY}px) scale(${viewTransform.scale})`,
            transformOrigin: "top left",
            display: isLoading || loadError ? "none" : "block",
          }}
          onLoad={handleImageLoad}
          onError={handleImageError}
          draggable={false}
        />
      )}

      {/* Canvas overlay for markups only - transparent background */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 cursor-crosshair"
        style={{ background: "transparent" }}
        onClick={handleCanvasClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-600">Loading image...</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {loadError && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3 text-center p-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-600 font-medium">{loadError}</p>
            <p className="text-xs text-gray-500">Try uploading a PNG or JPG image</p>
          </div>
        </div>
      )}

      {/* Empty State - only show when no image and not loading/error */}
      {!imageUrl && !isLoading && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <p>Upload a drawing to begin markup</p>
        </div>
      )}

      {/* Calibration Instructions */}
      {currentTool === "calibrate" && imageLoaded && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg">
          <p className="text-sm font-medium">
            {calibrationStart
              ? "Click the second point on the known dimension"
              : "Click the first point on a known dimension"}
          </p>
        </div>
      )}
    </div>
  );
}
