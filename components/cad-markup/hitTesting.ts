// Hit Testing Utilities for CAD Markup
// Provides geometry utilities for click detection on markups

import { Point, Polygon, CountMarker, LinearMeasurement } from "./types";

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * Cast a horizontal ray from the point to the right and count intersections
 * Odd count = inside, even count = outside
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const { x, y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    // Check if ray intersects this edge
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is within tolerance distance of a line segment
 * Uses perpendicular distance calculation with segment clamping
 */
export function pointNearLine(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
  tolerance: number
): boolean {
  const distance = pointToLineDistance(point, lineStart, lineEnd);
  return distance <= tolerance;
}

/**
 * Calculate the distance from a point to a line segment
 */
function pointToLineDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const { x, y } = point;
  const { x: x1, y: y1 } = lineStart;
  const { x: x2, y: y2 } = lineEnd;

  // Calculate the line segment length squared
  const lineLengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;

  // If the line segment is actually a point
  if (lineLengthSq === 0) {
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  // Calculate projection parameter t (clamped to [0, 1] for segment)
  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lineLengthSq;
  t = Math.max(0, Math.min(1, t));

  // Calculate the closest point on the line segment
  const closestX = x1 + t * (x2 - x1);
  const closestY = y1 + t * (y2 - y1);

  // Return distance from point to closest point on segment
  return Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
}

/**
 * Check if a point is within tolerance distance of a target point
 */
export function pointNearPoint(
  point: Point,
  target: Point,
  tolerance: number
): boolean {
  const dx = point.x - target.x;
  const dy = point.y - target.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= tolerance;
}

/**
 * Hit test all polygons and return the id of the first hit polygon
 * Returns null if no polygon is hit
 */
export function hitTestPolygons(
  point: Point,
  polygons: Polygon[],
  tolerance: number
): string | null {
  // First check if point is inside any polygon
  for (const polygon of polygons) {
    if (polygon.isComplete && pointInPolygon(point, polygon.points)) {
      return polygon.id;
    }
  }

  // Then check if point is near any polygon edge (for border clicks)
  for (const polygon of polygons) {
    if (!polygon.isComplete) continue;

    const { points } = polygon;
    for (let i = 0; i < points.length; i++) {
      const start = points[i];
      const end = points[(i + 1) % points.length];

      if (pointNearLine(point, start, end, tolerance)) {
        return polygon.id;
      }
    }
  }

  return null;
}

/**
 * Hit test all markers and return the id of the first hit marker
 * Returns null if no marker is hit
 */
export function hitTestMarkers(
  point: Point,
  markers: CountMarker[],
  tolerance: number
): string | null {
  for (const marker of markers) {
    if (pointNearPoint(point, marker.position, tolerance)) {
      return marker.id;
    }
  }
  return null;
}

/**
 * Hit test all measurements and return the id of the first hit measurement
 * Returns null if no measurement is hit
 */
export function hitTestMeasurements(
  point: Point,
  measurements: LinearMeasurement[],
  tolerance: number
): string | null {
  for (const measurement of measurements) {
    // Check if near the line itself
    if (pointNearLine(point, measurement.start, measurement.end, tolerance)) {
      return measurement.id;
    }

    // Also check if near the endpoints (for easier selection)
    if (
      pointNearPoint(point, measurement.start, tolerance) ||
      pointNearPoint(point, measurement.end, tolerance)
    ) {
      return measurement.id;
    }
  }
  return null;
}

/**
 * Hit result type for combined hit testing
 */
export interface HitResult {
  type: "polygon" | "marker" | "measurement";
  id: string;
}

/**
 * Hit test all markup types and return the first hit
 * Priority order: markers > measurements > polygons
 * (Smaller/more specific targets have higher priority)
 * Returns null if nothing is hit
 */
export function hitTestAll(
  point: Point,
  polygons: Polygon[],
  markers: CountMarker[],
  measurements: LinearMeasurement[],
  tolerance: number
): HitResult | null {
  // Check markers first (smallest targets, highest priority)
  const markerId = hitTestMarkers(point, markers, tolerance);
  if (markerId) {
    return { type: "marker", id: markerId };
  }

  // Check measurements second (line-based)
  const measurementId = hitTestMeasurements(point, measurements, tolerance);
  if (measurementId) {
    return { type: "measurement", id: measurementId };
  }

  // Check polygons last (area-based, lowest priority)
  const polygonId = hitTestPolygons(point, polygons, tolerance);
  if (polygonId) {
    return { type: "polygon", id: polygonId };
  }

  return null;
}
