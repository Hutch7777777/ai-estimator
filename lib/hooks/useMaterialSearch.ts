'use client';

import { useState, useEffect, useRef } from 'react';

// Type for the category query result
interface CategoryRow {
  category: string;
}

// Type for the product query result
interface ProductRow {
  id: string;
  product_name: string;
  material_cost: number | null;
  labor_cost: number | null;
  unit: string;
  category: string;
  manufacturer: string;
  sku: string;
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

// Main product categories by trade (excludes accessories, trim, fasteners, etc.)
// These are the primary products users assign to detections
// Accessories will be auto-scoped based on the main product selection
const MAIN_PRODUCT_CATEGORIES: Record<string, string[]> = {
  siding: ['lap_siding', 'panel', 'siding', 'Siding', 'shingle', 'LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING'],
  roofing: ['shingles', 'Shingles'],
  windows: ['window', 'windows', 'double_hung', 'window_unit', 'Windows'],
  gutters: ['gutter', 'gutters', 'gutter_sections', 'Gutters'],
};

// Map detection classes to specific product categories
// This allows class-specific filtering (e.g., trim class shows trim products)
const CLASS_TO_CATEGORIES: Record<string, string[]> = {
  // Area classes - main products (SF)
  siding: ['LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING', 'lap_siding', 'panel', 'siding', 'Siding', 'shingle'],
  window: ['window', 'windows', 'double_hung', 'window_unit', 'Windows'],
  door: ['LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING', 'lap_siding', 'panel'],
  garage: ['LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING', 'lap_siding', 'panel'],
  roof: ['shingles', 'Shingles'],
  gable: ['LAP SIDING - SMOOTH', 'LAP SIDING - CEDARMILL', 'PANEL SIDING', 'lap_siding', 'panel', 'shingle'],
  // Linear classes - trim/accessories (LF)
  trim: ['trim', 'accessories', 'Trim', 'Accessories'],
  fascia: ['trim', 'accessories', 'Trim', 'Accessories'],
  gutter: ['gutter', 'gutters', 'gutter_sections', 'downspouts', 'Gutters'],
  eave: ['trim', 'soffit', 'accessories', 'Trim', 'Soffit'],
  rake: ['trim', 'accessories', 'Trim', 'Accessories'],
  ridge: ['trim', 'ridge_cap', 'accessories', 'Trim'],
  soffit: ['soffit', 'trim', 'Soffit', 'Trim'],
};

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

  // Fetch categories on mount
  useEffect(() => {
    if (!enabled) {
      console.log('[useMaterialSearch] Categories fetch skipped - not enabled');
      return;
    }

    const fetchCategories = async () => {
      console.log('[useMaterialSearch] Fetching categories...');
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
        params.set('active', 'eq.true');
        params.set('order', 'category.asc');

        // Filter by trade if specified
        if (trade) {
          params.set('trade', `eq.${trade}`);
        }

        // Filter to main product categories only (exclude accessories, trim, etc.)
        const mainCategories = trade ? MAIN_PRODUCT_CATEGORIES[trade] : null;
        if (mainCategories && mainCategories.length > 0) {
          params.set('category', `in.(${mainCategories.join(',')})`);
        }

        const fetchUrl = `${url}/rest/v1/product_catalog?${params.toString()}`;
        console.log('[useMaterialSearch] Fetching categories:', fetchUrl, 'trade:', trade, 'mainCategories:', mainCategories);

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
        console.log('[useMaterialSearch] Categories fetched:', data.length);

        if (data && isMountedRef.current) {
          // Get unique categories (case-insensitive dedup)
          const uniqueCategories = Array.from(
            new Set(data.map((d) => d.category).filter(Boolean))
          ).sort();
          console.log('[useMaterialSearch] Unique categories:', uniqueCategories);
          setCategories(uniqueCategories);
        }
      } catch (err) {
        console.error('[useMaterialSearch] Unexpected error fetching categories:', err);
      }
    };

    fetchCategories();
  }, [enabled, trade]);

  // Fetch products with debounced search
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
      console.log('[useMaterialSearch] Starting products fetch...');

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

        // Build query params for PostgREST
        const params = new URLSearchParams();
        params.set('select', 'id,product_name,material_cost,labor_cost,unit,category,manufacturer,sku');
        params.set('active', 'eq.true');
        params.set('order', 'sort_order.asc');
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

        const fetchUrl = `${url}/rest/v1/product_catalog?${params.toString()}`;
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

        const data: ProductRow[] = await response.json();
        console.log('[useMaterialSearch] Products fetched:', {
          count: data.length,
          firstItem: data[0]?.product_name,
        });

        if (isMountedRef.current) {
          const mappedItems = data.map((item) => ({
            id: item.id,
            product_name: item.product_name,
            material_cost: item.material_cost,
            labor_cost: item.labor_cost,
            unit: item.unit,
            category: item.category,
            manufacturer: item.manufacturer,
            sku: item.sku,
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
// Helper: Fetch single product by ID
// =============================================================================

export async function getMaterialById(materialId: string): Promise<MaterialItem | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error('[getMaterialById] Missing Supabase environment variables');
      return null;
    }

    const params = new URLSearchParams();
    params.set('select', 'id,product_name,material_cost,labor_cost,unit,category,manufacturer,sku');
    params.set('id', `eq.${materialId}`);

    const fetchUrl = `${url}/rest/v1/product_catalog?${params.toString()}`;

    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.pgrst.object+json', // Return single object instead of array
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getMaterialById] Error:', errorText);
      return null;
    }

    const row: ProductRow = await response.json();

    if (!row || !row.id) {
      console.error('[getMaterialById] No data found');
      return null;
    }

    return {
      id: row.id,
      product_name: row.product_name,
      material_cost: row.material_cost,
      labor_cost: row.labor_cost,
      unit: row.unit,
      category: row.category,
      manufacturer: row.manufacturer,
      sku: row.sku,
    };
  } catch (err) {
    console.error('[getMaterialById] Unexpected error:', err);
    return null;
  }
}
