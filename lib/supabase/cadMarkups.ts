// Using direct fetch instead of Supabase client due to client issues
// (Supabase JS client queries build but never execute HTTP requests)
import {
  Polygon,
  CountMarker,
  LinearMeasurement,
  DEFAULT_MARKUP_COLOR,
} from "@/components/cad-markup/types";

// Database row type
interface CadManualMarkupRow {
  id: string;
  project_id: string;
  markup_type: "polygon" | "marker" | "measurement";
  page_number: number;
  points: { x: number; y: number }[] | null;
  position: { x: number; y: number } | null;
  start_point: { x: number; y: number } | null;
  end_point: { x: number; y: number } | null;
  trade: string | null;
  category: string | null;
  product_id: string | null;
  product_name: string | null;
  color: string;
  area_sf: number | null;
  count: number | null;
  length_lf: number | null;
  subject: string | null;
  label: string | null;
  notes: string | null;
  is_complete: boolean;
  is_ai_suggested: boolean;
  ai_confidence: number | null;
  is_user_modified: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CONVERTERS: App Types <-> Database Types
// ============================================================================

function polygonToRow(
  polygon: Polygon,
  projectId: string
): Omit<CadManualMarkupRow, "id" | "created_at" | "updated_at"> {
  return {
    project_id: projectId,
    markup_type: "polygon",
    page_number: polygon.pageNumber,
    points: polygon.points,
    position: null,
    start_point: null,
    end_point: null,
    trade: polygon.material.trade,
    category: polygon.material.category,
    product_id: polygon.material.productId || null,
    product_name: polygon.material.productName || null,
    color: polygon.material.color,
    area_sf: polygon.area,
    count: null,
    length_lf: null,
    subject: polygon.subject || null,
    label: null,
    notes: polygon.notes || null,
    is_complete: polygon.isComplete,
    is_ai_suggested: false,
    ai_confidence: null,
    is_user_modified: false,
  };
}

function markerToRow(
  marker: CountMarker,
  projectId: string
): Omit<CadManualMarkupRow, "id" | "created_at" | "updated_at"> {
  return {
    project_id: projectId,
    markup_type: "marker",
    page_number: marker.pageNumber,
    points: null,
    position: marker.position,
    start_point: null,
    end_point: null,
    trade: marker.material.trade,
    category: marker.material.category,
    product_id: marker.material.productId || null,
    product_name: marker.material.productName || null,
    color: marker.material.color,
    area_sf: null,
    count: marker.count,
    length_lf: null,
    subject: marker.subject || null,
    label: marker.label,
    notes: marker.notes || null,
    is_complete: true,
    is_ai_suggested: false,
    ai_confidence: null,
    is_user_modified: false,
  };
}

function measurementToRow(
  measurement: LinearMeasurement,
  projectId: string
): Omit<CadManualMarkupRow, "id" | "created_at" | "updated_at"> {
  return {
    project_id: projectId,
    markup_type: "measurement",
    page_number: measurement.pageNumber,
    points: null,
    position: null,
    start_point: measurement.start,
    end_point: measurement.end,
    trade: measurement.material.trade,
    category: measurement.material.category,
    product_id: measurement.material.productId || null,
    product_name: measurement.material.productName || null,
    color: measurement.material.color,
    area_sf: null,
    count: null,
    length_lf: measurement.lengthFeet,
    subject: measurement.subject || null,
    label: measurement.label || null,
    notes: measurement.notes || null,
    is_complete: true,
    is_ai_suggested: false,
    ai_confidence: null,
    is_user_modified: false,
  };
}

function rowToPolygon(row: CadManualMarkupRow): Polygon {
  return {
    id: row.id,
    pageNumber: row.page_number,
    points: row.points || [],
    material: {
      trade: row.trade || "",
      category: row.category || "",
      productId: row.product_id || undefined,
      productName: row.product_name || undefined,
      color: row.color || DEFAULT_MARKUP_COLOR,
    },
    area: row.area_sf || 0,
    isComplete: row.is_complete,
    subject: row.subject || undefined,
    notes: row.notes || undefined,
  };
}

function rowToMarker(row: CadManualMarkupRow): CountMarker {
  return {
    id: row.id,
    pageNumber: row.page_number,
    position: row.position || { x: 0, y: 0 },
    material: {
      trade: row.trade || "",
      category: row.category || "",
      productId: row.product_id || undefined,
      productName: row.product_name || undefined,
      color: row.color || DEFAULT_MARKUP_COLOR,
    },
    count: row.count || 1,
    label: row.label || "1",
    subject: row.subject || undefined,
    notes: row.notes || undefined,
  };
}

function rowToMeasurement(row: CadManualMarkupRow): LinearMeasurement {
  return {
    id: row.id,
    pageNumber: row.page_number,
    start: row.start_point || { x: 0, y: 0 },
    end: row.end_point || { x: 0, y: 0 },
    material: {
      trade: row.trade || "",
      category: row.category || "",
      productId: row.product_id || undefined,
      productName: row.product_name || undefined,
      color: row.color || DEFAULT_MARKUP_COLOR,
    },
    lengthFeet: row.length_lf || 0,
    label: row.label || undefined,
    subject: row.subject || undefined,
    notes: row.notes || undefined,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export interface MarkupData {
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
}

/**
 * Save all markups for a project (replaces existing)
 */
export async function saveMarkups(
  projectId: string,
  data: MarkupData
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete existing markups for this project
    const deleteResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cad_manual_markups?project_id=eq.${projectId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error("Error deleting existing markups:", errorText);
      return { success: false, error: `Delete failed: ${deleteResponse.statusText}` };
    }

    // Prepare all rows
    const rows: Omit<CadManualMarkupRow, "id" | "created_at" | "updated_at">[] = [
      ...data.polygons.filter((p) => p.isComplete).map((p) => polygonToRow(p, projectId)),
      ...data.markers.map((m) => markerToRow(m, projectId)),
      ...data.measurements.map((m) => measurementToRow(m, projectId)),
    ];

    if (rows.length === 0) {
      return { success: true }; // Nothing to save
    }

    // Insert all markups
    const insertResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cad_manual_markups`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rows)
      }
    );

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error("Error inserting markups:", errorText);
      return { success: false, error: `Insert failed: ${insertResponse.statusText}` };
    }

    return { success: true };
  } catch (error) {
    console.error("Error saving markups:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Load all markups for a project
 */
export async function loadMarkups(
  projectId: string
): Promise<{ data: MarkupData | null; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cad_manual_markups?project_id=eq.${projectId}&select=*&order=page_number.asc,created_at.asc`,
      {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error loading markups:", errorText);
      return { data: null, error: `Load failed: ${response.statusText}` };
    }

    const rows = await response.json();

    if (!rows || rows.length === 0) {
      return { data: { polygons: [], markers: [], measurements: [] } };
    }

    // Convert rows to app types
    const polygons: Polygon[] = [];
    const markers: CountMarker[] = [];
    const measurements: LinearMeasurement[] = [];

    for (const row of rows as CadManualMarkupRow[]) {
      switch (row.markup_type) {
        case "polygon":
          polygons.push(rowToPolygon(row));
          break;
        case "marker":
          markers.push(rowToMarker(row));
          break;
        case "measurement":
          measurements.push(rowToMeasurement(row));
          break;
      }
    }

    return { data: { polygons, markers, measurements } };
  } catch (error) {
    console.error("Error loading markups:", error);
    return { data: null, error: String(error) };
  }
}

/**
 * Delete all markups for a project
 */
export async function deleteAllMarkups(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cad_manual_markups?project_id=eq.${projectId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error deleting markups:", errorText);
      return { success: false, error: `Delete failed: ${response.statusText}` };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting markups:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get markup count for a project (for UI display)
 */
export async function getMarkupCount(
  projectId: string
): Promise<{ count: number; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cad_manual_markups?project_id=eq.${projectId}&select=id`,
      {
        method: 'HEAD',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );

    if (!response.ok) {
      return { count: 0, error: `Count failed: ${response.statusText}` };
    }

    const contentRange = response.headers.get('content-range');
    // Format: "0-9/100" or "*/100" for count-only
    const count = contentRange ? parseInt(contentRange.split('/')[1]) : 0;

    return { count: count || 0 };
  } catch (error) {
    return { count: 0, error: String(error) };
  }
}
