export interface DetectionCountPricing {
  class_name: string;
  display_name: string;
  sku: string;
  description: string;
  material_cost: number;
  labor_cost: number;
  unit: string;
  presentation_group: string;
  measurement_type: 'count' | 'area' | 'linear';
}
