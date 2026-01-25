import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Notes & Specifications Extraction API Route
// Extracts takeoff-relevant specs from plan pages for exterior finishing
// =============================================================================

const NOTES_SPECS_PROMPT = `You are an expert construction estimator analyzing architectural drawings to extract EVERY specification relevant to exterior finishing takeoffs.

Your job is to find MAXIMUM DETAIL. Extract exact specifications, not general descriptions.

## WHAT TO EXTRACT (be extremely specific):

### SIDING
- Manufacturer: James Hardie, LP SmartSide, CertainTeed, Nichiha, Allura
- Product line: HardiePlank, HardiePanel, SmartSide 38, etc.
- Dimensions: width, length, thickness (e.g., "8.25" x 144" x 5/16"")
- Exposure/reveal: exact inches (e.g., "7" exposure", "6" reveal")
- Profile/texture: Cedarmill, smooth, beaded, Select Cedarmill, sand finish
- Finish: ColorPlus (factory), primed, pre-finished, field paint
- Color: exact color name if specified (Arctic White, Monterey Taupe, etc.)
- Installation: blind nail, face nail, nail spacing, starter strip

### TRIM & FASCIA
- Product: HardieTrim, SmartTrim, PVC, cedar, composite
- Nominal vs actual size: 1x4 (3.5" actual), 1x6 (5.5" actual), 5/4 x 4
- Thickness: 4/4, 5/4, or exact dimension
- Profile: flat, beaded, rustic
- Corner boards: inside/outside, mitered, butted
- Specific locations: window head, jamb, sill, band board, frieze, rake

### WEATHER BARRIER / WRB
- Brand: Tyvek HomeWrap, Tyvek CommercialWrap, ZIP System, Henry Blueskin
- Type: non-perforated, drainable, self-adhered
- Overlap requirements: horizontal lap (6", 8"), vertical lap (12")
- Taping: seam tape required, flashing tape at penetrations
- Fasteners: cap nails, cap staples, spacing

### FLASHING
- Type: Z-flashing, J-channel, drip cap, kickout, step flashing, pan flashing
- Material: galvanized, aluminum, copper, painted steel
- Dimensions: leg length, width (e.g., "4" face x 2" leg")
- Locations: above windows/doors, horizontal joints, roof-wall, deck ledger
- Sealant: specify caulk type if noted (polyurethane, silicone, etc.)

### FASTENERS & ADHESIVES
- Nail type: siding nails, roofing nails, ring shank, smooth shank
- Material: galvanized, stainless steel, hot-dipped galvanized
- Length: 1-1/4", 1-1/2", 2", 2-1/2"
- Spacing: 16" OC, 24" OC, stud spacing
- Adhesive/caulk: polyurethane, silicone, OSI Quad, construction adhesive
- Screws: if specified for trim or panels

### CODE & COMPLIANCE
- Code version: IRC 2021, IRC 2018, IBC
- Specific sections: R703.7 (siding), R703.8 (flashing)
- Fire rating: Class A, 1-hour, non-combustible requirements
- Wind zone: basic, high wind, coastal
- Exposure: C, D (per ASCE 7)
- Fire-resistive construction requirements

### INSTALLATION REQUIREMENTS
- Gaps: 1/8" at joints, 3/16" at trim
- Caulk joints: which joints to caulk vs leave open
- Paint: primer, topcoat, number of coats, paint grade
- Touch-up: field touch-up requirements
- Ventilation: requirements behind siding if specified

### SPECIAL CONDITIONS
- Coastal/marine environment
- High altitude
- Wildfire zone (WUI)
- Historic district requirements
- HOA requirements if noted
- Warranty requirements

## RESPONSE FORMAT

For each specification found, provide:
- category: One of: siding_specs, trim_details, flashing_waterproofing, weather_barrier, fasteners_adhesives, code_requirements, installation_notes, special_conditions
- item: Brief title (e.g., "Lap Siding Product")
- details: FULL specification with all details found (be verbose here - include everything)
- source_page: Page number where found
- importance: "critical" (affects material/pricing), "standard" (good practice), "optional" (nice to know)

## RULES

1. If manufacturer is specified, ALWAYS include it
2. If dimensions are given, include EXACT numbers with units
3. Include abbreviations you find: FC=fiber cement, HW=housewrap, GYP=gypsum, OSB=oriented strand board
4. If something is "per manufacturer specs" or "per code", still note it but mark what specific requirement it refers to
5. Look in title blocks, general notes, detail callouts, and keynotes
6. Check for specification references (e.g., "See Spec Section 07 46 00")
7. Note "Not specified" for critical items that are missing (like if no WRB is mentioned)

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview highlighting key manufacturers and critical specs",
  "notes": [
    {
      "id": "note-1",
      "category": "siding_specs",
      "item": "Lap Siding Product",
      "details": "James Hardie HardiePlank Lap Siding, 8.25\\" x 144\\" x 5/16\\" thick, 7\\" exposure, Cedarmill texture, ColorPlus Arctic White factory finish. Blind nail 1\\" from top edge at each stud.",
      "source_page": "Page 3",
      "importance": "critical"
    }
  ],
  "extraction_notes": "Observations about spec completeness, missing items, or ambiguities",
  "confidence": 0.85,
  "confidenceNotes": "Clear specifications found for siding and weather barrier."
}

IMPORTANT: Return ONLY the JSON object. No explanation, no markdown formatting.`;

interface TakeoffNote {
  id: string;
  category: string;
  item: string;
  details: string;
  source_page: string;
  importance: 'critical' | 'standard' | 'optional';
}

interface NotesSpecsData {
  summary: string;
  notes: TakeoffNote[];
  categories: Record<string, number>;
  pages_analyzed: number;
  extracted_at: string;
  version: string;
  model_used: string;
  tokens_used: number;
  confidence: number;
  confidenceNotes: string;
}

interface ExtractNotesSpecsRequest {
  job_id: string;
  include_all_pages?: boolean;
}

interface ExtractNotesSpecsResponse {
  success: boolean;
  data?: NotesSpecsData;
  error?: string;
}

interface ClaudeExtractionResponse {
  notes: Array<{
    id?: string;
    category: string;
    item: string;
    details: string;
    source_page: string;
    importance: string;
  }>;
  summary: string;
  confidence: number;
  confidenceNotes: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractNotesSpecsResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractNotesSpecsRequest;
    const { job_id, include_all_pages = false } = body;

    if (!job_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: job_id' },
        { status: 400 }
      );
    }

    console.log(`[extract-notes-specs] Processing job ${job_id}, include_all_pages: ${include_all_pages}`);

    // 2. Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error: API key not set' },
        { status: 500 }
      );
    }

    // 3. Fetch relevant pages from database
    const supabase = await createClient();

    // Get pages that likely contain specs (cover, other, detail, elevation, section)
    const pageTypes = include_all_pages
      ? ['cover', 'other', 'detail', 'elevation', 'section', 'schedule', 'floor_plan']
      : ['cover', 'other', 'detail', 'elevation', 'section'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pages, error: pagesError } = await (supabase as any)
      .from('extraction_pages')
      .select('id, page_number, page_type, image_url')
      .eq('job_id', job_id)
      .in('page_type', pageTypes)
      .order('page_number');

    if (pagesError) {
      console.error('[extract-notes-specs] Failed to fetch pages:', pagesError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pages from database' },
        { status: 500 }
      );
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No suitable pages found for notes extraction' },
        { status: 404 }
      );
    }

    // Limit to 10 pages to avoid token limits
    const pagesToAnalyze = pages.slice(0, 10);
    console.log(`[extract-notes-specs] Analyzing ${pagesToAnalyze.length} pages (of ${pages.length} available)`);

    // 4. Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // 5. Build multi-image message content
    const imageContents: Anthropic.ImageBlockParam[] = pagesToAnalyze.map((page: { image_url: string; page_number: number; page_type: string }) => ({
      type: 'image' as const,
      source: {
        type: 'url' as const,
        url: page.image_url,
      },
    }));

    // Add page context to prompt
    const pageContext = pagesToAnalyze.map((page: { page_number: number; page_type: string }) =>
      `Page ${page.page_number} (${page.page_type})`
    ).join(', ');

    const contextualPrompt = `${NOTES_SPECS_PROMPT}

PAGES BEING ANALYZED: ${pageContext}

When noting source_page, use format "Page X" where X is the page number.`;

    // 6. Call Claude Vision API with multiple images
    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContents,
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

    console.log(`[extract-notes-specs] Claude response received in ${processingTime}ms, tokens: ${tokensUsed}`);

    // 7. Extract text content from response
    const textContent = message.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    // 8. Parse JSON response
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
      console.error('[extract-notes-specs] JSON parse error:', parseError);
      console.error('[extract-notes-specs] Raw response:', textContent.text);
      return NextResponse.json(
        { success: false, error: 'Failed to parse Claude response as JSON' },
        { status: 500 }
      );
    }

    // 9. Normalize and validate notes
    const normalizedNotes: TakeoffNote[] = (extractedData.notes || []).map((note, idx) => ({
      id: note.id || `note-${idx + 1}`,
      category: note.category || 'installation_notes',
      item: note.item || 'Unknown Item',
      details: note.details || '',
      source_page: note.source_page || 'Unknown',
      importance: (['critical', 'standard', 'optional'].includes(note.importance)
        ? note.importance
        : 'standard') as 'critical' | 'standard' | 'optional',
    }));

    // 10. Calculate category counts
    const categories: Record<string, number> = {
      siding_specs: 0,
      trim_details: 0,
      flashing_waterproofing: 0,
      weather_barrier: 0,
      fasteners_adhesives: 0,
      code_requirements: 0,
      installation_notes: 0,
      special_conditions: 0,
    };

    normalizedNotes.forEach(note => {
      if (categories[note.category] !== undefined) {
        categories[note.category]++;
      } else {
        categories.installation_notes++;
      }
    });

    // 11. Build final result
    const notesSpecsData: NotesSpecsData = {
      summary: extractedData.summary || `Found ${normalizedNotes.length} specifications across ${pagesToAnalyze.length} pages.`,
      notes: normalizedNotes,
      categories,
      pages_analyzed: pagesToAnalyze.length,
      extracted_at: new Date().toISOString(),
      version: 'v1',
      model_used: 'claude-sonnet-4-20250514',
      tokens_used: tokensUsed,
      confidence: typeof extractedData.confidence === 'number' ? extractedData.confidence : 0.7,
      confidenceNotes: extractedData.confidenceNotes || '',
    };

    console.log(`[extract-notes-specs] Extracted ${normalizedNotes.length} notes:`);
    console.log(`  - Critical: ${normalizedNotes.filter(n => n.importance === 'critical').length}`);
    console.log(`  - Standard: ${normalizedNotes.filter(n => n.importance === 'standard').length}`);
    console.log(`  - Optional: ${normalizedNotes.filter(n => n.importance === 'optional').length}`);
    console.log(`  - Categories:`, categories);

    // 12. Store in Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_jobs')
      .update({
        notes_specs_data: notesSpecsData,
      })
      .eq('id', job_id);

    if (updateError) {
      console.error('[extract-notes-specs] Supabase update error:', updateError);
      // Don't fail - still return the extracted data
    } else {
      console.log(`[extract-notes-specs] Updated job ${job_id} with notes_specs_data`);
    }

    console.log(`[extract-notes-specs] Complete. Time: ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: notesSpecsData,
    });

  } catch (error) {
    console.error('[extract-notes-specs] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve existing notes_specs_data for a job
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Missing job_id parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error } = await (supabase as any)
      .from('extraction_jobs')
      .select('id, notes_specs_data')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job.notes_specs_data,
    });

  } catch (error) {
    console.error('[extract-notes-specs] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notes data' },
      { status: 500 }
    );
  }
}
