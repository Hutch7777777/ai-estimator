import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type { FloorPlanData, ExteriorCorner, ExteriorWallSegment, CornerSummary } from '@/lib/types/extraction';

// =============================================================================
// Floor Plan Extraction API Route
// Extracts building geometry data from floor plan drawings for siding/trim estimation
// =============================================================================

const FLOOR_PLAN_PROMPT = `You are an expert construction estimator analyzing an architectural FLOOR PLAN drawing.

YOUR TASK: Extract building geometry data needed for EXTERIOR estimation (siding, trim, corners).

Focus on the EXTERIOR PERIMETER of the building - ignore interior walls.

WHAT TO EXTRACT:

1. FLOOR LEVEL
   - Identify which floor this is based on what the drawing actually shows:
     - "crawlspace" - for crawlspace/foundation plans showing footings and foundation walls
     - "basement" - for finished or unfinished basement living space
     - "main" - for the main/first floor (ground level living space)
     - "second" - for second floor / upper level
     - "third", "fourth" - for higher floors
     - "garage" - for detached garage plans
   - Look for labels like "MAIN FLOOR", "SECOND FLOOR", "CRAWLSPACE", "FOUNDATION PLAN"
   - A crawlspace is NOT a "lower floor" - call it "crawlspace"

   IMPORTANT FLOOR IDENTIFICATION RULES:
   - If the plan shows BEDROOMS and BATHROOMS, it is likely "second" floor (upper level), NOT "main" floor
   - "Main floor" typically has: kitchen, living room, dining room, entry, garage connection
   - "Second floor" typically has: bedrooms, bathrooms, closets, bonus rooms
   - Don't be confused by terms like "main living area" in upper floor plans
   - Look for floor labels like "UPPER FLOOR", "SECOND FLOOR", "LEVEL 2"

2. EXTERIOR CORNERS (Critical for corner boards and J-channel)
   - Count ALL corners where exterior walls meet
   - OUTSIDE CORNERS (90°): Standard corners where walls meet outward (most common)
   - INSIDE CORNERS (90°): Where walls create an inward angle (like L-shaped bump-outs)
   - 45° CORNERS: Angled corners (less common)
   - Note the approximate location of each corner

3. EXTERIOR PERIMETER
   - Total linear feet of exterior wall
   - Add up all exterior wall segments
   - Use the scale to calculate real dimensions
   - Break down by wall segment if dimensions are noted

4. FLOOR AREA
   - Total square footage of this floor
   - May be noted directly on plan
   - Or calculate from dimensions

5. EXTERIOR OPENINGS (for cross-reference)
   - Count windows (look for window symbols or marks like W1, W2, 101, 102)
   - Count exterior doors (not interior doors)
   - Count garage doors

6. OVERALL DIMENSIONS
   - Building width (typically East-West)
   - Building depth (typically North-South)

SCALE USAGE:
- Use the provided scale to convert drawing measurements to real-world dimensions
- 1/4" = 1'-0" means 1 inch on drawing = 4 feet actual

CORNER COUNTING TIPS:
- Walk the exterior perimeter mentally, counting each direction change
- A simple rectangle has 4 outside corners
- An L-shaped building has 6 outside corners and 1 inside corner
- Bump-outs add corners (garage bump-out = +4 outside corners typically)
- Bay windows may add corners

Return ONLY valid JSON:
{
  "floorLevel": "main",
  "floorAreaSF": 2850,

  "exteriorPerimeterLF": 245,
  "wallSegments": [
    {
      "id": "north-1",
      "orientation": "north",
      "lengthLF": 52,
      "notes": "front facade",
      "confidence": 0.85
    },
    {
      "id": "east-1",
      "orientation": "east",
      "lengthLF": 38,
      "notes": "right side to garage",
      "confidence": 0.85
    }
  ],

  "corners": [
    {
      "type": "outside_90",
      "location": "front-left (northwest)",
      "confidence": 0.9
    },
    {
      "type": "outside_90",
      "location": "front-right (northeast)",
      "confidence": 0.9
    },
    {
      "type": "inside_90",
      "location": "garage bump-out inner corner",
      "confidence": 0.85
    }
  ],

  "cornerSummary": {
    "outsideCorners90": 12,
    "insideCorners90": 2,
    "outsideCorners45": 0,
    "insideCorners45": 0,
    "totalOutsideCorners": 12,
    "totalInsideCorners": 2
  },

  "windowCount": 18,
  "doorCount": 2,
  "garageDoorCount": 2,

  "overallWidth": 65,
  "overallDepth": 48,

  "scale": "1/4\\" = 1'-0\\"",
  "confidence": 0.8,
  "confidenceNotes": "Clear floor plan with dimensions noted. Corner count based on exterior perimeter trace.",
  "extractionNotes": "Main floor with attached 2-car garage. L-shaped footprint creates inside corner at garage connection."
}

If this is NOT a floor plan or lacks exterior information:
{
  "floorLevel": "unknown",
  "floorAreaSF": null,
  "exteriorPerimeterLF": null,
  "wallSegments": [],
  "corners": [],
  "cornerSummary": {
    "outsideCorners90": 0,
    "insideCorners90": 0,
    "outsideCorners45": 0,
    "insideCorners45": 0,
    "totalOutsideCorners": 0,
    "totalInsideCorners": 0
  },
  "windowCount": 0,
  "doorCount": 0,
  "garageDoorCount": 0,
  "overallWidth": null,
  "overallDepth": null,
  "scale": null,
  "confidence": 0,
  "confidenceNotes": "This page does not appear to contain a floor plan",
  "extractionNotes": "Page type: [describe what it is]"
}

IMPORTANT: Return ONLY the JSON object. No explanation, no markdown formatting.`;

interface ExtractFloorPlanRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
  scaleNotation?: string;
}

interface ExtractFloorPlanResponse {
  success: boolean;
  pageId: string;
  floorPlan?: FloorPlanData;
  error?: string;
  tokens_used?: number;
}

interface ClaudeWallSegmentResponse {
  id?: string;
  orientation: string;
  lengthLF: number;
  wallHeight?: number;
  notes: string | null;
  confidence: number;
}

interface ClaudeCornerResponse {
  type: string;
  location: string;
  angle?: number;
  confidence: number;
}

interface ClaudeExtractionResponse {
  floorLevel: string;
  floorAreaSF: number | null;
  exteriorPerimeterLF: number | null;
  wallSegments: ClaudeWallSegmentResponse[];
  corners: ClaudeCornerResponse[];
  cornerSummary: {
    outsideCorners90: number;
    insideCorners90: number;
    outsideCorners45: number;
    insideCorners45: number;
    totalOutsideCorners: number;
    totalInsideCorners: number;
  };
  windowCount: number;
  doorCount: number;
  garageDoorCount: number;
  overallWidth: number | null;
  overallDepth: number | null;
  scale: string | null;
  confidence: number;
  confidenceNotes: string;
  extractionNotes: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractFloorPlanResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractFloorPlanRequest;
    const { pageId, imageUrl, jobId, pageNumber, scaleNotation } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, pageId: pageId || '', error: 'Missing required fields: pageId and imageUrl' },
        { status: 400 }
      );
    }

    console.log(`[extract-floor-plan] Processing page ${pageId} (page #${pageNumber || 'unknown'})`);

    // 2. Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { success: false, pageId, error: 'Server configuration error: API key not set' },
        { status: 500 }
      );
    }

    // 3. Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // 4. Add scale context to prompt if available
    let contextualPrompt = FLOOR_PLAN_PROMPT;
    if (scaleNotation) {
      contextualPrompt += `\n\nSCALE CONTEXT: This drawing uses scale "${scaleNotation}". Use this to calculate real-world dimensions from the drawing.`;
    }

    // 5. Call Claude Vision API
    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: contextualPrompt,
            },
          ],
        },
      ],
    });
    const processingTime = Date.now() - startTime;
    const tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

    console.log(`[extract-floor-plan] Claude response received in ${processingTime}ms, tokens: ${tokensUsed}`);

    // 6. Extract text content from response
    const textContent = message.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, pageId, error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    // 7. Parse JSON response
    let extractedData: ClaudeExtractionResponse;
    try {
      // Clean potential markdown formatting
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7);
      }
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3);
      }
      jsonText = jsonText.trim();

      extractedData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[extract-floor-plan] JSON parse error:', parseError);
      console.error('[extract-floor-plan] Raw response:', textContent.text);
      return NextResponse.json(
        { success: false, pageId, error: 'Failed to parse Claude response as JSON' },
        { status: 500 }
      );
    }

    // 8. Normalize floor level
    const normalizeFloorLevel = (level: string): FloorPlanData['floorLevel'] => {
      const lower = level.toLowerCase();
      if (lower.includes('crawl') || lower.includes('foundation')) return 'crawlspace';
      if (lower.includes('basement') || lower.includes('bsmt')) return 'basement';
      if (lower.includes('main') || lower.includes('first') || lower === '1st' || lower === '1') return 'main';
      if (lower.includes('second') || lower === '2nd' || lower === '2') return 'second';
      if (lower.includes('third') || lower === '3rd' || lower === '3') return 'third';
      if (lower.includes('fourth') || lower === '4th' || lower === '4') return 'fourth';
      if (lower.includes('garage')) return 'garage';
      return 'unknown';
    };

    // 9. Normalize wall segments
    const normalizedWallSegments: ExteriorWallSegment[] = (extractedData.wallSegments || []).map((seg, idx) => ({
      id: seg.id || `segment-${idx}`,
      orientation: seg.orientation as ExteriorWallSegment['orientation'],
      lengthLF: seg.lengthLF || 0,
      wallHeight: seg.wallHeight,
      notes: seg.notes || null,
      confidence: typeof seg.confidence === 'number' ? seg.confidence : 0.7,
    }));

    // 10. Normalize corners
    const normalizedCorners: ExteriorCorner[] = (extractedData.corners || []).map(corner => ({
      type: corner.type as ExteriorCorner['type'],
      location: corner.location || 'unknown',
      angle: corner.angle,
      confidence: typeof corner.confidence === 'number' ? corner.confidence : 0.7,
    }));

    // 11. Build corner summary with defaults
    const cornerSummary: CornerSummary = extractedData.cornerSummary || {
      outsideCorners90: 0,
      insideCorners90: 0,
      outsideCorners45: 0,
      insideCorners45: 0,
      totalOutsideCorners: 0,
      totalInsideCorners: 0,
    };

    // 12. Build floor plan data
    const floorPlanData: FloorPlanData = {
      id: `${pageId}-floor`,
      pageRef: pageNumber ? `Page ${pageNumber}` : pageId,
      floorLevel: normalizeFloorLevel(extractedData.floorLevel || 'unknown'),
      floorAreaSF: extractedData.floorAreaSF || null,
      exteriorPerimeterLF: extractedData.exteriorPerimeterLF || null,
      wallSegments: normalizedWallSegments,
      corners: normalizedCorners,
      cornerSummary,
      windowCount: extractedData.windowCount || 0,
      doorCount: extractedData.doorCount || 0,
      garageDoorCount: extractedData.garageDoorCount || 0,
      overallWidth: extractedData.overallWidth || null,
      overallDepth: extractedData.overallDepth || null,
      scale: extractedData.scale || scaleNotation || null,
      confidence: typeof extractedData.confidence === 'number' ? extractedData.confidence : 0,
      confidenceNotes: extractedData.confidenceNotes || '',
      extractionNotes: extractedData.extractionNotes || '',
      extractedAt: new Date().toISOString(),
      version: 'v1',
      model_used: 'claude-sonnet-4-20250514',
      tokens_used: tokensUsed,
    };

    console.log(`[extract-floor-plan] Extracted floor plan data:`);
    console.log(`  - Floor level: ${floorPlanData.floorLevel}`);
    console.log(`  - Floor area: ${floorPlanData.floorAreaSF} SF`);
    console.log(`  - Perimeter: ${floorPlanData.exteriorPerimeterLF} LF`);
    console.log(`  - Outside corners (90°): ${floorPlanData.cornerSummary.outsideCorners90}`);
    console.log(`  - Inside corners (90°): ${floorPlanData.cornerSummary.insideCorners90}`);
    console.log(`  - Total outside: ${floorPlanData.cornerSummary.totalOutsideCorners}`);
    console.log(`  - Total inside: ${floorPlanData.cornerSummary.totalInsideCorners}`);
    console.log(`  - Windows: ${floorPlanData.windowCount}`);
    console.log(`  - Doors: ${floorPlanData.doorCount}`);
    console.log(`  - Garage doors: ${floorPlanData.garageDoorCount}`);
    console.log(`  - Confidence: ${Math.round(floorPlanData.confidence * 100)}%`);

    // 13. Store in Supabase (extraction_pages.floor_plan_data)
    const supabase = await createClient();

    // Using type assertion since floor_plan_data column may not be in generated types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_pages')
      .update({
        floor_plan_data: floorPlanData,
      })
      .eq('id', pageId);

    if (updateError) {
      console.error('[extract-floor-plan] Supabase update error:', updateError);
      // Don't fail the request - still return the extracted data
    } else {
      console.log(`[extract-floor-plan] Updated page ${pageId} with floor plan data`);
    }

    // 14. Update job-level aggregated data if jobId provided
    if (jobId && floorPlanData.confidence > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingJob } = await (supabase as any)
          .from('extraction_jobs')
          .select('results_summary')
          .eq('id', jobId)
          .single();

        if (existingJob) {
          const currentSummary = existingJob.results_summary || {};
          const aggregatedData = currentSummary.aggregated_data || {};
          const existingFloorPlans = aggregatedData.floor_plans || [];

          // Add or update this floor's data
          const floorSummary = {
            floorLevel: floorPlanData.floorLevel,
            pageRef: floorPlanData.pageRef,
            floorAreaSF: floorPlanData.floorAreaSF,
            exteriorPerimeterLF: floorPlanData.exteriorPerimeterLF,
            outsideCorners: floorPlanData.cornerSummary.totalOutsideCorners,
            insideCorners: floorPlanData.cornerSummary.totalInsideCorners,
            windowCount: floorPlanData.windowCount,
            doorCount: floorPlanData.doorCount,
            garageDoorCount: floorPlanData.garageDoorCount,
            extractedFromPage: pageNumber,
            lastExtractedAt: new Date().toISOString(),
          };

          // Replace or add this floor
          const existingIdx = existingFloorPlans.findIndex(
            (fp: { pageRef: string }) => fp.pageRef === floorSummary.pageRef
          );
          if (existingIdx >= 0) {
            existingFloorPlans[existingIdx] = floorSummary;
          } else {
            existingFloorPlans.push(floorSummary);
          }

          // Calculate totals
          const totals = {
            totalFloorAreaSF: existingFloorPlans.reduce((sum: number, fp: { floorAreaSF?: number }) => sum + (fp.floorAreaSF || 0), 0),
            totalExteriorPerimeterLF: existingFloorPlans.reduce((sum: number, fp: { exteriorPerimeterLF?: number }) => sum + (fp.exteriorPerimeterLF || 0), 0),
            totalOutsideCorners: existingFloorPlans.reduce((sum: number, fp: { outsideCorners?: number }) => sum + (fp.outsideCorners || 0), 0),
            totalInsideCorners: existingFloorPlans.reduce((sum: number, fp: { insideCorners?: number }) => sum + (fp.insideCorners || 0), 0),
            totalWindowCount: existingFloorPlans.reduce((sum: number, fp: { windowCount?: number }) => sum + (fp.windowCount || 0), 0),
            totalDoorCount: existingFloorPlans.reduce((sum: number, fp: { doorCount?: number }) => sum + (fp.doorCount || 0), 0),
            totalGarageDoorCount: existingFloorPlans.reduce((sum: number, fp: { garageDoorCount?: number }) => sum + (fp.garageDoorCount || 0), 0),
            floorCount: existingFloorPlans.length,
            lastUpdatedAt: new Date().toISOString(),
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('extraction_jobs')
            .update({
              results_summary: {
                ...currentSummary,
                aggregated_data: {
                  ...aggregatedData,
                  floor_plans: existingFloorPlans,
                  building_geometry: totals,
                },
              },
            })
            .eq('id', jobId);

          console.log(`[extract-floor-plan] Updated job ${jobId} with aggregated floor plan data`);
        }
      } catch (jobUpdateError) {
        console.error('[extract-floor-plan] Job update error:', jobUpdateError);
        // Non-critical - don't fail the request
      }
    }

    console.log(`[extract-floor-plan] Complete. Time: ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      pageId,
      floorPlan: floorPlanData,
      tokens_used: tokensUsed,
    });

  } catch (error) {
    console.error('[extract-floor-plan] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        pageId: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve existing floor plan data for a page
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    if (!pageId) {
      return NextResponse.json(
        { success: false, error: 'Missing pageId parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Using type assertion since floor_plan_data column may not be in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page, error } = await (supabase as any)
      .from('extraction_pages')
      .select('id, floor_plan_data')
      .eq('id', pageId)
      .single();

    if (error || !page) {
      return NextResponse.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    const typedPage = page as { id: string; floor_plan_data?: FloorPlanData };

    return NextResponse.json({
      success: true,
      pageId,
      floorPlan: typedPage.floor_plan_data,
    });

  } catch (error) {
    console.error('[extract-floor-plan] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch floor plan data' },
      { status: 500 }
    );
  }
}
