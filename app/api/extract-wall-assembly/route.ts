import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type { WallAssembly, WallLayer, WallAssemblyExtractionResult } from '@/lib/types/extraction';

// =============================================================================
// Wall Assembly Extraction API Route
// Extracts wall construction layers from section drawings
// =============================================================================

const WALL_ASSEMBLY_PROMPT = `Analyze this construction section drawing and extract ALL wall assembly details.

WHAT TO LOOK FOR:
1. WALL SECTION DETAILS - Look for callouts showing wall construction layers
2. ASSEMBLY TAGS - Like "TYPICAL EXTERIOR WALL", "WALL TYPE A", "DETAIL 3/A5.1"
3. LAYER CALLOUTS - Material labels pointing to each layer of the wall
4. DIMENSION STRINGS - Showing layer thicknesses

TYPICAL WALL LAYERS (exterior to interior):
1. Exterior Cladding: siding, stucco, brick veneer, stone veneer
2. Weather Barrier: Tyvek, house wrap, building paper
3. Sheathing: OSB, plywood, ZIP System, DensGlass
4. Air Gap / Furring: rain screen cavity, furring strips
5. Framing: 2x4, 2x6, steel stud
6. Insulation: fiberglass batt, mineral wool, spray foam, rigid foam
7. Vapor Barrier: poly sheeting, kraft facing
8. Interior Finish: drywall, plaster, paneling

MANUFACTURER RECOGNITION:
- James Hardie: "Hardie", "HardiePlank", "HardiePanel"
- Tyvek: "DuPont Tyvek", "HomeWrap", "CommercialWrap"
- ZIP System: "Huber ZIP", "ZIP Sheathing"
- Owens Corning: pink insulation, "OC"
- CertainTeed: "CertainTeed", insulation products
- DensGlass: "Georgia-Pacific DensGlass"

EXTRACT:
1. Assembly name/type
2. Each layer with:
   - Position (1 = outermost)
   - Layer name (descriptive)
   - Material specification
   - Manufacturer if shown
   - Thickness if dimensioned
   - R-value for insulation
3. Framing type and spacing
4. Total assembly thickness
5. Special ratings (fire, acoustic)

Return ONLY valid JSON (no markdown, no explanation):
{
  "hasWallSections": true,
  "assemblies": [
    {
      "assemblyName": "Typical Exterior Wall",
      "layers": [
        {
          "position": 1,
          "layerName": "Exterior Cladding",
          "material": "Fiber Cement Lap Siding",
          "manufacturer": "James Hardie",
          "productLine": "HardiePlank",
          "thickness": "5/16\\"",
          "rValue": null,
          "notes": "7\\" exposure",
          "confidence": 0.95
        },
        {
          "position": 2,
          "layerName": "Weather Barrier",
          "material": "House Wrap",
          "manufacturer": "DuPont",
          "productLine": "Tyvek HomeWrap",
          "thickness": null,
          "rValue": null,
          "notes": null,
          "confidence": 0.90
        },
        {
          "position": 3,
          "layerName": "Sheathing",
          "material": "OSB",
          "manufacturer": null,
          "productLine": null,
          "thickness": "7/16\\"",
          "rValue": null,
          "notes": null,
          "confidence": 0.85
        },
        {
          "position": 4,
          "layerName": "Framing Cavity",
          "material": "2x6 Wood Stud",
          "manufacturer": null,
          "productLine": null,
          "thickness": "5-1/2\\"",
          "rValue": null,
          "notes": "16\\" O.C.",
          "confidence": 0.90
        },
        {
          "position": 5,
          "layerName": "Cavity Insulation",
          "material": "Fiberglass Batt",
          "manufacturer": "Owens Corning",
          "productLine": null,
          "thickness": "5-1/2\\"",
          "rValue": 21,
          "notes": "R-21",
          "confidence": 0.85
        },
        {
          "position": 6,
          "layerName": "Interior Finish",
          "material": "Gypsum Board",
          "manufacturer": null,
          "productLine": null,
          "thickness": "1/2\\"",
          "rValue": null,
          "notes": "Type X where required",
          "confidence": 0.90
        }
      ],
      "totalThickness": "7-5/16\\"",
      "framingType": "2x6",
      "framingSpacing": "16\\" O.C.",
      "insulationType": "Fiberglass Batt",
      "insulationRValue": 21,
      "vaporBarrier": "Kraft facing on insulation",
      "fireRating": null,
      "acousticRating": null,
      "notes": "Typical for all exterior walls",
      "confidence": 0.88,
      "confidenceNotes": "Clear section detail with most layers labeled"
    }
  ],
  "sectionDetails": [
    {
      "sectionTitle": "TYPICAL EXTERIOR WALL SECTION",
      "sectionNumber": "3/A5.1",
      "scale": "1\\" = 1'-0\\""
    }
  ],
  "extractionNotes": "Found one clear wall section detail with 6 layers identified"
}

If NO wall assembly sections are found (e.g., this is a floor plan or elevation):
{
  "hasWallSections": false,
  "assemblies": [],
  "sectionDetails": [],
  "extractionNotes": "This appears to be [describe what the page shows] - no wall section details found"
}

IMPORTANT: Return ONLY the JSON object. No explanation, no markdown formatting.`;

interface ExtractWallAssemblyRequest {
  pageId: string;
  imageUrl: string;
  jobId?: string;
  pageNumber?: number;
}

interface ExtractWallAssemblyResponse {
  success: boolean;
  pageId: string;
  data?: WallAssemblyExtractionResult;
  error?: string;
  tokens_used?: number;
}

interface ClaudeLayerResponse {
  position: number;
  layerName: string;
  material: string;
  manufacturer: string | null;
  productLine: string | null;
  thickness: string | null;
  rValue: number | null;
  notes: string | null;
  confidence: number;
}

interface ClaudeAssemblyResponse {
  assemblyName: string;
  layers: ClaudeLayerResponse[];
  totalThickness: string | null;
  framingType: string | null;
  framingSpacing: string | null;
  insulationType: string | null;
  insulationRValue: number | null;
  vaporBarrier: string | null;
  fireRating: string | null;
  acousticRating: string | null;
  notes: string | null;
  confidence: number;
  confidenceNotes: string;
}

interface ClaudeExtractionResponse {
  hasWallSections: boolean;
  assemblies: ClaudeAssemblyResponse[];
  sectionDetails: {
    sectionTitle: string;
    sectionNumber: string | null;
    scale: string | null;
  }[];
  extractionNotes: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractWallAssemblyResponse>> {
  try {
    // 1. Parse and validate request
    const body = await request.json() as ExtractWallAssemblyRequest;
    const { pageId, imageUrl, jobId, pageNumber } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, pageId: pageId || '', error: 'Missing required fields: pageId and imageUrl' },
        { status: 400 }
      );
    }

    console.log(`[extract-wall-assembly] Processing page ${pageId} (page #${pageNumber || 'unknown'})`);

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
              text: WALL_ASSEMBLY_PROMPT,
            },
          ],
        },
      ],
    });
    const processingTime = Date.now() - startTime;
    const tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

    console.log(`[extract-wall-assembly] Claude response received in ${processingTime}ms, tokens: ${tokensUsed}`);

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
      console.error('[extract-wall-assembly] JSON parse error:', parseError);
      console.error('[extract-wall-assembly] Raw response:', textContent.text);
      return NextResponse.json(
        { success: false, pageId, error: 'Failed to parse Claude response as JSON' },
        { status: 500 }
      );
    }

    // 7. Normalize and format assemblies
    const normalizedAssemblies: WallAssembly[] = (extractedData.assemblies || []).map((assembly, idx) => {
      const layers: WallLayer[] = (assembly.layers || []).map(layer => ({
        position: layer.position,
        layerName: layer.layerName || 'Unknown Layer',
        material: layer.material || 'Unspecified',
        manufacturer: layer.manufacturer || null,
        productLine: layer.productLine || null,
        thickness: layer.thickness || null,
        rValue: layer.rValue || null,
        notes: layer.notes || null,
        confidence: typeof layer.confidence === 'number' ? layer.confidence : 0.7,
      }));

      return {
        id: `${pageId}-assembly-${idx}`,
        assemblyName: assembly.assemblyName || `Wall Assembly ${idx + 1}`,
        layers,
        totalThickness: assembly.totalThickness || null,
        framingType: assembly.framingType || null,
        framingSpacing: assembly.framingSpacing || null,
        insulationType: assembly.insulationType || null,
        insulationRValue: assembly.insulationRValue || null,
        vaporBarrier: assembly.vaporBarrier || null,
        fireRating: assembly.fireRating || null,
        acousticRating: assembly.acousticRating || null,
        notes: assembly.notes || null,
        confidence: typeof assembly.confidence === 'number' ? assembly.confidence : 0.7,
        confidenceNotes: assembly.confidenceNotes || '',
        pageRef: pageNumber ? `Page ${pageNumber}` : pageId,
      };
    });

    // 8. Build result
    const result: WallAssemblyExtractionResult = {
      hasWallSections: extractedData.hasWallSections,
      assemblies: normalizedAssemblies,
      sectionDetails: extractedData.sectionDetails || [],
      extractedAt: new Date().toISOString(),
      modelUsed: 'claude-sonnet-4-20250514',
      tokensUsed,
      processingTimeMs: processingTime,
      extractionNotes: extractedData.extractionNotes || null,
    };

    console.log(`[extract-wall-assembly] Found ${normalizedAssemblies.length} wall assemblies`);
    if (normalizedAssemblies.length > 0) {
      normalizedAssemblies.forEach(assembly => {
        console.log(`  - ${assembly.assemblyName}: ${assembly.layers.length} layers`);
      });
    }

    // 9. Store in Supabase (extraction_pages.wall_assembly)
    const supabase = await createClient();

    // Using type assertion since wall_assembly column may not be in generated types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_pages')
      .update({
        wall_assembly: result,
      })
      .eq('id', pageId);

    if (updateError) {
      console.error('[extract-wall-assembly] Supabase update error:', updateError);
      // Don't fail the request - still return the extracted data
    } else {
      console.log(`[extract-wall-assembly] Updated page ${pageId} with wall assembly data`);
    }

    // 10. Optionally update job-level aggregated data
    if (jobId && normalizedAssemblies.length > 0) {
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

          // Add wall assembly summary
          const wallAssemblySummary = {
            total_assemblies_found: normalizedAssemblies.length,
            assembly_names: normalizedAssemblies.map(a => a.assemblyName),
            primary_framing: normalizedAssemblies[0]?.framingType || null,
            primary_insulation: normalizedAssemblies[0]?.insulationType || null,
            primary_r_value: normalizedAssemblies[0]?.insulationRValue || null,
            extracted_from_pages: [pageNumber],
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('extraction_jobs')
            .update({
              results_summary: {
                ...currentSummary,
                aggregated_data: {
                  ...aggregatedData,
                  wall_assembly: wallAssemblySummary,
                },
              },
            })
            .eq('id', jobId);
        }
      } catch (jobUpdateError) {
        console.error('[extract-wall-assembly] Job update error:', jobUpdateError);
        // Non-critical - don't fail the request
      }
    }

    console.log(`[extract-wall-assembly] Complete. Assemblies: ${normalizedAssemblies.length}, Time: ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      pageId,
      data: result,
      tokens_used: tokensUsed,
    });

  } catch (error) {
    console.error('[extract-wall-assembly] Unexpected error:', error);
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

    // Using type assertion since wall_assembly column may not be in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page, error } = await (supabase as any)
      .from('extraction_pages')
      .select('id, wall_assembly')
      .eq('id', pageId)
      .single();

    if (error || !page) {
      return NextResponse.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    const typedPage = page as { id: string; wall_assembly?: WallAssemblyExtractionResult };

    return NextResponse.json({
      success: true,
      pageId,
      data: typedPage.wall_assembly,
    });

  } catch (error) {
    console.error('[extract-wall-assembly] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wall assembly data' },
      { status: 500 }
    );
  }
}
