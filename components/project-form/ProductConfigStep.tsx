"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2,
  AlertCircle,
  ChevronDown,
  Info,
  Check,
  Palette,
  Ruler,
  Package,
  Settings,
  Layers
} from "lucide-react";
import { ProjectFormData } from "@/app/project/new/page";
import { createClient } from "@/lib/supabase/client";
import type { TradeConfiguration, ProductCatalog, ShowIfCondition } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface ProductConfigStepProps {
  data: ProjectFormData;
  onUpdate: (data: Partial<ProjectFormData>) => void;
}

interface GroupedProducts {
  [category: string]: ProductCatalog[];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert snake_case to Title Case
 * Example: "primary_siding" → "Primary Siding"
 */
function toTitleCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get icon for section based on section name
 */
function getSectionIcon(sectionName: string) {
  const lowerSection = sectionName.toLowerCase();

  if (lowerSection.includes('color') || lowerSection.includes('paint')) {
    return Palette;
  } else if (lowerSection.includes('dimension') || lowerSection.includes('size')) {
    return Ruler;
  } else if (lowerSection.includes('product') || lowerSection.includes('material')) {
    return Package;
  } else if (lowerSection.includes('general') || lowerSection.includes('basic')) {
    return Settings;
  } else {
    return Layers;
  }
}

/**
 * Check if field is filled
 */
function isFieldFilled(value: any): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return true;
  return true;
}

/**
 * Format price for display
 */
function formatPrice(price: number | null): string {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(price);
}

/**
 * Get trade-specific description explaining that accessories are auto-calculated
 */
function getTradeDescription(trade: string): string {
  switch (trade) {
    case 'siding':
      return 'Select your main siding products. Accessories (WRB, flashing, trim, etc.) will be automatically calculated based on your selections and HOVER measurements.';
    case 'roofing':
      return 'Select your roofing materials. Underlayment, flashing, and accessories will be automatically calculated.';
    case 'windows':
      return 'Select your window products. Trim, flashing, and installation materials will be automatically calculated.';
    case 'gutters':
      return 'Select your gutter system. Downspouts, hangers, and accessories will be automatically calculated.';
    default:
      return 'Configure products for this trade. Accessories will be automatically calculated.';
  }
}

export function ProductConfigStep({ data, onUpdate }: ProductConfigStepProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configurations, setConfigurations] = useState<TradeConfiguration[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductCatalog[]>([]);
  const [formValues, setFormValues] = useState<Record<string, Record<string, any>>>(
    data.configurations || {}
  );

  const supabase = createClient();

  // Fetch configurations and products when selectedTrades changes
  useEffect(() => {
    const fetchConfigurations = async () => {
      if (!data.selectedTrades || data.selectedTrades.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch trade configurations for all selected trades
        const { data: configs, error: configError } = await supabase
          .from('trade_configurations')
          .select('*')
          .in('trade', data.selectedTrades)
          .eq('active', true)
          .order('section_order', { ascending: true })
          .order('field_order', { ascending: true });

        if (configError) throw configError;

        // Debug logging to diagnose missing trade sections
        console.log('🔍 Debug: Selected trades:', data.selectedTrades);
        console.log('🔍 Debug: Configurations fetched:', configs?.length || 0);
        console.log('🔍 Debug: Trades with data:', configs?.reduce((acc, c) => {
          acc[c.trade] = (acc[c.trade] || 0) + 1;
          return acc;
        }, {} as Record<string, number>));

        // Fetch product catalog for trades that need it
        // catalog_filter on each field determines which products are shown
        const { data: products, error: productError } = await supabase
          .from('product_catalog')
          .select('*')
          .in('trade', data.selectedTrades)
          .eq('active', true)
          .eq('discontinued', false)
          .order('sort_order', { ascending: true })
          .order('product_name', { ascending: true });

        if (productError) throw productError;

        setConfigurations(configs || []);
        setProductCatalog(products || []);
      } catch (err) {
        console.error('Error fetching configurations:', err);
        setError('Failed to load configuration fields. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchConfigurations();
  }, [data.selectedTrades]);

  // Update parent form data when local values change
  useEffect(() => {
    onUpdate({ configurations: formValues });
  }, [formValues]);

  // Check if a product is a ColorPlus product
  const isProductColorPlus = (productId: string): boolean => {
    if (!productId) return false;
    const product = productCatalog.find(p => p.id === productId);
    return product?.physical_properties?.is_colorplus === true;
  };

  // Check if field should be visible based on show_if_conditions
  const isFieldVisible = (field: TradeConfiguration, trade: string): boolean => {
    const tradeValues = formValues[trade] || {};

    // DEBUG LOG - Remove after debugging
    if (field.show_if_conditions) {
      console.log('🔍 Visibility check:', JSON.stringify({
        fieldName: field.config_name,
        fieldLabel: field.field_label,
        showIfConditions: field.show_if_conditions,
        allTradeValues: tradeValues,
        isRequired: field.is_required
      }, null, 2));
    }

    // Special case: ColorPlus color field should only show for ColorPlus products
    if (field.config_name === 'colorplus_color') {
      const selectedProductId = tradeValues['siding_product_type'];
      if (!selectedProductId) return false;
      return isProductColorPlus(selectedProductId);
    }

    if (!field.show_if_conditions) {
      return true;
    }

    const conditions = field.show_if_conditions;

    // Helper: Check if a value is "empty" (undefined, null, or empty string)
    const isEmpty = (val: any): boolean => {
      return val === undefined || val === null || val === '';
    };

    // Iterate through each condition key
    for (const [conditionFieldName, conditionValue] of Object.entries(conditions)) {
      const fieldValue = tradeValues[conditionFieldName];

      // Case 1: Nested object with operator (e.g., {contains: "value"} or {operator: "not_equals", value: ""})
      if (typeof conditionValue === 'object' && conditionValue !== null && !Array.isArray(conditionValue)) {

        // Check if it has "operator" key (old ShowIfCondition format)
        if ('operator' in conditionValue) {
          const operator = conditionValue.operator;
          const expectedValue = conditionValue.value;
          let result = false;

          switch (operator) {
            case 'equals':
              if (expectedValue === '') {
                result = isEmpty(fieldValue);
              } else {
                result = fieldValue === expectedValue;
              }
              break;

            case 'not_equals':
              if (expectedValue === '') {
                result = !isEmpty(fieldValue);
              } else {
                result = fieldValue !== expectedValue;
              }
              break;

            case 'contains':
              if (Array.isArray(fieldValue)) {
                result = Array.isArray(expectedValue)
                  ? expectedValue.some((v: string) => fieldValue.includes(v))
                  : fieldValue.includes(expectedValue);
              }
              break;

            case 'not_contains':
              if (Array.isArray(fieldValue)) {
                result = Array.isArray(expectedValue)
                  ? !expectedValue.some((v: string) => fieldValue.includes(v))
                  : !fieldValue.includes(expectedValue);
              } else {
                result = true;
              }
              break;

            default:
              result = true;
          }

          console.log('  ↳ Condition result:', JSON.stringify({
            conditionField: conditionFieldName,
            operator: operator,
            expectedValue: expectedValue,
            actualValue: fieldValue,
            isEmpty: isEmpty(fieldValue),
            result: result
          }, null, 2));

          if (!result) return false;
          continue;
        }

        // Check if it has "contains" key (shorthand operator)
        if ('contains' in conditionValue) {
          const containsValue = conditionValue.contains;
          const result = Array.isArray(fieldValue) && fieldValue.includes(containsValue);

          console.log('  ↳ Condition result:', JSON.stringify({
            conditionField: conditionFieldName,
            operator: 'contains',
            expectedValue: containsValue,
            actualValue: fieldValue,
            result: result
          }, null, 2));

          if (!result) return false;
          continue;
        }

        // Unknown object format - skip
        console.warn('Unknown condition format:', conditionFieldName, conditionValue);
        continue;
      }

      // Case 2: Simple equality check (e.g., {belly_band_include: true})
      const result = fieldValue === conditionValue;

      console.log('  ↳ Condition result:', JSON.stringify({
        conditionField: conditionFieldName,
        operator: 'equals',
        expectedValue: conditionValue,
        actualValue: fieldValue,
        result: result
      }, null, 2));

      if (!result) return false;
    }

    // All conditions passed
    return true;
  };

  /**
   * Filter products based on field's catalog_filter JSONB criteria
   */
  const filterProductsByCatalogFilter = (
    products: ProductCatalog[],
    catalogFilter: Record<string, any> | null
  ): ProductCatalog[] => {
    if (!catalogFilter) return products;

    return products.filter(product => {
      // Check active status
      if (catalogFilter.active !== undefined && product.active !== catalogFilter.active) {
        return false;
      }

      // Check category (can be array or single value)
      if (catalogFilter.category) {
        const categories = Array.isArray(catalogFilter.category)
          ? catalogFilter.category
          : [catalogFilter.category];

        if (!categories.includes(product.category)) {
          return false;
        }
      }

      // Check discontinued status
      if (catalogFilter.discontinued !== undefined && product.discontinued !== catalogFilter.discontinued) {
        return false;
      }

      // Check manufacturer (can be array or single value)
      if (catalogFilter.manufacturer) {
        const manufacturers = Array.isArray(catalogFilter.manufacturer)
          ? catalogFilter.manufacturer
          : [catalogFilter.manufacturer];

        if (!manufacturers.includes(product.manufacturer)) {
          return false;
        }
      }

      return true;
    });
  };

  /**
   * Get display name for product (product line/series only, no colors/sizes)
   */
  const getProductDisplayName = (product: ProductCatalog): string => {
    // Prefer product_line field if available
    if (product.product_line) {
      return product.product_line;
    }

    // Fallback: Parse product_name to extract series/line
    const name = product.display_name || product.product_name;

    // Remove color (after " - ")
    const withoutColor = name.split(' - ')[0].trim();

    // For windows/doors: Take first word (series name)
    // For siding/roofing: Keep full line name before color
    if (product.trade === 'windows') {
      return withoutColor.split(' ')[0];
    }

    return withoutColor;
  };

  /**
   * Deduplicate products by display name (show each product line once)
   */
  const deduplicateProducts = (products: ProductCatalog[]): ProductCatalog[] => {
    const seen = new Set<string>();
    const unique: ProductCatalog[] = [];

    for (const product of products) {
      const displayName = getProductDisplayName(product);

      if (!seen.has(displayName)) {
        seen.add(displayName);
        unique.push(product);
      }
    }

    return unique;
  };

  // Group products by category
  const getGroupedProducts = (
    trade: string,
    catalogFilter: Record<string, any> | null = null
  ): GroupedProducts => {
    let tradeProducts = productCatalog.filter((p) => p.trade === trade);

    // Apply catalog_filter if provided
    if (catalogFilter) {
      tradeProducts = filterProductsByCatalogFilter(tradeProducts, catalogFilter);
    }

    // Deduplicate by product line name
    tradeProducts = deduplicateProducts(tradeProducts);

    return tradeProducts.reduce((acc, product) => {
      const category = product.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(product);
      return acc;
    }, {} as GroupedProducts);
  };

  // Handle field value change
  const handleFieldChange = (trade: string, fieldName: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [trade]: {
        ...(prev[trade] || {}),
        [fieldName]: value,
      },
    }));
  };

  // Handle multiselect checkbox change
  const handleMultiselectChange = (trade: string, fieldName: string, optionValue: string, checked: boolean) => {
    setFormValues((prev) => {
      const tradeValues = prev[trade] || {};
      const currentValues = tradeValues[fieldName] || [];
      const newValues = checked
        ? [...currentValues, optionValue]
        : currentValues.filter((v: string) => v !== optionValue);
      return {
        ...prev,
        [trade]: {
          ...tradeValues,
          [fieldName]: newValues,
        },
      };
    });
  };

  // Render field based on type
  const renderField = (field: TradeConfiguration, trade: string) => {
    if (!isFieldVisible(field, trade)) {
      return null;
    }

    const tradeValues = formValues[trade] || {};
    const fieldValue = tradeValues[field.config_name];

    switch (field.field_type) {
      case 'select':
        // Get options from field_options or product catalog
        // Special handling: Apply dynamic filtering for window_series based on selected manufacturer
        let effectiveCatalogFilter = field.catalog_filter;

        if (field.config_name === 'window_series' && field.load_from_catalog) {
          const selectedManufacturer = tradeValues['window_manufacturer'];

          if (selectedManufacturer) {
            effectiveCatalogFilter = {
              ...field.catalog_filter,
              manufacturer: selectedManufacturer
            };

            console.log('🏭 Window series manufacturer filter:', {
              selectedManufacturer,
              originalFilter: field.catalog_filter,
              effectiveFilter: effectiveCatalogFilter
            });
          }
        }

        const selectOptions = field.load_from_catalog
          ? getGroupedProducts(field.trade, effectiveCatalogFilter)
          : null;
        const isFilled = isFieldFilled(fieldValue);

        // Debug logging for catalog loading
        if (field.load_from_catalog && selectOptions) {
          const totalProducts = Object.values(selectOptions).flat().length;
          console.log('🔍 Catalog field:', {
            fieldName: field.config_name,
            trade: field.trade,
            catalogFilter: effectiveCatalogFilter,
            productsFound: totalProducts
          });
        }

        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center justify-between">
              {field.field_help_text ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label htmlFor={field.config_name} className="flex items-center gap-2 cursor-help">
                        {field.field_label}
                        {field.is_required && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Required
                          </Badge>
                        )}
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{field.field_help_text}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Label htmlFor={field.config_name} className="flex items-center gap-2">
                  {field.field_label}
                  {field.is_required && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Required
                    </Badge>
                  )}
                </Label>
              )}
              {isFilled && (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </div>
            <Select
              value={fieldValue || ''}
              onValueChange={(value) => handleFieldChange(trade, field.config_name, value)}
            >
              <SelectTrigger id={field.config_name} className={cn(
                "min-h-11",
                isFilled && "border-green-600/50 bg-green-50/50 dark:bg-green-950/20"
              )}>
                <SelectValue placeholder={field.field_placeholder || `Select ${field.field_label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {selectOptions ? (
                  // Render grouped list of products from catalog
                  Object.entries(selectOptions).map(([category, products]) => (
                    <SelectGroup key={category}>
                      <SelectLabel className="text-xs font-semibold text-muted-foreground">
                        {toTitleCase(category)}
                      </SelectLabel>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center gap-2">
                            <span>{getProductDisplayName(product)}</span>
                            {product.physical_properties?.is_colorplus && (
                              <Badge className="bg-blue-500 text-white text-xs">
                                ColorPlus
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                ) : (
                  // Render options from field_options
                  field.field_options?.options?.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        {option.description && (
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center space-x-2 rounded-lg border p-4">
              <Checkbox
                id={field.config_name}
                checked={fieldValue || false}
                onCheckedChange={(checked) => handleFieldChange(trade, field.config_name, checked)}
                className="min-h-5 min-w-5"
              />
              <div className="flex-1 flex items-center gap-2">
                <Label
                  htmlFor={field.config_name}
                  className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {field.field_label}
                  {field.is_required && (
                    <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">
                      Required
                    </Badge>
                  )}
                </Label>
                {field.field_help_text && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{field.field_help_text}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        );

      case 'multiselect':
        const multiselectFilled = isFieldFilled(fieldValue);

        return (
          <div key={field.id} className="space-y-3">
            <div className="flex items-center justify-between">
              {field.field_help_text ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label className="flex items-center gap-2 cursor-help">
                        {field.field_label}
                        {field.is_required && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Required
                          </Badge>
                        )}
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{field.field_help_text}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Label className="flex items-center gap-2">
                  {field.field_label}
                  {field.is_required && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Required
                    </Badge>
                  )}
                </Label>
              )}
              {multiselectFilled && (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              {field.field_options?.options?.map((option: any) => (
                <div key={option.value} className="flex items-start space-x-3 py-1">
                  <Checkbox
                    id={`${field.config_name}-${option.value}`}
                    checked={fieldValue?.includes(option.value) || false}
                    onCheckedChange={(checked) =>
                      handleMultiselectChange(trade, field.config_name, option.value, checked as boolean)
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={`${field.config_name}-${option.value}`}
                      className="cursor-pointer text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {option.label}
                    </Label>
                    {option.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'number':
        const numberFilled = isFieldFilled(fieldValue);

        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center justify-between">
              {field.field_help_text ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label htmlFor={field.config_name} className="flex items-center gap-2 cursor-help">
                        {field.field_label}
                        {field.is_required && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Required
                          </Badge>
                        )}
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{field.field_help_text}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Label htmlFor={field.config_name} className="flex items-center gap-2">
                  {field.field_label}
                  {field.is_required && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Required
                    </Badge>
                  )}
                </Label>
              )}
              {numberFilled && (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </div>
            <Input
              id={field.config_name}
              type="number"
              value={fieldValue || ''}
              onChange={(e) => handleFieldChange(trade, field.config_name, e.target.value)}
              placeholder={field.field_placeholder || `Enter ${field.field_label.toLowerCase()}`}
              className={cn(
                "min-h-11",
                numberFilled && "border-green-600/50 bg-green-50/50 dark:bg-green-950/20"
              )}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // Group configurations by trade, then by section
  const groupedByTradeAndSection = configurations.reduce((acc, config) => {
    const trade = config.trade;
    const section = config.config_section || 'General';

    if (!acc[trade]) {
      acc[trade] = {};
    }
    if (!acc[trade][section]) {
      acc[trade][section] = [];
    }

    acc[trade][section].push(config);
    return acc;
  }, {} as Record<string, Record<string, TradeConfiguration[]>>);

  // Helper function to group fields by parent-child relationships
  const groupFieldsByParent = (fields: TradeConfiguration[]) => {
    const grouped: Array<{
      parent: TradeConfiguration | null;
      children: TradeConfiguration[];
    }> = [];

    const parentFields = new Map<string, TradeConfiguration>();
    const childFields = new Map<string, TradeConfiguration[]>();
    const ungroupedFields: TradeConfiguration[] = [];

    // First pass: Identify parents and group children
    fields.forEach(field => {
      const match = field.config_name.match(/^(.+)_include$/);

      if (match && field.field_type === 'checkbox') {
        // This is a parent field
        const prefix = match[1];
        parentFields.set(prefix, field);
        childFields.set(prefix, []);
      } else {
        // Check if this field belongs to a parent
        let belongsToParent = false;

        for (const prefix of Array.from(parentFields.keys())) {
          if (field.config_name.startsWith(prefix + '_')) {
            childFields.get(prefix)!.push(field);
            belongsToParent = true;
            break;
          }
        }

        if (!belongsToParent) {
          ungroupedFields.push(field);
        }
      }
    });

    // Build grouped structure
    parentFields.forEach((parent, prefix) => {
      grouped.push({
        parent,
        children: childFields.get(prefix) || []
      });
    });

    // Add ungrouped fields
    ungroupedFields.forEach(field => {
      grouped.push({
        parent: null,
        children: [field]
      });
    });

    return grouped;
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-6 w-48" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configure Products</CardTitle>
          <CardDescription>An error occurred</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No trades selected
  if (!data.selectedTrades || data.selectedTrades.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configure Products</CardTitle>
          <CardDescription>
            Select products and materials for each selected trade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-muted-foreground/25 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Please select at least one trade in the previous step.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render configuration form
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-4">
        {data.selectedTrades
          ?.filter(trade => groupedByTradeAndSection[trade])
          .map((trade) => {
            const sections = groupedByTradeAndSection[trade];
            const tradeDescription = getTradeDescription(trade);
            const tradeName = toTitleCase(trade);

            return (
              <Collapsible key={trade} defaultOpen>
                <Card className="shadow-sm">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl">{tradeName}</CardTitle>
                          <CardDescription className="mt-0.5">
                            {tradeDescription}
                          </CardDescription>
                        </div>
                        <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200" />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-4">
                      {Object.entries(sections).map(([section, fields]) => {
                        const SectionIcon = getSectionIcon(section);
                        const sectionTitle = toTitleCase(section);

                        // Check if this is trim_accessories section
                        const isTrimSection = section === 'trim_accessories';
                        const groupedFields = isTrimSection ? groupFieldsByParent(fields) : null;

                        return (
                          <div key={section} className="mb-6 last:mb-0">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="rounded-lg bg-primary/10 p-1.5">
                                <SectionIcon className="h-4 w-4 text-primary" />
                              </div>
                              <h3 className="text-md font-semibold">{sectionTitle}</h3>
                            </div>

                            {isTrimSection && groupedFields ? (
                              // Render trim_accessories with grouping
                              <div className="space-y-4">
                                {groupedFields.map((group, index) => {
                                  if (group.parent) {
                                    const parentValue = formValues[trade]?.[group.parent.config_name];

                                    return (
                                      <div key={group.parent.id} className="space-y-3">
                                        {/* Parent checkbox - full width */}
                                        {renderField(group.parent, trade)}

                                        {/* Child fields - indented */}
                                        {parentValue && group.children.length > 0 && (
                                          <div className="ml-8 pl-4 border-l-2 border-muted space-y-3">
                                            <div className="grid gap-4 md:grid-cols-2">
                                              {group.children.map(child => renderField(child, trade))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    // Ungrouped fields
                                    return (
                                      <div key={`ungrouped-${index}`} className="grid gap-4 md:grid-cols-2">
                                        {group.children.map(child => renderField(child, trade))}
                                      </div>
                                    );
                                  }
                                })}
                              </div>
                            ) : (
                              // Render other sections normally (flat 2-column grid)
                              <div className="grid gap-4 md:grid-cols-2">
                                {fields.map((field) => renderField(field, trade))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
        })}

        {/* Show placeholder cards for selected trades that don't have database configurations */}
        {data.selectedTrades?.filter(trade =>
          !Object.keys(groupedByTradeAndSection).includes(trade)
        ).map(trade => (
          <Card key={trade} className="border-dashed border-yellow-500/50">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-yellow-500/50" />
                <p className="mt-4 text-sm font-medium text-foreground">
                  {toTitleCase(trade)} - Not Yet Configured
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No configuration fields found in trade_configurations table for this trade.
                </p>
              </div>
            </CardContent>
          </Card>
        ))}

        {configurations.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-lg border border-dashed border-muted-foreground/25 p-8 text-center">
                <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm font-medium text-foreground">
                  No configuration fields found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Please add fields to the trade_configurations table for the selected trades.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
