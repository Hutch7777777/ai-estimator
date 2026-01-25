import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Schedule Structure Analysis API Route
// Pass 1: Analyzes table structure WITHOUT extracting data
// Returns column mapping that guides the extraction pass
// =============================================================================

const STRUCTURE_ANALYSIS_PROMPT = `Analyze this construction schedule and identify its EXACT table structure.

CRITICAL: Many schedules have NESTED/GROUPED column headers. For example:
- "OVERALL WINDOW DIMENSIONS" may be a GROUP containing "WIDTH" and "HEIGHT" sub-columns
- "PANEL DIMENSIONS" may contain "WIDTH" and "HEIGHT"
- "PLACEMENT" may contain "HEAD HEIGHT" and "SILL HEIGHT" (NOT the window size!)

LOOK CAREFULLY at the header rows - there may be 2 rows of headers.

For WINDOW SCHEDULES, identify:
1. MARK column - Usually "Mark", "MARK", or "Window #" (contains values like 101A, W1)
2. SIZE columns - Look for "WIDTH" and "HEIGHT" under a parent like "OVERALL WINDOW DIMENSIONS" or "SIZE"
   - These are the ACTUAL window dimensions in feet and inches (e.g., 3'-0", 6'-0")
   - NOT the placement heights (HEAD HEIGHT, SILL HEIGHT) - those are different!
3. TYPE/DESCRIPTION column - The one with text like "SINGLE HUNG", "FIXED", "CASEMENT", "AWNING"
   - There may be a TYPE CODE column (SH1, C1, A1) AND a DESCRIPTION column
   - Prefer the DESCRIPTION column for the type field
4. NOTES/COMMENTS column - Usually at the end, contains "EGRESS", "SG", "TEMPERED"

For DOOR SCHEDULES, identify:
1. MARK column - "Door #", "NUMBER", "MARK"
2. SIZE columns - CRITICAL: Find columns explicitly labeled "WIDTH" and "HEIGHT"
   - Often under a parent header like "PANEL DIMENSIONS" or "DOOR SIZE"
   - These contain actual dimensions like "3'-0\"", "6'-8\""
   - NEVER confuse with TYPE columns (see below)
3. TYPE column - "PANEL TYPE", "DOOR TYPE", or description like "PREHUNG", "BIFOLD", "FLUSH WOOD"
4. NOTES column

CRITICAL for DOOR SIZE extraction - these are TYPE indicators, NOT dimensions:
- "PRE" = Prehung door → goes in TYPE field
- "F WD" or "F/G WD" = Flush Wood or Flush Glass Wood → goes in TYPE field
- "PNL" = Panel door → goes in TYPE field
- "HCR" = Hollow Core → goes in TYPE field
- "SCR" = Solid Core → goes in TYPE field
- Numbers like "100", "200" = Style codes → goes in TYPE field
- "CASED" = Cased opening → goes in NOTES field

Door sizes MUST look like dimensions: "3'-0\"", "2'-8\"", "6'-8\"" (feet-inches format)
If a "size" value contains letters like PRE, WD, PNL - that's a TYPE, not a size!

READ ACTUAL VALUES from the schedule to verify you have the right columns:
- First data row
- A middle row
- Last data row

Return ONLY valid JSON (no markdown, no explanation):
{
  "is_schedule_page": true,
  "schedules_found": ["windows", "doors"],
  "window_schedule": {
    "exists": true,
    "header_row_count": 2,
    "column_headers": ["Mark", "TYPE", "DESCRIPTION", "WIDTH", "HEIGHT", "HEAD HT", "SILL HT", "AREA", "COMMENTS"],
    "nested_headers": {
      "OVERALL WINDOW DIMENSIONS": ["WIDTH", "HEIGHT"],
      "PLACEMENT": ["HEAD HT", "SILL HT"]
    },
    "column_count": 9,
    "size_format": "split",
    "size_columns": {
      "width_column": 4,
      "width_header": "WIDTH (under OVERALL WINDOW DIMENSIONS)",
      "height_column": 5,
      "height_header": "HEIGHT (under OVERALL WINDOW DIMENSIONS)"
    },
    "mark_column": 1,
    "type_column": 3,
    "type_column_header": "DESCRIPTION (contains SINGLE HUNG, FIXED, etc.)",
    "type_code_column": 2,
    "type_code_header": "TYPE (contains codes like SH1, C1 - ignore this)",
    "quantity_column": null,
    "notes_column": 9,
    "notes_column_header": "COMMENTS",
    "data_row_count": 45,
    "sample_rows": [
      {"mark": "101A", "width": "3'-0\\"", "height": "6'-0\\"", "type": "SINGLE HUNG", "notes": ""},
      {"mark": "101C", "width": "1'-6\\"", "height": "7'-6\\"", "type": "FIXED", "notes": "SG"},
      {"mark": "212C", "width": "3'-0\\"", "height": "6'-0\\"", "type": "SINGLE HUNG", "notes": "EGRESS"}
    ]
  },
  "door_schedule": {
    "exists": true,
    "header_row_count": 2,
    "column_headers": ["DOOR #", "PANEL TYPE", "WIDTH", "HEIGHT", "FRAME TYPE", "NOTES"],
    "nested_headers": {
      "PANEL DIMENSIONS": ["WIDTH", "HEIGHT"]
    },
    "column_count": 6,
    "size_format": "split",
    "size_columns": {
      "width_column": 3,
      "width_header": "WIDTH (under PANEL DIMENSIONS) - contains dimensions like 3'-0\"",
      "height_column": 4,
      "height_header": "HEIGHT (under PANEL DIMENSIONS) - contains dimensions like 6'-8\""
    },
    "mark_column": 1,
    "type_column": 2,
    "type_column_header": "PANEL TYPE (contains PRE, F WD, PNL, HCR - these are door types)",
    "quantity_column": null,
    "notes_column": 6,
    "data_row_count": 15,
    "sample_rows": [
      {"mark": "101A", "width": "3'-0\\"", "height": "6'-8\\"", "type": "PREHUNG", "notes": ""},
      {"mark": "103A", "width": "2'-8\\"", "height": "6'-8\\"", "type": "FLUSH WOOD", "notes": "CASED"},
      {"mark": "105", "width": "2'-6\\"", "height": "6'-8\\"", "type": "BIFOLD", "notes": ""}
    ]
  },
  "skylight_schedule": {
    "exists": false
  },
  "garage_schedule": {
    "exists": false
  },
  "analysis_notes": "Window schedule has nested headers. WIDTH and HEIGHT are under OVERALL WINDOW DIMENSIONS group. Use DESCRIPTION column for type (SINGLE HUNG, FIXED), not TYPE column (codes like SH1, C1). PLACEMENT columns (HEAD HT, SILL HT) are installation heights, NOT window dimensions."
}

If this is NOT a schedule page:
{
  "is_schedule_page": false,
  "page_description": "This appears to be an energy code compliance sheet / floor plan / elevation drawing / etc.",
  "schedules_found": []
}

IMPORTANT: Return ONLY the JSON object. No explanation, no markdown formatting, no text before or after the JSON.`;

interface AnalyzeStructureRequest {
  pageId: string;
  imageUrl: string;
}

interface ColumnMapping {
  width_column?: number;
  width_header?: string;
  height_column?: number;
  height_header?: string;
  combined_column?: number;
}

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
  size_columns?: ColumnMapping;
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

export interface StructureAnalysisResult {
  is_schedule_page: boolean;
  page_description?: string;
  schedules_found: string[];
  window_schedule?: ScheduleStructure;
  door_schedule?: ScheduleStructure;
  skylight_schedule?: ScheduleStructure;
  garage_schedule?: ScheduleStructure;
  analysis_notes?: string;
}

interface AnalyzeStructureResponse {
  success: boolean;
  pageId: string;
  structure?: StructureAnalysisResult;
  error?: string;
  tokens_used?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeStructureResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as AnalyzeStructureRequest;
    const { pageId, imageUrl } = body;

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

    // 4. Call Claude Vision API for structure analysis
    console.log(`[analyze-schedule-structure] Analyzing structure for page ${pageId}`);

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
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
              text: STRUCTURE_ANALYSIS_PROMPT,
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

    // 6. Parse JSON response - handle various Claude response formats
    let jsonText = textContent.text.trim();

    // Log raw response for debugging
    console.log('[analyze-structure] Raw response length:', jsonText.length);
    console.log('[analyze-structure] First 300 chars:', jsonText.substring(0, 300));

    // Remove markdown code blocks
    jsonText = jsonText.replace(/```json\s*/gi, '');
    jsonText = jsonText.replace(/```\s*/g, '');

    // Try to find JSON object in the response
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[analyze-structure] No JSON object found in response');
      console.error('[analyze-structure] Full response:', jsonText);
      return NextResponse.json(
        {
          success: false,
          pageId,
          error: 'No JSON object found in Claude response',
        },
        { status: 500 }
      );
    }

    jsonText = jsonMatch[0];

    let structureResult: StructureAnalysisResult;
    try {
      structureResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[analyze-structure] JSON parse error:', parseError);
      console.error('[analyze-structure] Attempted to parse:', jsonText.substring(0, 500));
      return NextResponse.json(
        {
          success: false,
          pageId,
          error: 'Failed to parse JSON: ' + (parseError instanceof Error ? parseError.message : 'Unknown error'),
        },
        { status: 500 }
      );
    }

    console.log('[analyze-structure] Successfully parsed structure');

    const tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

    console.log(`[analyze-schedule-structure] Complete. Is schedule: ${structureResult.is_schedule_page}, Schedules found: ${structureResult.schedules_found?.join(', ') || 'none'}, Time: ${processingTime}ms, Tokens: ${tokensUsed}`);

    return NextResponse.json({
      success: true,
      pageId,
      structure: structureResult,
      tokens_used: tokensUsed,
    });

  } catch (error) {
    console.error('[analyze-schedule-structure] Unexpected error:', error);
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
