// CAD Markup System Exports

export { CADMarkupStep } from "./CADMarkupStep";
export { CADViewer } from "./CADViewer";
export { MarkupToolbar } from "./MarkupToolbar";
export { MarkupLegend } from "./MarkupLegend";
export { MarkupsList } from "./MarkupsList";
export { ColorPicker } from "./ColorPicker";
export { CategoryPicker } from "./CategoryPicker";
export { PageNavigation } from "./PageNavigation";
export { PageThumbnails } from "./PageThumbnails";
export { ProjectSelector } from "./ProjectSelector";
export { ProjectCard } from "./ProjectCard";
export { ProjectGrid } from "./ProjectGrid";
export { SaveStatus } from "./SaveStatus";
export { CadDataPanel } from "./CadDataPanel";
export { CalloutClassificationPanel } from "./CalloutClassificationPanel";
export { EditCalloutDialog } from "./EditCalloutDialog";
export { useProductCategories } from "./useProductCategories";

export type {
  Point,
  Polygon,
  CountMarker,
  LinearMeasurement,
  MarkupMaterial,
  ToolMode,
  ViewTransform,
  CADMarkupData,
  MarkupSummary,
  MarkupSummaryItem,
  MarkupType,
  MarkupSelection,
} from "./types";

export type { UseProductCategoriesReturn } from "./useProductCategories";
export type { SyncStatus } from "./SaveStatus";

export { DEFAULT_MARKUP_COLOR, MARKUP_COLOR_PRESETS } from "./types";

// Hit testing utilities
export * from "./hitTesting";
