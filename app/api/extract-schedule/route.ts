import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type { ScheduleOCRData, ScheduleWindow, ScheduleDoor, ScheduleSkylight, ScheduleGarage } from '@/lib/types/extraction';
import type { StructureAnalysisResult } from '../analyze-schedule-structure/route';

// =============================================================================
// Schedule Extraction API Route
// Uses Claude Vision to extract window/door schedules from construction plans
// Supports two-pass extraction with structure analysis for improved accuracy
// =============================================================================

// Type for schedule structure (matches StructureAnalysisResult from analyze-schedule-structure)
interface SampleRow {
  mark: string;
  width?: string;
  height?: string;
  size?: string;
  type: string;
  notes?: string;
}

interface ScheduleStructure {
  exists: boolean;
  header_row_count?: number;
  column_headers?: string[];
  nested_headers?: Record<string, string[]>;
  column_count?: number;
  size_format?: 'split' | 'combined';
  size_columns?: {
    width_column?: number;
    width_header?: string;
    height_column?: number;
    height_header?: string;
    combined_column?: number;
  };
  mark_column?: number;
  type_column?: number;
  type_column_header?: string;
  type_code_column?: number;
  type_code_header?: string;
  quantity_column?: number | null;
  notes_column?: number | null;
  notes_column_header?: string;
  data_row_count?: number;
  sample_rows?: SampleRow[];
  // Legacy fields for backwards compatibility
  sample_first_row?: string[];
  sample_last_row?: string[];
}

// =============================================================================
// Size Validation Helpers
// =============================================================================

// Pattern for valid dimension formats: 3'-0", 36", 2'-6", etc.
const VALID_SIZE_PATTERN = /^\d+['-]?\d*["']?\s*x\s*\d+['-]?\d*["']?$/i;

// Known door type indicators that should NOT be in size field
const INVALID_SIZE_INDICATORS = [
  'PRE', 'PREHUNG', 'F WD', 'F/G WD', 'FWD', 'FLUSH', 'PNL', 'PANEL',
  'HCR', 'SCR', 'HOLLOW', 'SOLID', 'CASED', 'POCKET', 'BIFOLD',
  'WD', 'WOOD', 'MTL', 'METAL', 'GL', 'GLASS', 'FRP', 'INT', 'EXT'
];

/**
 * Validates if a size string looks like actual dimensions
 * Returns true if valid, false if it looks like a type indicator
 */
function isValidDoorSize(size: string): boolean {
  if (!size || size.trim() === '') return false;

  const normalized = size.trim().toUpperCase();

  // Check if it contains known type indicators
  for (const indicator of INVALID_SIZE_INDICATORS) {
    if (normalized.includes(indicator)) {
      console.log(`[size-validation] Invalid door size detected: "${size}" contains type indicator "${indicator}"`);
      return false;
    }
  }

  // Check if it matches valid dimension pattern (e.g., "3'-0" x 6'-8"")
  if (VALID_SIZE_PATTERN.test(normalized)) {
    return true;
  }

  // Check for partial dimensions (might be missing 'x' delimiter)
  const hasFeetInches = /\d+['-]\d*["']?/.test(normalized);
  const hasNumbers = /\d/.test(normalized);
  const hasLetters = /[A-Z]/.test(normalized);

  // If it has letters but no feet-inches pattern, likely invalid
  if (hasLetters && !hasFeetInches) {
    console.log(`[size-validation] Invalid door size detected: "${size}" has letters without dimension format`);
    return false;
  }

  // If it only has a single number without any dimension markers, likely invalid
  if (hasNumbers && !hasFeetInches && normalized.length < 4) {
    console.log(`[size-validation] Invalid door size detected: "${size}" too short to be valid dimension`);
    return false;
  }

  return hasNumbers; // At least has numbers
}

/**
 * Attempts to extract type from an invalid size field
 * Returns the type if extracted, or 'unknown' otherwise
 */
function extractTypeFromInvalidSize(invalidSize: string): string {
  const normalized = invalidSize.trim().toUpperCase();

  if (normalized.includes('PRE') || normalized.includes('PREHUNG')) return 'prehung';
  if (normalized.includes('F WD') || normalized.includes('FWD') || normalized.includes('FLUSH')) return 'flush wood';
  if (normalized.includes('F/G') || normalized.includes('FG')) return 'flush glass';
  if (normalized.includes('PNL') || normalized.includes('PANEL')) return 'panel';
  if (normalized.includes('HCR') || normalized.includes('HOLLOW')) return 'hollow core';
  if (normalized.includes('SCR') || normalized.includes('SOLID')) return 'solid core';
  if (normalized.includes('BIFOLD')) return 'bifold';
  if (normalized.includes('POCKET')) return 'pocket';
  if (normalized.includes('CASED')) return 'cased opening';

  return 'unknown';
}

// =============================================================================
// buildTargetedPrompt - Creates extraction prompt based on structure analysis
// =============================================================================
function buildTargetedPrompt(structure: StructureAnalysisResult): string {
  let prompt = `Extract schedule data using the EXACT column mapping below.

CRITICAL: I've already analyzed the table structure. Use these EXACT columns - do NOT guess.

`;

  // Calculate total expected rows
  let totalExpectedRows = 0;

  // Add window schedule instructions
  if (structure.window_schedule?.exists) {
    const ws = structure.window_schedule as ScheduleStructure;
    totalExpectedRows += ws.data_row_count || 0;

    prompt += `## WINDOW SCHEDULE
Total rows to extract: ${ws.data_row_count || 'Unknown'}

COLUMN MAPPING (use these EXACT columns):
`;

    // Mark column
    prompt += `- MARK: Column ${ws.mark_column || '?'}\n`;

    // Size columns - with header info for clarity
    if (ws.size_format === 'split' && ws.size_columns) {
      prompt += `- SIZE WIDTH: Column ${ws.size_columns.width_column || '?'}`;
      if (ws.size_columns.width_header) {
        prompt += ` ("${ws.size_columns.width_header}")`;
      }
      prompt += `\n`;
      prompt += `- SIZE HEIGHT: Column ${ws.size_columns.height_column || '?'}`;
      if (ws.size_columns.height_header) {
        prompt += ` ("${ws.size_columns.height_header}")`;
      }
      prompt += `\n`;
      prompt += `  → COMBINE as: "WIDTH x HEIGHT" (e.g., "3'-0\\" x 6'-0\\"")\n`;
    } else if (ws.size_columns?.combined_column) {
      prompt += `- SIZE: Column ${ws.size_columns.combined_column} (already combined)\n`;
    }

    // Type column - with explicit instruction about type codes
    prompt += `- TYPE: Column ${ws.type_column || '?'}`;
    if (ws.type_column_header) {
      prompt += ` ("${ws.type_column_header}")`;
    }
    prompt += `\n`;
    if (ws.type_code_column && ws.type_code_header) {
      prompt += `  → IGNORE column ${ws.type_code_column} ("${ws.type_code_header}") - those are codes like SH1, C1\n`;
    }

    // Notes column
    if (ws.notes_column) {
      prompt += `- NOTES: Column ${ws.notes_column}`;
      if (ws.notes_column_header) {
        prompt += ` ("${ws.notes_column_header}")`;
      }
      prompt += `\n`;
    }

    // Quantity
    if (ws.quantity_column) {
      prompt += `- QUANTITY: Column ${ws.quantity_column}\n`;
    } else {
      prompt += `- QUANTITY: No column - default to 1\n`;
    }

    // Sample rows for verification
    if (ws.sample_rows && ws.sample_rows.length > 0) {
      prompt += `\nVERIFY with sample data - your extraction MUST match these:\n`;
      ws.sample_rows.forEach((row, i) => {
        const size = row.size || (row.width && row.height ? `${row.width} x ${row.height}` : 'unknown');
        prompt += `  Row ${i + 1}: mark="${row.mark}", size="${size}", type="${row.type}", notes="${row.notes || ''}"\n`;
      });
    }
    prompt += '\n';
  }

  // Add door schedule instructions
  if (structure.door_schedule?.exists) {
    const ds = structure.door_schedule as ScheduleStructure;
    totalExpectedRows += ds.data_row_count || 0;

    prompt += `## DOOR SCHEDULE
Total rows to extract: ${ds.data_row_count || 'Unknown'}

CRITICAL - Door SIZE must be DIMENSIONS only:
- VALID sizes: "3'-0\\" x 6'-8\\"", "2'-8\\" x 6'-8\\"", "36\\" x 80\\""
- INVALID sizes (these are TYPES, not sizes): "PRE", "F WD", "PNL", "HCR", "PRE / WD"

COLUMN MAPPING (use these EXACT columns):
`;

    // Mark column
    prompt += `- MARK: Column ${ds.mark_column || '?'}\n`;

    // Size columns - with extra emphasis on what they contain
    if (ds.size_format === 'split' && ds.size_columns) {
      prompt += `- SIZE WIDTH: Column ${ds.size_columns.width_column || '?'}`;
      if (ds.size_columns.width_header) {
        prompt += ` ("${ds.size_columns.width_header}")`;
      }
      prompt += ` - MUST contain feet-inches like "3'-0\\""\n`;
      prompt += `- SIZE HEIGHT: Column ${ds.size_columns.height_column || '?'}`;
      if (ds.size_columns.height_header) {
        prompt += ` ("${ds.size_columns.height_header}")`;
      }
      prompt += ` - MUST contain feet-inches like "6'-8\\""\n`;
      prompt += `  → COMBINE as: "WIDTH x HEIGHT" (e.g., "3'-0\\" x 6'-8\\"")\n`;
      prompt += `  → If you see "PRE", "F WD", "PNL" in these columns, those are WRONG columns - find the actual dimension columns!\n`;
    } else if (ds.size_columns?.combined_column) {
      prompt += `- SIZE: Column ${ds.size_columns.combined_column} (already combined)\n`;
    }

    // Type column - with clear guidance about what goes here
    prompt += `- TYPE: Column ${ds.type_column || '?'}`;
    if (ds.type_column_header) {
      prompt += ` ("${ds.type_column_header}")`;
    }
    prompt += `\n`;
    prompt += `  → This column contains codes like: PRE (prehung), F WD (flush wood), PNL (panel), HCR (hollow core)\n`;
    prompt += `  → Convert codes to readable types: PRE→"prehung", F WD→"flush wood", PNL→"panel", HCR→"hollow core"\n`;

    // Notes column
    if (ds.notes_column) {
      prompt += `- NOTES: Column ${ds.notes_column}`;
      if (ds.notes_column_header) {
        prompt += ` ("${ds.notes_column_header}")`;
      }
      prompt += `\n`;
    }

    // Quantity
    if (ds.quantity_column) {
      prompt += `- QUANTITY: Column ${ds.quantity_column}\n`;
    } else {
      prompt += `- QUANTITY: No column - default to 1\n`;
    }

    // Sample rows
    if (ds.sample_rows && ds.sample_rows.length > 0) {
      prompt += `\nVERIFY with sample data - your extraction MUST match these:\n`;
      ds.sample_rows.forEach((row, i) => {
        const size = row.size || (row.width && row.height ? `${row.width} x ${row.height}` : 'unknown');
        prompt += `  Row ${i + 1}: mark="${row.mark}", size="${size}", type="${row.type}", notes="${row.notes || ''}"\n`;
      });
    }
    prompt += '\n';
  }

  // Add skylight schedule instructions if exists
  if (structure.skylight_schedule?.exists) {
    const ss = structure.skylight_schedule as ScheduleStructure;
    totalExpectedRows += ss.data_row_count || 0;
    prompt += `## SKYLIGHT SCHEDULE
Total rows: ${ss.data_row_count || 'Unknown'}
- MARK: Column ${ss.mark_column || '?'}
- SIZE format: ${ss.size_format === 'split' ? 'SPLIT (combine width x height)' : 'COMBINED'}

`;
  }

  // Add garage schedule instructions if exists
  if (structure.garage_schedule?.exists) {
    const gs = structure.garage_schedule as ScheduleStructure;
    totalExpectedRows += gs.data_row_count || 0;
    prompt += `## GARAGE SCHEDULE
Total rows: ${gs.data_row_count || 'Unknown'}
- MARK: Column ${gs.mark_column || '?'}
- SIZE format: ${gs.size_format === 'split' ? 'SPLIT (combine width x height)' : 'COMBINED'}

`;
  }

  // Add analysis notes if available
  if (structure.analysis_notes) {
    prompt += `## IMPORTANT NOTES
${structure.analysis_notes}

`;
  }

  // Add extraction instructions
  prompt += `## EXTRACTION RULES
1. SIZE must be "WIDTH x HEIGHT" from the dimension columns (e.g., "3'-0\\" x 6'-0\\"")
2. TYPE must be the description text (SINGLE HUNG, FIXED, PREHUNG) - NOT type codes (SH1, C1)
3. Each MARK should appear exactly ONCE in your output
4. IGNORE values like "PRE", "F WD", "PNL" in size fields - those are type indicators
5. Extract ALL ${totalExpectedRows} rows total

Return ONLY valid JSON (no markdown, no explanation):
{
  "windows": [{"mark": "101A", "size": "3'-0\\" x 6'-0\\"", "quantity": 1, "type": "single hung", "notes": ""}],
  "doors": [{"mark": "D1", "size": "3'-0\\" x 6'-8\\"", "quantity": 1, "type": "prehung", "notes": ""}],
  "skylights": [],
  "garages": [],
  "totals": {"windows": N, "doors": N, "skylights": 0, "garages": 0},
  "confidence": 0.95,
  "extraction_notes": "Successfully extracted using structure-guided approach",
  "is_schedule_page": true
}`;

  return prompt;
}

// Default prompt (fallback when no structure analysis available)
const SCHEDULE_EXTRACTION_PROMPT = `You are analyzing a construction plan schedule page. Extract window and door schedule data with HIGH ACCURACY.

IMPORTANT PARSING RULES:
1. SIZE must be dimensions (width x height) like "3'-0\\" x 4'-0\\"" or "36\\" x 48\\"" - NEVER a type like "PRE HUNG"
2. TYPE is the style/operation: double hung, single hung, fixed, casement, awning, slider, prehung, bifold, etc.
3. If a cell contains BOTH size and type info, separate them correctly
4. MARK/TAG is usually alphanumeric: W1, 101A, A, 1, etc.
5. QUANTITY defaults to 1 if not specified
6. Look for column headers to understand the table structure

WINDOW SCHEDULE - Look for columns like:
- Mark/Tag/Number
- Type (SH=Single Hung, DH=Double Hung, FX=Fixed, C=Casement, AW=Awning)
- Size/Dimensions (Width x Height)
- Quantity/Count
- Notes/Remarks/Comments

DOOR SCHEDULE - Look for columns like:
- Mark/Number/Tag
- Size (Width x Height, e.g., "3'-0\\" x 6'-8\\"")
- Type (Entry, Interior, Exterior, Sliding, Bifold, French, Garage, Prehung)
- Panel configuration
- Notes (fire rating, material, hardware, glass)

DOOR SCHEDULE SPECIAL HANDLING:
Many door schedules have NESTED or SPLIT columns where dimensions are separated.

When you see split dimensions (Width in one column, Height in another):
- COMBINE them into: "3'-0\\" x 6'-8\\""

IGNORE these as size values - they are TYPE indicators:
- "PRE" or "PREHUNG" → put in TYPE field
- "F WD" (flush wood) → put in TYPE field
- "PNL" (panel) → put in TYPE field
- Numbers like "100", "200" → door style codes, put in TYPE field

Example nested door schedule:
| DOOR # | Panel Type | Width | Height | Notes |
| 101A   | PRE        | 3'-0" | 6'-8"  | Cased |

CORRECT: mark="101A", size="3'-0\\" x 6'-8\\"", type="prehung"
WRONG: size="PRE # 100" ← These are type codes, NOT dimensions

ALSO EXTRACT if present:
- SKYLIGHT SCHEDULE
- GARAGE DOOR info (usually in door schedule with larger sizes like 9'-0\\" x 7'-0\\")

Return ONLY valid JSON (no markdown, no explanation):
{
  "windows": [
    {
      "mark": "101A",
      "size": "3'-0\\" x 4'-0\\"",
      "quantity": 2,
      "type": "single hung",
      "notes": "tempered, egress"
    }
  ],
  "doors": [
    {
      "mark": "D1",
      "size": "3'-0\\" x 6'-8\\"",
      "quantity": 1,
      "type": "prehung interior",
      "notes": "hollow core"
    }
  ],
  "skylights": [
    {
      "mark": "SK1",
      "size": "2'-0\\" x 4'-0\\"",
      "quantity": 1,
      "type": "fixed",
      "notes": ""
    }
  ],
  "garages": [
    {
      "mark": "G1",
      "size": "16'-0\\" x 7'-0\\"",
      "quantity": 1,
      "type": "sectional",
      "notes": "insulated"
    }
  ],
  "totals": {
    "windows": 12,
    "doors": 8,
    "skylights": 1,
    "garages": 2
  },
  "confidence": 0.92,
  "extraction_notes": "Any observations about data quality or ambiguous entries"
}

If this page is NOT a window/door schedule (e.g., energy code, floor plan, elevation):
{
  "windows": [],
  "doors": [],
  "skylights": [],
  "garages": [],
  "totals": {"windows": 0, "doors": 0, "skylights": 0, "garages": 0},
  "confidence": 0,
  "extraction_notes": "This page is [describe what it is] - not a window/door schedule",
  "is_schedule_page": false
}`;

interface ExtractScheduleRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  structure?: StructureAnalysisResult; // Optional structure from Pass 1
}

interface ExtractScheduleResponse {
  success: boolean;
  pageId: string;
  data?: ScheduleOCRData;
  error?: string;
  used_targeted_prompt?: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractScheduleResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractScheduleRequest;
    const { pageId, imageUrl, jobId, structure } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, pageId: pageId || '', error: 'Missing required fields: pageId and imageUrl' },
        { status: 400 }
      );
    }

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

    // 4. Determine which prompt to use
    const useTargetedPrompt = structure && structure.is_schedule_page && structure.schedules_found.length > 0;
    const extractionPrompt = useTargetedPrompt
      ? buildTargetedPrompt(structure)
      : SCHEDULE_EXTRACTION_PROMPT;

    // 5. Call Claude Vision API
    console.log(`[extract-schedule] Processing page ${pageId} with image: ${imageUrl}`);
    console.log(`[extract-schedule] Using ${useTargetedPrompt ? 'TARGETED' : 'DEFAULT'} prompt`);

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
              text: extractionPrompt,
            },
          ],
        },
      ],
    });
    const processingTime = Date.now() - startTime;

    // 5. Extract text content from response
    const textContent = message.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, pageId, error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    // 6. Parse JSON response
    let extractedData: Omit<ScheduleOCRData, 'extracted_at' | 'model_used' | 'tokens_used'>;
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
      console.error('[extract-schedule] JSON parse error:', parseError);
      console.error('[extract-schedule] Raw response:', textContent.text);
      return NextResponse.json(
        { success: false, pageId, error: 'Failed to parse Claude response as JSON' },
        { status: 500 }
      );
    }

    // 7. Validate and normalize extracted data
    const normalizedWindows: ScheduleWindow[] = (extractedData.windows || []).map((w) => ({
      mark: String(w.mark || ''),
      size: String(w.size || ''),
      quantity: Number(w.quantity) || 1,
      type: String(w.type || 'unknown'),
      notes: w.notes ? String(w.notes) : undefined,
    }));

    const normalizedDoors: ScheduleDoor[] = (extractedData.doors || []).map((d) => {
      const rawSize = String(d.size || '');
      const rawType = String(d.type || 'unknown');

      // Validate door size - if invalid, try to extract type from it
      let finalSize = rawSize;
      let finalType = rawType;

      if (!isValidDoorSize(rawSize)) {
        console.log(`[extract-schedule] Door "${d.mark}" has invalid size "${rawSize}" - attempting recovery`);

        // Try to extract type from the invalid size field
        const extractedType = extractTypeFromInvalidSize(rawSize);
        if (extractedType !== 'unknown' && (rawType === 'unknown' || rawType === '')) {
          finalType = extractedType;
          console.log(`[extract-schedule] Recovered type "${finalType}" from invalid size field`);
        }

        // Mark size as needs-verification
        finalSize = `[NEEDS VERIFICATION: ${rawSize}]`;
      }

      return {
        mark: String(d.mark || ''),
        size: finalSize,
        quantity: Number(d.quantity) || 1,
        type: finalType,
        notes: d.notes ? String(d.notes) : undefined,
      };
    });

    // Normalize skylights (cast extractedData to any for optional fields)
    const extractedDataAny = extractedData as Record<string, unknown>;
    const normalizedSkylights: ScheduleSkylight[] = (Array.isArray(extractedDataAny.skylights) ? extractedDataAny.skylights : []).map((s: Record<string, unknown>) => ({
      mark: String(s.mark || ''),
      size: String(s.size || ''),
      quantity: Number(s.quantity) || 1,
      type: String(s.type || 'fixed'),
      notes: s.notes ? String(s.notes) : undefined,
    }));

    // Normalize garages
    const normalizedGarages: ScheduleGarage[] = (Array.isArray(extractedDataAny.garages) ? extractedDataAny.garages : []).map((g: Record<string, unknown>) => ({
      mark: String(g.mark || ''),
      size: String(g.size || ''),
      quantity: Number(g.quantity) || 1,
      type: String(g.type || 'sectional'),
      notes: g.notes ? String(g.notes) : undefined,
    }));

    // Calculate totals from actual data
    const windowTotal = normalizedWindows.reduce((sum, w) => sum + w.quantity, 0);
    const doorTotal = normalizedDoors.reduce((sum, d) => sum + d.quantity, 0);
    const skylightTotal = normalizedSkylights.reduce((sum, s) => sum + s.quantity, 0);
    const garageTotal = normalizedGarages.reduce((sum, g) => sum + g.quantity, 0);

    // Determine if this is actually a schedule page
    const isSchedulePage = extractedDataAny.is_schedule_page !== false;

    // Build complete OCR data object
    const ocrData: ScheduleOCRData = {
      windows: normalizedWindows,
      doors: normalizedDoors,
      skylights: normalizedSkylights,
      garages: normalizedGarages,
      totals: {
        windows: windowTotal,
        doors: doorTotal,
        skylights: skylightTotal,
        garages: garageTotal,
      },
      confidence: typeof extractedData.confidence === 'number' ? extractedData.confidence : 0.8,
      extraction_notes: extractedData.extraction_notes,
      is_schedule_page: isSchedulePage,
      extracted_at: new Date().toISOString(),
      model_used: 'claude-sonnet-4-20250514',
      tokens_used: (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0),
    };

    // 8. Store in Supabase (extraction_pages.ocr_data)
    const supabase = await createClient();

    // Using type assertion since ocr_data columns exist but aren't in generated types
    const { error: updateError } = await (supabase as any)
      .from('extraction_pages')
      .update({
        ocr_data: ocrData,
        ocr_status: 'complete',
        ocr_processed_at: ocrData.extracted_at,
      })
      .eq('id', pageId);

    if (updateError) {
      console.error('[extract-schedule] Supabase update error:', updateError);
      // Don't fail the request - still return the extracted data
    } else {
      console.log(`[extract-schedule] Updated page ${pageId} with OCR data`);
    }

    // 9. Optionally update job-level aggregated data
    if (jobId) {
      try {
        // Get current job results_summary (using any for untyped columns)
        const { data: job } = await (supabase as any)
          .from('extraction_jobs')
          .select('results_summary')
          .eq('id', jobId)
          .single();

        if (job) {
          const currentSummary = (job as { results_summary?: Record<string, unknown> }).results_summary || {};
          const aggregatedData = (currentSummary as Record<string, unknown>).aggregated_data as Record<string, unknown> || {};

          // Update or create elements.windows and elements.doors
          const elements = (aggregatedData.elements as Record<string, unknown>) || {};
          elements.windows = {
            ...(elements.windows as Record<string, unknown>),
            count_from_schedule: windowTotal,
            recommended_count: windowTotal,
            source: 'schedule_ocr',
          };
          elements.doors = {
            ...(elements.doors as Record<string, unknown>),
            count_from_schedule: doorTotal,
            recommended_count: doorTotal,
            source: 'schedule_ocr',
          };

          await (supabase as any)
            .from('extraction_jobs')
            .update({
              results_summary: {
                ...currentSummary,
                aggregated_data: {
                  ...aggregatedData,
                  elements,
                },
              },
            })
            .eq('id', jobId);
        }
      } catch (jobUpdateError) {
        console.error('[extract-schedule] Job update error:', jobUpdateError);
        // Non-critical - don't fail the request
      }
    }

    console.log(`[extract-schedule] Complete. Windows: ${windowTotal}, Doors: ${doorTotal}, Time: ${processingTime}ms, Targeted: ${useTargetedPrompt}`);

    return NextResponse.json({
      success: true,
      pageId,
      data: ocrData,
      used_targeted_prompt: useTargetedPrompt,
    });

  } catch (error) {
    console.error('[extract-schedule] Unexpected error:', error);
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

    // Using type assertion since ocr_* columns exist but aren't in generated types
    const { data: page, error } = await (supabase as any)
      .from('extraction_pages')
      .select('id, ocr_data, ocr_status, ocr_processed_at')
      .eq('id', pageId)
      .single();

    if (error || !page) {
      return NextResponse.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    const typedPage = page as { id: string; ocr_status?: string; ocr_data?: unknown; ocr_processed_at?: string };

    return NextResponse.json({
      success: true,
      pageId,
      status: typedPage.ocr_status || 'pending',
      data: typedPage.ocr_data,
      extractedAt: typedPage.ocr_processed_at,
    });

  } catch (error) {
    console.error('[extract-schedule] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch OCR status' },
      { status: 500 }
    );
  }
}
