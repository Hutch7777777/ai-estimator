// CAD Markup System Types

export interface Point {
  x: number;
  y: number;
}

// Material selection from product catalog
export interface MarkupMaterial {
  trade: string;              // 'siding', 'roofing', 'windows', 'gutters', 'decking', 'miscellaneous'
  category: string;           // 'lap_siding', 'trim', 'shingles', etc.
  productId?: string;         // Optional - specific product UUID from product_catalog
  productName?: string;       // Cached product name for display
  color: string;              // User-selected hex color: "#3B82F6"
}

// Default color for new markups
export const DEFAULT_MARKUP_COLOR = "#3B82F6"; // Blue

// Preset colors for quick selection
export const MARKUP_COLOR_PRESETS = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
  "#6B7280", // Gray
];

export type ToolMode = "select" | "draw" | "count" | "linear" | "calibrate";

export interface Polygon {
  id: string;
  pageNumber: number;
  points: Point[];
  material: MarkupMaterial;
  area: number; // in square feet
  isComplete: boolean;
  subject?: string; // User-editable label, defaults to material label
  notes?: string; // Optional notes field
}

export interface CountMarker {
  id: string;
  pageNumber: number;
  position: Point;
  material: MarkupMaterial;
  label: string;
  count: number;
  subject?: string; // User-editable label, defaults to material label
  notes?: string; // Optional notes field
}

export interface LinearMeasurement {
  id: string;
  pageNumber: number;
  start: Point;
  end: Point;
  lengthFeet: number;
  material: MarkupMaterial;
  label?: string;
  subject?: string; // User-editable label, defaults to material label
  notes?: string; // Optional notes field
}

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MarkupSummaryItem {
  trade: string;
  category: string;
  totalArea?: number;
  totalCount?: number;
  totalLength?: number;
  items: Array<{
    id: string;
    value: number;
    unit: "SF" | "EA" | "LF";
  }>;
}

export interface MarkupSummary {
  areas: MarkupSummaryItem[];
  counts: MarkupSummaryItem[];
  measurements: MarkupSummaryItem[];
}

export interface CADMarkupData {
  imageUrl: string;
  imageName: string;
  pixelsPerFoot: number;
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
  viewTransform: ViewTransform;
}

// Selection types
export type MarkupType = "polygon" | "marker" | "measurement";

export interface MarkupSelection {
  id: string;
  type: MarkupType;
}
