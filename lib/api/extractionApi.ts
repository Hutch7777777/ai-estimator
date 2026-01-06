// Extraction API client for Phase 4 enhanced data
// Connects to extraction-api-production.up.railway.app

import type { WallHeightsData, Phase4Data } from '@/lib/types/extraction';

// =============================================================================
// Siding Polygon Types
// =============================================================================

export interface SidingHole {
  class: string;
  points: [number, number][];
  area_sf: number;
}

export interface SidingSummary {
  building_sf: number;
  roof_sf: number;
  gross_facade_sf: number;
  openings_sf: number;
  net_siding_sf: number;
  opening_count: number;
}

export interface SidingPolygon {
  building_id: string;
  exterior: {
    points: [number, number][];
    gross_facade_sf: number;
  };
  holes: SidingHole[];
  summary: SidingSummary;
}

export interface SidingPolygonResponse {
  success: boolean;
  page_id: string;
  // Legacy format (first building only, for backwards compatibility)
  exterior: {
    points: [number, number][];
    gross_facade_sf: number;
  };
  holes: SidingHole[];
  summary: SidingSummary;
  // New multi-building format
  siding_polygons?: SidingPolygon[];
  page_summary?: {
    total_buildings: number;
    total_net_siding_sf: number;
  };
}

const EXTRACTION_API_BASE =
  process.env.NEXT_PUBLIC_EXTRACTION_API_URL ||
  'https://extraction-api-production.up.railway.app';

/**
 * Get wall heights data for a job (OCR-extracted or estimated)
 */
export async function getWallHeights(jobId: string): Promise<WallHeightsData | null> {
  try {
    const res = await fetch(`${EXTRACTION_API_BASE}/wall-heights?job_id=${jobId}`);
    if (!res.ok) {
      console.error('getWallHeights failed:', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    return data.wall_heights || data;
  } catch (err) {
    console.error('getWallHeights error:', err);
    return null;
  }
}

/**
 * Calculate linear elements (corners, perimeter, trim)
 * This triggers calculation on the backend and returns results
 */
export async function calculateLinearElements(jobId: string): Promise<Phase4Data | null> {
  try {
    const res = await fetch(`${EXTRACTION_API_BASE}/calculate-linear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (!res.ok) {
      console.error('calculateLinearElements failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('calculateLinearElements error:', err);
    return null;
  }
}

/**
 * Get cached linear summary (if already calculated)
 */
export async function getLinearSummary(jobId: string): Promise<Phase4Data | null> {
  try {
    const res = await fetch(`${EXTRACTION_API_BASE}/linear-summary?job_id=${jobId}`);
    if (!res.ok) {
      // 404 means not calculated yet - not an error
      if (res.status === 404) return null;
      console.error('getLinearSummary failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('getLinearSummary error:', err);
    return null;
  }
}

/**
 * Get all Phase 4 data in one call (wall heights + linear elements)
 * Tries to get cached data first, calculates if not available
 */
export async function getPhase4Data(jobId: string): Promise<Phase4Data | null> {
  // First try to get cached summary
  const cached = await getLinearSummary(jobId);
  if (cached) return cached;

  // If not cached, trigger calculation
  return calculateLinearElements(jobId);
}

/**
 * Get siding polygon data for a page (exterior bounds with hole cutouts)
 * Returns polygon coordinates for rendering net siding area overlay
 */
export async function getSidingPolygons(pageId: string): Promise<SidingPolygonResponse | null> {
  try {
    const res = await fetch(`${EXTRACTION_API_BASE}/siding-polygons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_id: pageId }),
    });
    if (!res.ok) {
      console.error('getSidingPolygons failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('getSidingPolygons error:', err);
    return null;
  }
}
