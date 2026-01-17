/**
 * Shared utility for rendering detection overlays onto elevation images.
 * Used by both the Takeoffs page and Detection Editor for "Download Markup Plans" feature.
 */

// =============================================================================
// Types
// =============================================================================

export interface DetectionForRender {
  class: string;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  polygon_points?: Array<{ x: number; y: number }> | null;
}

// =============================================================================
// Constants
// =============================================================================

export const DETECTION_COLORS: Record<string, { fill: string; stroke: string }> = {
  siding: { fill: 'rgba(239, 68, 68, 0.35)', stroke: '#ef4444' },           // Red
  window: { fill: 'rgba(34, 197, 94, 0.35)', stroke: '#22c55e' },           // Green
  door: { fill: 'rgba(59, 130, 246, 0.35)', stroke: '#3b82f6' },            // Blue
  garage: { fill: 'rgba(168, 85, 247, 0.35)', stroke: '#a855f7' },          // Purple
  gable: { fill: 'rgba(249, 115, 22, 0.35)', stroke: '#f97316' },           // Orange
  roof: { fill: 'rgba(6, 182, 212, 0.35)', stroke: '#06b6d4' },             // Cyan
  trim: { fill: 'rgba(236, 72, 153, 0.35)', stroke: '#ec4899' },            // Pink
  soffit: { fill: 'rgba(132, 204, 22, 0.35)', stroke: '#84cc16' },          // Lime
  fascia: { fill: 'rgba(251, 191, 36, 0.35)', stroke: '#fbbf24' },          // Amber
  'exterior wall': { fill: 'rgba(107, 114, 128, 0.35)', stroke: '#6b7280' }, // Gray
  corbel: { fill: 'rgba(219, 39, 119, 0.35)', stroke: '#db2777' },          // Pink-600
  shutter: { fill: 'rgba(139, 92, 246, 0.35)', stroke: '#8b5cf6' },         // Violet
  column: { fill: 'rgba(20, 184, 166, 0.35)', stroke: '#14b8a6' },          // Teal
  railing: { fill: 'rgba(245, 158, 11, 0.35)', stroke: '#f59e0b' },         // Amber-500
  deck: { fill: 'rgba(168, 162, 158, 0.35)', stroke: '#a8a29e' },           // Stone
  porch: { fill: 'rgba(120, 113, 108, 0.35)', stroke: '#78716c' },          // Stone-500
  chimney: { fill: 'rgba(87, 83, 78, 0.35)', stroke: '#57534e' },           // Stone-600
  vent: { fill: 'rgba(156, 163, 175, 0.35)', stroke: '#9ca3af' },           // Gray-400
};

export const DEFAULT_DETECTION_COLOR = { fill: 'rgba(156, 163, 175, 0.35)', stroke: '#9ca3af' };

// =============================================================================
// Functions
// =============================================================================

/**
 * Load an image with CORS support
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Render detection overlays onto an image and return as a Blob.
 * Supports both polygon shapes (for accurate gables, etc.) and bounding box rectangles.
 */
export async function renderMarkupImage(
  imageUrl: string,
  detections: DetectionForRender[],
  elevationName?: string | null
): Promise<Blob> {
  // Load base image
  const img = await loadImage(imageUrl);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;

  // Draw base image
  ctx.drawImage(img, 0, 0);

  // Draw each detection (shapes only, no labels for cleaner output)
  for (const det of detections) {
    const colors = DETECTION_COLORS[det.class] || DEFAULT_DETECTION_COLOR;

    // Check if we have polygon points for accurate shape rendering
    if (det.polygon_points && Array.isArray(det.polygon_points) && det.polygon_points.length >= 3) {
      // Draw polygon shape (triangular gables, custom shapes, etc.)
      ctx.beginPath();
      ctx.moveTo(det.polygon_points[0].x, det.polygon_points[0].y);
      for (let i = 1; i < det.polygon_points.length; i++) {
        ctx.lineTo(det.polygon_points[i].x, det.polygon_points[i].y);
      }
      ctx.closePath();

      // Fill polygon
      ctx.fillStyle = colors.fill;
      ctx.fill();

      // Stroke polygon border
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // Fallback to bounding box rectangle
      const x = det.pixel_x - det.pixel_width / 2;
      const y = det.pixel_y - det.pixel_height / 2;
      const w = det.pixel_width;
      const h = det.pixel_height;

      // Draw filled rectangle
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, w, h);

      // Draw border
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
    }
  }

  // Add elevation name header if provided
  if (elevationName) {
    const headerText = elevationName.toUpperCase() + ' ELEVATION';
    ctx.font = 'bold 24px Arial';
    const headerMetrics = ctx.measureText(headerText);

    // Header background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, headerMetrics.width + 20, 36);

    // Header text
    ctx.fillStyle = 'white';
    ctx.fillText(headerText, 20, 36);
  }

  // Add legend in corner
  const legendX = img.width - 200;
  let legendY = 20;
  const usedClasses = [...new Set(detections.map(d => d.class))];

  if (usedClasses.length > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(legendX - 10, legendY - 10, 190, usedClasses.length * 25 + 20);

    ctx.font = 'bold 12px Arial';
    for (const cls of usedClasses) {
      const colors = DETECTION_COLORS[cls] || DEFAULT_DETECTION_COLOR;

      // Color swatch
      ctx.fillStyle = colors.fill;
      ctx.fillRect(legendX, legendY, 20, 16);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(legendX, legendY, 20, 16);

      // Label
      ctx.fillStyle = 'white';
      ctx.fillText(cls.toUpperCase(), legendX + 28, legendY + 13);

      legendY += 25;
    }
  }

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      'image/png',
      1.0
    );
  });
}
