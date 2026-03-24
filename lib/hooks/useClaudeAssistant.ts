'use client';

import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  getRelevantPageTypes,
  filterRelevantPages,
  formatSelectedPages,
  type PageInput,
  type SelectedPage,
} from '@/lib/utils/pageTypeMapping';
import {
  detectAction,
  isActionMode as checkIsActionMode,
  getActionDescription,
  type PlanReaderAction,
} from '@/lib/utils/planReaderActions';
import {
  generateTakeoffSpreadsheet,
  generateScheduleSpreadsheet,
  generateRFIDocument,
  generateScopeOfWork,
  generateInstallationChecklist,
  generateProjectSummary,
  downloadFile,
  downloadTextDocument,
  type TakeoffItem,
  type ScheduleData,
  type RFIItem,
  type ChecklistItem,
} from '@/lib/utils/documentGenerators';
import type {
  ScheduleOCRData,
  ScheduleWindow,
  ScheduleDoor,
} from '@/lib/types/extraction';

// =============================================================================
// Schedule Data Conversion (Azure DI → TakeoffItem)
// =============================================================================

/**
 * Convert Azure-extracted ScheduleWindow[] to TakeoffItem[] for Excel export.
 */
function scheduleWindowsToTakeoffItems(windows: ScheduleWindow[]): TakeoffItem[] {
  return windows.map((w, i) => ({
    item_code: w.mark || `W${i + 1}`,
    description: w.type ? `${w.type} - ${w.mark}` : `Window ${w.mark}`,
    manufacturer: '',
    size: w.size || '',
    quantity: w.quantity || 1,
    unit: 'EA',
    notes: w.notes || '',
  }));
}

/**
 * Convert Azure-extracted ScheduleDoor[] to TakeoffItem[] for Excel export.
 */
function scheduleDoorsToTakeoffItems(doors: ScheduleDoor[]): TakeoffItem[] {
  return doors.map((d, i) => ({
    item_code: d.mark || `D${i + 1}`,
    description: d.type ? `${d.type} - ${d.mark}` : `Door ${d.mark}`,
    manufacturer: '',
    size: d.size || '',
    quantity: d.quantity || 1,
    unit: 'EA',
    notes: d.notes || '',
  }));
}

/**
 * Fetch existing Azure schedule data via server-side API for pages with ocr_data.
 * Uses fetch to avoid RLS issues with browser Supabase client.
 * Returns aggregated ScheduleOCRData if found, or null if no schedule data exists.
 */
async function fetchExistingScheduleData(pageIds: string[]): Promise<ScheduleOCRData | null> {
  console.log('[fetchExistingScheduleData] ========================================');
  console.log('[fetchExistingScheduleData] Fetching via API for', pageIds.length, 'pages');

  if (pageIds.length === 0) {
    console.log('[fetchExistingScheduleData] No page IDs provided');
    return null;
  }

  try {
    const allWindows: ScheduleWindow[] = [];
    const allDoors: ScheduleDoor[] = [];

    for (const pageId of pageIds) {
      try {
        const res = await fetch(`/api/extraction-pages/${pageId}`);
        if (!res.ok) {
          console.warn(`[fetchExistingScheduleData] Failed to fetch page ${pageId}: ${res.status}`);
          continue;
        }
        const data = await res.json();
        const ocrData = data?.ocr_data as ScheduleOCRData | null;

        console.log(`[fetchExistingScheduleData] Page ${data?.page_number} (${data?.page_type}):`, {
          hasOcrData: !!ocrData,
          windowsInOcr: ocrData?.windows?.length ?? 'N/A',
          doorsInOcr: ocrData?.doors?.length ?? 'N/A',
        });

        if (!ocrData) continue;

        if (ocrData.windows?.length) {
          console.log(`[fetchExistingScheduleData] -> Adding ${ocrData.windows.length} windows`);
          allWindows.push(...ocrData.windows);
        }
        if (ocrData.doors?.length) {
          console.log(`[fetchExistingScheduleData] -> Adding ${ocrData.doors.length} doors`);
          allDoors.push(...ocrData.doors);
        }
      } catch (e) {
        console.warn('[fetchExistingScheduleData] Failed to fetch page', pageId, e);
      }
    }

    console.log('[fetchExistingScheduleData] Total:', allWindows.length, 'windows,', allDoors.length, 'doors');

    if (allWindows.length === 0 && allDoors.length === 0) {
      console.log('[fetchExistingScheduleData] No windows or doors found across all pages');
      return null;
    }

    console.log(`[fetchExistingScheduleData] SUCCESS: ${allWindows.length} windows, ${allDoors.length} doors`);

    return {
      windows: allWindows,
      doors: allDoors,
      skylights: [],
      garages: [],
      totals: {
        windows: allWindows.length,
        doors: allDoors.length,
      },
      confidence: 0.92,
      extraction_notes: 'Aggregated from Azure Document Intelligence extraction',
      is_schedule_page: true,
      extracted_at: new Date().toISOString(),
      model_used: 'azure-document-intelligence-layout-v4.0',
      tokens_used: 0,
    };
  } catch (err) {
    console.error('[fetchExistingScheduleData] ERROR:', err);
    return null;
  }
}

// =============================================================================
// Types
// =============================================================================

export interface ClaudeAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Processing time in ms (assistant messages only) */
  processingTimeMs?: number;
  /** Token usage (assistant messages only) */
  tokensUsed?: { input: number; output: number };
  /** Pages that were analyzed for this response */
  analyzedPages?: SelectedPage[];
}

export interface UseClaudeAssistantOptions {
  /** Current page image URL (fallback if no pages or PDF provided) */
  imageUrl: string;
  /** Current page ID for smart selection */
  currentPageId?: string;
  /** All available pages for smart selection */
  allPages?: PageInput[];
  /** PDF URL for best quality analysis (preferred over images) */
  pdfUrl?: string;
  /** Optional page context hint for better analysis */
  pageContext?: 'elevation' | 'schedule' | 'detail' | 'notes';
  /** Project name for generated documents */
  projectName?: string;
  /** Project address for generated documents */
  projectAddress?: string;
}

export interface UseClaudeAssistantResult {
  /** Whether a request is in progress */
  isLoading: boolean;
  /** Error message if request failed */
  error: string | null;
  /** Conversation messages */
  messages: ClaudeAssistantMessage[];
  /** Send a prompt to Claude */
  askClaude: (prompt: string) => Promise<void>;
  /** Clear all messages */
  clearMessages: () => void;
}

// =============================================================================
// Quick Prompts - Material and Specification Analysis
// =============================================================================

export const QUICK_PROMPTS = [
  {
    id: 'siding-material',
    label: 'Siding Material',
    prompt: 'What siding material is specified for this house? Look for callouts mentioning HardiePlank, LP SmartSide, cedar, vinyl, or other siding materials.',
  },
  {
    id: 'trim-type',
    label: 'Trim Type',
    prompt: 'What type of trim is used on this project? Look for HardieTrim, Azek, PVC, or composite trim callouts. Include any corner boards, fascia, or window/door casing specifications.',
  },
  {
    id: 'window-brand',
    label: 'Window Brand',
    prompt: 'What window manufacturer or brand is specified? Look for Milgard, Andersen, Pella, Marvin, or other window brands. Include any series names if visible.',
  },
  {
    id: 'roofing-material',
    label: 'Roofing Material',
    prompt: 'What roofing material is specified? Look for asphalt shingles (GAF, CertainTeed, etc.), metal roofing, cedar shakes, or tile.',
  },
  {
    id: 'all-callouts',
    label: 'All Callouts',
    prompt: 'Read and list all material callouts visible on this page. Include siding, trim, windows, roofing, and any other exterior finishes that are specified.',
  },
  {
    id: 'belly-band',
    label: 'Belly Band',
    prompt: 'Is there a belly band or horizontal band detail on this elevation? If so, what material is specified for it?',
  },
  {
    id: 'wrb-housewrap',
    label: 'WRB/Housewrap',
    prompt: 'What weather resistive barrier (WRB) or housewrap is specified? Look for Tyvek, HardieWrap, Zip System, or similar products.',
  },
  {
    id: 'exterior-colors',
    label: 'Exterior Colors',
    prompt: 'What exterior colors are specified? Look for paint colors, siding colors (like Arctic White, Evening Blue, etc.), and trim colors.',
  },
] as const;

// =============================================================================
// Document Generation Helper
// =============================================================================

interface DocumentResult {
  filename: string;
  mimeType: string;
}

async function generateDocumentFromData(
  action: PlanReaderAction,
  format: string,
  data: Record<string, unknown>,
  projectName: string,
  projectAddress: string,
  subject: string
): Promise<DocumentResult | null> {
  const dateStr = new Date().toISOString().split('T')[0];
  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '_');

  switch (action) {
    case 'create_takeoff': {
      const items = (data.items as TakeoffItem[]) || [];
      if (items.length === 0) return null;

      const buffer = await generateTakeoffSpreadsheet(items, projectName, subject || 'Material');
      const filename = `${safeName}_${subject || 'Material'}_Takeoff_${dateStr}.xlsx`;
      downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }

    case 'export_schedule': {
      const scheduleData = data as unknown as ScheduleData;
      if (!scheduleData.rows || scheduleData.rows.length === 0) return null;

      const buffer = await generateScheduleSpreadsheet(scheduleData, projectName);
      const filename = `${safeName}_${scheduleData.schedule_name || 'Schedule'}_${dateStr}.xlsx`;
      downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }

    case 'create_rfi': {
      const items = (data.items as RFIItem[]) || [];
      if (items.length === 0) return null;

      const content = generateRFIDocument(items, projectName, projectAddress);
      const filename = `${safeName}_RFI_${dateStr}.md`;
      downloadTextDocument(content, filename, 'text/markdown');
      return { filename, mimeType: 'text/markdown' };
    }

    case 'create_sow': {
      const materials = (data.materials as string[]) || [];
      const quantities = (data.quantities as Record<string, number | string>) || {};
      const trade = (data.trade as string) || subject || 'Exterior';

      const content = generateScopeOfWork(materials, quantities, projectName, trade);
      const filename = `${safeName}_SOW_${trade}_${dateStr}.md`;
      downloadTextDocument(content, filename, 'text/markdown');
      return { filename, mimeType: 'text/markdown' };
    }

    case 'create_checklist': {
      const items = (data.items as ChecklistItem[]) || [];
      const trade = (data.trade as string) || subject || 'Exterior';

      const content = generateInstallationChecklist(items, projectName, trade);
      const filename = `${safeName}_Checklist_${trade}_${dateStr}.md`;
      downloadTextDocument(content, filename, 'text/markdown');
      return { filename, mimeType: 'text/markdown' };
    }

    case 'create_summary': {
      const materials = (data.materials as Record<string, string>) || {};
      const quantities = (data.quantities as Record<string, number | string>) || {};
      const notes = (data.notes as string[]) || [];

      const content = generateProjectSummary(projectName, projectAddress, materials, quantities, notes);
      const filename = `${safeName}_Summary_${dateStr}.md`;
      downloadTextDocument(content, filename, 'text/markdown');
      return { filename, mimeType: 'text/markdown' };
    }

    default:
      return null;
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useClaudeAssistant(options: UseClaudeAssistantOptions): UseClaudeAssistantResult {
  const { imageUrl, currentPageId, allPages, pdfUrl, pageContext, projectName, projectAddress } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClaudeAssistantMessage[]>([]);

  // Track request ID to handle race conditions
  const requestIdRef = useRef(0);

  // Ask Claude for analysis with smart page selection
  const askClaude = useCallback(async (prompt: string) => {
    // Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    setIsLoading(true);
    setError(null);

    // Detect if this is an action request (document generation)
    const detectedAction = detectAction(prompt);
    const isActionRequest = checkIsActionMode(detectedAction);

    console.log('[useClaudeAssistant] ========================================');
    console.log('[useClaudeAssistant] Prompt:', prompt);
    console.log('[useClaudeAssistant] Detected action:', JSON.stringify(detectedAction));
    console.log('[useClaudeAssistant] Is action request:', isActionRequest);

    // Add user message
    const userMessage: ClaudeAssistantMessage = {
      id: uuidv4(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // =========================================================================
    // FAST PATH: Use existing Azure schedule data for window/door takeoffs
    // =========================================================================
    if (
      detectedAction.action === 'create_takeoff' &&
      (detectedAction.subject === 'window' || detectedAction.subject === 'windows' ||
       detectedAction.subject === 'door' || detectedAction.subject === 'doors') &&
      allPages && allPages.length > 0
    ) {
      const startTime = Date.now();
      const isWindowTakeoff = detectedAction.subject?.startsWith('window');
      const subjectLabel = isWindowTakeoff ? 'Window' : 'Door';

      console.log(`[useClaudeAssistant] Fast path: checking for existing ${subjectLabel} schedule data...`);

      // Debug: log ALL pages and their types
      console.log('[useClaudeAssistant] All available pages:', allPages.map(p => ({
        id: p.id?.substring(0, 8) + '...',
        page_number: p.page_number,
        page_type: p.page_type,
        matchesSchedule: p.page_type?.toLowerCase().includes('schedule'),
      })));

      // Get page IDs for schedule pages
      const schedulePageIds = allPages
        .filter(p => p.page_type?.toLowerCase().includes('schedule'))
        .map(p => p.id);

      console.log(`[useClaudeAssistant] Found ${schedulePageIds.length} schedule pages:`, schedulePageIds.map(id => id.substring(0, 8) + '...'));

      if (schedulePageIds.length > 0) {
        const scheduleData = await fetchExistingScheduleData(schedulePageIds);

        console.log('[useClaudeAssistant] Schedule data result:', {
          hasData: !!scheduleData,
          windowCount: scheduleData?.windows?.length ?? 0,
          doorCount: scheduleData?.doors?.length ?? 0,
        });

        if (scheduleData) {
          const items = isWindowTakeoff
            ? scheduleWindowsToTakeoffItems(scheduleData.windows)
            : scheduleDoorsToTakeoffItems(scheduleData.doors);

          console.log(`[useClaudeAssistant] Converted to ${items.length} TakeoffItems for ${subjectLabel}`);

          if (items.length > 0) {
            console.log(`[useClaudeAssistant] Fast path SUCCESS: ${items.length} ${subjectLabel.toLowerCase()}s from Azure schedule data`);

            try {
              const dateStr = new Date().toISOString().split('T')[0];
              const safeName = (projectName || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
              const filename = `${safeName}_${subjectLabel}_Takeoff_${dateStr}.xlsx`;

              const buffer = await generateTakeoffSpreadsheet(items, projectName || 'Project', subjectLabel);
              downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

              const elapsedMs = Date.now() - startTime;

              // Build summary message
              const itemSummary = items
                .slice(0, 5)
                .map(item => `• ${item.item_code}: ${item.size || 'N/A'} (qty: ${item.quantity})`)
                .join('\n');
              const moreItems = items.length > 5 ? `\n... and ${items.length - 5} more items` : '';

              const assistantMessage: ClaudeAssistantMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: `## ${subjectLabel} Takeoff Generated\n\nExtracted **${items.length} ${subjectLabel.toLowerCase()}s** from the schedule:\n\n${itemSummary}${moreItems}\n\n✅ **Document Generated:** ${filename}\n\nThe file has been downloaded to your computer.\n\n*Source: Azure Document Intelligence (${elapsedMs}ms)*`,
                timestamp: new Date(),
                processingTimeMs: elapsedMs,
              };
              setMessages(prev => [...prev, assistantMessage]);
              setIsLoading(false);
              return; // Early return - skip Claude API call
            } catch (docError) {
              console.error('[useClaudeAssistant] Fast path document generation failed:', docError);
              // Fall through to normal Claude flow
            }
          }
        }
      }
      console.log('[useClaudeAssistant] Fast path: no existing data, falling back to Claude Vision');
    }

    try {
      let selectedPages: SelectedPage[] = [];
      let requestBody: Record<string, unknown>;

      // Smart page selection if we have all pages
      if (allPages && allPages.length > 0 && currentPageId) {
        // Get relevant page types based on question keywords
        const relevantTypes = getRelevantPageTypes(prompt);
        selectedPages = filterRelevantPages(allPages, relevantTypes, currentPageId, 4);

        console.log('[useClaudeAssistant] Question:', prompt);
        console.log('[useClaudeAssistant] Relevant page types:', relevantTypes);
        console.log('[useClaudeAssistant] Selected pages:', selectedPages.map(p => ({
          page: p.page_number,
          reason: p.reason,
          hasImage: !!p.image_url
        })));
        console.log('[useClaudeAssistant] PDF URL available:', !!pdfUrl);

        // Build multi-page request
        const pageImages = selectedPages
          .filter(p => p.image_url)
          .map(p => ({
            page_number: p.page_number,
            reason: p.reason,
            image_url: p.image_url!,
          }));

        requestBody = {
          prompt,
          pages: pageImages,
          pdf_url: pdfUrl, // Include PDF URL if available (best quality)
          page_context: pageContext,
          action: detectedAction.action,
          subject: detectedAction.subject,
        };
      } else {
        // Fallback to single image mode
        if (!imageUrl) {
          setError('No image available to analyze');
          setIsLoading(false);
          return;
        }

        console.log('[useClaudeAssistant] Single page mode, image URL:', imageUrl.substring(0, 50) + '...');

        requestBody = {
          image_url: imageUrl,
          prompt,
          page_context: pageContext,
          action: detectedAction.action,
          subject: detectedAction.subject,
        };
      }

      const response = await fetch('/api/claude-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Check if this request is still current
      if (currentRequestId !== requestIdRef.current) {
        console.log('[useClaudeAssistant] Request superseded, ignoring response');
        return;
      }

      const data = await response.json();

      console.log('[useClaudeAssistant] API Response:', {
        success: data.success,
        hasAnalysis: !!data.analysis,
        analysisLength: data.analysis?.length || 0,
        hasStructuredData: !!data.structuredData,
        structuredDataKeys: data.structuredData ? Object.keys(data.structuredData) : null,
        action: data.action,
        processing_time_ms: data.processing_time_ms,
      });

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze image');
      }

      // Build assistant message with analyzed pages info
      let contentWithPageInfo = data.analysis;

      // Append page info if multiple pages were analyzed
      if (selectedPages.length > 1) {
        contentWithPageInfo += `\n\n📄 *Analyzed: ${formatSelectedPages(selectedPages)}*`;
      }

      // Handle action mode - generate and download documents
      console.log('[useClaudeAssistant] Action mode check:', {
        isActionRequest,
        hasStructuredData: !!data.structuredData,
        willGenerateDoc: isActionRequest && !!data.structuredData,
      });

      if (isActionRequest && data.structuredData) {
        console.log('[useClaudeAssistant] Generating document:', {
          action: detectedAction.action,
          format: detectedAction.format,
          subject: detectedAction.subject,
          structuredData: JSON.stringify(data.structuredData).substring(0, 200),
        });
        try {
          const docResult = await generateDocumentFromData(
            detectedAction.action,
            detectedAction.format || 'excel',
            data.structuredData,
            projectName || 'Project',
            projectAddress || '',
            detectedAction.subject || ''
          );

          if (docResult) {
            contentWithPageInfo += `\n\n✅ **Document Generated:** ${docResult.filename}\n\nThe file has been downloaded to your computer.`;
          }
        } catch (docError) {
          console.error('[useClaudeAssistant] Document generation failed:', docError);
          contentWithPageInfo += `\n\n⚠️ *Document generation failed. The analysis above contains the extracted information.*`;
        }
      } else if (isActionRequest && !data.structuredData) {
        contentWithPageInfo += `\n\n⚠️ *Could not extract structured data for document generation. The analysis above contains the information found.*`;
      }

      // Add assistant message
      const assistantMessage: ClaudeAssistantMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: contentWithPageInfo,
        timestamp: new Date(),
        processingTimeMs: data.processing_time_ms,
        tokensUsed: data.tokens_used,
        analyzedPages: selectedPages.length > 0 ? selectedPages : undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      console.error('[useClaudeAssistant] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);

      // Add error message
      const errorMsg: ClaudeAssistantMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `Error: ${errorMessage}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [imageUrl, currentPageId, allPages, pdfUrl, pageContext, projectName, projectAddress]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    messages,
    askClaude,
    clearMessages,
  };
}
