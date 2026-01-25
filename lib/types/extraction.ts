// Extraction Detection System Types
// Matches production database schema

// =============================================================================
// Re-exports
// =============================================================================

// Polygon support for freeform shape editing
export type { PolygonPoint } from '@/lib/utils/polygonUtils';

// =============================================================================
// Polygon with Holes Support
// =============================================================================

/** Simple polygon point */
export interface SimplePolygonPoint {
  x: number;
  y: number;
}

/** Polygon with optional holes (for split detections) */
export interface PolygonWithHoles {
  outer: SimplePolygonPoint[];  // Outer boundary (clockwise)
  holes?: SimplePolygonPoint[][];  // Inner holes (counter-clockwise)
}

/** Polygon points can be simple array or polygon with holes */
export type PolygonPoints = SimplePolygonPoint[] | PolygonWithHoles;

/** Type guard to check if polygon has holes */
export function isPolygonWithHoles(points: PolygonPoints | null | undefined): points is PolygonWithHoles {
  return points !== null && points !== undefined && typeof points === 'object' && 'outer' in points;
}

// =============================================================================
// Literal Types
// =============================================================================

export type DetectionStatus = 'auto' | 'verified' | 'edited' | 'deleted';

// User-selectable classes (shown in dropdown)
export type DetectionClass =
  | 'window'
  | 'door'
  | 'garage'
  | 'siding'    // Facade/wall area - replaces exterior_wall in UI
  | 'roof'
  | 'gable'
  // Linear measurement classes (measured in LF)
  | 'trim'
  | 'fascia'
  | 'gutter'
  | 'eave'
  | 'rake'
  | 'ridge'
  | 'soffit'
  | 'valley'
  // Point classes (count only)
  | 'vent'
  | 'flashing'
  | 'downspout'
  | 'outlet'
  | 'hose_bib'
  | 'light_fixture'
  | 'corbel'
  | 'gable_vent'
  | 'belly_band'
  | 'corner_inside'
  | 'corner_outside'
  | 'shutter'
  | 'post'
  | 'column'
  | 'bracket'
  | '';

// Internal classes - used for calculations but not user-selectable
export type InternalDetectionClass = 'building' | 'exterior_wall';

// Combined type for database compatibility
export type AllDetectionClasses = DetectionClass | InternalDetectionClass;

export type PageType =
  | 'elevation'
  | 'floor_plan'
  | 'schedule'
  | 'cover'
  | 'detail'
  | 'section'
  | 'site_plan'
  | 'other';

export type ElevationName = 'front' | 'rear' | 'left' | 'right';

export type JobStatus =
  | 'converting'
  | 'classifying'
  | 'classified'  // Pages classified, ready for user review
  | 'processing'
  | 'complete'
  | 'approved'    // Detections approved, takeoff generated
  | 'failed';

export type EditType =
  | 'verify'
  | 'move'
  | 'resize'
  | 'delete'
  | 'reclassify'
  | 'create'
  | 'batch';

export type ToolMode = 'select' | 'create' | 'pan' | 'verify' | 'calibrate' | 'line' | 'point' | 'split';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

// Markup type for different detection shapes
export type MarkupType = 'polygon' | 'line' | 'point';

// =============================================================================
// Count Classes (for Point Tool dropdown)
// =============================================================================

export type CountClass =
  | 'corbel'
  | 'gable_vent'
  | 'roof_vent'
  | 'outlet'
  | 'hose_bib'
  | 'downspout'
  | 'light_fixture'
  | 'louver'
  | 'address_block'
  | 'decorative_bracket'
  | 'vent'
  | 'flashing'
  | 'shutter'
  | 'post'
  | 'column'
  | 'bracket'
  | 'other';

export const COUNT_CLASSES: { value: CountClass; label: string }[] = [
  { value: 'corbel', label: 'Corbel' },
  { value: 'gable_vent', label: 'Gable Vent' },
  { value: 'roof_vent', label: 'Roof Vent' },
  { value: 'outlet', label: 'Outlet' },
  { value: 'hose_bib', label: 'Hose Bib' },
  { value: 'downspout', label: 'Downspout' },
  { value: 'light_fixture', label: 'Light Fixture' },
  { value: 'louver', label: 'Louver' },
  { value: 'address_block', label: 'Address Block' },
  { value: 'decorative_bracket', label: 'Decorative Bracket' },
  { value: 'vent', label: 'Vent' },
  { value: 'flashing', label: 'Flashing' },
  { value: 'shutter', label: 'Shutter' },
  { value: 'post', label: 'Post' },
  { value: 'column', label: 'Column' },
  { value: 'bracket', label: 'Bracket' },
  { value: 'other', label: 'Other' },
];

// =============================================================================
// Database Entity Interfaces
// =============================================================================

export interface ExtractionJob {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: JobStatus;
  source_pdf_url: string | null;
  total_pages: number;
  elevation_count: number;
  created_at: string;
  completed_at: string | null;
  default_scale_ratio: number | null;
  plan_dpi: number | null;
  // Results from intelligent analysis and aggregation
  results_summary?: {
    // From intelligent analysis
    total_pages_analyzed?: number;
    successful?: number;
    failed?: number;
    total_time_seconds?: number;
    avg_time_per_page_ms?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    estimated_cost_usd?: number;
    page_type_counts?: Record<string, number>;
    element_totals?: {
      windows?: number;
      doors?: number;
      garages?: number;
      gables?: number;
      outside_corners?: number;
      inside_corners?: number;
    };
    // From aggregation service
    aggregation?: ExtractionJobTotals['aggregated_data'];
  };
}

export interface ExtractionPage {
  id: string;
  job_id: string;
  page_number: number;
  image_url: string;
  thumbnail_url: string | null;
  page_type: PageType | null;
  page_type_confidence: number | null;
  elevation_name: ElevationName | null;
  status: string;
  scale_ratio: number | null;
  dpi: number | null;
  // Original unmarked image (detection coordinates are in this space)
  original_image_url: string | null;
  original_width: number | null;
  original_height: number | null;
}

export interface ExtractionDetection {
  id: string;
  job_id: string;
  page_id: string;
  class: DetectionClass;
  detection_index: number;
  confidence: number;

  // Pixel coordinates (from ML model)
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;

  // Real-world measurements (calculated from scale)
  real_width_in: number | null;
  real_height_in: number | null;
  real_width_ft: number | null;
  real_height_ft: number | null;
  area_sf: number | null;
  perimeter_lf: number | null;

  // Additional properties
  is_triangle: boolean;
  matched_tag: string | null;
  created_at: string;

  // Edit tracking
  status: DetectionStatus;
  edited_by: string | null;
  edited_at: string | null;
  original_bbox: {
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
  } | null;

  // Polygon support (null = legacy rectangle mode)
  // When set, polygon_points contains absolute pixel coordinates for each vertex
  // The pixel_x/y/width/height fields become the bounding box of the polygon
  // Can be simple array of points or PolygonWithHoles for polygons with cut-outs
  polygon_points?: PolygonPoints | null;

  // Flag indicating this detection has a hole (for rendering optimization)
  has_hole?: boolean;

  // Markup type support (polygon = area, line = linear measurement, point = count marker)
  markup_type?: MarkupType;
  marker_label?: string | null;

  // Product assignment (for Properties Panel)
  assigned_material_id?: string | null;

  // Price overrides (user-edited prices that override pricing_items defaults)
  // Hierarchy: detection override > organization override > pricing_items base price
  material_cost_override?: number | null;
  labor_cost_override?: number | null;

  // User notes/comments
  notes?: string | null;
}

/** Material/product details for assigned detections */
export interface AssignedMaterial {
  id: string;
  sku: string;
  product_name: string;
  manufacturer: string | null;
  category: string;
  material_cost: number;
  labor_cost: number;
  unit: string;
}

export interface ExtractionElevationCalcs {
  id: string;
  job_id: string;
  page_id: string;
  elevation_name: string | null;

  // Counts
  window_count: number;
  door_count: number;
  garage_count: number;
  gable_count: number;
  roof_count: number;
  exterior_wall_count: number;

  // Area calculations
  gross_facade_sf: number;
  window_area_sf: number;
  door_area_sf: number;
  garage_area_sf: number;
  total_openings_sf: number;
  net_siding_sf: number;

  // Window perimeter measurements
  window_perimeter_lf: number;
  window_head_lf: number;
  window_jamb_lf: number;
  window_sill_lf: number;

  // Door perimeter measurements
  door_perimeter_lf: number;
  door_head_lf: number;
  door_jamb_lf: number;

  // Other measurements
  garage_head_lf: number;
  gable_rake_lf: number;
  roof_eave_lf: number;
  roof_rake_lf: number;

  // Scale info
  scale_ratio: number | null;
  dpi: number | null;
  confidence_avg: number | null;
}

export interface ExtractionJobTotals {
  id: string;
  job_id: string;
  elevation_count: number;
  elevations_processed: string[];

  // Counts
  total_windows: number;
  total_doors: number;
  total_garages: number;
  total_gables: number;

  // Area totals
  total_gross_facade_sf: number;
  total_openings_sf: number;
  total_net_siding_sf: number;

  // Window perimeter totals
  total_window_head_lf: number;
  total_window_jamb_lf: number;
  total_window_sill_lf: number;
  total_window_perimeter_lf: number;

  // Door perimeter totals
  total_door_head_lf: number;
  total_door_jamb_lf: number;
  total_door_perimeter_lf: number;

  // Other totals
  total_garage_head_lf: number;
  total_gable_rake_lf: number;
  total_roof_eave_lf: number;

  // Derived values
  siding_squares: number;
  calculation_version: string | null;

  // Corner data from intelligent analysis aggregation
  outside_corners_count?: number;
  inside_corners_count?: number;
  outside_corners_lf?: number;
  inside_corners_lf?: number;
  corner_source?: string;
  total_wall_height_ft?: number;
  height_source?: string;
  height_confidence?: number;

  // Full aggregated data from /aggregate-job (stored in job results_summary.aggregation)
  aggregated_data?: {
    corners?: {
      outside_count?: number;
      outside_count_confidence?: number;
      outside_count_source?: string;
      inside_count?: number;
      inside_count_confidence?: number;
      inside_count_source?: string;
    };
    heights?: {
      stories?: number;
      total_wall_height_ft?: number;
      height_source?: string;
      height_confidence?: number;
      story_heights?: Array<{ label: string; height_ft: number; source: string }>;
    };
    calculated?: {
      outside_corner_lf?: number;
      inside_corner_lf?: number;
      total_corner_lf?: number;
    };
    elements?: {
      windows?: { count_from_schedule?: number; count_from_elevations?: number; recommended_count?: number; source?: string };
      doors?: { count_from_schedule?: number; count_from_elevations?: number; recommended_count?: number; source?: string };
      gables?: { count?: number; confidence?: number; source?: string };
      garages?: { count?: number; position?: string; widths?: number[]; source?: string };
    };
    materials?: {
      siding_type?: string;
      siding_profile?: string;
      siding_exposure_inches?: number;
      source?: string;
    };
    spatial?: {
      stories?: number;
      roof_style?: string;
      roof_pitch?: string;
      foundation_type?: string;
      has_porch?: boolean;
      porch_type?: string;
    };
    quality?: {
      data_completeness?: number;
      missing_data?: string[];
      warnings?: string[];
    };
  };
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface DetectionEditRequest {
  job_id: string;
  page_id: string;
  edit_type: EditType;
  detection_id?: string;
  changes?: Partial<{
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
    class: DetectionClass;
    status: DetectionStatus;
  }>;
  user_id?: string;
  scale_ratio?: number;
  dpi?: number;
}

export interface DetectionEditResponse {
  success: boolean;
  edit_type: EditType;
  detection_id: string | null;
  updated_detection: ExtractionDetection | null;
  elevation_totals: ExtractionElevationCalcs | null;
  job_totals: ExtractionJobTotals | null;
  timestamp: string;
  error?: string;
}

// =============================================================================
// UI State Types
// =============================================================================

export interface DetectionWithUI extends ExtractionDetection {
  isSelected?: boolean;
  isHovered?: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
}

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// =============================================================================
// Constants
// =============================================================================

export const DETECTION_CLASS_COLORS: Record<DetectionClass | InternalDetectionClass, string> = {
  window: '#3B82F6',         // Blue
  door: '#F59E0B',           // Amber
  garage: '#6366F1',         // Indigo
  siding: '#6B7280',         // Grey (gray-500)
  roof: '#EF4444',           // Red
  gable: '#EC4899',          // Pink
  // Linear measurement classes (LF)
  trim: '#8B5CF6',           // Violet
  fascia: '#F97316',         // Orange
  gutter: '#06B6D4',         // Cyan
  eave: '#84CC16',           // Lime
  rake: '#EC4899',           // Pink
  ridge: '#EF4444',          // Red
  soffit: '#14B8A6',         // Teal
  valley: '#7C3AED',         // Purple
  // Point classes (count only)
  vent: '#0EA5E9',           // Sky blue
  flashing: '#F97316',       // Orange
  downspout: '#06B6D4',      // Cyan
  outlet: '#FACC15',         // Yellow
  hose_bib: '#22C55E',       // Green
  light_fixture: '#FBBF24',  // Amber
  corbel: '#D97706',         // Amber-600
  gable_vent: '#7C3AED',     // Violet-600
  belly_band: '#DC2626',     // Red-600
  corner_inside: '#059669',  // Emerald-600
  corner_outside: '#0D9488', // Teal-600
  shutter: '#4F46E5',        // Indigo-600
  post: '#9333EA',           // Purple-600
  column: '#2563EB',         // Blue-600
  bracket: '#CA8A04',        // Yellow-600
  // Internal classes
  building: '#8B5CF6',       // Purple (internal)
  exterior_wall: '#10B981',  // Same as siding (legacy compatibility)
  '': '#6B7280',             // Gray - unclassified
};

/** Classes that users can select in the UI dropdown */
export const USER_SELECTABLE_CLASSES: DetectionClass[] = [
  // Area classes (SF)
  'siding',
  'window',
  'door',
  'garage',
  'roof',
  'gable',
  // Linear classes (LF)
  'trim',
  'fascia',
  'gutter',
  'eave',
  'rake',
  'ridge',
  'soffit',
  'valley',
  // Point classes (count only)
  'vent',
  'flashing',
  'downspout',
  'outlet',
  'hose_bib',
  'light_fixture',
  'corbel',
  'gable_vent',
  'belly_band',
  // Note: corner_inside and corner_outside are excluded from user selection
  // They come from floor plan analysis, not manual markup
  'shutter',
  'post',
  'column',
  'bracket',
];

/** Measurement type for each detection class - used to filter classes by tool type */
export const CLASS_MEASUREMENT_TYPES: Record<DetectionClass, 'area' | 'linear' | 'count'> = {
  // Area classes (SF) - measured in square feet
  siding: 'area',
  window: 'area',
  door: 'area',
  garage: 'area',
  roof: 'area',
  gable: 'area',
  soffit: 'area',  // Soffit is measured in SF (area), not LF
  // Linear classes (LF) - measured in linear feet
  trim: 'linear',
  fascia: 'linear',
  gutter: 'linear',
  eave: 'linear',
  rake: 'linear',
  ridge: 'linear',
  valley: 'linear',
  // Point/Count classes (EA) - measured by count
  vent: 'count',
  flashing: 'count',
  downspout: 'count',
  outlet: 'count',
  hose_bib: 'count',
  light_fixture: 'count',
  corbel: 'count',
  gable_vent: 'count',
  belly_band: 'linear',
  corner_inside: 'count',
  corner_outside: 'count',
  shutter: 'count',
  post: 'count',
  column: 'count',
  bracket: 'count',
  '': 'area', // Default for unclassified
};

/** Get classes filtered by measurement type */
export function getClassesByMeasurementType(type: 'area' | 'linear' | 'count'): DetectionClass[] {
  return USER_SELECTABLE_CLASSES.filter(cls => CLASS_MEASUREMENT_TYPES[cls] === type);
}

export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  medium: 0.7,
  low: 0.5,
} as const;

export const STATUS_CONFIG: Record<
  DetectionStatus,
  { label: string; color: string; icon: string }
> = {
  auto: { label: 'Auto-detected', color: '#6B7280', icon: 'cpu' },
  verified: { label: 'Verified', color: '#10B981', icon: 'check-circle' },
  edited: { label: 'Edited', color: '#F59E0B', icon: 'pencil' },
  deleted: { label: 'Deleted', color: '#EF4444', icon: 'trash' },
};

// =============================================================================
// Class Normalization (backend aliases → frontend canonical classes)
// =============================================================================

/**
 * Maps backend/ML detection class names to canonical frontend DetectionClass values.
 * This handles variations from:
 * - Python ML models (snake_case: "exterior_wall", "gable_vent")
 * - Backend services (mixed case, spaces: "Exterior Wall", "Gable Vent")
 * - Legacy data (old class names)
 */
export const CLASS_ALIAS_MAP: Record<string, DetectionClass> = {
  // Siding/Wall aliases
  'exterior wall': 'siding',
  'exterior_wall': 'siding',
  'wall': 'siding',
  'facade': 'siding',
  'cladding': 'siding',

  // Gable aliases
  'gable end': 'gable',
  'gable_end': 'gable',
  'gable wall': 'gable',
  'gable_wall': 'gable',

  // Window aliases
  'windows': 'window',

  // Door aliases
  'doors': 'door',
  'entry door': 'door',
  'entry_door': 'door',

  // Garage aliases
  'garage door': 'garage',
  'garage_door': 'garage',

  // Roof aliases
  'roofing': 'roof',
  'roof area': 'roof',
  'roof_area': 'roof',

  // Trim aliases
  'window trim': 'trim',
  'window_trim': 'trim',
  'door trim': 'trim',
  'door_trim': 'trim',

  // Fascia aliases
  'fascia board': 'fascia',
  'fascia_board': 'fascia',

  // Gutter aliases
  'gutters': 'gutter',
  'rain gutter': 'gutter',
  'rain_gutter': 'gutter',

  // Eave aliases
  'eaves': 'eave',
  'roof eave': 'eave',
  'roof_eave': 'eave',

  // Rake aliases
  'rakes': 'rake',
  'gable rake': 'rake',
  'gable_rake': 'rake',
  'roof rake': 'rake',
  'roof_rake': 'rake',

  // Ridge aliases
  'ridges': 'ridge',
  'roof ridge': 'ridge',
  'roof_ridge': 'ridge',

  // Soffit aliases
  'soffits': 'soffit',
  'eave soffit': 'soffit',
  'eave_soffit': 'soffit',

  // Valley aliases
  'valleys': 'valley',
  'roof valley': 'valley',
  'roof_valley': 'valley',

  // Vent aliases
  'vents': 'vent',
  'roof vent': 'vent',
  'roof_vent': 'vent',

  // Flashing aliases
  'flashings': 'flashing',
  'step flashing': 'flashing',
  'step_flashing': 'flashing',

  // Downspout aliases
  'downspouts': 'downspout',
  'down spout': 'downspout',
  'down_spout': 'downspout',

  // Outlet aliases
  'outlets': 'outlet',
  'electrical outlet': 'outlet',
  'electrical_outlet': 'outlet',

  // Hose bib aliases
  'hose bib': 'hose_bib',
  'hosebib': 'hose_bib',
  'hose bibb': 'hose_bib',
  'spigot': 'hose_bib',

  // Light fixture aliases
  'light fixture': 'light_fixture',
  'light': 'light_fixture',
  'exterior light': 'light_fixture',
  'exterior_light': 'light_fixture',

  // Corbel aliases
  'corbels': 'corbel',

  // Gable vent aliases
  'gable vent': 'gable_vent',
  'gable_vents': 'gable_vent',
  'gable vents': 'gable_vent',

  // Belly band aliases
  'belly band': 'belly_band',
  'bellyband': 'belly_band',
  'band board': 'belly_band',
  'band_board': 'belly_band',

  // Corner aliases
  'corner inside': 'corner_inside',
  'inside corner': 'corner_inside',
  'inside_corner': 'corner_inside',
  'interior corner': 'corner_inside',
  'interior_corner': 'corner_inside',

  'corner outside': 'corner_outside',
  'outside corner': 'corner_outside',
  'outside_corner': 'corner_outside',
  'exterior corner': 'corner_outside',
  'exterior_corner': 'corner_outside',

  // Shutter aliases
  'shutters': 'shutter',
  'window shutter': 'shutter',
  'window_shutter': 'shutter',

  // Post aliases
  'posts': 'post',
  'porch post': 'post',
  'porch_post': 'post',

  // Column aliases
  'columns': 'column',
  'porch column': 'column',
  'porch_column': 'column',

  // Bracket aliases
  'brackets': 'bracket',
  'decorative bracket': 'bracket',
  'decorative_bracket': 'bracket',
};

/**
 * Normalizes a class name to a canonical DetectionClass.
 * Handles null/undefined, case differences, and known aliases.
 *
 * @param className - Raw class name from backend/ML/database
 * @returns Canonical DetectionClass or '' if unrecognized
 */
export function normalizeClass(className: string | undefined | null): DetectionClass {
  if (!className) return '';

  const normalized = className.toLowerCase().trim();

  // Check alias map first
  if (CLASS_ALIAS_MAP[normalized]) {
    return CLASS_ALIAS_MAP[normalized];
  }

  // Check if it's already a valid DetectionClass
  if (USER_SELECTABLE_CLASSES.includes(normalized as DetectionClass)) {
    return normalized as DetectionClass;
  }

  // Check internal classes (building, exterior_wall)
  if (normalized === 'building' || normalized === 'exterior_wall') {
    // Map internal classes to their display equivalents
    return normalized === 'exterior_wall' ? 'siding' : '' as DetectionClass;
  }

  return '';
}

/**
 * Gets the display label for a detection class.
 * Normalizes the class first, then formats for display.
 *
 * @param className - Raw class name
 * @returns Human-readable label (e.g., "Exterior Wall" for "siding")
 */
export function getClassDisplayLabel(className: string | undefined | null): string {
  const normalized = normalizeClass(className);
  if (!normalized) return 'Unclassified';

  return normalized
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// Phase 4 Enhanced Data Types (from extraction-api)
// =============================================================================

export interface WallHeightsData {
  first_floor_ft: number;
  second_floor_ft: number | null;
  total_wall_height_ft: number;
  story_count: number;
  source: 'ocr' | 'estimated';
  heights_by_elevation?: Record<string, { floor: string; height_ft: number }[]>;
}

export interface CornerCalculations {
  outside_corners_count: number;
  inside_corners_count: number;
  outside_corners_lf: number;
  inside_corners_lf: number;
  total_corner_lf: number;
  corner_posts_needed: number;
  j_channel_pieces_needed: number;
  wall_height_used_ft: number;
}

export interface PerimeterElements {
  building_perimeter_lf: number;
  starter_strip_lf: number;
  starter_strip_pieces: number;
  water_table_lf: number;
  band_board_lf: number;
  frieze_board_lf: number;
}

export interface Phase4Data {
  wall_heights: WallHeightsData;
  corners: CornerCalculations;
  perimeter: PerimeterElements;
  trim_totals?: {
    window_perimeter_lf: number;
    door_perimeter_lf: number;
    gable_rake_lf: number;
  };
}

// ============================================
// LABOR INTERFACES (Mike Skjei methodology)
// ============================================

/**
 * Individual labor line item from squares-based calculation
 */
export interface LaborLineItem {
  rate_id: string;
  rate_name: string;
  description: string;
  quantity: number;        // In squares (SQ)
  unit: string;            // 'SQ' = 100 SF
  unit_cost: number;       // $/SQ
  total_cost: number;      // quantity * unit_cost
  notes?: string;
}

/**
 * Labor section of calculation response
 */
export interface LaborSection {
  installation_items: LaborLineItem[];
  installation_subtotal: number;
}

// ============================================
// OVERHEAD INTERFACES
// ============================================

/**
 * Individual overhead cost line item
 */
export interface OverheadLineItem {
  cost_id: string;
  cost_name: string;
  description: string;
  category: string;        // 'labor_burden', 'equipment', 'setup', etc.
  quantity?: number;
  unit?: string;
  rate?: number;
  amount: number;
  calculation_type: string; // 'percentage', 'calculated', 'flat_fee', 'per_day'
  notes?: string;
}

/**
 * Overhead section of calculation response
 */
export interface OverheadSection {
  items: OverheadLineItem[];
  subtotal: number;
}

// ============================================
// PROJECT TOTALS INTERFACE
// ============================================

/**
 * Full project totals breakdown following Mike Skjei methodology
 */
export interface ProjectTotals {
  // Materials
  material_cost: number;
  material_markup_rate: number;      // 0.26 (26%)
  material_markup_amount: number;
  material_total: number;

  // Labor breakdown
  installation_labor_subtotal: number;
  overhead_subtotal: number;
  labor_cost_before_markup: number;  // installation + overhead
  labor_markup_rate: number;         // 0.26 (26%)
  labor_markup_amount: number;
  labor_total: number;

  // Final totals
  subtotal: number;                  // material_total + labor_total
  project_insurance: number;         // $24.38 per $1,000
  grand_total: number;               // subtotal + project_insurance
}

// ============================================
// CALCULATION METADATA
// ============================================

/**
 * Enhanced metadata from calculation API
 */
export interface CalculationMetadata {
  pricing_method: 'hybrid-v2';
  calculation_method: string;        // 'mike_skjei_v1'
  markup_rate: number;               // 0.26
  crew_size: number;                 // Default: 4
  estimated_weeks: number;           // Default: 2
  items_before_consolidation: number;
  items_after_consolidation: number;
  has_auto_scope_items: boolean;
  total_auto_scope_items: number;
  total_assigned_items: number;
  total_pricing_lookups: number;
  pricing_lookup_success_rate: number;
  warnings?: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'very_low';

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (confidence >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'very_low';
}

/**
 * Gets the color for a detection class.
 * Normalizes the class first to handle aliases, then looks up color.
 *
 * @param detectionClass - Raw class name (can be alias or canonical)
 * @returns Hex color code for the class
 */
export function getDetectionColor(detectionClass: DetectionClass | InternalDetectionClass | string | null | undefined): string {
  // Handle internal classes directly (they have their own colors)
  if (detectionClass === 'building' || detectionClass === 'exterior_wall') {
    return DETECTION_CLASS_COLORS[detectionClass];
  }

  // Normalize to canonical class
  const normalized = normalizeClass(detectionClass as string);

  return DETECTION_CLASS_COLORS[normalized] ?? DETECTION_CLASS_COLORS[''];
}

// =============================================================================
// Live Derived Totals (calculated from current page detections)
// =============================================================================

export interface LiveDerivedTotals {
  // FACADE (building/exterior wall)
  buildingCount: number;
  buildingAreaSf: number;
  buildingPerimeterLf: number;
  buildingLevelStarterLf: number;
  // WINDOWS
  windowCount: number;
  windowAreaSf: number;
  windowPerimeterLf: number;
  windowHeadLf: number;
  windowJambLf: number;
  windowSillLf: number;
  // DOORS
  doorCount: number;
  doorAreaSf: number;
  doorPerimeterLf: number;
  doorHeadLf: number;
  doorJambLf: number;
  // GARAGES
  garageCount: number;
  garageAreaSf: number;
  garagePerimeterLf: number;
  garageHeadLf: number;
  garageJambLf: number;
  // GABLES
  gableCount: number;
  gableAreaSf: number;
  gableRakeLf: number;
  // CORNERS
  insideCornerCount: number;
  insideCornerLf: number;
  outsideCornerCount: number;
  outsideCornerLf: number;
  // ROOFLINE (line-type measurements)
  eavesCount: number;
  eavesLf: number;
  rakesCount: number;
  rakesLf: number;
  ridgeCount: number;
  ridgeLf: number;
  valleyCount: number;
  valleyLf: number;
  // SOFFIT (area)
  soffitCount: number;
  soffitAreaSf: number;
  // FASCIA (line)
  fasciaCount: number;
  fasciaLf: number;
  // BELLY BAND (line)
  bellyBandCount: number;
  bellyBandLf: number;
  // GUTTERS
  gutterCount: number;
  gutterLf: number;
  downspoutCount: number;
  // SIDING (net area = building - openings)
  sidingNetSf: number;
  // COUNTS (point markers grouped by class)
  countsByClass: Record<string, number>;
  totalPointCount: number;
}

// =============================================================================
// Material Assignment (for ID-based pricing lookup)
// =============================================================================

export interface MaterialAssignment {
  detection_id: string;
  detection_class: string;
  pricing_item_id: string;  // UUID from pricing_items.id
  quantity: number;
  unit: 'SF' | 'LF' | 'EA';
  area_sf?: number | null;
  perimeter_lf?: number | null;
  // Price overrides (user-edited prices that override pricing_items defaults)
  material_cost_override?: number | null;
  labor_cost_override?: number | null;
}

// =============================================================================
// Approve & Calculate Webhook Payload
// =============================================================================

export interface ApprovePayload {
  job_id: string;
  project_id?: string;
  project_name?: string;
  client_name?: string;
  address?: string;

  // Which trades to calculate (default: ['siding'])
  selected_trades: string[];

  facade: {
    gross_area_sf: number;
    net_siding_sf: number;
    perimeter_lf: number;
    level_starter_lf: number;
  };

  windows: {
    count: number;
    area_sf: number;
    perimeter_lf: number;
    head_lf: number;
    jamb_lf: number;
    sill_lf: number;
  };

  doors: {
    count: number;
    area_sf: number;
    perimeter_lf: number;
    head_lf: number;
    jamb_lf: number;
  };

  garages: {
    count: number;
    area_sf: number;
    perimeter_lf: number;
    head_lf: number;
    jamb_lf: number;
  };

  trim: {
    total_head_lf: number;
    total_jamb_lf: number;
    total_sill_lf: number;
    total_trim_lf: number;
  };

  corners: {
    outside_count: number;
    outside_lf: number;
    inside_count: number;
    inside_lf: number;
  };

  gables: {
    count: number;
    area_sf: number;
    rake_lf: number;
  };

  // Minimal product config - n8n uses auto-scope rules and DB defaults
  products: {
    color: string | null;
    profile: string;
  };

  // NEW: Material assignments from detections (for ID-based pricing)
  material_assignments?: MaterialAssignment[];

  // NEW: Organization context for multi-tenant pricing
  organization_id?: string;

  // Detection counts by class (corbels, brackets, belly_bands, etc.)
  detection_counts?: Record<string, {
    count: number;
    total_lf?: number;  // For linear measurement types (e.g., belly_band)
    display_name: string;
    measurement_type: 'count' | 'area' | 'linear';
    unit: string;
  }>;

  // Total point markers count
  total_point_count?: number;
}

// =============================================================================
// Approval Result (response from n8n webhook)
// =============================================================================

export interface ApprovalResult {
  success: boolean;
  takeoff_id: string;
  pricing_snapshot_id?: string | null;   // For audit trail - which pricing snapshot was used
  organization_id?: string | null;        // For multi-tenant support
  sections_created: number;
  line_items_created: number;
  line_items_failed: number;
  trades_processed: string[];
  totals: {
    material_cost: number;
    labor_cost: number;
    overhead_cost: number;
    subtotal: number;
    markup_percent: number;
    markup_amount?: number;              // Calculated markup dollar amount
    final_price?: number;                // subtotal + markup_amount
  };
  // NEW fields for V2 response
  labor?: LaborSection;
  overhead?: OverheadSection;
  project_totals?: ProjectTotals;
}

// =============================================================================
// OCR Data Types (for Plan Intelligence)
// =============================================================================

/** Window schedule entry extracted from OCR */
export interface ScheduleWindow {
  mark: string;           // e.g., "W1", "A", "101"
  size: string;           // e.g., "3'-0\" x 4'-0\""
  quantity: number;
  type: string;           // e.g., "double hung", "casement", "fixed"
  notes?: string;         // e.g., "tempered glass", "egress"
}

/** Door schedule entry extracted from OCR */
export interface ScheduleDoor {
  mark: string;           // e.g., "D1", "1", "A"
  size: string;           // e.g., "3'-0\" x 6'-8\""
  quantity: number;
  type: string;           // e.g., "entry", "interior", "garage"
  notes?: string;         // e.g., "fiberglass", "fire rated"
}

/** Skylight schedule entry extracted from OCR */
export interface ScheduleSkylight {
  mark: string;           // e.g., "SK1", "SKY-1"
  size: string;           // e.g., "2'-0\" x 4'-0\""
  quantity: number;
  type: string;           // e.g., "fixed", "venting"
  notes?: string;         // e.g., "tempered", "Low-E"
}

/** Garage door schedule entry extracted from OCR */
export interface ScheduleGarage {
  mark: string;           // e.g., "G1", "111B"
  size: string;           // e.g., "16'-0\" x 7'-0\""
  quantity: number;
  type: string;           // e.g., "sectional", "roll-up"
  notes?: string;         // e.g., "insulated", "with windows"
}

/** Material callout extracted from OCR */
export interface MaterialCallout {
  id: string;
  rawText: string;        // Original text as found
  normalizedText?: string; // Cleaned/standardized version
  trade: string;          // e.g., "siding", "trim", "roofing"
  materialType?: string;  // e.g., "lap_siding", "fascia"
  manufacturer?: string;  // e.g., "James Hardie"
  productMatch?: string;  // Matched product_catalog.id if found
  confidence: number;     // 0-1 confidence score
  pageRef?: string;       // Page reference (e.g., "Page 3")
  bbox?: {               // Bounding box in image coordinates
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Dimension value extracted from OCR */
export interface ExtractedDimension {
  id: string;
  category: string;       // e.g., "wall_height", "exposure", "opening"
  label: string;          // e.g., "First Floor Height", "Siding Exposure"
  value: string;          // e.g., "9'-0\"", "7\""
  numericValue?: number;  // Parsed numeric value in inches
  unit?: string;          // e.g., "ft", "in"
  source: string;         // e.g., "ocr", "estimated"
  confidence: number;
  pageRef?: string;
}

/** Note/specification extracted from OCR */
export interface ExtractedNote {
  id: string;
  category: string;       // e.g., "general", "installation", "material"
  text: string;
  pageRef?: string;
}

/** Schedule OCR extraction result */
export interface ScheduleOCRData {
  windows: ScheduleWindow[];
  doors: ScheduleDoor[];
  skylights?: ScheduleSkylight[];
  garages?: ScheduleGarage[];
  totals: {
    windows: number;
    doors: number;
    skylights?: number;
    garages?: number;
  };
  confidence: number;
  extraction_notes?: string;
  is_schedule_page?: boolean;  // false if page is not a schedule (e.g., energy code)
  extracted_at: string;
  model_used?: string;
  tokens_used?: number;
}

/** Complete OCR data for a page */
export interface PageOCRData {
  schedule?: ScheduleOCRData;
  materialCallouts?: MaterialCallout[];
  dimensions?: ExtractedDimension[];
  notes?: ExtractedNote[];
  extraction_status: 'pending' | 'processing' | 'complete' | 'failed';
  extraction_error?: string;
  last_extracted_at?: string;
}

/** OCR status for tracking extraction state */
export type OCRStatus = 'pending' | 'processing' | 'complete' | 'failed';

// =============================================================================
// Enhanced Two-Pass Material Extraction Types (V2)
// =============================================================================

/** Text annotation from survey pass */
export interface TextAnnotation {
  id: number;
  exactText: string;
  location: string;
  hasLeaderLine: boolean;
  pointsTo: string;
  textType: 'material_spec' | 'dimension' | 'note' | 'label' | 'title' | 'other';
}

/** Survey pass result from V2 extraction */
export interface SurveyResult {
  annotations: TextAnnotation[];
  totalFound: number;
  materialSpecs: number;
  dimensions: number;
  other: number;
  imageQuality: 'good' | 'fair' | 'poor';
  notes: string;
}

/** Parsed material dimensions */
export interface MaterialDimensions {
  exposure_inches: number | null;
  thickness_inches: number | null;
  width_inches: number | null;
  length_feet: number | null;
}

/** Enhanced material callout with full classification details */
export interface EnhancedMaterialCallout {
  id: string;
  rawText: string;
  normalizedText: string;
  trade: string;
  materialType: string;
  manufacturer: string | null;
  productLine: string | null;
  profile: 'smooth' | 'cedar_mill' | 'stucco' | 'beaded' | 'select_cedarmill' | string | null;
  finish: 'primed' | 'colorplus' | 'prefinished' | 'painted' | 'stained' | string | null;
  color: string | null;
  dimensions: MaterialDimensions;
  orientation: 'horizontal' | 'vertical' | null;
  installationNotes: string | null;
  confidence: number;
  confidenceNotes: string;
  alternatives: string[];
  // Metadata
  pageId: string;
  pageNumber: number;
  surveyData: TextAnnotation;
  // Product matching (populated later)
  productMatch?: string;
}

/** V2 extraction result stored in database */
export interface MaterialExtractionV2Result {
  version: 'v2';
  surveyResult: SurveyResult;
  classifiedMaterials: EnhancedMaterialCallout[];
  finalCallouts: EnhancedMaterialCallout[];
  extractedAt: string;
  modelUsed: string;
  totalTokensUsed: number;
  processingTimeMs: number;
  stats: {
    totalAnnotationsFound: number;
    materialSpecsFound: number;
    classificationCalls: number;
    finalCalloutsAfterDedup: number;
  };
}

/** Classification request for a single annotation */
export interface ClassificationRequest {
  annotation: TextAnnotation;
  imageUrl: string;
  pageId: string;
  pageNumber: number;
}

/** Trade types for material classification */
export type MaterialTrade =
  | 'siding'
  | 'trim'
  | 'roofing'
  | 'fascia'
  | 'soffit'
  | 'gutter'
  | 'insulation'
  | 'sheathing'
  | 'weather_barrier'
  | 'flashing'
  | 'miscellaneous';

/** Material types by trade */
export const MATERIAL_TYPES_BY_TRADE: Record<MaterialTrade, string[]> = {
  siding: [
    'lap_siding', 'panel_siding', 'board_and_batten', 'shake', 'shingle',
    'stucco', 'stone_veneer', 'brick_veneer', 'vertical_siding'
  ],
  trim: [
    'flat_trim', 'crown_molding', 'base_trim', 'window_trim', 'door_trim',
    'corner_board', 'band_board', 'frieze_board', 'rake_trim'
  ],
  roofing: [
    'asphalt_shingle', 'metal_panel', 'standing_seam', 'slate', 'tile',
    'flat_membrane', 'rolled_roofing'
  ],
  fascia: ['fascia_board', 'composite_fascia', 'aluminum_fascia'],
  soffit: ['vented_soffit', 'solid_soffit', 'aluminum_soffit', 'vinyl_soffit'],
  gutter: ['k_style', 'half_round', 'box_gutter', 'seamless'],
  insulation: ['batt_insulation', 'blown_insulation', 'rigid_foam', 'spray_foam'],
  sheathing: ['osb', 'plywood', 'zip_system', 'densglass'],
  weather_barrier: ['house_wrap', 'felt_paper', 'self_adhered', 'rain_screen'],
  flashing: ['step_flashing', 'counter_flashing', 'drip_edge', 'valley_flashing'],
  miscellaneous: ['other']
};

/** Known manufacturer keywords for recognition */
export const MANUFACTURER_KEYWORDS: Record<string, string[]> = {
  'James Hardie': ['hardie', 'hardieplank', 'hardipanel', 'hardietrim', 'artisan', 'colorplus'],
  'LP Building Products': ['lp', 'smartside', 'smarttrim', 'smart side', 'smart trim'],
  'CertainTeed': ['certainteed', 'landmark', 'presidential', 'northgate'],
  'GAF': ['gaf', 'timberline', 'hdz', 'camelot', 'grand sequoia'],
  'Owens Corning': ['owens corning', 'oc', 'duration', 'trudefinition', 'oakridge'],
  'DuPont': ['tyvek', 'homewrap', 'commercialwrap', 'dupont'],
  'Huber': ['zip', 'zip system', 'advantech', 'huber'],
  'Boral': ['boral', 'truexterior'],
  'Royal': ['royal', 'celect'],
  'Azek': ['azek', 'timbertech'],
  'Ply Gem': ['plygem', 'ply gem', 'mastic'],
  'Georgia-Pacific': ['densglass', 'gp', 'georgia pacific'],
};

// =============================================================================
// Wall Assembly Extraction Types (Phase 2 - Section Page Analysis)
// =============================================================================

/** Individual layer within a wall assembly (exterior to interior order) */
export interface WallLayer {
  /** Position in assembly (1 = outermost, higher = further interior) */
  position: number;
  /** Descriptive name for the layer (e.g., "Exterior Cladding", "Air Gap") */
  layerName: string;
  /** Material specification (e.g., "Fiber Cement Siding", "OSB Sheathing") */
  material: string;
  /** Manufacturer if identified (e.g., "James Hardie") */
  manufacturer: string | null;
  /** Product line if identified (e.g., "HardiePlank") */
  productLine: string | null;
  /** Thickness of layer (e.g., "5/16\"", "1/2\"", "3-1/2\"") */
  thickness: string | null;
  /** R-value for insulation layers */
  rValue: number | null;
  /** Additional notes about the layer */
  notes: string | null;
  /** Confidence score for this layer extraction (0-1) */
  confidence: number;
}

/** Complete wall assembly extracted from section drawing */
export interface WallAssembly {
  /** Unique identifier */
  id: string;
  /** Assembly name/type (e.g., "Typical Exterior Wall", "Garage Wall") */
  assemblyName: string;
  /** Ordered layers from exterior to interior */
  layers: WallLayer[];
  /** Total assembly thickness (e.g., "6-1/4\"") */
  totalThickness: string | null;
  /** Framing type (e.g., "2x4", "2x6", "Steel Stud") */
  framingType: string | null;
  /** Framing spacing (e.g., "16\" O.C.", "24\" O.C.") */
  framingSpacing: string | null;
  /** Primary insulation type (e.g., "Fiberglass Batt", "Spray Foam") */
  insulationType: string | null;
  /** Total R-value of insulation */
  insulationRValue: number | null;
  /** Vapor barrier specification */
  vaporBarrier: string | null;
  /** Fire rating if specified (e.g., "1-hour", "2-hour") */
  fireRating: string | null;
  /** Acoustic rating if specified (e.g., "STC 45") */
  acousticRating: string | null;
  /** General notes about the assembly */
  notes: string | null;
  /** Overall confidence for the extraction */
  confidence: number;
  /** Notes explaining confidence score */
  confidenceNotes: string;
  /** Page reference (e.g., "Page 12") */
  pageRef: string;
}

/** Result from wall assembly extraction API */
export interface WallAssemblyExtractionResult {
  /** Whether wall assembly sections were found */
  hasWallSections: boolean;
  /** Extracted wall assemblies */
  assemblies: WallAssembly[];
  /** Raw section detail data */
  sectionDetails: {
    sectionTitle: string;
    sectionNumber: string | null;
    scale: string | null;
  }[];
  /** Extraction metadata */
  extractedAt: string;
  /** Model used for extraction */
  modelUsed: string;
  /** Total tokens consumed */
  tokensUsed: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Notes about the extraction */
  extractionNotes: string | null;
}

// =============================================================================
// Roof Plan Extraction Types (Phase 3 - Roof Plan Analysis)
// =============================================================================

/** Individual roof slope/section */
export interface RoofSlope {
  /** Unique identifier */
  id: string;
  /** Name of the slope (e.g., "Main Roof", "Garage Roof", "Porch") */
  name: string;
  /** Pitch notation (e.g., "6:12", "8:12", "4:12") */
  pitch: string;
  /** Pitch in degrees (e.g., 26.57 for 6:12) */
  pitchDegrees: number | null;
  /** Area in square feet */
  areaSF: number | null;
  /** Additional notes */
  notes: string | null;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Linear roof element (ridge, hip, valley, etc.) */
export interface RoofLinearElement {
  /** Type of linear element */
  type: 'ridge' | 'hip' | 'valley' | 'eave' | 'rake' | 'gutter_line' | 'drip_edge';
  /** Length in linear feet */
  lengthLF: number;
  /** Location description (e.g., "main ridge", "north eave") */
  location: string | null;
  /** Additional notes */
  notes: string | null;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Roof feature (skylight, chimney, vent, etc.) */
export interface RoofFeature {
  /** Type of feature */
  type: 'skylight' | 'chimney' | 'vent' | 'dormer' | 'cricket' | 'solar_panel' | 'other';
  /** Quantity of this feature */
  quantity: number;
  /** Size description (e.g., "2'-6\" x 4'-0\"") */
  size: string | null;
  /** Location on roof */
  location: string | null;
  /** Additional notes */
  notes: string | null;
}

/** Roofing material callout from roof plan */
export interface RoofMaterialCallout {
  /** Raw text as found on drawing */
  rawText: string;
  /** Material type classification */
  materialType: 'asphalt_shingle' | 'metal' | 'tile' | 'flat' | 'slate' | 'wood_shake' | string | null;
  /** Manufacturer if identified */
  manufacturer: string | null;
  /** Product line if identified */
  productLine: string | null;
  /** Color if specified */
  color: string | null;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Summary of linear elements for quick reference */
export interface RoofLinearSummary {
  /** Total ridge length in LF */
  ridgeLF: number;
  /** Total hip length in LF */
  hipLF: number;
  /** Total valley length in LF */
  valleyLF: number;
  /** Total eave length in LF */
  eaveLF: number;
  /** Total rake length in LF */
  rakeLF: number;
  /** Total perimeter (eave + rake) in LF */
  totalPerimeterLF: number;
}

/** Complete roof plan data extracted from a page */
export interface RoofPlanData {
  /** Unique identifier */
  id: string;
  /** Page reference (e.g., "Page 9") */
  pageRef: string;
  /** Primary/most common pitch */
  primaryPitch: string | null;
  /** Total roof area in SF */
  totalRoofAreaSF: number | null;
  /** Individual roof slopes/sections */
  slopes: RoofSlope[];
  /** Linear elements (ridge, hip, valley, etc.) */
  linearElements: RoofLinearElement[];
  /** Summary totals for linear elements */
  linearSummary: RoofLinearSummary;
  /** Roof features (skylights, chimneys, etc.) */
  features: RoofFeature[];
  /** Material callouts found on roof plan */
  materialCallouts: RoofMaterialCallout[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Notes explaining confidence */
  confidenceNotes: string;
  /** General extraction notes */
  extractionNotes: string;
  /** Extraction timestamp */
  extractedAt?: string;
  /** Model version */
  version?: string;
  /** Model used */
  model_used?: string;
  /** Tokens consumed */
  tokens_used?: number;
}

/** Result from roof plan extraction API */
export interface RoofPlanExtractionResult {
  /** Extracted roof plan data (usually one per job) */
  roofPlans: RoofPlanData[];
  /** Aggregated totals across all roof plans */
  aggregated: {
    totalRoofAreaSF: number;
    primaryPitch: string | null;
    ridgeLF: number;
    hipLF: number;
    valleyLF: number;
    eaveLF: number;
    rakeLF: number;
    skylightCount: number;
    chimneyCount: number;
  };
  /** Extraction timestamp */
  extractedAt: string;
  /** API version */
  version: string;
}

// =============================================================================
// Floor Plan Extraction Types (Phase 4 - Building Geometry Analysis)
// =============================================================================

/** Exterior corner type classification */
export type ExteriorCornerType =
  | 'outside_90'
  | 'outside_45'
  | 'inside_90'
  | 'inside_45'
  | 'outside_other'
  | 'inside_other';

/** Individual exterior corner detected on floor plan */
export interface ExteriorCorner {
  /** Type of corner */
  type: ExteriorCornerType;
  /** Location description (e.g., "front-left", "rear garage bump-out") */
  location: string;
  /** Actual angle if not 90 or 45 degrees */
  angle?: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Individual exterior wall segment */
export interface ExteriorWallSegment {
  /** Unique identifier for the segment */
  id: string;
  /** Compass orientation */
  orientation: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest';
  /** Length in linear feet */
  lengthLF: number;
  /** Wall height if noted on plan */
  wallHeight?: number;
  /** Additional notes about the segment */
  notes: string | null;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Summary of corner counts by type */
export interface CornerSummary {
  /** Count of 90-degree outside corners */
  outsideCorners90: number;
  /** Count of 90-degree inside corners */
  insideCorners90: number;
  /** Count of 45-degree outside corners */
  outsideCorners45: number;
  /** Count of 45-degree inside corners */
  insideCorners45: number;
  /** Total outside corners (all angles) */
  totalOutsideCorners: number;
  /** Total inside corners (all angles) */
  totalInsideCorners: number;
}

/** Complete floor plan data extracted from a page */
export interface FloorPlanData {
  /** Unique identifier */
  id: string;
  /** Page reference (e.g., "Page 6") */
  pageRef: string;
  /** Floor level identifier */
  floorLevel: 'crawlspace' | 'basement' | 'main' | 'second' | 'third' | 'fourth' | 'garage' | 'unknown';

  // Area
  /** Floor area in square feet */
  floorAreaSF: number | null;

  // Perimeter
  /** Total exterior perimeter in linear feet */
  exteriorPerimeterLF: number | null;
  /** Individual wall segments */
  wallSegments: ExteriorWallSegment[];

  // Corners
  /** Detailed corner list */
  corners: ExteriorCorner[];
  /** Summary of corner counts */
  cornerSummary: CornerSummary;

  // Openings (for cross-reference with schedules)
  /** Count of windows on this floor */
  windowCount: number;
  /** Count of exterior doors (not interior) */
  doorCount: number;
  /** Count of garage doors */
  garageDoorCount: number;

  // Building dimensions
  /** Overall width (typically East-West) in feet */
  overallWidth: number | null;
  /** Overall depth (typically North-South) in feet */
  overallDepth: number | null;

  // Metadata
  /** Scale notation (e.g., "1/4\" = 1'-0\"") */
  scale: string | null;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Notes explaining confidence */
  confidenceNotes: string;
  /** General extraction notes */
  extractionNotes: string;
  /** Extraction timestamp */
  extractedAt?: string;
  /** API version */
  version?: string;
  /** Model used */
  model_used?: string;
  /** Tokens consumed */
  tokens_used?: number;
}

/** Aggregated totals across all floor plans */
export interface FloorPlanAggregates {
  /** Total floor area across all floors */
  totalFloorAreaSF: number;
  /** Total exterior perimeter (note: may not be additive for multi-story) */
  totalExteriorPerimeterLF: number;
  /** Total outside corners */
  totalOutsideCorners: number;
  /** Total inside corners */
  totalInsideCorners: number;
  /** Total window count across all floors */
  totalWindowCount: number;
  /** Total exterior door count */
  totalExteriorDoorCount: number;
  /** Total garage door count */
  totalGarageDoorCount: number;
}

/** Result from floor plan extraction API */
export interface FloorPlanExtractionResult {
  /** Extracted floor plan data (one per floor) */
  floors: FloorPlanData[];
  /** Aggregated totals across all floors */
  aggregated: FloorPlanAggregates;
  /** Extraction timestamp */
  extractedAt: string;
  /** API version */
  version: string;
}

// =============================================================================
// Notes & Specifications Extraction Types
// =============================================================================

/** Individual takeoff note/specification */
export interface TakeoffNote {
  /** Unique identifier */
  id: string;
  /** Category of the specification */
  category: TakeoffNoteCategory;
  /** Brief title */
  item: string;
  /** Full specification details */
  details: string;
  /** Page where this was found */
  source_page: string;
  /** Importance level */
  importance: 'critical' | 'standard' | 'optional';
}

/** Categories for takeoff notes */
export type TakeoffNoteCategory =
  | 'siding_specs'
  | 'trim_details'
  | 'flashing_waterproofing'
  | 'weather_barrier'
  | 'fasteners_adhesives'
  | 'code_requirements'
  | 'installation_notes'
  | 'special_conditions';

/** Complete notes/specs extraction result */
export interface NotesSpecsData {
  /** Summary of extracted specifications */
  summary: string;
  /** Array of extracted notes */
  notes: TakeoffNote[];
  /** Category counts */
  categories: Record<string, number>;
  /** Number of pages analyzed */
  pages_analyzed: number;
  /** Extraction timestamp */
  extracted_at: string;
  /** API version */
  version: string;
  /** Model used */
  model_used: string;
  /** Tokens consumed */
  tokens_used: number;
  /** Overall confidence (0-1) */
  confidence: number;
  /** Notes about confidence */
  confidenceNotes: string;
}

// =============================================================================
// RFI (Request for Information) Types
// =============================================================================

/** Status of an individual RFI item */
export type RFIStatus =
  | 'unresolved'    // Not yet addressed
  | 'will_clarify'  // User will get clarification from client/architect
  | 'resolved'      // Resolved with user-provided answer
  | 'not_applicable'; // Not relevant to this project

/** Individual RFI item derived from missing/unclear specifications */
export interface RFIItem {
  /** Unique identifier */
  id: string;
  /** Related note ID from notes extraction (if applicable) */
  source_note_id?: string;
  /** Category of the specification */
  category: TakeoffNoteCategory;
  /** Brief description of what's missing or unclear */
  question: string;
  /** More detailed context */
  details?: string;
  /** Why this is important for the takeoff */
  impact: string;
  /** Suggested default or common practice (if applicable) */
  suggested_default?: string;
  /** Current status */
  status: RFIStatus;
  /** User's resolution/answer (if resolved) */
  resolution?: string;
  /** Who resolved it */
  resolved_by?: string;
  /** When it was resolved */
  resolved_at?: string;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  /** Page reference where the gap was identified */
  source_page?: string;
}

/** RFI list data structure */
export interface RFIListData {
  /** Unique identifier */
  id: string;
  /** Parent job ID */
  job_id: string;
  /** List of RFI items */
  items: RFIItem[];
  /** Summary statistics */
  summary: {
    total: number;
    unresolved: number;
    will_clarify: number;
    resolved: number;
    not_applicable: number;
    high_priority: number;
    medium_priority: number;
    low_priority: number;
  };
  /** When the RFI list was generated */
  generated_at: string;
  /** When last updated */
  updated_at: string;
  /** Version */
  version: string;
}

/** RFI generation result from API */
export interface RFIGenerationResult {
  success: boolean;
  rfi_list?: RFIListData;
  error?: string;
}

/** Approval confirmation data (includes RFI summary) */
export interface ApprovalConfirmation {
  /** Can proceed with approval */
  can_proceed: boolean;
  /** RFI summary for display */
  rfi_summary: {
    total_items: number;
    unresolved_critical: number;
    unresolved_other: number;
    will_clarify: number;
  };
  /** Warning messages to display */
  warnings: string[];
  /** Blocking issues (if can_proceed is false) */
  blockers?: string[];
}
