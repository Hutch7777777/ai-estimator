// Polygon Utility Functions for Detection Editor
// Handles polygon math, coordinate conversion, and measurements

import { isPolygonWithHoles, type PolygonWithHoles, type PolygonPoints } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface PolygonPoint {
  x: number;
  y: number;
}

export interface BoundingBox {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Extract simple polygon points from any polygon format.
 * For PolygonWithHoles, returns the outer boundary.
 * For simple arrays, returns as-is.
 */
function extractSimplePoints(points: PolygonPoint[] | PolygonWithHoles | PolygonPoints | null | undefined): PolygonPoint[] {
  if (!points) return [];
  if (isPolygonWithHoles(points)) {
    return points.outer as PolygonPoint[];
  }
  if (Array.isArray(points)) {
    return points as PolygonPoint[];
  }
  console.warn('[polygonUtils] extractSimplePoints: Unexpected points format', points);
  return [];
}

// =============================================================================
// Rectangle to Polygon Conversion
// =============================================================================

/**
 * Convert a rectangle detection (center-based) to 4 polygon points.
 * Points are in clockwise order starting from top-left.
 */
export function rectToPolygonPoints(detection: {
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
}): PolygonPoint[] {
  const halfWidth = detection.pixel_width / 2;
  const halfHeight = detection.pixel_height / 2;
  const cx = detection.pixel_x;
  const cy = detection.pixel_y;

  return [
    { x: cx - halfWidth, y: cy - halfHeight }, // top-left
    { x: cx + halfWidth, y: cy - halfHeight }, // top-right
    { x: cx + halfWidth, y: cy + halfHeight }, // bottom-right
    { x: cx - halfWidth, y: cy + halfHeight }, // bottom-left
  ];
}

// =============================================================================
// Area Calculations (Shoelace Formula)
// =============================================================================

/**
 * Calculate polygon area in pixels using the Shoelace formula.
 * Works for any simple polygon (non-self-intersecting) with 3+ points.
 * Returns absolute area (always positive).
 *
 * DEFENSIVE: Accepts both simple polygon arrays and PolygonWithHoles.
 * For PolygonWithHoles, uses the outer boundary only.
 */
export function calculatePolygonArea(points: PolygonPoint[] | PolygonWithHoles | PolygonPoints | null | undefined): number {
  const simplePoints = extractSimplePoints(points);
  if (simplePoints.length < 3) return 0;

  let area = 0;
  const n = simplePoints.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += simplePoints[i].x * simplePoints[j].y;
    area -= simplePoints[j].x * simplePoints[i].y;
  }

  return Math.abs(area / 2);
}

/**
 * Calculate polygon area in square feet.
 * @param points - Polygon vertices in pixel coordinates
 * @param scaleRatio - Pixels per foot (e.g., 64 means 64 pixels = 1 foot)
 */
export function calculatePolygonAreaSf(
  points: PolygonPoint[],
  scaleRatio: number
): number {
  const pixelArea = calculatePolygonArea(points);
  // Convert pixel^2 to ft^2: divide by (pixels/foot)^2
  return pixelArea / (scaleRatio * scaleRatio);
}

// =============================================================================
// Perimeter Calculations
// =============================================================================

/**
 * Calculate the distance between two points.
 */
function distance(p1: PolygonPoint, p2: PolygonPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate polygon perimeter in pixels.
 * Sum of all edge lengths.
 *
 * DEFENSIVE: Accepts both simple polygon arrays and PolygonWithHoles.
 * For PolygonWithHoles, uses the outer boundary only.
 */
export function calculatePolygonPerimeter(points: PolygonPoint[] | PolygonWithHoles | PolygonPoints | null | undefined): number {
  const simplePoints = extractSimplePoints(points);
  if (simplePoints.length < 2) return 0;

  let perimeter = 0;
  const n = simplePoints.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perimeter += distance(simplePoints[i], simplePoints[j]);
  }

  return perimeter;
}

/**
 * Calculate polygon perimeter in linear feet.
 * @param points - Polygon vertices in pixel coordinates
 * @param scaleRatio - Pixels per foot
 */
export function calculatePolygonPerimeterLf(
  points: PolygonPoint[],
  scaleRatio: number
): number {
  const pixelPerimeter = calculatePolygonPerimeter(points);
  return pixelPerimeter / scaleRatio;
}

// =============================================================================
// Bounding Box
// =============================================================================

/**
 * Calculate the axis-aligned bounding box of a polygon.
 * Used for label positioning and backwards compatibility with rectangle fields.
 *
 * DEFENSIVE: Accepts both simple polygon arrays and PolygonWithHoles.
 * For PolygonWithHoles, uses the outer boundary for bounding box calculation.
 */
export function getPolygonBoundingBox(points: PolygonPoint[] | PolygonWithHoles | PolygonPoints | null | undefined): BoundingBox {
  // Extract simple points from any format (handles PolygonWithHoles)
  const simplePoints = extractSimplePoints(points);

  if (simplePoints.length === 0) {
    return {
      centerX: 0,
      centerY: 0,
      width: 0,
      height: 0,
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };
  }

  const xs = simplePoints.map((p) => p.x);
  const ys = simplePoints.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    maxX,
    maxY,
  };
}

// =============================================================================
// Centroid (Center of Mass)
// =============================================================================

/**
 * Calculate the centroid (geometric center) of a polygon.
 * Better for label positioning than bounding box center for irregular shapes.
 *
 * DEFENSIVE: Accepts both simple polygon arrays and PolygonWithHoles.
 * For PolygonWithHoles, uses the outer boundary only.
 */
export function getPolygonCentroid(points: PolygonPoint[] | PolygonWithHoles | PolygonPoints | null | undefined): PolygonPoint {
  const simplePoints = extractSimplePoints(points);

  if (simplePoints.length === 0) {
    return { x: 0, y: 0 };
  }

  if (simplePoints.length === 1) {
    return { x: simplePoints[0].x, y: simplePoints[0].y };
  }

  if (simplePoints.length === 2) {
    return {
      x: (simplePoints[0].x + simplePoints[1].x) / 2,
      y: (simplePoints[0].y + simplePoints[1].y) / 2,
    };
  }

  // For 3+ points, use the centroid formula
  let cx = 0;
  let cy = 0;
  let signedArea = 0;
  const n = simplePoints.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = simplePoints[i].x;
    const y0 = simplePoints[i].y;
    const x1 = simplePoints[j].x;
    const y1 = simplePoints[j].y;

    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  signedArea *= 0.5;

  // Handle degenerate case where area is 0
  if (Math.abs(signedArea) < 0.0001) {
    // Fall back to simple average
    const avgX = simplePoints.reduce((sum, p) => sum + p.x, 0) / n;
    const avgY = simplePoints.reduce((sum, p) => sum + p.y, 0) / n;
    return { x: avgX, y: avgY };
  }

  cx /= 6 * signedArea;
  cy /= 6 * signedArea;

  return { x: cx, y: cy };
}

// =============================================================================
// Konva Helpers
// =============================================================================

/**
 * Flatten polygon points array for Konva Line component.
 * Converts [{x, y}, {x, y}, ...] to [x, y, x, y, ...]
 *
 * DEFENSIVE: Accepts both simple polygon arrays and PolygonWithHoles.
 * For PolygonWithHoles, uses the outer boundary only.
 */
export function flattenPoints(points: PolygonPoint[] | PolygonWithHoles | PolygonPoints | null | undefined): number[] {
  const simplePoints = extractSimplePoints(points);
  return simplePoints.flatMap((p) => [p.x, p.y]);
}

// =============================================================================
// Edge Operations (Add Point)
// =============================================================================

/**
 * Find the closest point on a polygon edge to a given position.
 * Used for adding new points by clicking on edges.
 *
 * @param points - Polygon vertices
 * @param clickPos - Click position in same coordinate system
 * @returns The edge index and the closest point on that edge
 */
export function findClosestEdge(
  points: PolygonPoint[],
  clickPos: PolygonPoint
): { edgeIndex: number; point: PolygonPoint; distance: number } {
  if (points.length < 2) {
    return { edgeIndex: 0, point: clickPos, distance: Infinity };
  }

  let closestEdge = 0;
  let closestPoint: PolygonPoint = clickPos;
  let minDistance = Infinity;

  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = points[i];
    const p2 = points[j];

    // Find closest point on line segment p1-p2 to clickPos
    const closest = closestPointOnSegment(p1, p2, clickPos);
    const dist = distance(closest, clickPos);

    if (dist < minDistance) {
      minDistance = dist;
      closestEdge = i;
      closestPoint = closest;
    }
  }

  return { edgeIndex: closestEdge, point: closestPoint, distance: minDistance };
}

/**
 * Find the closest point on a line segment to a given point.
 */
function closestPointOnSegment(
  p1: PolygonPoint,
  p2: PolygonPoint,
  p: PolygonPoint
): PolygonPoint {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // p1 and p2 are the same point
    return { x: p1.x, y: p1.y };
  }

  // Project p onto the line defined by p1-p2
  let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lengthSq;

  // Clamp t to [0, 1] to stay on the segment
  t = Math.max(0, Math.min(1, t));

  return {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };
}

// =============================================================================
// Measurement Helpers
// =============================================================================

/**
 * Calculate all measurements for a polygon given a scale ratio.
 * Returns values compatible with ExtractionDetection fields.
 */
export function calculatePolygonMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): {
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  area_sf: number;
  perimeter_lf: number;
  real_width_ft: number;
  real_height_ft: number;
} {
  const bbox = getPolygonBoundingBox(points);
  const areaSf = calculatePolygonAreaSf(points, scaleRatio);
  const perimeterLf = calculatePolygonPerimeterLf(points, scaleRatio);

  return {
    pixel_x: bbox.centerX,
    pixel_y: bbox.centerY,
    pixel_width: bbox.width,
    pixel_height: bbox.height,
    area_sf: areaSf,
    perimeter_lf: perimeterLf,
    real_width_ft: bbox.width / scaleRatio,
    real_height_ft: bbox.height / scaleRatio,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Check if a polygon has the minimum required points (3 for triangle).
 */
export function isValidPolygon(points: PolygonPoint[]): boolean {
  return points.length >= 3;
}

/**
 * Check if removing a point would leave a valid polygon.
 */
export function canRemovePoint(points: PolygonPoint[]): boolean {
  return points.length > 3;
}

// =============================================================================
// Class-Specific Derived Measurements
// =============================================================================

export interface WindowDerivedMeasurements {
  head_lf: number;      // Top horizontal edge
  sill_lf: number;      // Bottom horizontal edge
  jamb_lf: number;      // Left + right vertical edges combined
  perimeter_lf: number; // Total perimeter
}

export interface DoorDerivedMeasurements {
  head_lf: number;      // Top horizontal edge
  jamb_lf: number;      // Left + right vertical edges combined
  perimeter_lf: number; // Total perimeter (no sill - door touches floor)
}

export interface GarageDerivedMeasurements {
  head_lf: number;      // Top horizontal edge
  jamb_lf: number;      // Left + right vertical edges combined
  perimeter_lf: number;
}

export interface GableDerivedMeasurements {
  rake_lf: number;      // Two sloped edges combined (excludes bottom)
  base_lf: number;      // Bottom horizontal edge (for reference)
}

/**
 * Calculate distance between two points (exported version)
 */
export function distanceBetweenPoints(p1: PolygonPoint, p2: PolygonPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate derived measurements for a WINDOW (4-point polygon)
 * Identifies head (top), sill (bottom), and jambs (sides) by Y-coordinate
 */
export function calculateWindowMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): WindowDerivedMeasurements {
  if (points.length !== 4) {
    // Fallback for non-4-point shapes: use bounding box approximation
    const bbox = getPolygonBoundingBox(points);
    const widthFt = bbox.width / scaleRatio;
    const heightFt = bbox.height / scaleRatio;
    return {
      head_lf: widthFt,
      sill_lf: widthFt,
      jamb_lf: heightFt * 2,
      perimeter_lf: (widthFt + heightFt) * 2,
    };
  }

  // Sort points by Y coordinate (lowest Y = top in image coordinates)
  const sortedByY = [...points].sort((a, b) => a.y - b.y);

  // Top 2 points form the HEAD edge
  const topPoints = sortedByY.slice(0, 2);
  // Bottom 2 points form the SILL edge
  const bottomPoints = sortedByY.slice(2, 4);

  // Sort each pair by X to get left-to-right order
  topPoints.sort((a, b) => a.x - b.x);
  bottomPoints.sort((a, b) => a.x - b.x);

  // Calculate edge lengths in pixels
  const headPx = distanceBetweenPoints(topPoints[0], topPoints[1]);
  const sillPx = distanceBetweenPoints(bottomPoints[0], bottomPoints[1]);
  const leftJambPx = distanceBetweenPoints(topPoints[0], bottomPoints[0]);
  const rightJambPx = distanceBetweenPoints(topPoints[1], bottomPoints[1]);

  // Convert to feet
  const head_lf = headPx / scaleRatio;
  const sill_lf = sillPx / scaleRatio;
  const jamb_lf = (leftJambPx + rightJambPx) / scaleRatio;
  const perimeter_lf = head_lf + sill_lf + jamb_lf;

  return {
    head_lf: Math.round(head_lf * 100) / 100,
    sill_lf: Math.round(sill_lf * 100) / 100,
    jamb_lf: Math.round(jamb_lf * 100) / 100,
    perimeter_lf: Math.round(perimeter_lf * 100) / 100,
  };
}

/**
 * Calculate derived measurements for a DOOR (4-point polygon)
 * Similar to window but no sill measurement (door touches floor)
 */
export function calculateDoorMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): DoorDerivedMeasurements {
  if (points.length !== 4) {
    const bbox = getPolygonBoundingBox(points);
    const widthFt = bbox.width / scaleRatio;
    const heightFt = bbox.height / scaleRatio;
    return {
      head_lf: widthFt,
      jamb_lf: heightFt * 2,
      perimeter_lf: widthFt + (heightFt * 2),
    };
  }

  const sortedByY = [...points].sort((a, b) => a.y - b.y);
  const topPoints = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomPoints = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

  const headPx = distanceBetweenPoints(topPoints[0], topPoints[1]);
  const leftJambPx = distanceBetweenPoints(topPoints[0], bottomPoints[0]);
  const rightJambPx = distanceBetweenPoints(topPoints[1], bottomPoints[1]);

  const head_lf = headPx / scaleRatio;
  const jamb_lf = (leftJambPx + rightJambPx) / scaleRatio;

  return {
    head_lf: Math.round(head_lf * 100) / 100,
    jamb_lf: Math.round(jamb_lf * 100) / 100,
    perimeter_lf: Math.round((head_lf + jamb_lf) * 100) / 100,
  };
}

/**
 * Calculate derived measurements for a GARAGE (4-point polygon)
 * Similar to door
 */
export function calculateGarageMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): GarageDerivedMeasurements {
  const doorMeasurements = calculateDoorMeasurements(points, scaleRatio);
  return {
    head_lf: doorMeasurements.head_lf,
    jamb_lf: doorMeasurements.jamb_lf,
    perimeter_lf: doorMeasurements.perimeter_lf,
  };
}

/**
 * Calculate derived measurements for a GABLE (3-point triangle)
 * Rake = the two sloped edges (excludes the bottom horizontal edge)
 */
export function calculateGableMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): GableDerivedMeasurements {
  if (points.length !== 3) {
    // Fallback for non-triangle: use bounding box approximation
    const bbox = getPolygonBoundingBox(points);
    const halfBase = bbox.width / 2;
    const height = bbox.height;
    const rakeSide = Math.sqrt(halfBase * halfBase + height * height);
    return {
      rake_lf: Math.round(((rakeSide * 2) / scaleRatio) * 100) / 100,
      base_lf: Math.round((bbox.width / scaleRatio) * 100) / 100,
    };
  }

  // Sort points by Y coordinate (lowest Y = peak/top)
  const sortedByY = [...points].sort((a, b) => a.y - b.y);

  // Peak is the point with lowest Y (top of triangle)
  const peak = sortedByY[0];
  // Bottom two points form the base edge
  const basePoint1 = sortedByY[1];
  const basePoint2 = sortedByY[2];

  // Calculate edge lengths in pixels
  const basePx = distanceBetweenPoints(basePoint1, basePoint2);
  const leftRakePx = distanceBetweenPoints(peak, basePoint1);
  const rightRakePx = distanceBetweenPoints(peak, basePoint2);

  // Convert to feet
  const rake_lf = (leftRakePx + rightRakePx) / scaleRatio;
  const base_lf = basePx / scaleRatio;

  return {
    rake_lf: Math.round(rake_lf * 100) / 100,
    base_lf: Math.round(base_lf * 100) / 100,
  };
}

/**
 * Get derived measurements for any detection based on its class
 * Returns null for classes that don't have derived measurements
 */
export function getClassDerivedMeasurements(
  detectionClass: string,
  points: PolygonPoint[] | null | undefined,
  scaleRatio: number
): WindowDerivedMeasurements | DoorDerivedMeasurements | GarageDerivedMeasurements | GableDerivedMeasurements | null {
  if (!points || points.length < 3 || scaleRatio <= 0) return null;

  switch (detectionClass) {
    case 'window':
      return calculateWindowMeasurements(points, scaleRatio);
    case 'door':
      return calculateDoorMeasurements(points, scaleRatio);
    case 'garage':
      return calculateGarageMeasurements(points, scaleRatio);
    case 'gable':
      return calculateGableMeasurements(points, scaleRatio);
    default:
      return null;
  }
}

// =============================================================================
// Building/Facade Measurements
// =============================================================================

export interface BuildingDerivedMeasurements {
  area_sf: number;           // Total facade area
  perimeter_lf: number;      // Total perimeter
  level_starter_lf: number;  // Bottom edge (for starter strip)
}

export interface LineMeasurements {
  length_lf: number;         // Total length for line-type detections
}

/**
 * Calculate measurements for a BUILDING/FACADE polygon
 * Includes area, perimeter, and level starter (bottom edge)
 */
export function calculateBuildingMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): BuildingDerivedMeasurements {
  if (!points || points.length < 3 || scaleRatio <= 0) {
    return { area_sf: 0, perimeter_lf: 0, level_starter_lf: 0 };
  }

  // Calculate area using existing function
  const areaPx = calculatePolygonArea(points);
  const area_sf = areaPx / (scaleRatio * scaleRatio);

  // Calculate perimeter
  let perimeterPx = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    perimeterPx += distanceBetweenPoints(p1, p2);
  }
  const perimeter_lf = perimeterPx / scaleRatio;

  // Find bottom edge (level starter) - edge with highest average Y
  let bottomEdgeLength = 0;
  let maxAvgY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const avgY = (p1.y + p2.y) / 2;
    const edgeLength = distanceBetweenPoints(p1, p2);

    // Check if this edge is more horizontal (width > height difference)
    const isHorizontal = Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y);

    if (isHorizontal && avgY > maxAvgY) {
      maxAvgY = avgY;
      bottomEdgeLength = edgeLength;
    }
  }

  const level_starter_lf = bottomEdgeLength / scaleRatio;

  return {
    area_sf: Math.round(area_sf * 100) / 100,
    perimeter_lf: Math.round(perimeter_lf * 100) / 100,
    level_starter_lf: Math.round(level_starter_lf * 100) / 100,
  };
}

/**
 * Calculate length for LINE-type detections (eave, rake, ridge, fascia, trim)
 * Uses polygon_points as a polyline (not closed polygon)
 */
export function calculateLineMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): LineMeasurements {
  if (!points || points.length < 2 || scaleRatio <= 0) {
    return { length_lf: 0 };
  }

  let totalLengthPx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalLengthPx += distanceBetweenPoints(points[i], points[i + 1]);
  }

  return {
    length_lf: Math.round((totalLengthPx / scaleRatio) * 100) / 100,
  };
}

/**
 * Calculate area for polygon-type detections (soffit, siding zones)
 */
export function calculateAreaMeasurements(
  points: PolygonPoint[],
  scaleRatio: number
): { area_sf: number; perimeter_lf: number } {
  if (!points || points.length < 3 || scaleRatio <= 0) {
    return { area_sf: 0, perimeter_lf: 0 };
  }

  const areaPx = calculatePolygonArea(points);
  const area_sf = areaPx / (scaleRatio * scaleRatio);
  const perimeter_lf = calculatePolygonPerimeterLf(points, scaleRatio);

  return {
    area_sf: Math.round(area_sf * 100) / 100,
    perimeter_lf: Math.round(perimeter_lf * 100) / 100,
  };
}
