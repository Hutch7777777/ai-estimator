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
  | 'processing'
  | 'complete'
  | 'failed';

export type EditType =
  | 'verify'
  | 'move'
  | 'resize'
  | 'delete'
  | 'reclassify'
  | 'create'
  | 'batch';

export type ToolMode = 'select' | 'create' | 'pan' | 'verify';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

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

  // Product assignment (for Properties Panel)
  assigned_material_id?: string | null;
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
  building: '#8B5CF6',       // Purple (internal)
  exterior_wall: '#10B981',  // Same as siding (legacy compatibility)
  '': '#6B7280',             // Gray - unclassified
};

/** Classes that users can select in the UI dropdown */
export const USER_SELECTABLE_CLASSES: DetectionClass[] = [
  'siding',
  'window',
  'door',
  'garage',
  'roof',
  'gable',
];

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
