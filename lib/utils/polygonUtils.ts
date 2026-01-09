// Polygon Utility Functions for Detection Editor
// Handles polygon math, coordinate conversion, and measurements

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
 */
export function calculatePolygonArea(points: PolygonPoint[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
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
 */
export function calculatePolygonPerimeter(points: PolygonPoint[]): number {
  if (points.length < 2) return 0;

  let perimeter = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perimeter += distance(points[i], points[j]);
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
 */
export function getPolygonBoundingBox(points: PolygonPoint[]): BoundingBox {
  if (points.length === 0) {
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

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

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
 */
export function getPolygonCentroid(points: PolygonPoint[]): PolygonPoint {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y };
  }

  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  // For 3+ points, use the centroid formula
  let cx = 0;
  let cy = 0;
  let signedArea = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = points[i].x;
    const y0 = points[i].y;
    const x1 = points[j].x;
    const y1 = points[j].y;

    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  signedArea *= 0.5;

  // Handle degenerate case where area is 0
  if (Math.abs(signedArea) < 0.0001) {
    // Fall back to simple average
    const avgX = points.reduce((sum, p) => sum + p.x, 0) / n;
    const avgY = points.reduce((sum, p) => sum + p.y, 0) / n;
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
 */
export function flattenPoints(points: PolygonPoint[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
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
