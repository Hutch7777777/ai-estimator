import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type { RoofPlanData, RoofSlope, RoofLinearElement, RoofFeature, RoofMaterialCallout, RoofLinearSummary } from '@/lib/types/extraction';

// =============================================================================
// Roof Plan Extraction API Route
// Extracts roofing data from roof plan drawings
// =============================================================================

const ROOF_PLAN_PROMPT = `You are an expert construction estimator analyzing an architectural ROOF PLAN drawing.

YOUR TASK: Extract ALL roofing data needed for a roofing estimate.

WHAT TO LOOK FOR:

1. ROOF PITCH/SLOPE
   - Look for notations like "6:12", "8/12", "6-12", "6 IN 12"
   - May be shown with a triangle symbol
   - Different roof sections may have different pitches
   - Convert to standard format: "6:12"

2. LINEAR ELEMENTS (measure or estimate from scale)
   - RIDGE: The peak line where two slopes meet (horizontal line at top)
   - HIP: Diagonal line where two slopes meet at an outside corner
   - VALLEY: Diagonal line where two slopes meet at an inside corner (forms V)
   - EAVE: Horizontal edge at the bottom of roof (over exterior walls)
   - RAKE: Sloped edge at gable ends (diagonal edge)

3. ROOF AREAS
   - May be noted directly on plan
   - Or calculate from dimensions if scale is known
   - Break down by section if multiple roof areas

4. FEATURES
   - Skylights (note size and quantity)
   - Chimneys (note size)
   - Vents (plumbing vents, attic vents)
   - Dormers
   - Crickets (small diverter roofs behind chimneys)
   - Solar panel areas

5. MATERIAL CALLOUTS
   - "ARCH. SHINGLES", "GAF TIMBERLINE", "30 YR SHINGLE"
   - Metal roofing specs
   - Underlayment notes

SCALE USAGE:
- If scale is provided (e.g., 1/4" = 1'-0"), use it to calculate dimensions
- 1/4" = 1'-0" means 1 inch on drawing = 4 feet real
- If no scale, estimate based on typical residential dimensions

Return ONLY valid JSON:
{
  "primaryPitch": "6:12",
  "totalRoofAreaSF": 3200,

  "slopes": [
    {
      "name": "Main Roof - Front",
      "pitch": "6:12",
      "pitchDegrees": 26.57,
      "areaSF": 1600,
      "notes": null,
      "confidence": 0.85
    },
    {
      "name": "Main Roof - Back",
      "pitch": "6:12",
      "pitchDegrees": 26.57,
      "areaSF": 1400,
      "notes": null,
      "confidence": 0.85
    }
  ],

  "linearElements": [
    {
      "type": "ridge",
      "lengthLF": 85,
      "location": "main ridge",
      "notes": null,
      "confidence": 0.8
    },
    {
      "type": "hip",
      "lengthLF": 24,
      "location": "front left corner",
      "notes": null,
      "confidence": 0.75
    },
    {
      "type": "valley",
      "lengthLF": 18,
      "location": "between main roof and garage",
      "notes": null,
      "confidence": 0.75
    },
    {
      "type": "eave",
      "lengthLF": 180,
      "location": "total eave perimeter",
      "notes": null,
      "confidence": 0.8
    },
    {
      "type": "rake",
      "lengthLF": 95,
      "location": "gable ends",
      "notes": null,
      "confidence": 0.8
    }
  ],

  "linearSummary": {
    "ridgeLF": 85,
    "hipLF": 24,
    "valleyLF": 18,
    "eaveLF": 180,
    "rakeLF": 95,
    "totalPerimeterLF": 275
  },

  "features": [
    {
      "type": "skylight",
      "quantity": 1,
      "size": "2'-6\\" x 4'-0\\"",
      "location": "south slope",
      "notes": null
    },
    {
      "type": "chimney",
      "quantity": 1,
      "size": "3' x 4'",
      "location": "center of main roof",
      "notes": "requires cricket"
    }
  ],

  "materialCallouts": [
    {
      "rawText": "GAF TIMBERLINE HDZ",
      "materialType": "asphalt_shingle",
      "manufacturer": "GAF",
      "productLine": "Timberline HDZ",
      "color": null,
      "confidence": 0.9
    }
  ],

  "confidence": 0.8,
  "confidenceNotes": "Clear roof plan with pitch notation and dimensions. Linear measurements estimated from scale.",
  "extractionNotes": "Two-story home with main gable roof and attached garage. One skylight and one chimney noted."
}

If this is NOT a roof plan or contains no usable data:
{
  "primaryPitch": null,
  "totalRoofAreaSF": null,
  "slopes": [],
  "linearElements": [],
  "linearSummary": {
    "ridgeLF": 0,
    "hipLF": 0,
    "valleyLF": 0,
    "eaveLF": 0,
    "rakeLF": 0,
    "totalPerimeterLF": 0
  },
  "features": [],
  "materialCallouts": [],
  "confidence": 0,
  "confidenceNotes": "This page does not appear to be a roof plan",
  "extractionNotes": "Page type: [describe what it is]"
}

IMPORTANT: Return ONLY the JSON object. No explanation, no markdown formatting.`;

interface ExtractRoofPlanRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
  scaleNotation?: string;
}

interface ExtractRoofPlanResponse {
  success: boolean;
  pageId: string;
  roofPlan?: RoofPlanData;
  error?: string;
  tokens_used?: number;
}

interface ClaudeSlopeResponse {
  name: string;
  pitch: string;
  pitchDegrees: number | null;
  areaSF: number | null;
  notes: string | null;
  confidence: number;
}

interface ClaudeLinearElementResponse {
  type: string;
  lengthLF: number;
  location: string | null;
  notes: string | null;
  confidence: number;
}

interface ClaudeFeatureResponse {
  type: string;
  quantity: number;
  size: string | null;
  location: string | null;
  notes: string | null;
}

interface ClaudeMaterialCalloutResponse {
  rawText: string;
  materialType: string | null;
  manufacturer: string | null;
  productLine: string | null;
  color: string | null;
  confidence: number;
}

interface ClaudeExtractionResponse {
  primaryPitch: string | null;
  totalRoofAreaSF: number | null;
  slopes: ClaudeSlopeResponse[];
  linearElements: ClaudeLinearElementResponse[];
  linearSummary: {
    ridgeLF: number;
    hipLF: number;
    valleyLF: number;
    eaveLF: number;
    rakeLF: number;
    totalPerimeterLF: number;
  };
  features: ClaudeFeatureResponse[];
  materialCallouts: ClaudeMaterialCalloutResponse[];
  confidence: number;
  confidenceNotes: string;
  extractionNotes: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractRoofPlanResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractRoofPlanRequest;
    const { pageId, imageUrl, jobId, pageNumber, scaleNotation } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, pageId: pageId || '', error: 'Missing required fields: pageId and imageUrl' },
        { status: 400 }
      );
    }

    console.log(`[extract-roof-plan] Processing page ${pageId} (page #${pageNumber || 'unknown'})`);

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
    let contextualPrompt = ROOF_PLAN_PROMPT;
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

    console.log(`[extract-roof-plan] Claude response received in ${processingTime}ms, tokens: ${tokensUsed}`);

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
      console.error('[extract-roof-plan] JSON parse error:', parseError);
      console.error('[extract-roof-plan] Raw response:', textContent.text);
      return NextResponse.json(
        { success: false, pageId, error: 'Failed to parse Claude response as JSON' },
        { status: 500 }
      );
    }

    // 8. Normalize and build roof plan data
    const normalizedSlopes: RoofSlope[] = (extractedData.slopes || []).map((slope, idx) => ({
      id: `${pageId}-slope-${idx}`,
      name: slope.name || `Slope ${idx + 1}`,
      pitch: slope.pitch || 'Unknown',
      pitchDegrees: slope.pitchDegrees || null,
      areaSF: slope.areaSF || null,
      notes: slope.notes || null,
      confidence: typeof slope.confidence === 'number' ? slope.confidence : 0.7,
    }));

    const normalizedLinearElements: RoofLinearElement[] = (extractedData.linearElements || []).map(elem => ({
      type: elem.type as RoofLinearElement['type'],
      lengthLF: elem.lengthLF || 0,
      location: elem.location || null,
      notes: elem.notes || null,
      confidence: typeof elem.confidence === 'number' ? elem.confidence : 0.7,
    }));

    const normalizedFeatures: RoofFeature[] = (extractedData.features || []).map(feature => ({
      type: feature.type as RoofFeature['type'],
      quantity: feature.quantity || 1,
      size: feature.size || null,
      location: feature.location || null,
      notes: feature.notes || null,
    }));

    const normalizedMaterialCallouts: RoofMaterialCallout[] = (extractedData.materialCallouts || []).map(callout => ({
      rawText: callout.rawText || '',
      materialType: callout.materialType || null,
      manufacturer: callout.manufacturer || null,
      productLine: callout.productLine || null,
      color: callout.color || null,
      confidence: typeof callout.confidence === 'number' ? callout.confidence : 0.7,
    }));

    const linearSummary: RoofLinearSummary = extractedData.linearSummary || {
      ridgeLF: 0,
      hipLF: 0,
      valleyLF: 0,
      eaveLF: 0,
      rakeLF: 0,
      totalPerimeterLF: 0,
    };

    const roofPlanData: RoofPlanData = {
      id: `${pageId}-roof`,
      pageRef: pageNumber ? `Page ${pageNumber}` : pageId,
      primaryPitch: extractedData.primaryPitch || null,
      totalRoofAreaSF: extractedData.totalRoofAreaSF || null,
      slopes: normalizedSlopes,
      linearElements: normalizedLinearElements,
      linearSummary,
      features: normalizedFeatures,
      materialCallouts: normalizedMaterialCallouts,
      confidence: typeof extractedData.confidence === 'number' ? extractedData.confidence : 0,
      confidenceNotes: extractedData.confidenceNotes || '',
      extractionNotes: extractedData.extractionNotes || '',
      extractedAt: new Date().toISOString(),
      version: 'v1',
      model_used: 'claude-sonnet-4-20250514',
      tokens_used: tokensUsed,
    };

    console.log(`[extract-roof-plan] Extracted roof plan data:`);
    console.log(`  - Primary pitch: ${roofPlanData.primaryPitch}`);
    console.log(`  - Total area: ${roofPlanData.totalRoofAreaSF} SF`);
    console.log(`  - Slopes: ${roofPlanData.slopes.length}`);
    console.log(`  - Ridge: ${roofPlanData.linearSummary.ridgeLF} LF`);
    console.log(`  - Hip: ${roofPlanData.linearSummary.hipLF} LF`);
    console.log(`  - Valley: ${roofPlanData.linearSummary.valleyLF} LF`);
    console.log(`  - Eave: ${roofPlanData.linearSummary.eaveLF} LF`);
    console.log(`  - Rake: ${roofPlanData.linearSummary.rakeLF} LF`);
    console.log(`  - Features: ${roofPlanData.features.length}`);
    console.log(`  - Confidence: ${Math.round(roofPlanData.confidence * 100)}%`);

    // 9. Store in Supabase (extraction_pages.roof_plan_data)
    const supabase = await createClient();

    // Using type assertion since roof_plan_data column may not be in generated types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_pages')
      .update({
        roof_plan_data: roofPlanData,
      })
      .eq('id', pageId);

    if (updateError) {
      console.error('[extract-roof-plan] Supabase update error:', updateError);
      // Don't fail the request - still return the extracted data
    } else {
      console.log(`[extract-roof-plan] Updated page ${pageId} with roof plan data`);
    }

    // 10. Update job-level aggregated data if jobId provided
    if (jobId && roofPlanData.confidence > 0) {
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

          // Count skylights and chimneys
          const skylightCount = roofPlanData.features
            .filter(f => f.type === 'skylight')
            .reduce((sum, f) => sum + f.quantity, 0);
          const chimneyCount = roofPlanData.features
            .filter(f => f.type === 'chimney')
            .reduce((sum, f) => sum + f.quantity, 0);

          const roofSummary = {
            primaryPitch: roofPlanData.primaryPitch,
            totalRoofAreaSF: roofPlanData.totalRoofAreaSF,
            ridgeLF: roofPlanData.linearSummary.ridgeLF,
            hipLF: roofPlanData.linearSummary.hipLF,
            valleyLF: roofPlanData.linearSummary.valleyLF,
            eaveLF: roofPlanData.linearSummary.eaveLF,
            rakeLF: roofPlanData.linearSummary.rakeLF,
            skylightCount,
            chimneyCount,
            extractedFromPage: pageNumber,
            lastExtractedAt: new Date().toISOString(),
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('extraction_jobs')
            .update({
              results_summary: {
                ...currentSummary,
                aggregated_data: {
                  ...aggregatedData,
                  roof: roofSummary,
                },
              },
            })
            .eq('id', jobId);

          console.log(`[extract-roof-plan] Updated job ${jobId} with aggregated roof data`);
        }
      } catch (jobUpdateError) {
        console.error('[extract-roof-plan] Job update error:', jobUpdateError);
        // Non-critical - don't fail the request
      }
    }

    console.log(`[extract-roof-plan] Complete. Time: ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      pageId,
      roofPlan: roofPlanData,
      tokens_used: tokensUsed,
    });

  } catch (error) {
    console.error('[extract-roof-plan] Unexpected error:', error);
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

// GET endpoint to retrieve existing roof plan data for a page
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

    // Using type assertion since roof_plan_data column may not be in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page, error } = await (supabase as any)
      .from('extraction_pages')
      .select('id, roof_plan_data')
      .eq('id', pageId)
      .single();

    if (error || !page) {
      return NextResponse.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    const typedPage = page as { id: string; roof_plan_data?: RoofPlanData };

    return NextResponse.json({
      success: true,
      pageId,
      roofPlan: typedPage.roof_plan_data,
    });

  } catch (error) {
    console.error('[extract-roof-plan] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch roof plan data' },
      { status: 500 }
    );
  }
}
