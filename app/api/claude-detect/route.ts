import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';

// =============================================================================
// Claude Analysis API Route
// Uses Claude Vision to read specifications and materials from construction drawings
// =============================================================================

// =============================================================================
// Types
// =============================================================================

interface PageImage {
  page_number: number;
  reason: string;  // e.g., "current page", "schedule", "elevation"
  image_url: string;
}

interface RequestBody {
  // Single image mode (legacy)
  image_url?: string;
  // Multi-page mode
  pages?: PageImage[];
  // PDF mode (preferred - best quality for schedules)
  pdf_url?: string;
  // Common fields
  prompt: string;
  page_context?: string; // e.g., "elevation", "schedule", "detail", "notes"
  // Action mode for document generation
  action?: string; // e.g., "create_takeoff", "create_rfi", "answer"
  subject?: string; // e.g., "windows", "doors", "siding"
}

// =============================================================================
// PDF Page Extraction Helper
// =============================================================================

/**
 * Extract specific pages from a PDF to reduce file size.
 * This is needed because full PDFs can exceed Claude's request size limit.
 */
async function extractPdfPages(
  fullPdfBuffer: ArrayBuffer,
  pageNumbers: number[]
): Promise<Uint8Array> {
  const fullPdf = await PDFDocument.load(fullPdfBuffer);
  const newPdf = await PDFDocument.create();

  // Sort and dedupe page numbers
  const uniquePages = [...new Set(pageNumbers)].sort((a, b) => a - b);

  for (const pageNum of uniquePages) {
    const pageIndex = pageNum - 1; // Convert to 0-indexed
    if (pageIndex >= 0 && pageIndex < fullPdf.getPageCount()) {
      const [copiedPage] = await newPdf.copyPages(fullPdf, [pageIndex]);
      newPdf.addPage(copiedPage);
    }
  }

  return await newPdf.save();
}

// Maximum extracted PDF size in MB (base64 adds ~33%, so keep under 15MB)
const MAX_EXTRACTED_PDF_SIZE_MB = 15;

// =============================================================================
// Structured Data Extraction Prompts
// =============================================================================

/**
 * Get the prompt to extract structured JSON data for a specific action
 */
function getStructuredPromptForAction(action: string, subject?: string): string {
  switch (action) {
    case 'create_takeoff':
      return `Based on your analysis above, extract ALL ${subject || 'material'} items into JSON.

CRITICAL REQUIREMENTS:
1. Extract EVERY SINGLE ITEM from the schedule - do NOT summarize or combine items
2. Use the EXACT manufacturer and series you identified in your analysis (e.g., "Milgard", "Tuscany Series")
3. Include ALL item marks from the schedule (W01, W02, W03... through the highest number)
4. Use the EXACT quantities from the schedule
5. Do NOT use "Not Specified" for manufacturer if you identified one in your analysis

Return ONLY valid JSON (no markdown, no code blocks):
{
  "items": [
    {
      "item_code": "W01",
      "description": "Single Hung Window",
      "manufacturer": "Milgard",
      "series": "Tuscany Series",
      "size": "2'-6\\" x 5'-0\\"",
      "quantity": 4,
      "unit": "EA",
      "frame_material": "Vinyl",
      "glass_type": "Low-E",
      "notes": "With screen"
    }
  ],
  "total_count": 57,
  "manufacturer_summary": "Milgard Tuscany Series",
  "summary": "Complete extraction from schedule"
}

IMPORTANT: The total_count must equal the SUM of all item quantities. Include every row from the schedule.`;

    case 'create_rfi':
      return `Based on your analysis, identify any missing, unclear, or incomplete specifications. Return this exact JSON format (no markdown, just raw JSON):
{
  "items": [
    {
      "item_number": 1,
      "description": "Window flashing detail not specified",
      "reference_page": "Page 4",
      "priority": "High"
    }
  ],
  "summary": "X items require clarification"
}

Priority should be "High" for critical missing specs, "Medium" for important clarifications, "Low" for minor questions.`;

    case 'export_schedule':
      return `Extract the complete ${subject || ''} schedule data as JSON (no markdown, just raw JSON):
{
  "schedule_name": "Window Schedule",
  "columns": ["Mark", "Qty", "Width", "Height", "Type", "Manufacturer", "Notes"],
  "rows": [
    ["W01", 4, "4'-0\\"", "4'-0\\"", "Casement", "Milgard", "Low-E"]
  ],
  "total_items": 12
}

Extract ALL rows from the schedule. Preserve exact values as shown.`;

    case 'create_sow':
      return `Based on your analysis, extract information for a Scope of Work. Return this exact JSON format (no markdown, just raw JSON):
{
  "trade": "${subject || 'Exterior'}",
  "materials": [
    "Material 1 description",
    "Material 2 description"
  ],
  "quantities": {
    "Item Name": "Quantity with unit"
  },
  "special_notes": [
    "Any special installation requirements",
    "Coordination notes"
  ]
}`;

    case 'create_checklist':
      return `Based on your analysis, create an installation checklist. Return this exact JSON format (no markdown, just raw JSON):
{
  "trade": "${subject || 'Exterior'}",
  "items": [
    {
      "category": "Pre-Installation",
      "item": "Verify material specifications match approved submittal",
      "completed": false
    },
    {
      "category": "Installation",
      "item": "Install per manufacturer specifications",
      "completed": false
    }
  ]
}

Include relevant items for the materials and methods specified in the plans.`;

    case 'create_summary':
      return `Based on your analysis, create a project summary. Return this exact JSON format (no markdown, just raw JSON):
{
  "materials": {
    "Siding": "Material specification",
    "Windows": "Brand and series",
    "Trim": "Material and size"
  },
  "quantities": {
    "Windows": "12 EA",
    "Doors": "3 EA"
  },
  "notes": [
    "Important specification notes",
    "Special conditions"
  ]
}`;

    default:
      return '';
  }
}

// =============================================================================
// System Prompt
// =============================================================================

const ANALYSIS_SYSTEM_PROMPT = `You are an expert construction estimator analyzing architectural drawings and specifications.

Your job is to READ and EXTRACT information from the drawings, including:
- Material callouts and specifications
- Product names and manufacturers
- Notes and annotations
- Dimensions and measurements
- Assembly details

When analyzing EXTRACTED PDF PAGES:
- You have been provided with specific pages extracted from the plan set as a PDF
- Each page was selected as relevant to the user's question
- Reference specific page numbers where you find information
- Quote exact text from schedules and callouts
- Read all columns in schedules including QTY, SIZE, TYPE, MANUFACTURER, etc.

When analyzing MULTIPLE PAGE IMAGES:
- You may receive multiple images from different pages of the same plan set
- Each image is labeled with its page number and type (e.g., "Page 3 - schedule", "Page 1 - current page")
- Cross-reference information across pages when relevant
- If information appears on multiple pages, cite which page(s) contain it
- The "current page" is the page the user is currently viewing

When the user asks a question:
1. Carefully examine all provided images for relevant text, labels, callouts, and notes
2. Look for specification schedules, material lists, and detail callouts
3. Provide accurate information based on what you can read in the drawings
4. If information isn't visible or unclear, say so clearly
5. Quote exact text when possible (use quotation marks)

COMMON MATERIALS TO LOOK FOR:

Siding:
- James Hardie: HardiePlank, HardiePanel, HardieShingle, HardieTrim
- LP SmartSide: Lap siding, Panel, Trim
- Cedar, Vinyl, Stucco, EIFS, Brick veneer

Trim:
- HardieTrim, Azek, PVC, Composite, Cedar
- Corner boards, Window/Door casings, Fascia, Soffit

Windows:
- Milgard, Andersen, Pella, Marvin, Jeld-Wen
- Series names (e.g., Tuscany, 400 Series)

Roofing:
- Asphalt shingles (GAF, CertainTeed, Owens Corning)
- Metal, Standing seam, Cedar shakes, Tile

Weather Barriers:
- Tyvek HomeWrap, HardieWrap, Zip System
- Flexible flashing, Self-adhered membranes

RESPONSE FORMAT:
Respond conversationally with the information found. Be specific and quote exact callout text when visible.

If you find multiple relevant pieces of information, organize them clearly.
If you cannot find the information requested, say "I don't see [specific item] called out on this drawing" rather than guessing.`;

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[claude-analysis] ========================================');
  console.log('[claude-analysis] API called at:', new Date().toISOString());

  try {
    // 1. Parse request body
    const body: RequestBody = await request.json();
    const { image_url, pages, pdf_url, prompt, page_context, action, subject } = body;

    const isMultiPage = pages && pages.length > 0;
    const isPdfMode = !!pdf_url;
    const isActionMode = action && action !== 'answer';

    console.log('[claude-analysis] Request:', {
      mode: isPdfMode ? 'pdf' : isMultiPage ? 'multi-page' : 'single-image',
      pdf_url: isPdfMode ? pdf_url.substring(0, 50) + '...' : undefined,
      pageCount: isMultiPage ? pages.length : 1,
      image_url: !isMultiPage && !isPdfMode ? image_url?.substring(0, 50) + '...' : undefined,
      pages: isMultiPage ? pages.map(p => ({ page: p.page_number, reason: p.reason })) : undefined,
      prompt: prompt?.substring(0, 80) + '...',
      page_context,
      action: action || 'answer',
      subject,
    });

    // 2. Validate required fields
    if (!isPdfMode && !isMultiPage && !image_url) {
      return NextResponse.json(
        { success: false, error: 'pdf_url, image_url, or pages array is required' },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'prompt is required' },
        { status: 400 }
      );
    }

    // 3. Get API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[claude-analysis] Missing ANTHROPIC_API_KEY');
      return NextResponse.json(
        { success: false, error: 'Claude API key not configured' },
        { status: 500 }
      );
    }

    // 4. Build the user prompt with optional page context
    let userPrompt = prompt;
    if (page_context) {
      const contextHints: Record<string, string> = {
        elevation: 'This appears to be an elevation drawing. Look for material callouts, siding types, trim details, and window/door specifications.',
        schedule: 'This appears to be a schedule page. Look for window schedules, door schedules, or finish schedules with product specifications.',
        detail: 'This appears to be a detail drawing. Look for assembly specifications, material layers, and product callouts.',
        notes: 'This appears to be a notes or specifications page. Look for general notes, material specifications, and construction requirements.',
      };
      const hint = contextHints[page_context];
      if (hint) {
        userPrompt = `${hint}\n\n${prompt}`;
      }
    }

    // 5. Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // 6. Build content array (PDF, multi-page images, or single image)
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    if (isPdfMode && pdf_url && isMultiPage && pages) {
      // PDF mode with page extraction (preferred - best quality for schedules and text)
      console.log('[claude-analysis] Using PDF mode with page extraction...');

      try {
        const pdfResponse = await fetch(pdf_url);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
        }

        const fullPdfBuffer = await pdfResponse.arrayBuffer();
        const fullSizeMB = fullPdfBuffer.byteLength / (1024 * 1024);
        console.log('[claude-analysis] Full PDF fetched, size:', fullSizeMB.toFixed(2), 'MB');

        // Extract only the relevant pages
        const pageNumbers = pages.map(p => p.page_number);
        console.log('[claude-analysis] Extracting pages:', pageNumbers);

        const extractedPdfBytes = await extractPdfPages(fullPdfBuffer, pageNumbers);
        const extractedSizeMB = extractedPdfBytes.byteLength / (1024 * 1024);
        console.log('[claude-analysis] Extracted PDF size:', extractedSizeMB.toFixed(2), 'MB');

        // Check if extracted PDF is small enough
        if (extractedSizeMB > MAX_EXTRACTED_PDF_SIZE_MB) {
          console.log('[claude-analysis] Extracted PDF still too large, falling back to images');
          throw new Error(`Extracted PDF too large: ${extractedSizeMB.toFixed(2)}MB > ${MAX_EXTRACTED_PDF_SIZE_MB}MB`);
        }

        const base64Pdf = Buffer.from(extractedPdfBytes).toString('base64');

        // Build page context
        const pageContext = pages.map(p => `Page ${p.page_number}: ${p.reason}`).join('\n');

        contentBlocks.push({
          type: 'text',
          text: `I'm providing ${pageNumbers.length} relevant pages extracted from the plan set:\n${pageContext}\n\nPlease analyze these pages to answer the question.`,
        });

        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Pdf,
          },
        });

        contentBlocks.push({
          type: 'text',
          text: userPrompt,
        });

        console.log('[claude-analysis] Using extracted PDF with pages:', pageNumbers);
      } catch (pdfError) {
        console.error('[claude-analysis] PDF extraction failed, falling back to images:', pdfError);
        // Fall through to image handling below
      }
    }

    // If no PDF content was added (either not PDF mode or PDF fetch failed), use images
    if (contentBlocks.length === 0) {
      if (isMultiPage && pages) {
        // Multi-page mode: add each page image with a label
        for (const page of pages) {
          // Add label text before each image
          contentBlocks.push({
            type: 'text',
            text: `📄 Page ${page.page_number} (${page.reason}):`,
          });
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'url',
              url: page.image_url,
            },
          });
        }
        // Add the user's question at the end
        contentBlocks.push({
          type: 'text',
          text: `\n${userPrompt}`,
        });
      } else {
        // Single image mode (legacy)
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'url',
            url: image_url!,
          },
        });
        contentBlocks.push({
          type: 'text',
          text: userPrompt,
        });
      }
    }

    // 7. Call Claude Vision API
    console.log('[claude-analysis] Calling Claude Vision API...');
    const startTime = Date.now();

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });

    const processingTime = Date.now() - startTime;
    console.log('[claude-analysis] Claude response received in', processingTime, 'ms');

    // 8. Extract text content from response
    const textContent = message.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    console.log('[claude-analysis] Response length:', textContent.text.length, 'chars');

    // 9. If action mode, extract structured data
    let structuredData: unknown = null;

    console.log('[claude-analysis] Action mode check:', {
      action,
      isActionMode,
      willExtractStructuredData: isActionMode && !!action,
    });

    if (isActionMode && action) {
      const structuredPrompt = getStructuredPromptForAction(action, subject);

      console.log('[claude-analysis] Structured prompt for action:', action);
      console.log('[claude-analysis] Subject:', subject);
      console.log('[claude-analysis] Prompt preview:', structuredPrompt?.substring(0, 200));

      if (structuredPrompt) {
        console.log('[claude-analysis] Action mode detected, extracting structured data...');

        try {
          const structuredMessage = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            system: 'You are a construction data extractor. Return ONLY valid JSON with no markdown formatting, no code blocks, and no explanation. Just the raw JSON object.',
            messages: [
              {
                role: 'user',
                content: contentBlocks,
              },
              {
                role: 'assistant',
                content: textContent.text,
              },
              {
                role: 'user',
                content: structuredPrompt,
              },
            ],
          });

          const structuredTextContent = structuredMessage.content.find(block => block.type === 'text');
          if (structuredTextContent && structuredTextContent.type === 'text') {
            // Clean up the response - remove any markdown code blocks
            let jsonText = structuredTextContent.text
              .replace(/```json\n?/g, '')
              .replace(/```\n?/g, '')
              .trim();

            try {
              structuredData = JSON.parse(jsonText);
              console.log('[claude-analysis] Structured data extracted successfully');
              console.log('[claude-analysis] Structured data keys:', Object.keys(structuredData as object));

              // Validation logging for takeoffs
              const data = structuredData as Record<string, unknown>;
              if (Array.isArray(data.items)) {
                const items = data.items as Array<Record<string, unknown>>;
                const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
                console.log('[claude-analysis] Items count:', items.length);
                console.log('[claude-analysis] Total quantity:', totalQty);
                console.log('[claude-analysis] Sample item:', JSON.stringify(items[0], null, 2));

                // Check for missing manufacturers
                const missingMfg = items.filter(i => !i.manufacturer || i.manufacturer === 'Not Specified');
                if (missingMfg.length > 0) {
                  console.warn('[claude-analysis] WARNING:', missingMfg.length, 'items missing manufacturer');

                  // Try to extract manufacturer from the analysis
                  const mfgPatterns = [
                    /(?:uses?|from|by|are)\s+\*?\*?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:Series|windows|products)/i,
                    /\*?\*?([A-Z][a-zA-Z]+)\s+Tuscany/i,
                    /\*?\*?([A-Z][a-zA-Z]+)\s+(?:vinyl|aluminum|wood)\s+windows/i,
                    /manufacturer[:\s]+\*?\*?([A-Z][a-zA-Z]+)/i,
                  ];

                  let detectedMfg: string | null = null;
                  for (const pattern of mfgPatterns) {
                    const match = textContent.text.match(pattern);
                    if (match) {
                      detectedMfg = match[1];
                      console.log('[claude-analysis] Detected manufacturer from analysis:', detectedMfg);
                      break;
                    }
                  }

                  // Also check manufacturer_summary in structured data
                  if (!detectedMfg && data.manufacturer_summary) {
                    const summaryMatch = String(data.manufacturer_summary).match(/^([A-Z][a-zA-Z]+)/);
                    if (summaryMatch) {
                      detectedMfg = summaryMatch[1];
                      console.log('[claude-analysis] Detected manufacturer from summary:', detectedMfg);
                    }
                  }

                  // Fill in missing manufacturers
                  if (detectedMfg) {
                    console.log('[claude-analysis] Filling in manufacturer:', detectedMfg);
                    data.items = items.map(item => ({
                      ...item,
                      manufacturer: item.manufacturer && item.manufacturer !== 'Not Specified'
                        ? item.manufacturer
                        : detectedMfg
                    }));
                    structuredData = data;
                  }
                }

                // Clean up any remaining "Not Specified" or truncated values
                // Replace with empty string for cleaner display
                const cleanupValue = (val: unknown): string => {
                  if (!val) return '';
                  const strVal = String(val);
                  if (strVal === 'Not Specified' || strVal === 'Not' || strVal === 'N/A' || strVal === 'Unknown') {
                    return '';
                  }
                  return strVal;
                };

                data.items = (data.items as Array<Record<string, unknown>>).map(item => ({
                  ...item,
                  manufacturer: cleanupValue(item.manufacturer),
                  series: cleanupValue(item.series),
                  frame_material: cleanupValue(item.frame_material),
                  glass_type: cleanupValue(item.glass_type),
                }));
                structuredData = data;
                console.log('[claude-analysis] Cleaned up Not Specified values');
              }
            } catch (parseError) {
              console.error('[claude-analysis] Failed to parse structured JSON:', parseError);
              console.log('[claude-analysis] Raw response:', jsonText.substring(0, 500));
            }
          }
        } catch (structuredError) {
          console.error('[claude-analysis] Failed to extract structured data:', structuredError);
          // Continue without structured data
        }
      }
    }

    // 10. Return response
    return NextResponse.json({
      success: true,
      analysis: textContent.text,
      structuredData,
      action: action || 'answer',
      processing_time_ms: processingTime,
      tokens_used: {
        input: message.usage?.input_tokens || 0,
        output: message.usage?.output_tokens || 0,
      },
    });

  } catch (error) {
    console.error('[claude-analysis] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
