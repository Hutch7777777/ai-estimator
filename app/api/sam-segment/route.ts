import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// SAM Segment API Route
// Uses Segment Anything Model to generate precise polygon boundaries from clicks
// =============================================================================
//
// CURRENT STATUS: TEMPORARILY DISABLED
//
// Point-based click segmentation is not currently available because:
// - meta/sam-2 on Replicate only supports automatic grid-based segmentation
// - meta/sam-2-video requires video input, not single images
// - Roboflow SAM requires enterprise API access for point-based prompts
//
// The infrastructure is in place and ready for when a suitable model becomes
// available (e.g., a future SAM model with point_coords support for images).
// =============================================================================

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_INFERENCE_URL = process.env.ROBOFLOW_INFERENCE_URL || 'https://infer.roboflow.com';

// Feature flag to enable/disable SAM
// Set to false until a working point-based SAM model is available
const SAM_FEATURE_ENABLED = false;

// SAM 2 model on Replicate - using the official meta/sam-2 model
// NOTE: This model does NOT support point-based segmentation currently
// See: https://replicate.com/meta/sam-2
const SAM_MODEL_VERSION = 'meta/sam-2';

interface SAMSegmentRequest {
  image_url: string;
  click_point: {
    x: number;
    y: number;
  };
  image_width: number;
  image_height: number;
  /** Optional: multiple points for more precise segmentation */
  additional_points?: Array<{
    x: number;
    y: number;
    label: 0 | 1; // 0 = background, 1 = foreground
  }>;
}

interface SAMSegmentResponse {
  success: boolean;
  polygon_points?: Array<{ x: number; y: number }>;
  bounding_box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mask_url?: string;
  error?: string;
  source: 'replicate_sam' | 'roboflow_sam' | 'extraction_api_sam';
}

// =============================================================================
// Replicate SAM Integration
// =============================================================================

async function segmentWithReplicate(
  imageUrl: string,
  clickX: number,
  clickY: number,
  imageWidth: number,
  imageHeight: number
): Promise<SAMSegmentResponse> {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  console.log('[sam-segment] Using Replicate SAM...');
  console.log('[sam-segment] Image URL:', imageUrl);
  console.log('[sam-segment] Click point:', clickX, clickY);

  // Use the models API endpoint for official models
  // Format: POST https://api.replicate.com/v1/models/{owner}/{name}/predictions
  const response = await fetch(`https://api.replicate.com/v1/models/${SAM_MODEL_VERSION}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait', // Wait for result synchronously (up to 60s)
    },
    body: JSON.stringify({
      input: {
        image: imageUrl,
        // SAM 2 expects point_coords as array of [x, y] pairs
        point_coords: [[Math.round(clickX), Math.round(clickY)]],
        // point_labels: 1 = foreground, 0 = background
        point_labels: [1],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[sam-segment] Replicate API error:', response.status, errorText);
    throw new Error(`Replicate API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('[sam-segment] Replicate response status:', result.status);

  // If using Prefer: wait, result should be complete
  // Otherwise poll for completion
  if (result.status === 'starting' || result.status === 'processing') {
    // Poll for completion (max 30 seconds)
    const maxAttempts = 30;
    let attempts = 0;
    let pollResult = result;

    while (pollResult.status !== 'succeeded' && pollResult.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch(result.urls?.get || `https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        },
      });

      pollResult = await statusResponse.json();
      attempts++;
      console.log('[sam-segment] Status:', pollResult.status, `(attempt ${attempts})`);
    }

    if (pollResult.status === 'failed') {
      throw new Error(`SAM prediction failed: ${pollResult.error}`);
    }

    if (pollResult.status !== 'succeeded') {
      throw new Error('SAM prediction timed out');
    }

    // Use the polled result
    Object.assign(result, pollResult);
  }

  if (result.status === 'failed') {
    throw new Error(`SAM prediction failed: ${result.error}`);
  }

  // Parse the result - SAM returns masks
  const output = result.output;
  console.log('[sam-segment] Output type:', typeof output, Array.isArray(output) ? 'array' : '');

  // Convert mask to polygon points
  const polygonPoints = extractPolygonFromSAMOutput(output, imageWidth, imageHeight);
  const boundingBox = calculateBoundingBox(polygonPoints);

  return {
    success: true,
    polygon_points: polygonPoints,
    bounding_box: boundingBox,
    mask_url: typeof output === 'string' ? output : output?.mask || output?.combined_mask,
    source: 'replicate_sam',
  };
}

// =============================================================================
// Roboflow SAM Integration (if available)
// =============================================================================

async function segmentWithRoboflow(
  imageUrl: string,
  clickX: number,
  clickY: number,
  imageWidth: number,
  imageHeight: number
): Promise<SAMSegmentResponse> {
  if (!ROBOFLOW_API_KEY) {
    throw new Error('ROBOFLOW_API_KEY not configured');
  }

  console.log('[sam-segment] Using Roboflow SAM Inference API...');
  console.log('[sam-segment] Image URL:', imageUrl);
  console.log('[sam-segment] Click point:', clickX, clickY);

  // Roboflow Inference API for SAM
  // See: https://inference.roboflow.com/foundation/sam/
  const embedEndpoint = `${ROBOFLOW_INFERENCE_URL}/sam/embed_image`;
  const segmentEndpoint = `${ROBOFLOW_INFERENCE_URL}/sam/segment_image`;

  // Step 1: Create image embedding (or use cached)
  const imageId = `sam-${Buffer.from(imageUrl).toString('base64').slice(0, 32)}`;

  const embedResponse = await fetch(`${embedEndpoint}?api_key=${ROBOFLOW_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: {
        type: 'url',
        value: imageUrl,
      },
      image_id: imageId,
    }),
  });

  if (!embedResponse.ok) {
    const errorText = await embedResponse.text();
    console.error('[sam-segment] Roboflow embed error:', embedResponse.status, errorText);
    throw new Error(`Roboflow embed error: ${embedResponse.status}`);
  }

  const embedResult = await embedResponse.json();
  console.log('[sam-segment] Embedding created, image_id:', imageId);

  // Step 2: Segment with point prompt
  const segmentResponse = await fetch(`${segmentEndpoint}?api_key=${ROBOFLOW_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_id: imageId,
      point_coords: [[Math.round(clickX), Math.round(clickY)]],
      point_labels: [1], // 1 = foreground
    }),
  });

  if (!segmentResponse.ok) {
    const errorText = await segmentResponse.text();
    console.error('[sam-segment] Roboflow segment error:', segmentResponse.status, errorText);
    throw new Error(`Roboflow segment error: ${segmentResponse.status}`);
  }

  const result = await segmentResponse.json();
  console.log('[sam-segment] Roboflow result keys:', Object.keys(result));

  // Extract polygon from Roboflow response
  // Response format may include masks, predictions, or contours
  let polygonPoints: Array<{ x: number; y: number }> = [];

  if (result.masks && Array.isArray(result.masks) && result.masks.length > 0) {
    // If masks are returned, convert first mask to polygon
    // Masks are typically RLE encoded or binary arrays
    polygonPoints = extractPolygonFromMask(result.masks[0], imageWidth, imageHeight);
  } else if (result.predictions && Array.isArray(result.predictions)) {
    // Some responses include predictions with points
    const firstPrediction = result.predictions[0];
    if (firstPrediction?.points) {
      polygonPoints = firstPrediction.points;
    } else if (firstPrediction?.contour) {
      polygonPoints = firstPrediction.contour;
    }
  } else if (result.contours && Array.isArray(result.contours)) {
    polygonPoints = result.contours[0] || [];
  }

  const boundingBox = calculateBoundingBox(polygonPoints);

  return {
    success: true,
    polygon_points: polygonPoints.map((p: { x: number; y: number } | number[]) =>
      Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }
    ),
    bounding_box: boundingBox,
    source: 'roboflow_sam',
  };
}

/**
 * Extract polygon points from a binary mask
 * This is a simplified implementation - for production, consider using
 * a proper contour detection algorithm
 */
function extractPolygonFromMask(
  mask: unknown,
  imageWidth: number,
  imageHeight: number
): Array<{ x: number; y: number }> {
  // If mask is a URL (image), we can't process it directly
  if (typeof mask === 'string') {
    console.log('[sam-segment] Mask is URL, cannot extract polygon directly');
    return [];
  }

  // If mask is an array (binary or RLE), attempt basic extraction
  if (Array.isArray(mask)) {
    // For now, return empty - full implementation would decode mask to polygon
    console.log('[sam-segment] Mask is array, basic extraction not implemented');
    return [];
  }

  return [];
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractPolygonFromSAMOutput(
  output: unknown,
  imageWidth: number,
  imageHeight: number
): Array<{ x: number; y: number }> {
  // SAM output format varies by implementation
  // This handles common formats

  if (!output) return [];

  // If output is a direct polygon array
  if (Array.isArray(output) && output.length > 0) {
    if (typeof output[0] === 'object' && 'x' in output[0]) {
      return output as Array<{ x: number; y: number }>;
    }
    // If it's [[x,y], [x,y], ...] format
    if (Array.isArray(output[0]) && output[0].length === 2) {
      return output.map((p: number[]) => ({ x: p[0], y: p[1] }));
    }
  }

  // If output contains masks/contours
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;

    // Check for contours/polygon field
    if (obj.contours && Array.isArray(obj.contours)) {
      const contour = obj.contours[0]; // Take the largest/first contour
      if (Array.isArray(contour)) {
        return contour.map((p: number[] | { x: number; y: number }) =>
          Array.isArray(p) ? { x: p[0], y: p[1] } : p
        );
      }
    }

    if (obj.polygon && Array.isArray(obj.polygon)) {
      return obj.polygon as Array<{ x: number; y: number }>;
    }

    // Check for RLE mask - would need to decode
    if (obj.masks || obj.mask) {
      console.log('[sam-segment] Received mask format, polygon extraction not yet implemented');
      // For now, return empty - full implementation would decode RLE to polygon
      return [];
    }
  }

  console.log('[sam-segment] Unknown output format:', typeof output);
  return [];
}

function calculateBoundingBox(
  points: Array<{ x: number; y: number }>
): { x: number; y: number; width: number; height: number } | undefined {
  if (!points || points.length === 0) return undefined;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// =============================================================================
// Main API Handler
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[sam-segment] ========================================');
  console.log('[sam-segment] API called at:', new Date().toISOString());

  // Check if SAM feature is enabled
  if (!SAM_FEATURE_ENABLED) {
    console.log('[sam-segment] Feature is currently disabled');
    return NextResponse.json(
      {
        success: false,
        error: 'SAM Magic Select is temporarily unavailable. Click-to-segment requires a specialized SAM model with point-based input support, which is not yet available through the configured API providers. Please use the manual polygon drawing tool (P) or Rectangle tool (R) instead.',
        feature_disabled: true,
        alternatives: [
          { key: 'P', description: 'Draw polygon manually' },
          { key: 'R', description: 'Draw rectangle' },
          { key: 'D', description: 'Use AI Region Detect with bounding box' },
        ],
      },
      { status: 503 }
    );
  }

  try {
    const body: SAMSegmentRequest = await request.json();
    const { image_url, click_point, image_width, image_height } = body;

    console.log('[sam-segment] Image URL:', image_url?.substring(0, 100) + '...');
    console.log('[sam-segment] Click point:', click_point);
    console.log('[sam-segment] Image dimensions:', image_width, 'x', image_height);

    // Validate required fields
    if (!image_url || !click_point || !image_width || !image_height) {
      return NextResponse.json(
        { success: false, error: 'image_url, click_point, image_width, and image_height are required' },
        { status: 400 }
      );
    }

    // Try available SAM providers in order of preference
    let result: SAMSegmentResponse | null = null;
    const errors: string[] = [];

    // 1. Try Roboflow SAM first (if configured)
    if (ROBOFLOW_API_KEY) {
      try {
        result = await segmentWithRoboflow(
          image_url,
          click_point.x,
          click_point.y,
          image_width,
          image_height
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.log('[sam-segment] Roboflow SAM failed:', message);
        errors.push(`Roboflow: ${message}`);
      }
    }

    // 2. Try Replicate SAM
    if (!result && REPLICATE_API_TOKEN) {
      try {
        result = await segmentWithReplicate(
          image_url,
          click_point.x,
          click_point.y,
          image_width,
          image_height
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.log('[sam-segment] Replicate SAM failed:', message);
        errors.push(`Replicate: ${message}`);
      }
    }

    // 3. No SAM provider available
    if (!result) {
      const availableProviders = [
        ROBOFLOW_API_KEY ? 'Roboflow (configured)' : null,
        REPLICATE_API_TOKEN ? 'Replicate (configured)' : null,
      ].filter(Boolean);

      if (availableProviders.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No SAM provider configured. Set ROBOFLOW_API_KEY or REPLICATE_API_TOKEN.',
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `SAM segmentation failed: ${errors.join('; ')}`,
        },
        { status: 500 }
      );
    }

    // Add unique ID for the detection
    const detectionId = `sam-${uuidv4()}`;

    console.log('[sam-segment] Success! Polygon points:', result.polygon_points?.length || 0);

    return NextResponse.json({
      ...result,
      id: detectionId,
    });
  } catch (error) {
    console.error('[sam-segment] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
