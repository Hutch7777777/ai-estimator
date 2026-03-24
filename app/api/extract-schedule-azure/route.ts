/**
 * POST /api/extract-schedule-azure
 *
 * Azure Document Intelligence-powered schedule extraction.
 * Drop-in replacement for /api/extract-schedule that uses Azure's
 * prebuilt-layout model for structured table extraction.
 *
 * Key advantage: Azure returns exact cell-to-row/column mappings,
 * eliminating the column misalignment issues seen with Claude Vision
 * on complex nested schedule headers.
 *
 * This replaces BOTH Pass 1 (analyze-schedule-structure) and Pass 2
 * (extract-schedule) since Azure does structure + data in one call.
 *
 * Request body: same as /api/extract-schedule
 *   { pageId: string, imageUrl: string, jobId?: string }
 *
 * Response: same ScheduleOCRData format — PlanIntelligence.tsx needs no changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeLayout } from '@/lib/azure-doc-intel';
import { mapAzureResultToScheduleData } from '@/lib/azure-schedule-mapper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pageId, imageUrl, jobId } = body;

    if (!pageId || !imageUrl) {
      return NextResponse.json(
        { success: false, error: 'pageId and imageUrl are required' },
        { status: 400 }
      );
    }

    console.log(`[Azure Schedule] Starting extraction for page ${pageId}`);
    const startTime = Date.now();

    // ── Call Azure Document Intelligence ──
    const layoutResult = await analyzeLayout({ url: imageUrl });

    const elapsedMs = Date.now() - startTime;
    console.log(`[Azure Schedule] Layout analysis completed in ${elapsedMs}ms`);
    console.log(`[Azure Schedule] Found ${layoutResult.tables?.length || 0} tables`);

    // ── Map Azure tables → ScheduleOCRData ──
    const scheduleData = mapAzureResultToScheduleData(layoutResult);

    // Build debug info for response
    const debugTables = (layoutResult.tables || []).map((table, i) => ({
      index: i,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      caption: table.caption?.content || null,
      firstRowCells: table.cells
        .filter((c) => c.rowIndex === 0)
        .sort((a, b) => a.columnIndex - b.columnIndex)
        .map((c) => ({ col: c.columnIndex, content: c.content, kind: c.kind || 'content' })),
      headerCells: table.cells
        .filter((c) => c.kind === 'columnHeader')
        .map((c) => ({ row: c.rowIndex, col: c.columnIndex, content: c.content })),
    }));

    console.log(`[Azure Schedule] Extracted: ${scheduleData.totals.windows} windows, ${scheduleData.totals.doors} doors`);

    // ── Store results in Supabase (same as existing route) ──
    if (jobId || pageId) {
      try {
        const supabase = await createClient();

        // Update extraction_pages.ocr_data
        // Using type assertion since ocr_* columns exist but aren't in generated types
        const { error: pageError } = await (supabase as any)
          .from('extraction_pages')
          .update({
            ocr_data: scheduleData,
            ocr_status: 'complete',
            ocr_processed_at: new Date().toISOString(),
          })
          .eq('id', pageId);

        if (pageError) {
          console.error('[Azure Schedule] Failed to update extraction_pages:', pageError);
        }

        // Update extraction_jobs.results_summary with counts
        // Using type assertion since results_summary column isn't in generated types
        if (jobId) {
          const { data: jobData } = await (supabase as any)
            .from('extraction_jobs')
            .select('results_summary')
            .eq('id', jobId)
            .single();

          const existingSummary = (jobData?.results_summary as Record<string, unknown>) || {};
          const updatedSummary = {
            ...existingSummary,
            schedule_extraction: {
              windows: scheduleData.totals.windows,
              doors: scheduleData.totals.doors,
              skylights: scheduleData.totals.skylights || 0,
              garages: scheduleData.totals.garages || 0,
              method: 'azure-document-intelligence',
              extracted_at: scheduleData.extracted_at,
            },
          };

          const { error: jobError } = await (supabase as any)
            .from('extraction_jobs')
            .update({ results_summary: updatedSummary })
            .eq('id', jobId);

          if (jobError) {
            console.error('[Azure Schedule] Failed to update extraction_jobs:', jobError);
          }
        }
      } catch (dbError) {
        console.error('[Azure Schedule] Database update error:', dbError);
        // Don't fail the request — we still have the data
      }
    }

    return NextResponse.json({
      success: true,
      pageId,
      data: scheduleData,
      method: 'azure-document-intelligence',
      elapsed_ms: Date.now() - startTime,
      debug: { tables: debugTables },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Azure Schedule] Extraction error:', message);

    return NextResponse.json(
      {
        success: false,
        error: message,
        method: 'azure-document-intelligence',
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler — test endpoint to verify Azure DI is configured.
 */
export async function GET() {
  const configured = !!(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT &&
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  );

  return NextResponse.json({
    service: 'azure-document-intelligence',
    configured,
    endpoint: configured
      ? process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.replace(/\/+$/, '')
      : null,
    model: 'prebuilt-layout',
    apiVersion: '2024-11-30',
  });
}
