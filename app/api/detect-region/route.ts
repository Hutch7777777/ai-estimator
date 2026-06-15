import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requireExtractionPageAccess, trustedPageImageUrl } from '@/lib/api/access';

// =============================================================================
// Detect Region API Route
// Runs Roboflow detection directly on a page image
// =============================================================================

// Roboflow Workflow API configuration
// Uses the same workflow as extraction-api for consistency
const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_WORKFLOW_URL = process.env.ROBOFLOW_WORKFLOW_URL ||
  'https://serverless.roboflow.com/infer/workflows/exterior-finishes/find-windows-garages-exterior-walls-roofs-buildings-doors-and-gables';

interface RegionDetectRequest {
  page_id: string;
  image_url?: string;
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence_threshold?: number;
}

interface DetectionResult {
  id: string;
  class: string;
  confidence: number;
  pixel_x: number;  // CENTER X (Roboflow format)
  pixel_y: number;  // CENTER Y (Roboflow format)
  pixel_width: number;
  pixel_height: number;
  polygon_points?: Array<{ x: number; y: number }>;
}

interface RoboflowPrediction {
  class: string;
  confidence: number;
  x: number;      // CENTER X
  y: number;      // CENTER Y
  width: number;
  height: number;
  points?: Array<{ x: number; y: number }>;
}

interface RoboflowResponse {
  predictions: RoboflowPrediction[];
  image?: {
    width: number;
    height: number;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[detect-region] ========================================');
  console.log('[detect-region] API called at:', new Date().toISOString());

  try {
    // Parse request body with error handling
    let body: RegionDetectRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[detect-region] JSON parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { page_id, image_url, region, confidence_threshold = 0.3 } = body;

    console.log('[detect-region] Page ID:', page_id);
    if (image_url) {
      console.log('[detect-region] Ignoring client image URL claim:', image_url.substring(0, 80) + '...');
    }
    console.log('[detect-region] Region:', JSON.stringify(region));
    console.log('[detect-region] Confidence threshold:', confidence_threshold);
    console.log('[detect-region] ROBOFLOW_API_KEY exists:', !!ROBOFLOW_API_KEY);

    // Validate required fields
    if (!page_id || !region) {
      console.error('[detect-region] Missing required fields');
      return NextResponse.json(
        { success: false, error: 'page_id and region are required' },
        { status: 400 }
      );
    }

    // Validate region dimensions
    if (region.width < 50 || region.height < 50) {
      console.error('[detect-region] Region too small:', region);
      return NextResponse.json(
        { success: false, error: 'Region too small. Minimum size is 50x50 pixels.' },
        { status: 400 }
      );
    }

    // Check Roboflow API key
    if (!ROBOFLOW_API_KEY) {
      console.error('[detect-region] ROBOFLOW_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Detection service not configured. Please set ROBOFLOW_API_KEY.' },
        { status: 503 }
      );
    }

    const pageAccess = await requireExtractionPageAccess(page_id);
    if (!pageAccess.ok) {
      return pageAccess.response;
    }

    const trustedImage = trustedPageImageUrl(pageAccess.data);
    if (!trustedImage) {
      return NextResponse.json(
        { success: false, error: 'Page image not found' },
        { status: 404 }
      );
    }
    console.log('[detect-region] Authorized page image:', trustedImage.substring(0, 80) + '...');
    console.log('[detect-region] Page dimensions:', pageAccess.data.original_width, 'x', pageAccess.data.original_height);

    // Call Roboflow Workflow API (same format as extraction-api)
    console.log('[detect-region] Calling Roboflow Workflow API...');
    console.log('[detect-region] Workflow URL:', ROBOFLOW_WORKFLOW_URL);

    const roboflowPayload = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: {
          type: 'url',
          value: trustedImage,
        },
      },
    };
    console.log('[detect-region] Roboflow payload:', JSON.stringify({ ...roboflowPayload, api_key: '***' }));

    let roboflowResponse: Response;
    try {
      roboflowResponse = await fetch(ROBOFLOW_WORKFLOW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roboflowPayload),
      });
    } catch (fetchError) {
      console.error('[detect-region] Roboflow fetch error:', fetchError);
      return NextResponse.json(
        { success: false, error: `Failed to connect to Roboflow: ${fetchError instanceof Error ? fetchError.message : 'Network error'}` },
        { status: 502 }
      );
    }

    console.log('[detect-region] Roboflow response status:', roboflowResponse.status);

    if (!roboflowResponse.ok) {
      const errorText = await roboflowResponse.text();
      console.error('[detect-region] Roboflow Workflow API error:', roboflowResponse.status, errorText);
      return NextResponse.json(
        { success: false, error: `Roboflow detection failed: ${roboflowResponse.status} - ${errorText.substring(0, 200)}` },
        { status: 500 }
      );
    }

    // Workflow API returns nested structure: { outputs: [{ predictions: [...] }] }
    const workflowResult = await roboflowResponse.json();
    console.log('[detect-region] Workflow response keys:', Object.keys(workflowResult));
    console.log('[detect-region] First output keys:', workflowResult.outputs?.[0] ? Object.keys(workflowResult.outputs[0]) : 'none');

    // Extract predictions from workflow output - try different paths
    let predictions: RoboflowPrediction[] = [];
    if (workflowResult.outputs?.[0]?.predictions) {
      predictions = workflowResult.outputs[0].predictions;
    } else if (workflowResult.predictions) {
      predictions = workflowResult.predictions;
    } else if (Array.isArray(workflowResult.outputs)) {
      // Find first output with predictions
      for (const output of workflowResult.outputs) {
        if (output?.predictions) {
          predictions = output.predictions;
          break;
        }
      }
    }
    console.log('[detect-region] Roboflow returned', predictions.length, 'predictions');

    // Build the result structure expected by filtering code
    const roboflowResult: RoboflowResponse = {
      predictions,
      image: workflowResult.outputs?.[0]?.image,
    };

    // Filter detections to only those within the selected region AND above confidence threshold
    // Roboflow returns CENTER coordinates, so we check if center is within region
    const filteredDetections = (roboflowResult.predictions || [])
      .filter((pred: RoboflowPrediction) => {
        // Check confidence threshold
        if (pred.confidence < confidence_threshold) {
          return false;
        }
        // Check if detection center is within the selected region
        return (
          pred.x >= region.x &&
          pred.x <= region.x + region.width &&
          pred.y >= region.y &&
          pred.y <= region.y + region.height
        );
      })
      .map((pred: RoboflowPrediction): DetectionResult => ({
        id: `pending-region-${uuidv4()}`,
        class: (pred.class || 'unknown').toLowerCase().replace(/\s+/g, '_'),
        confidence: pred.confidence,
        // Roboflow returns CENTER coordinates - store as-is
        pixel_x: Math.round(pred.x),
        pixel_y: Math.round(pred.y),
        pixel_width: Math.round(pred.width),
        pixel_height: Math.round(pred.height),
        polygon_points: pred.points,
      }));

    console.log('[detect-region] Filtered', filteredDetections.length, 'detections in region');

    return NextResponse.json({
      success: true,
      detections: filteredDetections,
      detection_count: filteredDetections.length,
      message: `Found ${filteredDetections.length} objects in selected region`,
      region,
      source: 'roboflow_direct',
    });
  } catch (error) {
    console.error('[detect-region] ========================================');
    console.error('[detect-region] UNEXPECTED ERROR:', error);
    if (error instanceof Error) {
      console.error('[detect-region] Error name:', error.name);
      console.error('[detect-region] Error message:', error.message);
      console.error('[detect-region] Error stack:', error.stack);
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
