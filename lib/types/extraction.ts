// Extraction Detection System Types
// Matches production database schema

// =============================================================================
// Re-exports
// =============================================================================

// Polygon support for freeform shape editing
export type { PolygonPoint } from '@/lib/utils/polygonUtils';

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

export type ToolMode = 'select' | 'create' | 'pan' | 'verify' | 'calibrate' | 'line' | 'point';

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
  polygon_points?: Array<{ x: number; y: number }> | null;

  // Markup type support (polygon = area, line = linear measurement, point = count marker)
  markup_type?: MarkupType;
  marker_label?: string | null;

  // Product assignment (for Properties Panel)
  assigned_material_id?: string | null;

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
  siding: '#10B981',         // Emerald
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
  // Linear classes (LF) - measured in linear feet
  trim: 'linear',
  fascia: 'linear',
  gutter: 'linear',
  eave: 'linear',
  rake: 'linear',
  ridge: 'linear',
  soffit: 'linear',
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
  belly_band: 'count',
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

export function getDetectionColor(detectionClass: DetectionClass | InternalDetectionClass): string {
  return DETECTION_CLASS_COLORS[detectionClass] ?? DETECTION_CLASS_COLORS[''];
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
}

// =============================================================================
// Approval Result (response from n8n webhook)
// =============================================================================

export interface ApprovalResult {
  success: boolean;
  takeoff_id: string;
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
  };
}
