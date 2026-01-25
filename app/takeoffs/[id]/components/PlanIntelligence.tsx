'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Package,
  Ruler,
  Square,
  DoorOpen,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  Sparkles,
  RefreshCw,
  Layers,
  Home,
  LayoutGrid,
  Shield,
  Droplet,
  Wrench,
  Scale,
  Hammer,
  AlertCircle,
} from 'lucide-react';
import type {
  ScheduleOCRData,
  ScheduleWindow,
  ScheduleDoor,
  ScheduleSkylight,
  ScheduleGarage,
  WallAssembly,
  WallAssemblyExtractionResult,
  RoofPlanData,
  FloorPlanData,
} from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface PlanIntelligenceProps {
  takeoffId: string;
  jobId?: string;
  projectId?: string;
}

interface ValidationItem {
  label: string;
  fromSchedule: number | null;
  fromDetections: number;
  status: 'match' | 'discrepancy' | 'schedule-only' | 'detection-only';
}

interface MaterialCallout {
  id: string;
  trade: string;
  rawText: string;
  normalizedText?: string;
  materialType?: string;
  manufacturer?: string;
  productLine?: string;
  matchedProduct?: string;
  pageRef?: string;
  confidence?: number;
  // V2 enhanced fields
  profile?: string | null;
  finish?: string | null;
  color?: string | null;
  dimensions?: {
    exposure_inches: number | null;
    thickness_inches: number | null;
    width_inches: number | null;
    length_feet: number | null;
  };
  orientation?: 'horizontal' | 'vertical' | null;
  installationNotes?: string | null;
  confidenceNotes?: string;
  alternatives?: string[];
}

interface DimensionItem {
  id: string;
  category: string;
  label: string;
  value: string;
  source?: string;
}

interface ScheduleItem {
  id: string;
  mark: string;
  size: string;
  quantity: number;
  type: string;
  notes?: string;
}

interface NoteItem {
  id: string;
  category: string;
  text: string;
  pageRef?: string;
}

// Notes & Specifications types
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

interface SchedulePage {
  id: string;
  page_number: number;
  image_url: string;
  ocr_data?: ScheduleOCRData | null;
  ocr_status?: string;
}

interface ElevationPage {
  id: string;
  page_number: number;
  image_url: string;
  elevation_name: string | null;
  material_callouts?: {
    version?: 'v2' | string;
    callouts?: MaterialCallout[];
    finalCallouts?: MaterialCallout[];
    summary?: Record<string, unknown>;
    extraction_confidence?: number;
    extraction_notes?: string;
    extracted_at?: string;
    extractedAt?: string;
    stats?: {
      totalAnnotationsFound: number;
      materialSpecsFound: number;
      classificationCalls: number;
      finalCalloutsAfterDedup: number;
    };
  } | null;
}

interface SectionPage {
  id: string;
  page_number: number;
  image_url: string;
  wall_assembly?: WallAssemblyExtractionResult | null;
}

interface RoofPlanPage {
  id: string;
  page_number: number;
  image_url: string;
  scale?: string | null;
  roof_plan_data?: RoofPlanData | null;
}

interface FloorPlanPage {
  id: string;
  page_number: number;
  image_url: string;
  scale_notation?: string | null;
  floor_plan_data?: FloorPlanData | null;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchExtractionJobId(projectId: string): Promise<string | null> {
  console.log('[PlanIntelligence] fetchExtractionJobId called with projectId:', projectId);
  try {
    const url = `/api/extraction-jobs?project_id=${projectId}`;
    console.log('[PlanIntelligence] Fetching:', url);
    const response = await fetch(url);
    console.log('[PlanIntelligence] Response status:', response.status, response.ok);
    if (!response.ok) {
      console.log('[PlanIntelligence] Response not OK, returning null');
      return null;
    }
    const data = await response.json();
    console.log('[PlanIntelligence] Response data:', JSON.stringify(data));
    if (data.jobs && data.jobs.length > 0) {
      // Return the most recent job for this project
      console.log('[PlanIntelligence] Found job ID:', data.jobs[0].id);
      return data.jobs[0].id;
    }
    console.log('[PlanIntelligence] No jobs found in response');
    return null;
  } catch (error) {
    console.error('[PlanIntelligence] Failed to fetch extraction job:', error);
    return null;
  }
}

async function fetchSchedulePages(jobId: string): Promise<SchedulePage[]> {
  console.log('[PlanIntelligence] fetchSchedulePages called with jobId:', jobId);
  try {
    const url = `/api/extraction-pages?job_id=${jobId}&page_type=schedule`;
    console.log('[PlanIntelligence] Fetching:', url);
    const response = await fetch(url);
    console.log('[PlanIntelligence] Response status:', response.status, response.ok);
    if (!response.ok) {
      console.log('[PlanIntelligence] Response not OK, returning []');
      return [];
    }
    const data = await response.json();
    console.log('[PlanIntelligence] Response data - pages count:', data.pages?.length || 0);
    if (data.pages && data.pages.length > 0) {
      console.log('[PlanIntelligence] First page:', JSON.stringify(data.pages[0]));
    }
    return data.pages || [];
  } catch (error) {
    console.error('[PlanIntelligence] Failed to fetch schedule pages:', error);
    return [];
  }
}

async function fetchElevationPages(jobId: string): Promise<ElevationPage[]> {
  console.log('[PlanIntelligence] fetchElevationPages called with jobId:', jobId);
  try {
    const url = `/api/extraction-pages?job_id=${jobId}&page_type=elevation`;
    console.log('[PlanIntelligence] Fetching:', url);
    const response = await fetch(url);
    console.log('[PlanIntelligence] Response status:', response.status, response.ok);
    if (!response.ok) {
      console.log('[PlanIntelligence] Response not OK, returning []');
      return [];
    }
    const data = await response.json();
    console.log('[PlanIntelligence] Response data - elevation pages count:', data.pages?.length || 0);
    return data.pages || [];
  } catch (error) {
    console.error('[PlanIntelligence] Failed to fetch elevation pages:', error);
    return [];
  }
}

async function fetchSectionPages(jobId: string): Promise<SectionPage[]> {
  console.log('[PlanIntelligence] fetchSectionPages called with jobId:', jobId);
  try {
    // Fetch both section AND detail pages - wall assembly info can appear in either
    const [sectionResponse, detailResponse] = await Promise.all([
      fetch(`/api/extraction-pages?job_id=${jobId}&page_type=section`),
      fetch(`/api/extraction-pages?job_id=${jobId}&page_type=detail`),
    ]);

    const sectionData = sectionResponse.ok ? await sectionResponse.json() : { pages: [] };
    const detailData = detailResponse.ok ? await detailResponse.json() : { pages: [] };

    const allPages = [...(sectionData.pages || []), ...(detailData.pages || [])];

    // Sort by page number
    allPages.sort((a, b) => a.page_number - b.page_number);

    console.log('[PlanIntelligence] Response data - section pages:', sectionData.pages?.length || 0, 'detail pages:', detailData.pages?.length || 0);
    return allPages;
  } catch (error) {
    console.error('[PlanIntelligence] Failed to fetch section/detail pages:', error);
    return [];
  }
}

async function fetchRoofPlanPages(jobId: string): Promise<RoofPlanPage[]> {
  console.log('[PlanIntelligence] fetchRoofPlanPages called with jobId:', jobId);
  try {
    const url = `/api/extraction-pages?job_id=${jobId}&page_type=roof_plan`;
    console.log('[PlanIntelligence] Fetching:', url);
    const response = await fetch(url);
    console.log('[PlanIntelligence] Response status:', response.status, response.ok);
    if (!response.ok) {
      console.log('[PlanIntelligence] Response not OK, returning []');
      return [];
    }
    const data = await response.json();
    console.log('[PlanIntelligence] Response data - roof plan pages count:', data.pages?.length || 0);
    return data.pages || [];
  } catch (error) {
    console.error('[PlanIntelligence] Failed to fetch roof plan pages:', error);
    return [];
  }
}

async function fetchFloorPlanPages(jobId: string): Promise<FloorPlanPage[]> {
  console.log('[PlanIntelligence] fetchFloorPlanPages called with jobId:', jobId);
  try {
    const url = `/api/extraction-pages?job_id=${jobId}&page_type=floor_plan`;
    console.log('[PlanIntelligence] Fetching:', url);
    const response = await fetch(url);
    console.log('[PlanIntelligence] Response status:', response.status, response.ok);
    if (!response.ok) {
      console.log('[PlanIntelligence] Response not OK, returning []');
      return [];
    }
    const data = await response.json();
    console.log('[PlanIntelligence] Response data - floor plan pages count:', data.pages?.length || 0);
    return data.pages || [];
  } catch (error) {
    console.error('[PlanIntelligence] Failed to fetch floor plan pages:', error);
    return [];
  }
}

// Extract material callouts from a single page using V2 two-pass extraction
async function extractMaterialCalloutsFromPageV2(
  pageId: string,
  imageUrl: string,
  jobId?: string,
  pageNumber?: number
): Promise<{ callouts: MaterialCallout[]; stats?: Record<string, number> }> {
  try {
    console.log(`[PlanIntelligence] Extracting materials (V2) from page ${pageNumber || pageId}`);
    const response = await fetch('/api/extract-material-callouts-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, imageUrl, jobId, pageNumber }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Material extraction V2 failed');
    }
    const result = await response.json();
    console.log(`[PlanIntelligence] V2 Extracted ${result.data?.callouts?.length || 0} callouts from page ${pageNumber}`);
    if (result.data?.stats) {
      console.log(`[PlanIntelligence] V2 Stats:`, result.data.stats);
    }
    return {
      callouts: result.data?.callouts || [],
      stats: result.data?.stats,
    };
  } catch (error) {
    console.error('[PlanIntelligence] Material extraction V2 failed:', error);
    throw error;
  }
}

// Extract wall assembly from a section page
async function extractWallAssemblyFromPage(
  pageId: string,
  imageUrl: string,
  jobId?: string,
  pageNumber?: number
): Promise<WallAssemblyExtractionResult | null> {
  try {
    console.log(`[PlanIntelligence] Extracting wall assembly from page ${pageNumber || pageId}`);
    const response = await fetch('/api/extract-wall-assembly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, imageUrl, jobId, pageNumber }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Wall assembly extraction failed');
    }
    const result = await response.json();
    console.log(`[PlanIntelligence] Extracted ${result.data?.assemblies?.length || 0} wall assemblies from page ${pageNumber}`);
    return result.data || null;
  } catch (error) {
    console.error('[PlanIntelligence] Wall assembly extraction failed:', error);
    throw error;
  }
}

// Extract roof plan data from a roof plan page
async function extractRoofPlanFromPage(
  pageId: string,
  imageUrl: string,
  jobId?: string,
  pageNumber?: number,
  scale?: string
): Promise<RoofPlanData | null> {
  try {
    console.log(`[PlanIntelligence] Extracting roof plan from page ${pageNumber || pageId}`);
    const response = await fetch('/api/extract-roof-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, imageUrl, jobId, pageNumber, scale }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Roof plan extraction failed');
    }
    const result = await response.json();
    console.log(`[PlanIntelligence] Extracted roof plan from page ${pageNumber}:`, {
      primaryPitch: result.data?.primaryPitch,
      totalAreaSF: result.data?.totalRoofAreaSF,
      slopesCount: result.data?.slopes?.length || 0,
    });
    return result.data || null;
  } catch (error) {
    console.error('[PlanIntelligence] Roof plan extraction failed:', error);
    throw error;
  }
}

// Extract floor plan data from a floor plan page
async function extractFloorPlanFromPage(
  pageId: string,
  imageUrl: string,
  jobId?: string,
  pageNumber?: number,
  scaleNotation?: string
): Promise<FloorPlanData | null> {
  try {
    console.log(`[PlanIntelligence] Extracting floor plan from page ${pageNumber || pageId}`);
    const response = await fetch('/api/extract-floor-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, imageUrl, jobId, pageNumber, scaleNotation }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Floor plan extraction failed');
    }
    const result = await response.json();
    console.log(`[PlanIntelligence] Extracted floor plan from page ${pageNumber}:`, {
      floorLevel: result.floorPlan?.floorLevel,
      outsideCorners: result.floorPlan?.cornerSummary?.totalOutsideCorners,
      insideCorners: result.floorPlan?.cornerSummary?.totalInsideCorners,
      perimeterLF: result.floorPlan?.exteriorPerimeterLF,
    });
    return result.floorPlan || null;
  } catch (error) {
    console.error('[PlanIntelligence] Floor plan extraction failed:', error);
    throw error;
  }
}

// Structure analysis result type (from analyze-schedule-structure API)
interface SampleRow {
  mark: string;
  width?: string;
  height?: string;
  size?: string;
  type: string;
  notes?: string;
}

interface ScheduleStructureInfo {
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
}

interface StructureAnalysisResult {
  is_schedule_page: boolean;
  page_description?: string;
  schedules_found: string[];
  window_schedule?: ScheduleStructureInfo;
  door_schedule?: ScheduleStructureInfo;
  skylight_schedule?: ScheduleStructureInfo;
  garage_schedule?: ScheduleStructureInfo;
  analysis_notes?: string;
}

// Pass 1: Analyze schedule structure
async function analyzeScheduleStructure(pageId: string, imageUrl: string): Promise<StructureAnalysisResult | null> {
  try {
    console.log(`[PlanIntelligence] Pass 1: Analyzing structure for page ${pageId}`);
    const response = await fetch('/api/analyze-schedule-structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, imageUrl }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Structure analysis failed');
    }
    const result = await response.json();
    console.log(`[PlanIntelligence] Structure analysis complete:`, result.structure);
    return result.structure || null;
  } catch (error) {
    console.error('[PlanIntelligence] Structure analysis failed:', error);
    return null;
  }
}

// Pass 2: Extract schedule data (with optional structure guidance)
async function extractScheduleFromPage(
  pageId: string,
  imageUrl: string,
  jobId?: string,
  structure?: StructureAnalysisResult
): Promise<ScheduleOCRData | null> {
  try {
    console.log(`[PlanIntelligence] Pass 2: Extracting data for page ${pageId}${structure ? ' (with structure guidance)' : ''}`);
    const response = await fetch('/api/extract-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, imageUrl, jobId, structure }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Extraction failed');
    }
    const result = await response.json();
    console.log(`[PlanIntelligence] Extraction complete. Used targeted prompt: ${result.used_targeted_prompt}`);
    return result.data || null;
  } catch (error) {
    console.error('Schedule extraction failed:', error);
    throw error;
  }
}

// Helper: Deduplicate schedule items by mark
function deduplicateByMark<T extends { mark: string; quantity: number }>(items: T[]): T[] {
  const markMap = new Map<string, T>();

  for (const item of items) {
    const normalizedMark = item.mark.trim().toUpperCase();

    if (markMap.has(normalizedMark)) {
      // Keep the one with higher quantity, or merge quantities if same
      const existing = markMap.get(normalizedMark)!;
      // If marks are identical, prefer keeping the first one but note duplicates exist
      console.log(`[deduplicateByMark] Duplicate found: ${item.mark} (qty: ${item.quantity}) vs existing (qty: ${existing.quantity})`);
      // Keep existing, don't add duplicate
    } else {
      markMap.set(normalizedMark, item);
    }
  }

  return Array.from(markMap.values());
}

// Helper: Deduplicate material callouts by normalized text and trade
function deduplicateMaterialCallouts(callouts: MaterialCallout[]): MaterialCallout[] {
  const seen = new Map<string, MaterialCallout>();

  for (const callout of callouts) {
    // Create a key from normalized text + trade
    const normalizedText = (callout.normalizedText || callout.rawText)
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = `${normalizedText}|${callout.trade}`;

    if (seen.has(key)) {
      // Keep the one with higher confidence
      const existing = seen.get(key)!;
      if ((callout.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, callout);
        console.log(`[deduplicateMaterialCallouts] Replacing "${existing.rawText}" with higher confidence "${callout.rawText}"`);
      } else {
        console.log(`[deduplicateMaterialCallouts] Duplicate found, keeping existing: "${existing.rawText}"`);
      }
    } else {
      seen.set(key, callout);
    }
  }

  return Array.from(seen.values());
}

// =============================================================================
// Collapsible Section Component
// =============================================================================

function CollapsibleSection({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${iconColor} flex items-center justify-center`}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {badge}
        </div>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Info className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
    </div>
  );
}

// =============================================================================
// Validation Card Component
// =============================================================================

function ValidationCard({ item }: { item: ValidationItem }) {
  const getStatusStyles = () => {
    switch (item.status) {
      case 'match':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          icon: <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />,
          label: 'Match',
          labelColor: 'text-green-600 dark:text-green-400',
        };
      case 'discrepancy':
        return {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-800',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
          label: 'Discrepancy',
          labelColor: 'text-amber-600 dark:text-amber-400',
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-800/50',
          border: 'border-gray-200 dark:border-gray-700',
          icon: <Info className="w-5 h-5 text-gray-400 dark:text-gray-500" />,
          label: 'No schedule data',
          labelColor: 'text-gray-500 dark:text-gray-400',
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div className={`${styles.bg} ${styles.border} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {item.label}
        </span>
        {styles.icon}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">From Schedule</span>
          <span className="font-mono font-medium text-gray-900 dark:text-white">
            {item.fromSchedule !== null ? item.fromSchedule : '—'}
          </span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">From Detections</span>
          <span className="font-mono font-medium text-gray-900 dark:text-white">
            {item.fromDetections}
          </span>
        </div>
      </div>
      <div className={`mt-2 text-xs font-medium ${styles.labelColor}`}>
        {styles.label}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PlanIntelligence({ takeoffId, jobId: propJobId, projectId }: PlanIntelligenceProps) {
  console.log('[PlanIntelligence] Component render - props:', { takeoffId, propJobId, projectId });

  // Resolved extraction job ID (from props or fetched via project_id)
  const [extractionJobId, setExtractionJobId] = useState<string | null>(propJobId || null);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Schedule pages from API
  const [schedulePages, setSchedulePages] = useState<SchedulePage[]>([]);

  // OCR extracted data
  const [ocrData, setOcrData] = useState<ScheduleOCRData | null>(null);

  // Material callouts state
  const [materialCallouts, setMaterialCallouts] = useState<MaterialCallout[]>([]);
  const [isExtractingMaterials, setIsExtractingMaterials] = useState(false);
  const [materialExtractionError, setMaterialExtractionError] = useState<string | null>(null);
  const [elevationPages, setElevationPages] = useState<ElevationPage[]>([]);

  // Wall assembly state
  const [wallAssemblies, setWallAssemblies] = useState<WallAssembly[]>([]);
  const [isExtractingWallAssembly, setIsExtractingWallAssembly] = useState(false);
  const [wallAssemblyError, setWallAssemblyError] = useState<string | null>(null);
  const [sectionPages, setSectionPages] = useState<SectionPage[]>([]);

  // Roof plan state
  const [roofPlanData, setRoofPlanData] = useState<RoofPlanData[]>([]);
  const [isExtractingRoofPlan, setIsExtractingRoofPlan] = useState(false);
  const [roofPlanError, setRoofPlanError] = useState<string | null>(null);
  const [roofPlanPages, setRoofPlanPages] = useState<RoofPlanPage[]>([]);

  // Floor plan / building geometry state
  const [floorPlanData, setFloorPlanData] = useState<FloorPlanData[]>([]);
  const [isExtractingFloorPlan, setIsExtractingFloorPlan] = useState(false);
  const [floorPlanError, setFloorPlanError] = useState<string | null>(null);
  const [floorPlanPages, setFloorPlanPages] = useState<FloorPlanPage[]>([]);

  // Notes & Specifications state
  const [notesData, setNotesData] = useState<NotesSpecsData | null>(null);
  const [isExtractingNotes, setIsExtractingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Other placeholder data
  const [dimensions] = useState<DimensionItem[]>([]);
  const [notes] = useState<NoteItem[]>([]);

  console.log('[PlanIntelligence] Current state:', {
    extractionJobId,
    isLoading,
    schedulePagesCount: schedulePages.length,
    hasOcrData: !!ocrData,
  });

  // First, resolve the extraction job ID if not provided
  useEffect(() => {
    console.log('[PlanIntelligence] useEffect[resolveJobId] - propJobId:', propJobId, 'projectId:', projectId);

    // If we already have a jobId from props, use it
    if (propJobId) {
      console.log('[PlanIntelligence] Using propJobId:', propJobId);
      setExtractionJobId(propJobId);
      return;
    }

    // Otherwise, fetch the extraction job for this project
    if (projectId) {
      console.log('[PlanIntelligence] Fetching job for projectId:', projectId);
      setIsLoading(true);
      fetchExtractionJobId(projectId)
        .then((jobId) => {
          console.log('[PlanIntelligence] fetchExtractionJobId resolved:', jobId);
          if (jobId) {
            setExtractionJobId(jobId);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      console.log('[PlanIntelligence] No propJobId or projectId provided');
    }
  }, [projectId, propJobId]);

  // Computed: Convert OCR windows to ScheduleItem format
  const windowSchedule: ScheduleItem[] = (ocrData?.windows || []).map((w: ScheduleWindow, idx: number) => ({
    id: `window-${idx}`,
    mark: w.mark,
    size: w.size,
    quantity: w.quantity,
    type: w.type,
    notes: w.notes,
  }));

  // Computed: Convert OCR doors to ScheduleItem format
  const doorSchedule: ScheduleItem[] = (ocrData?.doors || []).map((d: ScheduleDoor, idx: number) => ({
    id: `door-${idx}`,
    mark: d.mark,
    size: d.size,
    quantity: d.quantity,
    type: d.type,
    notes: d.notes,
  }));

  // Computed: Convert OCR skylights to ScheduleItem format
  const skylightSchedule: ScheduleItem[] = (ocrData?.skylights || []).map((s: ScheduleSkylight, idx: number) => ({
    id: `skylight-${idx}`,
    mark: s.mark,
    size: s.size,
    quantity: s.quantity,
    type: s.type,
    notes: s.notes,
  }));

  // Computed: Convert OCR garages to ScheduleItem format
  const garageSchedule: ScheduleItem[] = (ocrData?.garages || []).map((g: ScheduleGarage, idx: number) => ({
    id: `garage-${idx}`,
    mark: g.mark,
    size: g.size,
    quantity: g.quantity,
    type: g.type,
    notes: g.notes,
  }));

  // Computed: Validation data comparing schedule vs detections
  const validationData: ValidationItem[] = [
    {
      label: 'Windows',
      fromSchedule: ocrData?.totals?.windows ?? null,
      fromDetections: 0, // TODO: Get from job totals
      status: ocrData?.totals?.windows ? 'schedule-only' : 'detection-only',
    },
    {
      label: 'Doors',
      fromSchedule: ocrData?.totals?.doors ?? null,
      fromDetections: 0, // TODO: Get from job totals
      status: ocrData?.totals?.doors ? 'schedule-only' : 'detection-only',
    },
    {
      label: 'Skylights',
      fromSchedule: ocrData?.totals?.skylights ?? null,
      fromDetections: 0, // TODO: Get from job totals
      status: ocrData?.totals?.skylights ? 'schedule-only' : 'detection-only',
    },
    {
      label: 'Garages',
      fromSchedule: ocrData?.totals?.garages ?? null,
      fromDetections: 0, // TODO: Get from job totals
      status: ocrData?.totals?.garages ? 'schedule-only' : 'detection-only',
    },
  ];

  // Load schedule pages once we have the extraction job ID
  useEffect(() => {
    console.log('[PlanIntelligence] useEffect[fetchPages] - extractionJobId:', extractionJobId);

    if (!extractionJobId) {
      console.log('[PlanIntelligence] No extractionJobId, skipping page fetch');
      return;
    }

    console.log('[PlanIntelligence] Fetching schedule pages for jobId:', extractionJobId);
    setIsLoading(true);

    // Fetch schedule, elevation, section, roof plan, and floor plan pages in parallel
    Promise.all([
      fetchSchedulePages(extractionJobId),
      fetchElevationPages(extractionJobId),
      fetchSectionPages(extractionJobId),
      fetchRoofPlanPages(extractionJobId),
      fetchFloorPlanPages(extractionJobId),
    ])
      .then(([scheduleData, elevationData, sectionData, roofPlanPagesData, floorPlanPagesData]) => {
        console.log('[PlanIntelligence] fetchSchedulePages resolved with', scheduleData.length, 'pages');
        console.log('[PlanIntelligence] fetchElevationPages resolved with', elevationData.length, 'pages');
        console.log('[PlanIntelligence] fetchSectionPages resolved with', sectionData.length, 'section/detail pages');
        console.log('[PlanIntelligence] fetchRoofPlanPages resolved with', roofPlanPagesData.length, 'roof plan pages');
        console.log('[PlanIntelligence] fetchFloorPlanPages resolved with', floorPlanPagesData.length, 'floor plan pages');

        setSchedulePages(scheduleData);
        setElevationPages(elevationData);
        setSectionPages(sectionData);
        setRoofPlanPages(roofPlanPagesData);
        setFloorPlanPages(floorPlanPagesData);

        // Check if any schedule page has existing OCR data
        const pageWithOcr = scheduleData.find(p => p.ocr_data);
        if (pageWithOcr?.ocr_data) {
          console.log('[PlanIntelligence] Found page with existing OCR data');
          setOcrData(pageWithOcr.ocr_data);
        }

        // Check if any elevation page has existing material callouts (handles v1 and v2 formats)
        const pagesWithMaterials = elevationData.filter(p => {
          const mc = p.material_callouts;
          if (!mc) return false;
          // V2 format uses finalCallouts, V1 uses callouts
          return (mc.finalCallouts && mc.finalCallouts.length > 0) ||
                 (mc.callouts && mc.callouts.length > 0);
        });
        if (pagesWithMaterials.length > 0) {
          const isV2 = pagesWithMaterials.some(p => p.material_callouts?.version === 'v2');
          console.log(`[PlanIntelligence] Found pages with existing material callouts (${isV2 ? 'V2' : 'V1'} format)`);
          const allCallouts: MaterialCallout[] = [];
          for (const page of pagesWithMaterials) {
            const mc = page.material_callouts;
            // Prefer finalCallouts (V2) over callouts (V1)
            const callouts = mc?.finalCallouts || mc?.callouts || [];
            if (callouts.length > 0) {
              allCallouts.push(...callouts);
            }
          }
          const deduplicated = deduplicateMaterialCallouts(allCallouts);
          setMaterialCallouts(deduplicated);
        }

        // Check if any section page has existing wall assembly data
        const pagesWithWallAssembly = sectionData.filter(p =>
          p.wall_assembly?.assemblies && p.wall_assembly.assemblies.length > 0
        );
        if (pagesWithWallAssembly.length > 0) {
          console.log(`[PlanIntelligence] Found ${pagesWithWallAssembly.length} page(s) with existing wall assembly data`);
          const allAssemblies: WallAssembly[] = [];
          for (const page of pagesWithWallAssembly) {
            if (page.wall_assembly?.assemblies) {
              allAssemblies.push(...page.wall_assembly.assemblies);
            }
          }
          setWallAssemblies(allAssemblies);
        }

        // Check if any roof plan page has existing roof plan data
        const pagesWithRoofPlan = roofPlanPagesData.filter(p => p.roof_plan_data);
        if (pagesWithRoofPlan.length > 0) {
          console.log(`[PlanIntelligence] Found ${pagesWithRoofPlan.length} page(s) with existing roof plan data`);
          const allRoofPlans: RoofPlanData[] = [];
          for (const page of pagesWithRoofPlan) {
            if (page.roof_plan_data) {
              allRoofPlans.push(page.roof_plan_data);
            }
          }
          setRoofPlanData(allRoofPlans);
        }

        // Check if any floor plan page has existing floor plan data
        const pagesWithFloorPlan = floorPlanPagesData.filter(p => p.floor_plan_data && p.floor_plan_data.confidence > 0);
        if (pagesWithFloorPlan.length > 0) {
          console.log(`[PlanIntelligence] Found ${pagesWithFloorPlan.length} page(s) with existing floor plan data`);
          const allFloorPlans: FloorPlanData[] = [];
          for (const page of pagesWithFloorPlan) {
            if (page.floor_plan_data) {
              allFloorPlans.push(page.floor_plan_data);
            }
          }
          setFloorPlanData(allFloorPlans);
        }

        // Fetch existing notes_specs_data from extraction_jobs table
        fetch(`/api/extract-notes-specs?job_id=${extractionJobId}`)
          .then(res => res.json())
          .then(result => {
            if (result.success && result.data) {
              setNotesData(result.data);
            }
          })
          .catch(err => console.error('[PlanIntelligence] Failed to fetch notes:', err));
      })
      .finally(() => setIsLoading(false));
  }, [extractionJobId]);

  // Extract schedules from ALL schedule pages using two-pass approach
  // Pass 1: Analyze structure (column mapping)
  // Pass 2: Extract data with targeted prompts
  // Pass 3: Deduplicate and aggregate
  const handleExtractSchedule = useCallback(async () => {
    if (schedulePages.length === 0) {
      setExtractionError('No schedule pages found for this job');
      return;
    }

    console.log(`[PlanIntelligence] Starting TWO-PASS extraction for ${schedulePages.length} schedule page(s)`);
    setIsExtracting(true);
    setExtractionError(null);

    try {
      // Process all schedule pages with two-pass approach
      const results: ScheduleOCRData[] = [];
      let totalTokens = 0;
      const updatedPages: SchedulePage[] = [...schedulePages];

      for (let i = 0; i < schedulePages.length; i++) {
        const page = schedulePages[i];
        console.log(`\n[PlanIntelligence] ======= Page ${i + 1}/${schedulePages.length} (page_number: ${page.page_number}) =======`);

        try {
          // PASS 1: Analyze structure
          console.log(`[PlanIntelligence] PASS 1: Analyzing structure...`);
          const structure = await analyzeScheduleStructure(page.id, page.image_url);

          // Skip non-schedule pages early
          if (structure && !structure.is_schedule_page) {
            console.log(`[PlanIntelligence] Page ${page.page_number} is NOT a schedule page: ${structure.page_description}`);
            continue;
          }

          // Log structure analysis results
          if (structure) {
            console.log(`[PlanIntelligence] Structure found:`);
            console.log(`  - Schedules: ${structure.schedules_found.join(', ')}`);
            if (structure.window_schedule?.exists) {
              console.log(`  - Windows: ${structure.window_schedule.data_row_count} rows, size format: ${structure.window_schedule.size_format}`);
            }
            if (structure.door_schedule?.exists) {
              console.log(`  - Doors: ${structure.door_schedule.data_row_count} rows, size format: ${structure.door_schedule.size_format}`);
            }
            if (structure.analysis_notes) {
              console.log(`  - Notes: ${structure.analysis_notes}`);
            }
          }

          // PASS 2: Extract data with structure guidance
          console.log(`[PlanIntelligence] PASS 2: Extracting data${structure ? ' with structure guidance' : ''}...`);
          const result = await extractScheduleFromPage(
            page.id,
            page.image_url,
            extractionJobId || undefined,
            structure || undefined
          );

          if (result) {
            console.log(`[PlanIntelligence] Page ${page.page_number} extracted:`);
            console.log(`  - Windows: ${result.totals.windows} (${result.windows.length} unique marks)`);
            console.log(`  - Doors: ${result.totals.doors} (${result.doors.length} unique marks)`);
            console.log(`  - Confidence: ${Math.round(result.confidence * 100)}%`);

            results.push(result);
            totalTokens += result.tokens_used || 0;

            // Update page in local array
            updatedPages[i] = { ...page, ocr_data: result, ocr_status: 'complete' };
          }
        } catch (pageError) {
          console.error(`[PlanIntelligence] Failed to process page ${page.page_number}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      // Update pages state with all results
      setSchedulePages(updatedPages);

      if (results.length === 0) {
        setExtractionError('Failed to extract data from any schedule pages');
        return;
      }

      // PASS 3: Aggregate and deduplicate results from all pages
      console.log(`\n[PlanIntelligence] ======= PASS 3: Aggregating & Deduplicating =======`);

      // Collect all items
      const allWindows: ScheduleWindow[] = [];
      const allDoors: ScheduleDoor[] = [];
      const allSkylights: ScheduleSkylight[] = [];
      const allGarages: ScheduleGarage[] = [];
      let totalConfidence = 0;
      let confidenceCount = 0;

      for (const result of results) {
        allWindows.push(...result.windows);
        allDoors.push(...result.doors);
        if (result.skylights) allSkylights.push(...result.skylights);
        if (result.garages) allGarages.push(...result.garages);

        // Only include confidence from actual schedule pages
        if (result.is_schedule_page !== false && result.confidence > 0) {
          totalConfidence += result.confidence;
          confidenceCount++;
        }
      }

      // Log pre-deduplication counts
      console.log(`[PlanIntelligence] Before deduplication:`);
      console.log(`  - Windows: ${allWindows.length} entries`);
      console.log(`  - Doors: ${allDoors.length} entries`);

      // Deduplicate by mark
      const deduplicatedWindows = deduplicateByMark(allWindows);
      const deduplicatedDoors = deduplicateByMark(allDoors);
      const deduplicatedSkylights = deduplicateByMark(allSkylights);
      const deduplicatedGarages = deduplicateByMark(allGarages);

      // Log post-deduplication counts
      console.log(`[PlanIntelligence] After deduplication:`);
      console.log(`  - Windows: ${deduplicatedWindows.length} unique marks`);
      console.log(`  - Doors: ${deduplicatedDoors.length} unique marks`);

      // Calculate average confidence
      const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

      // Build aggregated OCR data
      const aggregatedData: ScheduleOCRData = {
        windows: deduplicatedWindows,
        doors: deduplicatedDoors,
        skylights: deduplicatedSkylights,
        garages: deduplicatedGarages,
        totals: {
          windows: deduplicatedWindows.reduce((sum, w) => sum + w.quantity, 0),
          doors: deduplicatedDoors.reduce((sum, d) => sum + d.quantity, 0),
          skylights: deduplicatedSkylights.reduce((sum, s) => sum + s.quantity, 0),
          garages: deduplicatedGarages.reduce((sum, g) => sum + g.quantity, 0),
        },
        confidence: avgConfidence,
        extraction_notes: `Two-pass extraction from ${confidenceCount} of ${schedulePages.length} schedule page(s). Deduplicated by mark.`,
        extracted_at: new Date().toISOString(),
        model_used: 'claude-sonnet-4-20250514',
        tokens_used: totalTokens,
      };

      console.log(`\n[PlanIntelligence] ======= FINAL RESULTS =======`);
      console.log(`  - Total Windows: ${aggregatedData.totals.windows} (from ${deduplicatedWindows.length} unique marks)`);
      console.log(`  - Total Doors: ${aggregatedData.totals.doors} (from ${deduplicatedDoors.length} unique marks)`);
      console.log(`  - Total Skylights: ${aggregatedData.totals.skylights}`);
      console.log(`  - Total Garages: ${aggregatedData.totals.garages}`);
      console.log(`  - Avg Confidence: ${Math.round(aggregatedData.confidence * 100)}%`);
      console.log(`  - Total Tokens Used: ${totalTokens}`);

      setOcrData(aggregatedData);

    } catch (error) {
      console.error('[PlanIntelligence] Extraction error:', error);
      setExtractionError(error instanceof Error ? error.message : 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  }, [schedulePages, extractionJobId]);

  // Extract material callouts from ALL elevation pages using V2 two-pass extraction
  const handleExtractMaterials = useCallback(async () => {
    if (elevationPages.length === 0) {
      setMaterialExtractionError('No elevation pages found for this job');
      return;
    }

    console.log(`[PlanIntelligence] Starting V2 TWO-PASS material extraction for ${elevationPages.length} elevation page(s)`);
    setIsExtractingMaterials(true);
    setMaterialExtractionError(null);

    try {
      const allCallouts: MaterialCallout[] = [];
      let totalTokens = 0;
      let totalAnnotations = 0;
      let totalMaterialSpecs = 0;

      for (let i = 0; i < elevationPages.length; i++) {
        const page = elevationPages[i];
        console.log(`\n[PlanIntelligence] ======= Elevation Page ${i + 1}/${elevationPages.length} (${page.elevation_name || 'unknown'}) =======`);

        try {
          const result = await extractMaterialCalloutsFromPageV2(
            page.id,
            page.image_url,
            extractionJobId || undefined,
            page.page_number
          );

          if (result.callouts.length > 0) {
            console.log(`[PlanIntelligence] Page ${page.page_number} extracted ${result.callouts.length} callouts:`);
            result.callouts.forEach(c => {
              const details = [c.trade, c.materialType, c.manufacturer].filter(Boolean).join(' / ');
              console.log(`  - [${details}] ${c.rawText} (${Math.round((c.confidence || 0) * 100)}%)`);
            });
            allCallouts.push(...result.callouts);
          } else {
            console.log(`[PlanIntelligence] Page ${page.page_number} - no material callouts found`);
          }

          // Track stats
          if (result.stats) {
            totalAnnotations += result.stats.totalAnnotationsFound || 0;
            totalMaterialSpecs += result.stats.materialSpecsFound || 0;
          }
        } catch (pageError) {
          console.error(`[PlanIntelligence] Failed to process page ${page.page_number}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      if (allCallouts.length === 0) {
        setMaterialExtractionError('No material callouts found in elevation drawings. The V2 survey found annotations but no material specs.');
        return;
      }

      // Deduplicate callouts across all pages
      console.log(`\n[PlanIntelligence] ======= FINAL AGGREGATION =======`);
      console.log(`[PlanIntelligence] Total annotations surveyed: ${totalAnnotations}`);
      console.log(`[PlanIntelligence] Material specs classified: ${totalMaterialSpecs}`);
      console.log(`[PlanIntelligence] Before deduplication: ${allCallouts.length} callouts`);

      const deduplicated = deduplicateMaterialCallouts(allCallouts);

      console.log(`[PlanIntelligence] After deduplication: ${deduplicated.length} unique callouts`);

      // Group by trade for summary
      const byTrade = deduplicated.reduce((acc, c) => {
        acc[c.trade] = (acc[c.trade] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log(`[PlanIntelligence] Callouts by trade:`, byTrade);
      console.log(`[PlanIntelligence] Total tokens used: ${totalTokens}`);

      // Log enhanced data summary
      const withManufacturer = deduplicated.filter(c => c.manufacturer).length;
      const withDimensions = deduplicated.filter(c => c.dimensions?.exposure_inches || c.dimensions?.thickness_inches).length;
      const highConfidence = deduplicated.filter(c => (c.confidence || 0) >= 0.85).length;
      console.log(`[PlanIntelligence] Enhanced data:`);
      console.log(`  - With manufacturer: ${withManufacturer}/${deduplicated.length}`);
      console.log(`  - With dimensions: ${withDimensions}/${deduplicated.length}`);
      console.log(`  - High confidence (≥85%): ${highConfidence}/${deduplicated.length}`);

      setMaterialCallouts(deduplicated);

    } catch (error) {
      console.error('[PlanIntelligence] Material extraction V2 error:', error);
      setMaterialExtractionError(error instanceof Error ? error.message : 'V2 Extraction failed');
    } finally {
      setIsExtractingMaterials(false);
    }
  }, [elevationPages, extractionJobId]);

  // Extract wall assemblies from ALL section pages
  const handleExtractWallAssembly = useCallback(async () => {
    if (sectionPages.length === 0) {
      setWallAssemblyError('No section or detail pages found for this job');
      return;
    }

    console.log(`[PlanIntelligence] Starting wall assembly extraction for ${sectionPages.length} section/detail page(s)`);
    setIsExtractingWallAssembly(true);
    setWallAssemblyError(null);

    try {
      const allAssemblies: WallAssembly[] = [];
      let totalTokens = 0;

      for (let i = 0; i < sectionPages.length; i++) {
        const page = sectionPages[i];
        console.log(`\n[PlanIntelligence] ======= Section Page ${i + 1}/${sectionPages.length} (page ${page.page_number}) =======`);

        try {
          const result = await extractWallAssemblyFromPage(
            page.id,
            page.image_url,
            extractionJobId || undefined,
            page.page_number
          );

          if (result && result.assemblies.length > 0) {
            console.log(`[PlanIntelligence] Page ${page.page_number} extracted ${result.assemblies.length} wall assemblies:`);
            result.assemblies.forEach(assembly => {
              console.log(`  - ${assembly.assemblyName}: ${assembly.layers.length} layers, ${assembly.framingType || 'unknown framing'}`);
            });
            allAssemblies.push(...result.assemblies);
            totalTokens += result.tokensUsed || 0;
          } else if (result && !result.hasWallSections) {
            console.log(`[PlanIntelligence] Page ${page.page_number} - not a wall section detail`);
          } else {
            console.log(`[PlanIntelligence] Page ${page.page_number} - no wall assemblies found`);
          }
        } catch (pageError) {
          console.error(`[PlanIntelligence] Failed to process page ${page.page_number}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      if (allAssemblies.length === 0) {
        setWallAssemblyError('No wall assembly sections found in section/detail drawings. These pages may not contain wall section details.');
        return;
      }

      console.log(`\n[PlanIntelligence] ======= WALL ASSEMBLY RESULTS =======`);
      console.log(`[PlanIntelligence] Total assemblies found: ${allAssemblies.length}`);
      console.log(`[PlanIntelligence] Total tokens used: ${totalTokens}`);

      // Group by framing type for summary
      const byFraming = allAssemblies.reduce((acc, a) => {
        const framing = a.framingType || 'Unknown';
        acc[framing] = (acc[framing] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`[PlanIntelligence] Assemblies by framing type:`, byFraming);

      setWallAssemblies(allAssemblies);

    } catch (error) {
      console.error('[PlanIntelligence] Wall assembly extraction error:', error);
      setWallAssemblyError(error instanceof Error ? error.message : 'Wall assembly extraction failed');
    } finally {
      setIsExtractingWallAssembly(false);
    }
  }, [sectionPages, extractionJobId]);

  // Extract roof plan data from ALL roof plan pages
  const handleExtractRoofPlan = useCallback(async () => {
    if (roofPlanPages.length === 0) {
      setRoofPlanError('No roof plan pages found for this job');
      return;
    }

    console.log(`[PlanIntelligence] Starting roof plan extraction for ${roofPlanPages.length} roof plan page(s)`);
    setIsExtractingRoofPlan(true);
    setRoofPlanError(null);

    try {
      const allRoofPlans: RoofPlanData[] = [];
      let totalTokens = 0;

      for (let i = 0; i < roofPlanPages.length; i++) {
        const page = roofPlanPages[i];
        console.log(`\n[PlanIntelligence] ======= Roof Plan Page ${i + 1}/${roofPlanPages.length} (page ${page.page_number}) =======`);

        try {
          const result = await extractRoofPlanFromPage(
            page.id,
            page.image_url,
            extractionJobId || undefined,
            page.page_number,
            page.scale || undefined
          );

          if (result) {
            console.log(`[PlanIntelligence] Page ${page.page_number} extracted roof plan data:`);
            console.log(`  - Primary pitch: ${result.primaryPitch}`);
            console.log(`  - Total area: ${result.totalRoofAreaSF} SF`);
            console.log(`  - Slopes: ${result.slopes?.length || 0}`);
            console.log(`  - Linear elements: ${result.linearElements?.length || 0}`);
            console.log(`  - Features: ${result.features?.length || 0}`);
            allRoofPlans.push(result);
            totalTokens += result.tokens_used || 0;
          } else {
            console.log(`[PlanIntelligence] Page ${page.page_number} - no roof plan data extracted`);
          }
        } catch (pageError) {
          console.error(`[PlanIntelligence] Failed to process page ${page.page_number}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      if (allRoofPlans.length === 0) {
        setRoofPlanError('No roof plan data could be extracted from the roof plan pages.');
        return;
      }

      console.log(`\n[PlanIntelligence] ======= ROOF PLAN RESULTS =======`);
      console.log(`[PlanIntelligence] Total roof plans found: ${allRoofPlans.length}`);
      console.log(`[PlanIntelligence] Total tokens used: ${totalTokens}`);

      // Summarize linear elements
      const totalRidge = allRoofPlans.reduce((sum, rp) => sum + (rp.linearSummary?.ridgeLF || 0), 0);
      const totalHip = allRoofPlans.reduce((sum, rp) => sum + (rp.linearSummary?.hipLF || 0), 0);
      const totalValley = allRoofPlans.reduce((sum, rp) => sum + (rp.linearSummary?.valleyLF || 0), 0);
      const totalEave = allRoofPlans.reduce((sum, rp) => sum + (rp.linearSummary?.eaveLF || 0), 0);
      const totalRake = allRoofPlans.reduce((sum, rp) => sum + (rp.linearSummary?.rakeLF || 0), 0);

      console.log(`[PlanIntelligence] Linear totals: Ridge ${totalRidge} LF, Hip ${totalHip} LF, Valley ${totalValley} LF, Eave ${totalEave} LF, Rake ${totalRake} LF`);

      setRoofPlanData(allRoofPlans);

    } catch (error) {
      console.error('[PlanIntelligence] Roof plan extraction error:', error);
      setRoofPlanError(error instanceof Error ? error.message : 'Roof plan extraction failed');
    } finally {
      setIsExtractingRoofPlan(false);
    }
  }, [roofPlanPages, extractionJobId]);

  // Extract floor plan / building geometry from ALL floor plan pages
  const handleExtractFloorPlan = useCallback(async () => {
    if (floorPlanPages.length === 0) {
      setFloorPlanError('No floor plan pages found for this job');
      return;
    }

    console.log(`[PlanIntelligence] Starting floor plan extraction for ${floorPlanPages.length} floor plan page(s)`);
    setIsExtractingFloorPlan(true);
    setFloorPlanError(null);

    try {
      const allFloorPlans: FloorPlanData[] = [];
      let totalTokens = 0;

      for (let i = 0; i < floorPlanPages.length; i++) {
        const page = floorPlanPages[i];
        console.log(`\n[PlanIntelligence] ======= Floor Plan Page ${i + 1}/${floorPlanPages.length} (page ${page.page_number}) =======`);

        try {
          const result = await extractFloorPlanFromPage(
            page.id,
            page.image_url,
            extractionJobId || undefined,
            page.page_number,
            page.scale_notation || undefined
          );

          if (result && result.confidence > 0) {
            console.log(`[PlanIntelligence] Page ${page.page_number} extracted floor plan data:`);
            console.log(`  - Floor level: ${result.floorLevel}`);
            console.log(`  - Outside corners: ${result.cornerSummary?.totalOutsideCorners || 0}`);
            console.log(`  - Inside corners: ${result.cornerSummary?.totalInsideCorners || 0}`);
            console.log(`  - Perimeter: ${result.exteriorPerimeterLF} LF`);
            console.log(`  - Floor area: ${result.floorAreaSF} SF`);
            allFloorPlans.push(result);
            totalTokens += result.tokens_used || 0;
          } else {
            console.log(`[PlanIntelligence] Page ${page.page_number} - no floor plan data extracted or low confidence`);
          }
        } catch (pageError) {
          console.error(`[PlanIntelligence] Failed to process page ${page.page_number}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      if (allFloorPlans.length === 0) {
        setFloorPlanError('No floor plan data could be extracted from the floor plan pages.');
        return;
      }

      console.log(`\n[PlanIntelligence] ======= FLOOR PLAN RESULTS =======`);
      console.log(`[PlanIntelligence] Total floor plans found: ${allFloorPlans.length}`);
      console.log(`[PlanIntelligence] Total tokens used: ${totalTokens}`);

      // Calculate aggregates
      const totalOutsideCorners = allFloorPlans.reduce((sum, fp) => sum + (fp.cornerSummary?.totalOutsideCorners || 0), 0);
      const totalInsideCorners = allFloorPlans.reduce((sum, fp) => sum + (fp.cornerSummary?.totalInsideCorners || 0), 0);
      const totalPerimeter = allFloorPlans.reduce((sum, fp) => sum + (fp.exteriorPerimeterLF || 0), 0);
      const totalFloorArea = allFloorPlans.reduce((sum, fp) => sum + (fp.floorAreaSF || 0), 0);

      console.log(`[PlanIntelligence] Totals: ${totalOutsideCorners} outside corners, ${totalInsideCorners} inside corners, ${totalPerimeter} LF perimeter, ${totalFloorArea} SF floor area`);

      setFloorPlanData(allFloorPlans);

    } catch (error) {
      console.error('[PlanIntelligence] Floor plan extraction error:', error);
      setFloorPlanError(error instanceof Error ? error.message : 'Floor plan extraction failed');
    } finally {
      setIsExtractingFloorPlan(false);
    }
  }, [floorPlanPages, extractionJobId]);

  // Calculate floor plan aggregates for display
  const floorPlanAggregates = floorPlanData.length > 0 ? {
    totalFloorAreaSF: floorPlanData.reduce((sum, f) => sum + (f.floorAreaSF || 0), 0),
    totalExteriorPerimeterLF: floorPlanData.reduce((sum, f) => sum + (f.exteriorPerimeterLF || 0), 0),
    totalOutsideCorners: floorPlanData.reduce((sum, f) => sum + (f.cornerSummary?.totalOutsideCorners || 0), 0),
    totalInsideCorners: floorPlanData.reduce((sum, f) => sum + (f.cornerSummary?.totalInsideCorners || 0), 0),
    totalWindowCount: floorPlanData.reduce((sum, f) => sum + (f.windowCount || 0), 0),
    totalExteriorDoorCount: floorPlanData.reduce((sum, f) => sum + (f.doorCount || 0), 0),
    totalGarageDoorCount: floorPlanData.reduce((sum, f) => sum + (f.garageDoorCount || 0), 0),
  } : null;

  // Fetch existing notes specs data from job
  const fetchNotesSpecsData = useCallback(async (jobId: string) => {
    try {
      console.log('[PlanIntelligence] Fetching existing notes_specs_data for job:', jobId);
      const response = await fetch(`/api/extract-notes-specs?job_id=${jobId}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log(`[PlanIntelligence] Found existing notes data: ${result.data.notes?.length || 0} notes`);
          setNotesData(result.data);
        }
      }
    } catch (error) {
      console.error('[PlanIntelligence] Failed to fetch notes_specs_data:', error);
    }
  }, []);

  // Extract notes & specifications from plan pages
  const handleExtractNotes = useCallback(async () => {
    if (!extractionJobId) {
      setNotesError('No extraction job found');
      return;
    }

    console.log(`[PlanIntelligence] Starting notes & specifications extraction for job ${extractionJobId}`);
    setIsExtractingNotes(true);
    setNotesError(null);

    try {
      const response = await fetch('/api/extract-notes-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: extractionJobId,
          include_all_pages: false,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Notes extraction failed');
      }

      console.log(`[PlanIntelligence] Extracted ${result.data?.notes?.length || 0} notes`);
      setNotesData(result.data);

    } catch (error) {
      console.error('[PlanIntelligence] Notes extraction error:', error);
      setNotesError(error instanceof Error ? error.message : 'Notes extraction failed');
    } finally {
      setIsExtractingNotes(false);
    }
  }, [extractionJobId]);

  // Get category display info
  const getCategoryInfo = (category: string) => {
    const categoryMap: Record<string, { label: string; icon: React.ElementType; color: string }> = {
      siding_specs: { label: 'Siding Specifications', icon: Layers, color: 'blue' },
      weather_barrier: { label: 'Weather Barrier', icon: Shield, color: 'cyan' },
      flashing_waterproofing: { label: 'Flashing & Waterproofing', icon: Droplet, color: 'teal' },
      trim_details: { label: 'Trim Details', icon: Ruler, color: 'purple' },
      fasteners_adhesives: { label: 'Fasteners & Adhesives', icon: Wrench, color: 'orange' },
      code_requirements: { label: 'Code Requirements', icon: Scale, color: 'yellow' },
      installation_notes: { label: 'Installation Notes', icon: Hammer, color: 'green' },
      special_conditions: { label: 'Special Conditions', icon: AlertCircle, color: 'rose' },
    };
    return categoryMap[category] || { label: category.replace(/_/g, ' '), icon: FileText, color: 'gray' };
  };

  // Group notes by category
  const notesByCategory = notesData?.notes.reduce((acc, note) => {
    if (!acc[note.category]) acc[note.category] = [];
    acc[note.category].push(note);
    return acc;
  }, {} as Record<string, TakeoffNote[]>) || {};

  // Get critical notes
  const criticalNotes = notesData?.notes.filter(n => n.importance === 'critical') || [];

  // Group material callouts by trade
  const calloutsByTrade = materialCallouts.reduce((acc, callout) => {
    const trade = callout.trade || 'Other';
    if (!acc[trade]) acc[trade] = [];
    acc[trade].push(callout);
    return acc;
  }, {} as Record<string, MaterialCallout[]>);

  return (
    <div className="space-y-6">
      {/* Header Info with Extract Button */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Plan Intelligence
              </h4>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                {ocrData
                  ? `Extracted ${ocrData.totals.windows} windows and ${ocrData.totals.doors} doors from schedule pages.`
                  : schedulePages.length > 0
                    ? `Found ${schedulePages.length} schedule page(s). Click "Extract Schedules" to analyze with AI.`
                    : extractionJobId
                      ? 'No schedule pages found for this job.'
                      : projectId
                        ? 'No extraction job found for this project.'
                        : 'No project linked to this takeoff.'}
              </p>
              {ocrData?.extracted_at && (
                <p className="text-xs text-blue-500 dark:text-blue-400/70 mt-1">
                  Last extracted: {new Date(ocrData.extracted_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Extract Button */}
          {extractionJobId && schedulePages.length > 0 && (
            <button
              onClick={handleExtractSchedule}
              disabled={isExtracting || isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : ocrData ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Re-extract
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Extract Schedules
                </>
              )}
            </button>
          )}
        </div>

        {/* Extraction Error */}
        {extractionError && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{extractionError}</span>
            </div>
          </div>
        )}

        {/* Extraction Metadata */}
        {ocrData && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-blue-600 dark:text-blue-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Confidence: {Math.round((ocrData.confidence || 0) * 100)}%
            </span>
            {ocrData.model_used && (
              <span>Model: {ocrData.model_used}</span>
            )}
            {ocrData.tokens_used && (
              <span>Tokens: {ocrData.tokens_used.toLocaleString()}</span>
            )}
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && (
        <>
      {/* Validation Summary */}
      <CollapsibleSection
        title="Validation Summary"
        icon={CheckCircle2}
        iconColor="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400"
        defaultOpen={true}
      >
        <div className="pt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Compare counts from schedule pages with detected elements from elevation drawings.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {validationData.map((item, index) => (
              <ValidationCard key={index} item={item} />
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Material Callouts */}
      <CollapsibleSection
        title="Material Callouts"
        icon={Package}
        iconColor="bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400"
        badge={
          materialCallouts.length > 0 && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
              {materialCallouts.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {/* Extract Materials Button */}
          {extractionJobId && elevationPages.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {materialCallouts.length > 0
                  ? `Extracted from ${elevationPages.length} elevation page(s)`
                  : `${elevationPages.length} elevation page(s) available for extraction`}
              </p>
              <button
                onClick={handleExtractMaterials}
                disabled={isExtractingMaterials || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isExtractingMaterials ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : materialCallouts.length > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-extract
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Materials
                  </>
                )}
              </button>
            </div>
          )}

          {/* Extraction Error */}
          {materialExtractionError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{materialExtractionError}</span>
              </div>
            </div>
          )}

          {materialCallouts.length === 0 && !isExtractingMaterials ? (
            <EmptyState message="No material callouts extracted yet. Click 'Extract Materials' to identify siding, trim, roofing, and other material specifications from your elevation drawings." />
          ) : (
            <div className="space-y-4">
              {Object.entries(calloutsByTrade).map(([trade, callouts]) => (
                <div key={trade}>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 capitalize flex items-center gap-2">
                    {trade}
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      {callouts.length}
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {callouts.map((callout) => (
                      <div
                        key={callout.id}
                        className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {callout.rawText}
                            </span>
                            {callout.manufacturer && (
                              <span className="ml-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                                {callout.manufacturer}
                              </span>
                            )}
                            {callout.productLine && callout.productLine !== callout.manufacturer && (
                              <span className="ml-1 text-xs text-purple-500 dark:text-purple-300">
                                ({callout.productLine})
                              </span>
                            )}
                            {callout.matchedProduct && (
                              <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                                ✓ Matched
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {callout.confidence && (
                              <span
                                title={callout.confidenceNotes || undefined}
                                className={`text-xs px-2 py-0.5 rounded cursor-help ${
                                  callout.confidence >= 0.9
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                    : callout.confidence >= 0.7
                                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                }`}
                              >
                                {Math.round(callout.confidence * 100)}%
                              </span>
                            )}
                            {callout.pageRef && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {callout.pageRef}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* V2 Enhanced Details Row */}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {callout.materialType && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="text-gray-400 dark:text-gray-500">Type:</span>{' '}
                              {callout.materialType.replace(/_/g, ' ')}
                            </span>
                          )}
                          {callout.profile && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="text-gray-400 dark:text-gray-500">Profile:</span>{' '}
                              {callout.profile.replace(/_/g, ' ')}
                            </span>
                          )}
                          {callout.finish && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="text-gray-400 dark:text-gray-500">Finish:</span>{' '}
                              {callout.finish}
                            </span>
                          )}
                          {callout.color && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="text-gray-400 dark:text-gray-500">Color:</span>{' '}
                              {callout.color}
                            </span>
                          )}
                          {callout.orientation && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="text-gray-400 dark:text-gray-500">Orientation:</span>{' '}
                              {callout.orientation}
                            </span>
                          )}
                        </div>
                        {/* V2 Dimensions Row */}
                        {callout.dimensions && (
                          callout.dimensions.exposure_inches ||
                          callout.dimensions.thickness_inches ||
                          callout.dimensions.width_inches
                        ) && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {callout.dimensions.exposure_inches && (
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                {callout.dimensions.exposure_inches}&quot; exposure
                              </span>
                            )}
                            {callout.dimensions.thickness_inches && (
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                {callout.dimensions.thickness_inches}&quot; thick
                              </span>
                            )}
                            {callout.dimensions.width_inches && (
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                {callout.dimensions.width_inches}&quot; wide
                              </span>
                            )}
                          </div>
                        )}
                        {/* V2 Installation Notes */}
                        {callout.installationNotes && (
                          <div className="mt-1">
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              Note: {callout.installationNotes}
                            </span>
                          </div>
                        )}
                        {/* V2 Alternatives (shown when confidence is low) */}
                        {callout.alternatives && callout.alternatives.length > 0 && (callout.confidence || 0) < 0.85 && (
                          <div className="mt-1">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              Alternatives: {callout.alternatives.map(alt =>
                                typeof alt === 'string' ? alt : ((alt as { text?: string; interpretation?: string }).text || (alt as { text?: string; interpretation?: string }).interpretation || JSON.stringify(alt))
                              ).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Wall Assembly */}
      <CollapsibleSection
        title="Wall Assembly"
        icon={Layers}
        iconColor="bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400"
        badge={
          wallAssemblies.length > 0 && (
            <span className="text-xs bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full">
              {wallAssemblies.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {/* Extract Wall Assembly Button */}
          {extractionJobId && sectionPages.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {wallAssemblies.length > 0
                  ? `Extracted from ${sectionPages.length} section/detail page(s)`
                  : `${sectionPages.length} section/detail page(s) available for extraction`}
              </p>
              <button
                onClick={handleExtractWallAssembly}
                disabled={isExtractingWallAssembly || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isExtractingWallAssembly ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : wallAssemblies.length > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-extract
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Wall Assembly
                  </>
                )}
              </button>
            </div>
          )}

          {/* No section/detail pages message */}
          {extractionJobId && sectionPages.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No section or detail pages found for this job. Wall assembly extraction requires section or detail drawing pages.
            </p>
          )}

          {/* Extraction Error */}
          {wallAssemblyError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{wallAssemblyError}</span>
              </div>
            </div>
          )}

          {wallAssemblies.length === 0 && !isExtractingWallAssembly ? (
            <EmptyState message="No wall assemblies extracted yet. Click 'Extract Wall Assembly' to analyze section drawings and identify wall construction layers (siding, sheathing, insulation, framing, etc.)." />
          ) : (
            <div className="space-y-6">
              {wallAssemblies.map((assembly) => (
                <div
                  key={assembly.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Assembly Header */}
                  <div className="bg-teal-50 dark:bg-teal-900/30 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {assembly.assemblyName}
                        </h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {assembly.framingType && (
                            <span>Framing: <span className="font-medium">{assembly.framingType}</span></span>
                          )}
                          {assembly.framingSpacing && (
                            <span>Spacing: <span className="font-medium">{assembly.framingSpacing}</span></span>
                          )}
                          {assembly.totalThickness && (
                            <span>Total: <span className="font-medium">{assembly.totalThickness}</span></span>
                          )}
                          {assembly.insulationRValue && (
                            <span>R-Value: <span className="font-medium text-blue-600 dark:text-blue-400">R-{assembly.insulationRValue}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {assembly.confidence && (
                          <span
                            title={assembly.confidenceNotes || undefined}
                            className={`text-xs px-2 py-0.5 rounded cursor-help ${
                              assembly.confidence >= 0.85
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : assembly.confidence >= 0.7
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {Math.round(assembly.confidence * 100)}%
                          </span>
                        )}
                        {assembly.pageRef && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {assembly.pageRef}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Layers Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400 w-8">#</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Layer</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Material</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Thickness</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">R-Value</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assembly.layers.map((layer, idx) => (
                          <tr
                            key={`${assembly.id}-layer-${idx}`}
                            className={`border-b border-gray-100 dark:border-gray-800 ${
                              idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/25'
                            }`}
                          >
                            <td className="py-2 px-3 font-mono text-gray-400 dark:text-gray-500">
                              {layer.position}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {layer.layerName}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div>
                                <span className="text-gray-900 dark:text-white">{layer.material}</span>
                                {layer.manufacturer && (
                                  <span className="ml-2 text-xs text-teal-600 dark:text-teal-400 font-medium">
                                    {layer.manufacturer}
                                  </span>
                                )}
                                {layer.productLine && layer.productLine !== layer.manufacturer && (
                                  <span className="ml-1 text-xs text-teal-500 dark:text-teal-300">
                                    ({layer.productLine})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono text-gray-700 dark:text-gray-300">
                              {layer.thickness || '—'}
                            </td>
                            <td className="py-2 px-3">
                              {layer.rValue ? (
                                <span className="font-medium text-blue-600 dark:text-blue-400">
                                  R-{layer.rValue}
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                              {layer.notes || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Assembly Footer Notes */}
                  {(assembly.vaporBarrier || assembly.fireRating || assembly.notes) && (
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {assembly.vaporBarrier && (
                          <span className="text-gray-600 dark:text-gray-400">
                            Vapor Barrier: <span className="font-medium">{assembly.vaporBarrier}</span>
                          </span>
                        )}
                        {assembly.fireRating && (
                          <span className="text-gray-600 dark:text-gray-400">
                            Fire Rating: <span className="font-medium text-orange-600 dark:text-orange-400">{assembly.fireRating}</span>
                          </span>
                        )}
                        {assembly.acousticRating && (
                          <span className="text-gray-600 dark:text-gray-400">
                            Acoustic: <span className="font-medium">{assembly.acousticRating}</span>
                          </span>
                        )}
                        {assembly.notes && (
                          <span className="text-gray-500 dark:text-gray-400 italic">
                            {assembly.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Roof Plan */}
      <CollapsibleSection
        title="Roof Plan"
        icon={Home}
        iconColor="bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400"
        badge={
          roofPlanData.length > 0 && (
            <span className="text-xs bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
              {roofPlanData.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {/* Extract Roof Plan Button */}
          {extractionJobId && roofPlanPages.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {roofPlanData.length > 0
                  ? `Extracted from ${roofPlanPages.length} roof plan page(s)`
                  : `${roofPlanPages.length} roof plan page(s) available for extraction`}
              </p>
              <button
                onClick={handleExtractRoofPlan}
                disabled={isExtractingRoofPlan || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isExtractingRoofPlan ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : roofPlanData.length > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-extract
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Roof Plan
                  </>
                )}
              </button>
            </div>
          )}

          {/* No roof plan pages message */}
          {extractionJobId && roofPlanPages.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No roof plan pages found for this job. Roof plan extraction requires pages classified as &quot;roof_plan&quot;.
            </p>
          )}

          {/* Extraction Error */}
          {roofPlanError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{roofPlanError}</span>
              </div>
            </div>
          )}

          {roofPlanData.length === 0 && !isExtractingRoofPlan ? (
            <EmptyState message="No roof plan data extracted yet. Click 'Extract Roof Plan' to analyze roof drawings and identify pitch, ridge/hip/valley lengths, eave/rake measurements, and roof features." />
          ) : (
            <div className="space-y-6">
              {roofPlanData.map((roofPlan) => (
                <div
                  key={roofPlan.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Roof Plan Header */}
                  <div className="bg-rose-50 dark:bg-rose-900/30 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          Roof Plan - {roofPlan.pageRef}
                        </h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {roofPlan.primaryPitch && (
                            <span>Pitch: <span className="font-medium text-rose-600 dark:text-rose-400">{roofPlan.primaryPitch}</span></span>
                          )}
                          {roofPlan.totalRoofAreaSF && (
                            <span>Total Area: <span className="font-medium">{roofPlan.totalRoofAreaSF.toLocaleString()} SF</span></span>
                          )}
                          {roofPlan.slopes?.length > 0 && (
                            <span>Slopes: <span className="font-medium">{roofPlan.slopes.length}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {roofPlan.confidence && (
                          <span
                            title={roofPlan.confidenceNotes || undefined}
                            className={`text-xs px-2 py-0.5 rounded cursor-help ${
                              roofPlan.confidence >= 0.85
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : roofPlan.confidence >= 0.7
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {Math.round(roofPlan.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Linear Elements Summary */}
                  {roofPlan.linearSummary && (
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Linear Elements
                      </h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                          <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            {roofPlan.linearSummary.ridgeLF || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Ridge LF</div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                          <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            {roofPlan.linearSummary.hipLF || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Hip LF</div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                          <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            {roofPlan.linearSummary.valleyLF || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Valley LF</div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                          <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            {roofPlan.linearSummary.eaveLF || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Eave LF</div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                          <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            {roofPlan.linearSummary.rakeLF || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Rake LF</div>
                        </div>
                        <div className="text-center p-2 bg-rose-50 dark:bg-rose-900/30 rounded">
                          <div className="text-lg font-semibold text-rose-600 dark:text-rose-400">
                            {roofPlan.linearSummary.totalPerimeterLF || 0}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Perimeter LF</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slopes Table */}
                  {roofPlan.slopes && roofPlan.slopes.length > 0 && (
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Roof Slopes
                      </h5>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                              <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Pitch</th>
                              <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Area (SF)</th>
                              <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roofPlan.slopes.map((slope, idx) => (
                              <tr
                                key={slope.id || idx}
                                className={`border-b border-gray-100 dark:border-gray-800 ${
                                  idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/25'
                                }`}
                              >
                                <td className="py-2 px-3 font-medium text-gray-900 dark:text-white">
                                  {slope.name}
                                </td>
                                <td className="py-2 px-3 font-mono text-rose-600 dark:text-rose-400">
                                  {slope.pitch}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">
                                  {slope.areaSF?.toLocaleString() || '—'}
                                </td>
                                <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                                  {slope.notes || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Features */}
                  {roofPlan.features && roofPlan.features.length > 0 && (
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Roof Features
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {roofPlan.features.map((feature, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm"
                          >
                            <span className="font-medium text-gray-900 dark:text-white capitalize">
                              {feature.type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">
                              ×{feature.quantity}
                            </span>
                            {feature.size && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({feature.size})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Material Callouts */}
                  {roofPlan.materialCallouts && roofPlan.materialCallouts.length > 0 && (
                    <div className="px-4 py-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Roofing Materials
                      </h5>
                      <div className="space-y-2">
                        {roofPlan.materialCallouts.map((callout, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {callout.rawText}
                              </span>
                              {callout.confidence && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  callout.confidence >= 0.85
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                }`}>
                                  {Math.round(callout.confidence * 100)}%
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {callout.materialType && (
                                <span>Type: {callout.materialType.replace(/_/g, ' ')}</span>
                              )}
                              {callout.manufacturer && (
                                <span>Manufacturer: <span className="text-rose-600 dark:text-rose-400">{callout.manufacturer}</span></span>
                              )}
                              {callout.productLine && (
                                <span>Product: {callout.productLine}</span>
                              )}
                              {callout.color && (
                                <span>Color: {callout.color}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extraction Notes Footer */}
                  {roofPlan.extractionNotes && (
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                        {roofPlan.extractionNotes}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Building Geometry / Floor Plan */}
      <CollapsibleSection
        title="Building Geometry"
        icon={LayoutGrid}
        iconColor="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
        defaultOpen={floorPlanData.length > 0}
        badge={
          floorPlanAggregates && (
            <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
              {floorPlanAggregates.totalOutsideCorners} corners
            </span>
          )
        }
      >
        <div className="pt-4">
          {/* Extract Floor Plan Button */}
          {extractionJobId && floorPlanPages.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {floorPlanData.length > 0
                  ? `Extracted from ${floorPlanPages.length} floor plan page(s)`
                  : `${floorPlanPages.length} floor plan page(s) available for extraction`}
              </p>
              <button
                onClick={handleExtractFloorPlan}
                disabled={isExtractingFloorPlan || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isExtractingFloorPlan ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : floorPlanData.length > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-extract
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Geometry
                  </>
                )}
              </button>
            </div>
          )}

          {/* No floor plan pages message */}
          {extractionJobId && floorPlanPages.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No floor plan pages found for this job. Building geometry extraction requires pages classified as &quot;floor_plan&quot;.
            </p>
          )}

          {/* Extraction Error */}
          {floorPlanError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{floorPlanError}</span>
              </div>
            </div>
          )}

          {floorPlanData.length === 0 && !isExtractingFloorPlan ? (
            <EmptyState message="No building geometry extracted yet. Click 'Extract Geometry' to analyze floor plans and identify exterior corners, perimeter, and floor areas." />
          ) : (
            <div className="space-y-4">
              {/* Aggregated Summary Card */}
              {floorPlanAggregates && (
                <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-3">
                    Building Totals
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center p-2 bg-white dark:bg-gray-800/50 rounded">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {floorPlanAggregates.totalOutsideCorners}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Outside Corners</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800/50 rounded">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {floorPlanAggregates.totalInsideCorners}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Inside Corners</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800/50 rounded">
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {floorPlanAggregates.totalExteriorPerimeterLF.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Perimeter LF</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800/50 rounded">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {floorPlanAggregates.totalFloorAreaSF.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Floor Area SF</div>
                    </div>
                  </div>

                  {/* Openings summary */}
                  <div className="mt-4 pt-3 border-t border-indigo-200 dark:border-indigo-700">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-gray-900 dark:text-white">{floorPlanAggregates.totalWindowCount}</span> windows
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-gray-900 dark:text-white">{floorPlanAggregates.totalExteriorDoorCount}</span> ext. doors
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-gray-900 dark:text-white">{floorPlanAggregates.totalGarageDoorCount}</span> garage doors
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-Floor Details */}
              {floorPlanData.map((floor, idx) => (
                <div
                  key={floor.id || idx}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Floor Header */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {floor.floorLevel === 'crawlspace' ? 'Crawlspace' : `${floor.floorLevel.charAt(0).toUpperCase() + floor.floorLevel.slice(1)} Floor`}
                          <span className="font-normal text-gray-500 dark:text-gray-400 ml-2">
                            ({floor.pageRef})
                          </span>
                        </h4>
                        {(floor.overallWidth || floor.overallDepth) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Overall: {floor.overallWidth || '?'}&apos; × {floor.overallDepth || '?'}&apos;
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {floor.confidence !== undefined && (
                          <span
                            title={floor.confidenceNotes || undefined}
                            className={`text-xs px-2 py-0.5 rounded cursor-help ${
                              floor.confidence >= 0.85
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : floor.confidence >= 0.7
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {Math.round(floor.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Floor Metrics */}
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                        <div className="text-xl font-semibold text-gray-900 dark:text-white">
                          {floor.cornerSummary?.totalOutsideCorners || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Outside 90°</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                        <div className="text-xl font-semibold text-gray-900 dark:text-white">
                          {floor.cornerSummary?.totalInsideCorners || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Inside 90°</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                        <div className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">
                          {floor.exteriorPerimeterLF || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Perimeter LF</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                        <div className="text-xl font-semibold text-gray-900 dark:text-white">
                          {floor.floorAreaSF?.toLocaleString() || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Floor SF</div>
                      </div>
                    </div>

                    {/* Corner Details (collapsible) */}
                    {floor.corners && floor.corners.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                          View {floor.corners.length} corner locations
                        </summary>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                          {floor.corners.map((corner, cIdx) => (
                            <div
                              key={cIdx}
                              className="text-xs bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 flex items-center gap-1"
                            >
                              <span className={corner.type.includes('outside') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                                {corner.type.includes('outside') ? '↗' : '↙'}
                              </span>
                              <span className="text-gray-700 dark:text-gray-300 truncate">
                                {corner.location}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Extraction notes */}
                    {floor.extractionNotes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-3">
                        {floor.extractionNotes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Dimensions */}
      <CollapsibleSection
        title="Dimensions Extracted"
        icon={Ruler}
        iconColor="bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
        badge={
          dimensions.length > 0 && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {dimensions.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {dimensions.length === 0 ? (
            <EmptyState message="No dimensions extracted yet. OCR will identify wall heights, exposures, and other measurements from your plans." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dimensions.map((dim) => (
                <div
                  key={dim.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">
                      {dim.category}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {dim.label}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {dim.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Window Schedule */}
      <CollapsibleSection
        title="Window Schedule"
        icon={Square}
        iconColor="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
        badge={
          windowSchedule.length > 0 && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
              {windowSchedule.length} types
            </span>
          )
        }
      >
        <div className="pt-4">
          {windowSchedule.length === 0 ? (
            <EmptyState message="No window schedule extracted yet. OCR will read window schedules from your plans to provide accurate counts and sizes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {windowSchedule.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.mark}</td>
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.size}</td>
                      <td className="py-2 px-3 text-center font-mono text-gray-900 dark:text-white">{item.quantity}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.type}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Door Schedule */}
      <CollapsibleSection
        title="Door Schedule"
        icon={DoorOpen}
        iconColor="bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400"
        badge={
          doorSchedule.length > 0 && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
              {doorSchedule.length} types
            </span>
          )
        }
      >
        <div className="pt-4">
          {doorSchedule.length === 0 ? (
            <EmptyState message="No door schedule extracted yet. OCR will read door schedules from your plans to provide accurate counts and sizes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {doorSchedule.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.mark}</td>
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.size}</td>
                      <td className="py-2 px-3 text-center font-mono text-gray-900 dark:text-white">{item.quantity}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.type}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Skylight Schedule */}
      <CollapsibleSection
        title="Skylight Schedule"
        icon={Square}
        iconColor="bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400"
        badge={
          skylightSchedule.length > 0 && (
            <span className="text-xs bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full">
              {skylightSchedule.length} types
            </span>
          )
        }
      >
        <div className="pt-4">
          {skylightSchedule.length === 0 ? (
            <EmptyState message="No skylight schedule extracted yet. OCR will read skylight schedules from your plans." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {skylightSchedule.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.mark}</td>
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.size}</td>
                      <td className="py-2 px-3 text-center font-mono text-gray-900 dark:text-white">{item.quantity}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.type}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Garage Door Schedule */}
      <CollapsibleSection
        title="Garage Door Schedule"
        icon={DoorOpen}
        iconColor="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
        badge={
          garageSchedule.length > 0 && (
            <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
              {garageSchedule.length} types
            </span>
          )
        }
      >
        <div className="pt-4">
          {garageSchedule.length === 0 ? (
            <EmptyState message="No garage door schedule extracted yet. OCR will identify garage doors from your plans." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {garageSchedule.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.mark}</td>
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.size}</td>
                      <td className="py-2 px-3 text-center font-mono text-gray-900 dark:text-white">{item.quantity}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.type}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Notes & Specifications */}
      <CollapsibleSection
        title="Notes & Specifications"
        icon={FileText}
        iconColor="bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
        defaultOpen={notesData !== null && notesData.notes.length > 0}
        badge={
          notesData && notesData.notes.length > 0 && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {notesData.notes.length} specs
            </span>
          )
        }
      >
        <div className="pt-4">
          {/* Extract Button */}
          {extractionJobId && (
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {notesData
                  ? `Extracted from ${notesData.pages_analyzed} page(s)`
                  : 'Extract takeoff-relevant specifications from plan pages'}
              </p>
              <button
                onClick={handleExtractNotes}
                disabled={isExtractingNotes || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isExtractingNotes ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : notesData ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-extract
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Notes &amp; Specs
                  </>
                )}
              </button>
            </div>
          )}

          {/* Extraction Error */}
          {notesError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{notesError}</span>
              </div>
            </div>
          )}

          {!notesData && !isExtractingNotes ? (
            <EmptyState message="No notes or specifications extracted yet. Click 'Extract Notes & Specs' to identify siding specs, flashing requirements, fastener details, and code requirements from your plans." />
          ) : notesData && (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      {notesData.summary}
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(notesData.categories)
                        .filter(([, count]) => count > 0)
                        .map(([cat, count]) => {
                          const info = getCategoryInfo(cat);
                          return (
                            <span
                              key={cat}
                              className="text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full"
                            >
                              {info.label}: {count}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                  {notesData.confidence > 0 && (
                    <span
                      title={notesData.confidenceNotes || undefined}
                      className={`text-xs px-2 py-0.5 rounded cursor-help ${
                        notesData.confidence >= 0.85
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : notesData.confidence >= 0.7
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {Math.round(notesData.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Critical Items Section */}
              {criticalNotes.length > 0 && (
                <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 border-b border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">
                        Critical Items ({criticalNotes.length})
                      </h4>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {criticalNotes.map((note) => {
                      const info = getCategoryInfo(note.category);
                      const CategoryIcon = info.icon;
                      return (
                        <div
                          key={note.id}
                          className="flex items-start gap-3 p-2 bg-red-50/50 dark:bg-red-900/10 rounded"
                        >
                          <CategoryIcon className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {note.item}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {note.source_page}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                              {note.details}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category Sections */}
              {Object.entries(notesByCategory)
                .filter(([cat]) => cat !== 'critical')
                .map(([category, categoryNotes]) => {
                  const info = getCategoryInfo(category);
                  const CategoryIcon = info.icon;
                  const colorClasses: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
                    blue: { bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800', iconBg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-600 dark:text-blue-400' },
                    cyan: { bg: 'bg-cyan-50 dark:bg-cyan-900/30', border: 'border-cyan-200 dark:border-cyan-800', iconBg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-600 dark:text-cyan-400' },
                    teal: { bg: 'bg-teal-50 dark:bg-teal-900/30', border: 'border-teal-200 dark:border-teal-800', iconBg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-600 dark:text-teal-400' },
                    purple: { bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-800', iconBg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-600 dark:text-purple-400' },
                    orange: { bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-800', iconBg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-600 dark:text-orange-400' },
                    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-200 dark:border-yellow-800', iconBg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-600 dark:text-yellow-400' },
                    green: { bg: 'bg-green-50 dark:bg-green-900/30', border: 'border-green-200 dark:border-green-800', iconBg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-600 dark:text-green-400' },
                    rose: { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-800', iconBg: 'bg-rose-100 dark:bg-rose-900/50', text: 'text-rose-600 dark:text-rose-400' },
                    gray: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-200 dark:border-gray-700', iconBg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
                  };
                  const colors = colorClasses[info.color] || colorClasses.gray;

                  return (
                    <div key={category} className={`border ${colors.border} rounded-lg overflow-hidden`}>
                      <div className={`${colors.bg} px-4 py-2 border-b ${colors.border}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded ${colors.iconBg} flex items-center justify-center`}>
                            <CategoryIcon className={`w-3.5 h-3.5 ${colors.text}`} />
                          </div>
                          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {info.label}
                          </h4>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({categoryNotes.length})
                          </span>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {categoryNotes.map((note) => (
                          <div
                            key={note.id}
                            className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {note.item}
                                  </span>
                                  {note.importance === 'critical' && (
                                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded">
                                      Critical
                                    </span>
                                  )}
                                  {note.importance === 'optional' && (
                                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                      Optional
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                  {note.details}
                                </p>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {note.source_page}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

              {/* Metadata Footer */}
              {notesData.extracted_at && (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                  Last extracted: {new Date(notesData.extracted_at).toLocaleString()}
                  {notesData.tokens_used && ` • ${notesData.tokens_used.toLocaleString()} tokens used`}
                </div>
              )}

            </div>
          )}
        </div>
      </CollapsibleSection>
        </>
      )}
    </div>
  );
}
