// Coordinate conversion utilities for Detection Editor
// Handles conversion between Roboflow center-based coordinates and Konva top-left coordinates

// =============================================================================
// Types
// =============================================================================

export interface CenterCoords {
  pixel_x: number; // center X
  pixel_y: number; // center Y
  pixel_width: number;
  pixel_height: number;
}

export interface CanvasCoords {
  x: number; // top-left X
  y: number; // top-left Y
  width: number;
  height: number;
}

export interface RealWorldMeasurements {
  real_width_in: number;
  real_height_in: number;
  real_width_ft: number;
  real_height_ft: number;
  area_sf: number;
  perimeter_lf: number;
}

// =============================================================================
// Coordinate Conversion Functions
// =============================================================================

/**
 * Convert Roboflow center-based coordinates to Konva canvas top-left coordinates.
 * Roboflow stores (pixel_x, pixel_y) as the CENTER of the bounding box.
 * Konva needs (x, y) as the TOP-LEFT corner.
 */
export function centerToCanvas(coords: CenterCoords): CanvasCoords {
  return {
    x: coords.pixel_x - coords.pixel_width / 2,
    y: coords.pixel_y - coords.pixel_height / 2,
    width: coords.pixel_width,
    height: coords.pixel_height,
  };
}

/**
 * Convert Konva canvas top-left coordinates back to Roboflow center-based coordinates.
 * This is used when saving detection edits back to the database.
 */
export function canvasToCenter(coords: CanvasCoords): CenterCoords {
  return {
    pixel_x: coords.x + coords.width / 2,
    pixel_y: coords.y + coords.height / 2,
    pixel_width: coords.width,
    pixel_height: coords.height,
  };
}

/**
 * Calculate real-world measurements from pixel dimensions using scale_ratio.
 * scale_ratio = pixels per foot (e.g., 64 means 64 pixels = 1 foot)
 */
export function calculateRealWorldMeasurements(
  pixelWidth: number,
  pixelHeight: number,
  scaleRatio: number
): RealWorldMeasurements {
  // Convert pixels to feet
  const real_width_ft = pixelWidth / scaleRatio;
  const real_height_ft = pixelHeight / scaleRatio;

  // Convert feet to inches
  const real_width_in = real_width_ft * 12;
  const real_height_in = real_height_ft * 12;

  // Calculate area in square feet
  const area_sf = real_width_ft * real_height_ft;

  // Calculate perimeter in linear feet
  const perimeter_lf = 2 * (real_width_ft + real_height_ft);

  return {
    real_width_in,
    real_height_in,
    real_width_ft,
    real_height_ft,
    area_sf,
    perimeter_lf,
  };
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format feet as feet-inches notation.
 * Example: 3.5 -> "3'-6""
 * Example: 3.75 -> "3'-9""
 * Example: 4.0 -> "4'"
 */
export function formatFeetInches(feet: number): string {
  const wholeFeet = Math.floor(feet);
  const fractionalFeet = feet - wholeFeet;
  const inches = Math.round(fractionalFeet * 12);

  // Handle edge case where inches rounds to 12
  if (inches === 12) {
    return `${wholeFeet + 1}'`;
  }

  // If no inches, just show feet
  if (inches === 0) {
    return `${wholeFeet}'`;
  }

  return `${wholeFeet}'-${inches}"`;
}

/**
 * Format area with "SF" suffix.
 * Example: 12.5 -> "12.5 SF"
 * Example: 100.0 -> "100 SF"
 */
export function formatArea(areaSf: number): string {
  // For small areas, show one decimal place
  if (areaSf < 10) {
    return `${areaSf.toFixed(1)} SF`;
  }
  // For larger areas, show whole number
  return `${Math.round(areaSf)} SF`;
}

/**
 * Format dimension label with width × height notation.
 * Example: (3.5, 4.25) -> "3'-6" × 4'-3""
 */
export function formatDimensionLabel(widthFt: number, heightFt: number): string {
  return `${formatFeetInches(widthFt)} × ${formatFeetInches(heightFt)}`;
}

// =============================================================================
// Viewport/Zoom Utilities
// =============================================================================

/**
 * Calculate the initial scale to fit an image within a container while maintaining aspect ratio.
 */
export function calculateFitScale(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 40
): number {
  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  const scaleX = availableWidth / imageWidth;
  const scaleY = availableHeight / imageHeight;

  // Use the smaller scale to ensure the entire image fits
  return Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1
}

/**
 * Calculate the center offset to position an image in the center of a container.
 */
export function calculateCenterOffset(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  scale: number
): { x: number; y: number } {
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;

  return {
    x: (containerWidth - scaledWidth) / 2,
    y: (containerHeight - scaledHeight) / 2,
  };
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Constrain scale within reasonable bounds.
 */
export function constrainScale(scale: number, minScale = 0.1, maxScale = 5): number {
  return clamp(scale, minScale, maxScale);
}
