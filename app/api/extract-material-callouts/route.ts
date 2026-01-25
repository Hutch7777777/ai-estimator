import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type { MaterialCallout } from '@/lib/types/extraction';

// =============================================================================
// Material Callout Extraction API Route
// Uses Claude Vision to extract material specifications from elevation drawings
// =============================================================================

const MATERIAL_CALLOUT_PROMPT = `Extract ALL material specifications and callouts from this construction elevation/section drawing.

LOOK FOR THESE PATTERNS:
- SIDING: "HARDIE PLANK LAP SIDING 7" EXPOSURE", "LP SMARTSIDE PANEL", "CERTAINTEED", "FIBER CEMENT"
- TRIM: "1x4 SMOOTH TRIM", "3-1/2" TRIM", "HARDIE TRIM", "PVC TRIM"
- ROOFING: "GAF TIMBERLINE HDZ", "CERTAINTEED LANDMARK", "OWENS CORNING DURATION", "ASPHALT SHINGLES"
- FASCIA/SOFFIT: "6" SMOOTH FASCIA", "VENTED SOFFIT PANELS", "ALUMINUM SOFFIT"
- OTHER: "R-21 BATT INSULATION", "5/8" FIRE-RATED GYPSUM", "ZIP SYSTEM SHEATHING", "HOUSE WRAP"

MANUFACTURER RECOGNITION:
- James Hardie: "Hardie", "HardiePlank", "HardieTrim", "Artisan", "ColorPlus"
- LP Building Products: "LP", "SmartSide", "Smart Trim"
- CertainTeed: "CertainTeed", "Landmark", "Presidential"
- GAF: "GAF", "Timberline", "Camelot", "HDZ"
- Owens Corning: "Duration", "TruDefinition", "Oakridge"
- Boral: "Boral", "TruExterior"
- Royal: "Royal", "Celect"

MATERIAL TYPE CLASSIFICATION:
- lap_siding, board_and_batten, panel_siding, shake_siding, shingle_siding
- fascia_board, soffit_panel, corner_trim, window_trim, door_trim
- asphalt_shingle, metal_roofing, standing_seam, tile_roofing
- insulation, sheathing, house_wrap

TRADE CLASSIFICATION:
siding, trim, roofing, fascia, soffit, gutter, insulation, sheathing, miscellaneous

IMPORTANT:
- Extract the EXACT text as shown on the drawing
- Note any exposure dimensions (e.g., "7" EXPOSURE", "8" REVEAL")
- Note any color specifications
- If a profile/style is mentioned (lap, dutch lap, beaded, etc.), include it

Return ONLY valid JSON (no markdown, no explanation):
{
  "callouts": [
    {
      "rawText": "exact text as shown on drawing",
      "trade": "siding",
      "materialType": "lap_siding",
      "manufacturer": "James Hardie",
      "productLine": "HardiePlank",
      "exposure_inches": 7,
      "color": null,
      "dimensions": null,
      "confidence": 0.95
    }
  ],
  "summary": {
    "siding_manufacturer": "James Hardie",
    "siding_type": "lap",
    "siding_exposure": 7,
    "trim_manufacturer": null,
    "roofing_manufacturer": null,
    "roofing_type": null
  },
  "extraction_confidence": 0.85,
  "extraction_notes": "Any observations about the drawing or material specs"
}

If NO material callouts are found (e.g., the image is a floor plan without material specs):
{
  "callouts": [],
  "summary": {},
  "extraction_confidence": 0,
  "extraction_notes": "No material callouts found - this appears to be [describe what the image shows]"
}`;

interface ExtractMaterialCalloutsRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
}

interface ExtractMaterialCalloutsResponse {
  success: boolean;
  pageId: string;
  data?: {
    callouts: MaterialCallout[];
    summary: Record<string, unknown>;
    extraction_confidence: number;
    extraction_notes?: string;
  };
  error?: string;
  tokens_used?: number;
}

interface ClaudeCalloutResponse {
  rawText: string;
  trade: string;
  materialType?: string;
  manufacturer?: string;
  productLine?: string;
  exposure_inches?: number;
  color?: string;
  dimensions?: string;
  confidence: number;
}

interface ClaudeExtractionResponse {
  callouts: ClaudeCalloutResponse[];
  summary: Record<string, unknown>;
  extraction_confidence: number;
  extraction_notes?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractMaterialCalloutsResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractMaterialCalloutsRequest;
    const { pageId, imageUrl, jobId, pageNumber } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, pageId: pageId || '', error: 'Missing required fields: pageId and imageUrl' },
        { status: 400 }
      );
    }

    console.log(`[extract-material-callouts] Processing page ${pageId} (page #${pageNumber || 'unknown'})`);

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

    // 4. Call Claude Vision API
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
              text: MATERIAL_CALLOUT_PROMPT,
            },
          ],
        },
      ],
    });
    const processingTime = Date.now() - startTime;
    const tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

    console.log(`[extract-material-callouts] Claude response received in ${processingTime}ms, tokens: ${tokensUsed}`);

    // 5. Extract text content from response
    const textContent = message.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, pageId, error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    // 6. Parse JSON response
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
      console.error('[extract-material-callouts] JSON parse error:', parseError);
      console.error('[extract-material-callouts] Raw response:', textContent.text);
      return NextResponse.json(
        { success: false, pageId, error: 'Failed to parse Claude response as JSON' },
        { status: 500 }
      );
    }

    // 7. Normalize and validate extracted callouts
    const normalizedCallouts: MaterialCallout[] = (extractedData.callouts || []).map((c, idx) => ({
      id: `${pageId}-callout-${idx}`,
      rawText: String(c.rawText || ''),
      normalizedText: normalizeText(c.rawText),
      trade: String(c.trade || 'miscellaneous').toLowerCase(),
      materialType: c.materialType ? String(c.materialType) : undefined,
      manufacturer: c.manufacturer ? String(c.manufacturer) : undefined,
      productMatch: undefined, // Will be matched later against product_catalog
      confidence: typeof c.confidence === 'number' ? c.confidence : 0.8,
      pageRef: pageNumber ? `Page ${pageNumber}` : undefined,
    }));

    console.log(`[extract-material-callouts] Extracted ${normalizedCallouts.length} callouts from page ${pageNumber || pageId}`);
    if (normalizedCallouts.length > 0) {
      console.log(`[extract-material-callouts] Sample callouts:`, normalizedCallouts.slice(0, 3).map(c => c.rawText));
    }

    // 8. Store in Supabase (extraction_pages.material_callouts)
    const supabase = await createClient();

    // Using type assertion since material_callouts column exists but isn't in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_pages')
      .update({
        material_callouts: {
          callouts: normalizedCallouts,
          summary: extractedData.summary || {},
          extraction_confidence: extractedData.extraction_confidence || 0,
          extraction_notes: extractedData.extraction_notes,
          extracted_at: new Date().toISOString(),
          model_used: 'claude-sonnet-4-20250514',
          tokens_used: tokensUsed,
        },
      })
      .eq('id', pageId);

    if (updateError) {
      console.error('[extract-material-callouts] Supabase update error:', updateError);
      // Don't fail the request - still return the extracted data
    } else {
      console.log(`[extract-material-callouts] Updated page ${pageId} with material callouts`);
    }

    // 9. Optionally update job-level aggregated data
    if (jobId && normalizedCallouts.length > 0) {
      try {
        // Get current job results_summary
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: job } = await (supabase as any)
          .from('extraction_jobs')
          .select('results_summary')
          .eq('id', jobId)
          .single();

        if (job) {
          const currentSummary = (job as { results_summary?: Record<string, unknown> }).results_summary || {};
          const aggregatedData = (currentSummary as Record<string, unknown>).aggregated_data as Record<string, unknown> || {};

          // Merge material summary
          const existingMaterials = (aggregatedData.materials as Record<string, unknown>) || {};
          const newMaterials = {
            ...existingMaterials,
            ...extractedData.summary,
            source: 'elevation_ocr',
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('extraction_jobs')
            .update({
              results_summary: {
                ...currentSummary,
                aggregated_data: {
                  ...aggregatedData,
                  materials: newMaterials,
                },
              },
            })
            .eq('id', jobId);
        }
      } catch (jobUpdateError) {
        console.error('[extract-material-callouts] Job update error:', jobUpdateError);
        // Non-critical - don't fail the request
      }
    }

    console.log(`[extract-material-callouts] Complete. Callouts: ${normalizedCallouts.length}, Time: ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      pageId,
      data: {
        callouts: normalizedCallouts,
        summary: extractedData.summary || {},
        extraction_confidence: extractedData.extraction_confidence || 0,
        extraction_notes: extractedData.extraction_notes,
      },
      tokens_used: tokensUsed,
    });

  } catch (error) {
    console.error('[extract-material-callouts] Unexpected error:', error);
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

// GET endpoint to check extraction status for a page
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

    // Using type assertion since material_callouts column exists but isn't in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page, error } = await (supabase as any)
      .from('extraction_pages')
      .select('id, material_callouts')
      .eq('id', pageId)
      .single();

    if (error || !page) {
      return NextResponse.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    const typedPage = page as { id: string; material_callouts?: Record<string, unknown> };

    return NextResponse.json({
      success: true,
      pageId,
      data: typedPage.material_callouts,
    });

  } catch (error) {
    console.error('[extract-material-callouts] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch material callouts' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalizes text for comparison and deduplication
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"]/g, '')  // Remove quotes
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();
}
