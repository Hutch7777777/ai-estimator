import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type {
  TextAnnotation,
  SurveyResult,
  EnhancedMaterialCallout,
  MaterialExtractionV2Result,
  MaterialDimensions,
} from '@/lib/types/extraction';

// =============================================================================
// Material Callout Extraction V2 - Two-Pass Architecture
// Pass 1: Survey all text on the page
// Pass 2: Deep classify each material specification
// =============================================================================

// -----------------------------------------------------------------------------
// PASS 1: TEXT SURVEY PROMPT
// -----------------------------------------------------------------------------
const SURVEY_PROMPT = `You are analyzing an architectural elevation drawing. Your job is to find ALL text annotations.

SCAN THE ENTIRE IMAGE for text, including:
- Main callouts with leader lines pointing to building elements
- Notes in margins or corners
- Text in title block (bottom right usually)
- Small annotations near edges
- Abbreviations (TYP., SIM., EQ., CONT., etc.)
- Dimension strings (9'-1", 24'-0", etc.)

For EACH piece of text found, record:
1. exactText: The PRECISE text as written (preserve spelling, abbreviations, punctuation, line breaks as spaces)
2. location: Where on the page (e.g., "upper-left quadrant", "near roof line", "title block", "left margin")
3. hasLeaderLine: true/false - does it have a line/arrow pointing to something?
4. pointsTo: What building element does it reference? (wall, roof, window, door, trim, gable, foundation, etc.)
5. textType: Classify as one of:
   - "material_spec" = describes materials (siding, shingles, trim boards, insulation, etc.)
   - "dimension" = measurements (heights, widths, lengths)
   - "note" = general construction notes
   - "label" = element labels (FRONT ELEVATION, SECTION A-A)
   - "title" = drawing title/sheet info
   - "other" = anything else

MATERIAL SPEC INDICATORS (mark as "material_spec"):
- Product names: "HARDIE", "LP SMARTSIDE", "GAF", "CERTAINTEED", "TYVEK", "ZIP"
- Material descriptions: "LAP SIDING", "PANEL SIDING", "ASPHALT SHINGLES", "FIBER CEMENT"
- Dimensions on materials: '7" EXPOSURE', '1x4 TRIM', '5/16" PANEL'
- Installation specs: "SMOOTH FINISH", "PRIMED", "COLORPLUS"

BE EXHAUSTIVE. It's better to capture too much than miss something important.

Return ONLY valid JSON (no markdown):
{
  "annotations": [
    {
      "id": 1,
      "exactText": "HARDIE PANEL VERTICAL SIDING",
      "location": "upper-left, near gable",
      "hasLeaderLine": true,
      "pointsTo": "wall surface at gable",
      "textType": "material_spec"
    },
    {
      "id": 2,
      "exactText": "9'-1\\"",
      "location": "right side",
      "hasLeaderLine": true,
      "pointsTo": "wall height dimension",
      "textType": "dimension"
    }
  ],
  "totalFound": 25,
  "materialSpecs": 12,
  "dimensions": 8,
  "other": 5,
  "imageQuality": "good",
  "notes": "Clear elevation drawing with detailed callouts. Some text near edges may be partially cut off."
}

imageQuality: "good" = clear text, "fair" = some fuzzy areas, "poor" = hard to read`;

// -----------------------------------------------------------------------------
// PASS 2: CLASSIFICATION PROMPT BUILDER
// -----------------------------------------------------------------------------
function buildClassificationPrompt(annotation: TextAnnotation): string {
  return `Analyze this material specification text from an architectural drawing:

TEXT: "${annotation.exactText}"
LOCATION: ${annotation.location}
POINTS TO: ${annotation.pointsTo}

Your task: Extract EVERY detail possible from this text.

MANUFACTURER DETECTION (only if explicitly mentioned or clearly implied):
- James Hardie: "Hardie", "HardiePlank", "HardiePanel", "HardieTrim", "Artisan", "ColorPlus"
- LP Building Products: "LP", "SmartSide", "SmartTrim", "Smart Side", "Smart Trim"
- CertainTeed: "CertainTeed", "Landmark", "Presidential", "Northgate"
- GAF: "GAF", "Timberline", "HDZ", "Camelot", "Grand Sequoia"
- Owens Corning: "OC", "Owens Corning", "Duration", "TruDefinition", "Oakridge"
- DuPont: "Tyvek", "HomeWrap", "CommercialWrap"
- ZIP System/Huber: "ZIP", "Huber", "AdvanTech"
- Boral: "Boral", "TruExterior"
- Royal: "Royal", "Celect"
- Azek: "Azek", "TimberTech"

MATERIAL TYPE (based on context and text):
Siding: lap_siding, panel_siding, board_and_batten, shake, shingle, stucco, stone_veneer, brick_veneer, vertical_siding
Trim: flat_trim, crown_molding, base_trim, window_trim, door_trim, corner_board, band_board, frieze_board, rake_trim
Roofing: asphalt_shingle, metal_panel, standing_seam, slate, tile, flat_membrane
Fascia: fascia_board, composite_fascia, aluminum_fascia
Soffit: vented_soffit, solid_soffit, aluminum_soffit
Other: gutter, downspout, flashing, sheathing, weather_barrier, insulation

PROFILE/TEXTURE DETECTION:
- "SMOOTH" = smooth
- "CEDAR MILL", "CEDARMILL" = cedar_mill
- "SELECT CEDARMILL" = select_cedarmill
- "STUCCO" texture = stucco
- "BEADED" = beaded

FINISH DETECTION:
- "PRIMED" = primed (needs painting)
- "COLORPLUS" = colorplus (factory finished)
- "PREFINISHED" = prefinished
- "PAINTED" = painted
- "STAINED" = stained

DIMENSION PARSING:
- Exposure: "7\\" EXP", "7 INCH EXPOSURE", "7\\" REVEAL", "7\\" EXPOSURE" → exposure_inches: 7
- Thickness: "5/16\\"", "3/8\\"", "7/16\\"" → thickness_inches: (convert to decimal)
- Board width: "1x4" = 3.5", "1x6" = 5.5", "1x8" = 7.25", "1x10" = 9.25" (actual lumber dimensions)
- Panel width: "4x8", "4x9", "4x10" (feet, for sheets)

ABBREVIATION MEANINGS:
- "TYP." = typical (applies to multiple locations)
- "SIM." = similar
- "CONT." = continuous
- "EQ." = equal spacing
- "(E)" or "EXIST." = existing

COLOR DETECTION:
Look for color names like: "ARCTIC WHITE", "IRON GRAY", "COBBLESTONE", "NAVAJO BEIGE", "MONTEREY TAUPE"

Return ONLY valid JSON:
{
  "rawText": "${annotation.exactText}",
  "normalizedText": "Clean, standardized version without abbreviations expanded",
  "trade": "siding|trim|roofing|fascia|soffit|gutter|insulation|sheathing|weather_barrier|flashing|miscellaneous",
  "materialType": "specific type from lists above",
  "manufacturer": "Company name or null if not determinable",
  "productLine": "Specific product line (e.g., HardiePlank, SmartSide) or null",
  "profile": "smooth|cedar_mill|stucco|beaded|select_cedarmill|null",
  "finish": "primed|colorplus|prefinished|painted|stained|null",
  "color": "Color name or null",
  "dimensions": {
    "exposure_inches": null,
    "thickness_inches": null,
    "width_inches": null,
    "length_feet": null
  },
  "orientation": "horizontal|vertical|null",
  "installationNotes": "TYP., SIM., CONT., etc. or null",
  "confidence": 0.95,
  "confidenceNotes": "High confidence - explicit manufacturer and product mentioned",
  "alternatives": []
}

CONFIDENCE GUIDELINES:
- 0.95-1.0: Explicit manufacturer + product name visible
- 0.85-0.94: Clear material type with some details
- 0.70-0.84: Material type identifiable but details unclear
- 0.50-0.69: Partial information, some guessing required
- Below 0.50: Very uncertain, include alternatives`;
}

// -----------------------------------------------------------------------------
// Request/Response Types
// -----------------------------------------------------------------------------
interface ExtractMaterialCalloutsV2Request {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
}

interface ExtractMaterialCalloutsV2Response {
  success: boolean;
  pageId: string;
  version: 'v2';
  data?: {
    callouts: EnhancedMaterialCallout[];
    surveyResult: SurveyResult;
    stats: {
      totalAnnotationsFound: number;
      materialSpecsFound: number;
      classificationCalls: number;
      finalCalloutsAfterDedup: number;
    };
  };
  error?: string;
  tokens_used?: number;
  processing_time_ms?: number;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function parseJsonResponse<T>(text: string): T {
  let jsonText = text.trim();

  // Remove markdown code blocks
  jsonText = jsonText.replace(/```json\s*/gi, '');
  jsonText = jsonText.replace(/```\s*/g, '');

  // Find JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  return JSON.parse(jsonMatch[0]);
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateCallouts(callouts: EnhancedMaterialCallout[]): EnhancedMaterialCallout[] {
  const seen = new Map<string, EnhancedMaterialCallout>();

  for (const callout of callouts) {
    // Create key from normalized text + trade
    const key = `${normalizeText(callout.rawText)}|${callout.trade}`;

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      // Keep the one with higher confidence
      if (callout.confidence > existing.confidence) {
        seen.set(key, callout);
      }
    } else {
      seen.set(key, callout);
    }
  }

  return Array.from(seen.values());
}

// -----------------------------------------------------------------------------
// Main API Handler
// -----------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse<ExtractMaterialCalloutsV2Response>> {
  const startTime = Date.now();
  let totalTokensUsed = 0;

  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractMaterialCalloutsV2Request;
    const { pageId, imageUrl, jobId, pageNumber } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, pageId: pageId || '', version: 'v2', error: 'Missing required fields: pageId and imageUrl' },
        { status: 400 }
      );
    }

    console.log(`\n[extract-material-callouts-v2] ========================================`);
    console.log(`[extract-material-callouts-v2] Processing page ${pageId} (page #${pageNumber || 'unknown'})`);
    console.log(`[extract-material-callouts-v2] Using TWO-PASS extraction`);

    // 2. Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { success: false, pageId, version: 'v2', error: 'Server configuration error: API key not set' },
        { status: 500 }
      );
    }

    // 3. Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // =========================================================================
    // PASS 1: SURVEY ALL TEXT
    // =========================================================================
    console.log(`[extract-material-callouts-v2] PASS 1: Surveying all text...`);
    const pass1Start = Date.now();

    const surveyMessage = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            {
              type: 'text',
              text: SURVEY_PROMPT,
            },
          ],
        },
      ],
    });

    const pass1Tokens = (surveyMessage.usage?.input_tokens || 0) + (surveyMessage.usage?.output_tokens || 0);
    totalTokensUsed += pass1Tokens;
    const pass1Time = Date.now() - pass1Start;

    // Parse survey response
    const surveyTextContent = surveyMessage.content.find(block => block.type === 'text');
    if (!surveyTextContent || surveyTextContent.type !== 'text') {
      throw new Error('No text response from Claude in survey pass');
    }

    let surveyResult: SurveyResult;
    try {
      surveyResult = parseJsonResponse<SurveyResult>(surveyTextContent.text);
    } catch (parseError) {
      console.error('[extract-material-callouts-v2] Survey parse error:', parseError);
      console.error('[extract-material-callouts-v2] Raw response:', surveyTextContent.text.substring(0, 500));
      throw new Error('Failed to parse survey response');
    }

    console.log(`[extract-material-callouts-v2] PASS 1 complete: ${surveyResult.totalFound} annotations found`);
    console.log(`[extract-material-callouts-v2]   - Material specs: ${surveyResult.materialSpecs}`);
    console.log(`[extract-material-callouts-v2]   - Dimensions: ${surveyResult.dimensions}`);
    console.log(`[extract-material-callouts-v2]   - Other: ${surveyResult.other}`);
    console.log(`[extract-material-callouts-v2]   - Image quality: ${surveyResult.imageQuality}`);
    console.log(`[extract-material-callouts-v2]   - Time: ${pass1Time}ms, Tokens: ${pass1Tokens}`);

    // Filter to material specs only
    const materialAnnotations = surveyResult.annotations.filter(
      a => a.textType === 'material_spec'
    );

    if (materialAnnotations.length === 0) {
      console.log(`[extract-material-callouts-v2] No material specs found - returning empty result`);

      const processingTime = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        pageId,
        version: 'v2',
        data: {
          callouts: [],
          surveyResult,
          stats: {
            totalAnnotationsFound: surveyResult.totalFound,
            materialSpecsFound: 0,
            classificationCalls: 0,
            finalCalloutsAfterDedup: 0,
          },
        },
        tokens_used: totalTokensUsed,
        processing_time_ms: processingTime,
      });
    }

    // =========================================================================
    // PASS 2: CLASSIFY EACH MATERIAL SPEC
    // =========================================================================
    console.log(`[extract-material-callouts-v2] PASS 2: Classifying ${materialAnnotations.length} material specs...`);

    const classifiedCallouts: EnhancedMaterialCallout[] = [];
    let classificationCalls = 0;

    for (const annotation of materialAnnotations) {
      try {
        console.log(`[extract-material-callouts-v2]   Classifying: "${annotation.exactText.substring(0, 50)}..."`);

        const classifyMessage = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'url', url: imageUrl },
                },
                {
                  type: 'text',
                  text: buildClassificationPrompt(annotation),
                },
              ],
            },
          ],
        });

        classificationCalls++;
        const classifyTokens = (classifyMessage.usage?.input_tokens || 0) + (classifyMessage.usage?.output_tokens || 0);
        totalTokensUsed += classifyTokens;

        const classifyTextContent = classifyMessage.content.find(block => block.type === 'text');
        if (!classifyTextContent || classifyTextContent.type !== 'text') {
          console.warn(`[extract-material-callouts-v2]   - No response for annotation ${annotation.id}`);
          continue;
        }

        interface ClassificationResponse {
          rawText: string;
          normalizedText: string;
          trade: string;
          materialType: string;
          manufacturer: string | null;
          productLine: string | null;
          profile: string | null;
          finish: string | null;
          color: string | null;
          dimensions: MaterialDimensions;
          orientation: 'horizontal' | 'vertical' | null;
          installationNotes: string | null;
          confidence: number;
          confidenceNotes: string;
          alternatives: (string | { text?: string; interpretation?: string })[];
        }

        const classification = parseJsonResponse<ClassificationResponse>(classifyTextContent.text);

        // Normalize alternatives to string array (Claude may return objects)
        const normalizedAlternatives: string[] = (classification.alternatives || []).map(alt => {
          if (typeof alt === 'string') return alt;
          if (typeof alt === 'object' && alt !== null) {
            return alt.text || alt.interpretation || JSON.stringify(alt);
          }
          return String(alt);
        });

        const enhancedCallout: EnhancedMaterialCallout = {
          id: `${pageId}-v2-${annotation.id}`,
          rawText: classification.rawText || annotation.exactText,
          normalizedText: classification.normalizedText || normalizeText(annotation.exactText),
          trade: classification.trade || 'miscellaneous',
          materialType: classification.materialType || 'unknown',
          manufacturer: classification.manufacturer,
          productLine: classification.productLine,
          profile: classification.profile,
          finish: classification.finish,
          color: classification.color,
          dimensions: classification.dimensions || {
            exposure_inches: null,
            thickness_inches: null,
            width_inches: null,
            length_feet: null,
          },
          orientation: classification.orientation,
          installationNotes: classification.installationNotes,
          confidence: classification.confidence || 0.5,
          confidenceNotes: classification.confidenceNotes || '',
          alternatives: normalizedAlternatives,
          pageId,
          pageNumber: pageNumber || 0,
          surveyData: annotation,
        };

        classifiedCallouts.push(enhancedCallout);
        console.log(`[extract-material-callouts-v2]   - Classified as: ${enhancedCallout.trade}/${enhancedCallout.materialType} (${Math.round(enhancedCallout.confidence * 100)}%)`);

      } catch (classifyError) {
        console.error(`[extract-material-callouts-v2]   - Error classifying annotation ${annotation.id}:`, classifyError);
        // Continue with other annotations
      }
    }

    // =========================================================================
    // DEDUPLICATE AND FINALIZE
    // =========================================================================
    console.log(`[extract-material-callouts-v2] Deduplicating ${classifiedCallouts.length} callouts...`);
    const finalCallouts = deduplicateCallouts(classifiedCallouts);
    console.log(`[extract-material-callouts-v2] Final count after dedup: ${finalCallouts.length}`);

    // =========================================================================
    // SAVE TO DATABASE
    // =========================================================================
    const supabase = await createClient();
    const processingTime = Date.now() - startTime;

    const extractionResult: MaterialExtractionV2Result = {
      version: 'v2',
      surveyResult,
      classifiedMaterials: classifiedCallouts,
      finalCallouts,
      extractedAt: new Date().toISOString(),
      modelUsed: 'claude-sonnet-4-20250514',
      totalTokensUsed,
      processingTimeMs: processingTime,
      stats: {
        totalAnnotationsFound: surveyResult.totalFound,
        materialSpecsFound: materialAnnotations.length,
        classificationCalls,
        finalCalloutsAfterDedup: finalCallouts.length,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_pages')
      .update({
        material_callouts: extractionResult,
      })
      .eq('id', pageId);

    if (updateError) {
      console.error('[extract-material-callouts-v2] Supabase update error:', updateError);
    } else {
      console.log(`[extract-material-callouts-v2] Saved to database`);
    }

    // Update job-level summary if jobId provided
    if (jobId && finalCallouts.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: job } = await (supabase as any)
          .from('extraction_jobs')
          .select('results_summary')
          .eq('id', jobId)
          .single();

        if (job) {
          const currentSummary = (job as { results_summary?: Record<string, unknown> }).results_summary || {};
          const aggregatedData = (currentSummary as Record<string, unknown>).aggregated_data as Record<string, unknown> || {};

          // Build material summary from final callouts
          const materialSummary: Record<string, unknown> = {
            source: 'elevation_ocr_v2',
            extraction_version: 'v2',
          };

          // Find primary siding
          const sidingCallouts = finalCallouts.filter(c => c.trade === 'siding');
          if (sidingCallouts.length > 0) {
            const primarySiding = sidingCallouts.reduce((a, b) => a.confidence > b.confidence ? a : b);
            materialSummary.siding_manufacturer = primarySiding.manufacturer;
            materialSummary.siding_type = primarySiding.materialType;
            materialSummary.siding_profile = primarySiding.profile;
            materialSummary.siding_exposure = primarySiding.dimensions.exposure_inches;
          }

          // Find roofing
          const roofingCallouts = finalCallouts.filter(c => c.trade === 'roofing');
          if (roofingCallouts.length > 0) {
            const primaryRoofing = roofingCallouts.reduce((a, b) => a.confidence > b.confidence ? a : b);
            materialSummary.roofing_manufacturer = primaryRoofing.manufacturer;
            materialSummary.roofing_type = primaryRoofing.materialType;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('extraction_jobs')
            .update({
              results_summary: {
                ...currentSummary,
                aggregated_data: {
                  ...aggregatedData,
                  materials: {
                    ...(aggregatedData.materials as Record<string, unknown> || {}),
                    ...materialSummary,
                  },
                },
              },
            })
            .eq('id', jobId);
        }
      } catch (jobUpdateError) {
        console.error('[extract-material-callouts-v2] Job update error:', jobUpdateError);
      }
    }

    console.log(`[extract-material-callouts-v2] ========================================`);
    console.log(`[extract-material-callouts-v2] COMPLETE`);
    console.log(`[extract-material-callouts-v2]   - Total time: ${processingTime}ms`);
    console.log(`[extract-material-callouts-v2]   - Total tokens: ${totalTokensUsed}`);
    console.log(`[extract-material-callouts-v2]   - Final callouts: ${finalCallouts.length}`);
    console.log(`[extract-material-callouts-v2] ========================================\n`);

    return NextResponse.json({
      success: true,
      pageId,
      version: 'v2',
      data: {
        callouts: finalCallouts,
        surveyResult,
        stats: {
          totalAnnotationsFound: surveyResult.totalFound,
          materialSpecsFound: materialAnnotations.length,
          classificationCalls,
          finalCalloutsAfterDedup: finalCallouts.length,
        },
      },
      tokens_used: totalTokensUsed,
      processing_time_ms: processingTime,
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[extract-material-callouts-v2] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        pageId: '',
        version: 'v2',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processing_time_ms: processingTime,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check extraction status
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

    const typedPage = page as { id: string; material_callouts?: MaterialExtractionV2Result };
    const isV2 = typedPage.material_callouts?.version === 'v2';

    return NextResponse.json({
      success: true,
      pageId,
      version: isV2 ? 'v2' : 'v1',
      data: typedPage.material_callouts,
    });

  } catch (error) {
    console.error('[extract-material-callouts-v2] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch material callouts' },
      { status: 500 }
    );
  }
}
