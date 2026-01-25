'use client';

import { useState, useEffect, useRef } from 'react';

// Type for the category query result
interface CategoryRow {
  category: string;
}

// Type for the pricing_items query result
interface PricingRow {
  id: string;
  sku: string;
  product_name: string;
  material_cost: number | null;
  unit: string;
  is_colorplus: boolean;
  category: string;
}

// =============================================================================
// Types
// =============================================================================

export interface MaterialItem {
  id: string;
  product_name: string;
  material_cost: number | null;
  labor_cost: number | null;
  unit: string;
  category: string;
  manufacturer: string;
  sku: string;
  is_colorplus?: boolean;
}

export interface UseMaterialSearchOptions {
  /** Trade to filter by (e.g., 'siding', 'roofing', 'windows') */
  trade?: string;
  /** Detection class for class-specific category filtering (e.g., 'trim', 'soffit', 'gutter') */
  detectionClass?: string;
  /** Category to filter by (case-insensitive) - overrides class-based filtering */
  category?: string;
  /** Search query for product_name */
  search?: string;
  /** Whether to enable the query */
  enabled?: boolean;
  /** Maximum number of results */
  limit?: number;
}

export interface UseMaterialSearchReturn {
  /** List of matching products */
  items: MaterialItem[];
  /** List of unique categories for filtering */
  categories: string[];
  /** Whether the query is loading */
  isLoading: boolean;
  /** Error if query failed */
  error: Error | null;
}

// =============================================================================
// Constants
// =============================================================================

const DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 20;

// =============================================================================
// Category Configuration
// =============================================================================

// Categories that users can manually assign to detections
// Auto-scope categories (fasteners, flashing, sealants, etc.) are excluded
const SELECTABLE_CATEGORIES: Record<string, string[]> = {
  // Siding products - user selects the siding type
  // Includes lap_siding explicitly for HardiePlank widths and LP SmartSide
  siding: [
    'lap_siding', 'shingle', 'panel', 'siding', 'Siding',
    'LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING', 'SHINGLE SIDING',
  ],
  // Soffit products (vinyl, aluminum, Hardie)
  soffit: ['soffit', 'Soffit', 'SOFFIT'],
  // Trim products (for trim, fascia, belly band) - expanded HardieTrim widths
  trim: ['trim', 'Trim', 'TRIM'],
  // Gutter products - includes new gutter_accessories category
  // (elbows, end caps, hangers, guards, splash blocks)
  gutter: ['gutter', 'gutters', 'Gutters', 'downspout', 'Downspout', 'GUTTERS', 'gutter_accessories'],
  // Roofing products
  roofing: ['roofing', 'shingles', 'Shingles', 'ROOFING'],
  // Window products
  window: ['window', 'windows', 'Windows', 'double_hung', 'window_unit'],
  // Architectural/Decorative products
  // NEW: 50+ products including corbels, brackets, shutters, posts, columns, gable vents
  architectural: ['architectural', 'decorative', 'corbel', 'bracket', 'shutter', 'post', 'column'],
  // Vents - foundation vents, roof vents, gable vents, wall exhaust vents
  // NEW: User selects vent type instead of auto-scope
  vents: ['vents'],
};

// Categories that should NEVER appear in the dropdown (auto-scope only)
// These are calculated based on measurements, not manually assigned
const AUTO_SCOPE_CATEGORIES = [
  'accessories',
  'fasteners',
  'flashing',
  'sealants',
  'caulk',
  'water_barrier',
  'paint',
  'corner',
  'exclusion',
  'penetrations',
  'nails',
  'screws',
  'starter',
  'housewrap',
  'tyvek',
];

// Main product categories by trade (excludes accessories, trim, fasteners, etc.)
// These are the primary products users assign to detections
// Accessories will be auto-scoped based on the main product selection
const MAIN_PRODUCT_CATEGORIES: Record<string, string[]> = {
  siding: SELECTABLE_CATEGORIES.siding,
  roofing: SELECTABLE_CATEGORIES.roofing,
  windows: SELECTABLE_CATEGORIES.window,
  gutters: SELECTABLE_CATEGORIES.gutter,
};

// Map detection classes to specific product categories
// This allows class-specific filtering (e.g., trim class shows trim products)
// Classes with empty arrays are auto-scope only (no manual material selection)
const CLASS_TO_CATEGORIES: Record<string, string[]> = {
  // === AREA CLASSES (SF) - Siding Products ===
  siding: SELECTABLE_CATEGORIES.siding,
  exterior_wall: SELECTABLE_CATEGORIES.siding,
  door: SELECTABLE_CATEGORIES.siding,  // Door surrounds use siding
  garage: SELECTABLE_CATEGORIES.siding,
  gable: SELECTABLE_CATEGORIES.siding,

  // === AREA CLASSES (SF) - Other ===
  soffit: SELECTABLE_CATEGORIES.soffit,
  roof: SELECTABLE_CATEGORIES.roofing,
  window: SELECTABLE_CATEGORIES.window,

  // === LINEAR CLASSES (LF) ===
  trim: SELECTABLE_CATEGORIES.trim,
  fascia: SELECTABLE_CATEGORIES.trim,
  belly_band: SELECTABLE_CATEGORIES.trim,
  eave: SELECTABLE_CATEGORIES.trim,
  rake: SELECTABLE_CATEGORIES.trim,
  ridge: SELECTABLE_CATEGORIES.roofing,
  valley: SELECTABLE_CATEGORIES.roofing,
  // Gutters now include gutter_accessories for elbows, end caps, hangers, guards
  gutter: SELECTABLE_CATEGORIES.gutter,
  downspout: SELECTABLE_CATEGORIES.gutter,

  // === COUNT CLASSES (EA) - Architectural (NEW - manual material selection) ===
  // These show Material Selector with 'architectural' category products
  // 50+ products: corbels, brackets, shutters, posts, columns, decorative gable vents
  corbel: SELECTABLE_CATEGORIES.architectural,
  bracket: SELECTABLE_CATEGORIES.architectural,
  shutter: SELECTABLE_CATEGORIES.architectural,
  post: SELECTABLE_CATEGORIES.architectural,
  column: SELECTABLE_CATEGORIES.architectural,
  // Decorative gable vents (louvered, half-round, octagon) - user selects style
  // Shows both architectural (decorative) and vents (functional) options
  gable_vent: [...SELECTABLE_CATEGORIES.architectural, ...SELECTABLE_CATEGORIES.vents],

  // === COUNT CLASSES (EA) - Vents (NEW - manual material selection) ===
  // Foundation vents, roof vents, gable vents, wall exhaust vents - user selects type
  vent: [...SELECTABLE_CATEGORIES.vents, ...SELECTABLE_CATEGORIES.architectural],

  // === COUNT CLASSES (EA) - Auto-scope only (no manual selection needed) ===
  // These trigger auto-scope rules based on count, no material assignment
  outlet: [],         // Electrical outlets - auto-calculated J-block
  hose_bib: [],       // Hose bibs - auto-calculated J-block
  light_fixture: [],  // Light fixtures - auto-calculated J-block
  corner_inside: [],  // Auto-calculated from corner count × wall height
  corner_outside: [], // Auto-calculated from corner count × wall height
  flashing: [],       // Auto-calculated from opening perimeters
};

// Helper to check if a class is auto-scope only
export function isAutoScopeOnlyClass(detectionClass: string | undefined): boolean {
  if (!detectionClass) return false;
  const categories = CLASS_TO_CATEGORIES[detectionClass];
  return categories !== undefined && categories.length === 0;
}

// Helper to get selectable categories for a detection class
export function getSelectableCategoriesForClass(detectionClass: string | undefined): string[] {
  if (!detectionClass) return [];
  return CLASS_TO_CATEGORIES[detectionClass] || [];
}

// =============================================================================
// Hook
// =============================================================================

export function useMaterialSearch(options: UseMaterialSearchOptions = {}): UseMaterialSearchReturn {
  const { trade, detectionClass, category, search, enabled = true, limit = DEFAULT_LIMIT } = options;

  const [items, setItems] = useState<MaterialItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Fetch categories on mount - from pricing_items table
  // Now filters out auto-scope categories and applies class-based filtering
  useEffect(() => {
    if (!enabled) {
      console.log('[useMaterialSearch] Categories fetch skipped - not enabled');
      return;
    }

    const fetchCategories = async () => {
      console.log('[useMaterialSearch] Fetching categories from pricing_items...', { detectionClass });
      try {
        // Use direct fetch instead of Supabase JS client
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          console.error('[useMaterialSearch] Missing Supabase environment variables');
          return;
        }

        const params = new URLSearchParams();
        params.set('select', 'category');
        params.set('material_cost', 'not.is.null');
        params.set('order', 'category.asc');

        // Filter by trade if specified
        if (trade) {
          params.set('trade', `eq.${trade}`);
        }

        const fetchUrl = `${url}/rest/v1/pricing_items?${params.toString()}`;
        console.log('[useMaterialSearch] Fetching categories:', fetchUrl, 'trade:', trade);

        const response = await fetch(fetchUrl, {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        });

        console.log('[useMaterialSearch] Categories response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[useMaterialSearch] Categories fetch error:', errorText);
          return;
        }

        const data: CategoryRow[] = await response.json();
        console.log('[useMaterialSearch] Raw categories fetched:', data.length);

        if (data && isMountedRef.current) {
          // Get unique categories
          let uniqueCategories = Array.from(
            new Set(data.map((d) => d.category).filter(Boolean))
          );

          // Step 1: Filter out auto-scope categories that users shouldn't manually select
          const filteredCategories = uniqueCategories.filter(cat => {
            const catLower = cat.toLowerCase();
            return !AUTO_SCOPE_CATEGORIES.some(autoScope =>
              catLower.includes(autoScope.toLowerCase())
            );
          });
          console.log('[useMaterialSearch] After auto-scope filter:', filteredCategories.length);

          // Step 2: If a detection class is selected, further filter to only show relevant categories
          let finalCategories = filteredCategories;
          if (detectionClass && CLASS_TO_CATEGORIES[detectionClass]) {
            const allowedCategories = CLASS_TO_CATEGORIES[detectionClass];
            if (allowedCategories.length > 0) {
              finalCategories = filteredCategories.filter(cat => {
                const catLower = cat.toLowerCase();
                return allowedCategories.some(allowed =>
                  catLower.includes(allowed.toLowerCase()) ||
                  allowed.toLowerCase().includes(catLower)
                );
              });
              console.log('[useMaterialSearch] After class filter for', detectionClass, ':', finalCategories.length);
            } else {
              // Auto-scope only class - show no categories
              finalCategories = [];
              console.log('[useMaterialSearch] Auto-scope only class:', detectionClass);
            }
          }

          setCategories(finalCategories.sort());
        }
      } catch (err) {
        console.error('[useMaterialSearch] Unexpected error fetching categories:', err);
      }
    };

    fetchCategories();
  }, [enabled, trade, detectionClass]);

  // Fetch products with debounced search - from pricing_items table
  useEffect(() => {
    console.log('[useMaterialSearch] Products effect triggered:', { enabled, trade, category, search, limit });

    if (!enabled) {
      console.log('[useMaterialSearch] Products fetch skipped - not enabled');
      setItems([]);
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the search
    const debounceMs = search ? DEBOUNCE_MS : 0;
    console.log('[useMaterialSearch] Setting up debounced fetch with delay:', debounceMs);

    debounceRef.current = setTimeout(async () => {
      console.log('[useMaterialSearch] Starting products fetch from pricing_items...');

      if (!isMountedRef.current) {
        console.log('[useMaterialSearch] Component unmounted, skipping fetch');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Use direct fetch instead of Supabase JS client (which wasn't sending requests)
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        console.log('[useMaterialSearch] ENV CHECK:', {
          url: url?.substring(0, 30) + '...',
          keyExists: !!key,
          keyLength: key?.length
        });

        if (!url || !key) {
          throw new Error('Missing Supabase environment variables');
        }

        // Build query params for PostgREST - querying pricing_items table
        const params = new URLSearchParams();
        params.set('select', 'id,sku,product_name,material_cost,unit,is_colorplus,category');
        params.set('material_cost', 'not.is.null'); // Only items with prices
        params.set('order', 'product_name.asc');
        params.set('limit', String(limit));

        // Apply trade filter
        if (trade) {
          console.log('[useMaterialSearch] Applying trade filter:', trade);
          params.set('trade', `eq.${trade}`);
        }

        // Apply category filter - priority: user-selected > class-specific > trade-based
        if (category) {
          // User selected a specific category from dropdown - highest priority
          console.log('[useMaterialSearch] Applying user-selected category filter:', category);
          params.set('category', `ilike.${category}`);
        } else if (detectionClass && CLASS_TO_CATEGORIES[detectionClass]) {
          // Use class-specific categories (e.g., trim class shows trim products)
          const classCategories = CLASS_TO_CATEGORIES[detectionClass];
          console.log('[useMaterialSearch] Applying class-specific categories:', detectionClass, classCategories);
          params.set('category', `in.(${classCategories.join(',')})`);
        } else if (trade) {
          // Fall back to main product categories for trade
          // This excludes accessories, trim, fasteners, etc.
          const mainCategories = MAIN_PRODUCT_CATEGORIES[trade];
          if (mainCategories && mainCategories.length > 0) {
            console.log('[useMaterialSearch] Filtering to main categories:', mainCategories);
            params.set('category', `in.(${mainCategories.join(',')})`);
          }
        }

        // Apply search filter (case-insensitive with ilike)
        if (search && search.trim()) {
          console.log('[useMaterialSearch] Applying search filter:', search);
          params.set('product_name', `ilike.*${search.trim()}*`);
        }

        const fetchUrl = `${url}/rest/v1/pricing_items?${params.toString()}`;
        console.log('[useMaterialSearch] Fetching:', fetchUrl);

        const response = await fetch(fetchUrl, {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        });

        console.log('[useMaterialSearch] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[useMaterialSearch] Fetch error:', errorText);
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const data: PricingRow[] = await response.json();
        console.log('[useMaterialSearch] Products fetched:', {
          count: data.length,
          firstItem: data[0]?.product_name,
        });

        if (isMountedRef.current) {
          // Map pricing_items to MaterialItem interface
          const mappedItems: MaterialItem[] = data.map((item) => ({
            id: item.id,
            product_name: item.product_name,
            material_cost: item.material_cost,
            labor_cost: null, // pricing_items doesn't have labor_cost per item
            unit: item.unit || 'ea',
            category: item.category || '',
            manufacturer: '', // pricing_items doesn't have manufacturer
            sku: item.sku || '',
            is_colorplus: item.is_colorplus,
          }));
          console.log('[useMaterialSearch] Setting items:', mappedItems.length);
          setItems(mappedItems);
        }
      } catch (err) {
        console.error('[useMaterialSearch] Error fetching products:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setItems([]);
        }
      } finally {
        console.log('[useMaterialSearch] Fetch complete, setting isLoading to false');
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [enabled, trade, detectionClass, category, search, limit]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { items, categories, isLoading, error };
}

// =============================================================================
// Helper: Fetch single product by ID from pricing_items
// =============================================================================

export async function getMaterialById(materialId: string): Promise<MaterialItem | null> {
  console.log('[getMaterialById] Called with materialId:', materialId);

  if (!materialId) {
    console.log('[getMaterialById] No materialId provided');
    return null;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[getMaterialById] Missing Supabase env vars');
      return null;
    }

    const url = `${supabaseUrl}/rest/v1/v_pricing_current?id=eq.${materialId}&select=id,sku,product_name,material_cost,unit,category,manufacturer,is_colorplus,base_labor_cost`;

    console.log('[getMaterialById] Fetching from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[getMaterialById] Response status:', response.status);

    if (!response.ok) {
      console.error('[getMaterialById] HTTP error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    console.log('[getMaterialById] Response data:', data);

    if (!data || data.length === 0) {
      console.log('[getMaterialById] No data returned for ID:', materialId);
      return null;
    }

    const item = data[0];

    const result: MaterialItem = {
      id: item.id,
      sku: item.sku || '',
      product_name: item.product_name || '',
      material_cost: item.material_cost,
      labor_cost: item.base_labor_cost,
      unit: item.unit || 'ea',
      category: item.category || '',
      manufacturer: item.manufacturer || '',
      is_colorplus: item.is_colorplus || false,
    };

    console.log('[getMaterialById] Returning material:', result);
    return result;

  } catch (err) {
    console.error('[getMaterialById] Unexpected error:', err);
    return null;
  }
}
