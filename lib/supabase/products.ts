/**
 * Supabase API functions for product catalog and alternatives
 * Provides type-safe access to product data and substitution options
 */

import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/types/database';

type ProductCatalog = Database['public']['Tables']['product_catalog']['Row'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductAlternative = any; // Table may not exist in generated types

export interface ProductAlternativeWithDetails {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  manufacturer: string | null;
  material_cost: number;
  labor_cost: number;
  material_cost_difference: number;
  labor_cost_difference: number;
  material_impact_percent: number;
  labor_impact_percent: number;
  notes: string | null;
}

export interface GroupedAlternatives {
  equivalent?: ProductAlternativeWithDetails[];
  upgrade?: ProductAlternativeWithDetails[];
  downgrade?: ProductAlternativeWithDetails[];
  budget?: ProductAlternativeWithDetails[];
  premium?: ProductAlternativeWithDetails[];
}

/**
 * Fetch product alternatives for a given product ID
 * Uses the database function get_product_alternatives() for optimized querying
 */
export async function getProductAlternatives(
  productId: string
): Promise<{ data: GroupedAlternatives | null; error: Error | null }> {
  try {
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_product_alternatives', {
      p_product_id: productId,
    });

    if (error) {
      console.error('Error fetching product alternatives:', error);
      return { data: null, error: new Error(error.message) };
    }

    // data is already JSONB grouped by relationship type
    return { data: data as GroupedAlternatives, error: null };
  } catch (err) {
    console.error('Unexpected error in getProductAlternatives:', err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

/**
 * Search products in the catalog by name, SKU, or manufacturer
 * Returns products sorted by relevance
 */
export async function searchProducts(
  query: string,
  options?: {
    category?: string;
    manufacturer?: string;
    limit?: number;
  }
): Promise<{ data: ProductCatalog[] | null; error: Error | null }> {
  try {
    console.log('🔍 searchProducts called with:', { query, options });
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryBuilder = (supabase as any)
      .from('product_catalog')
      .select('*');

    // Only apply text search if query is not empty
    if (query && query.trim()) {
      queryBuilder = queryBuilder.or(`product_name.ilike.%${query}%,sku.ilike.%${query}%,manufacturer.ilike.%${query}%`);
      console.log('📊 Query pattern:', `product_name.ilike.%${query}%,sku.ilike.%${query}%,manufacturer.ilike.%${query}%`);
    } else {
      console.log('📊 No text search - fetching all products (will be filtered by category/manufacturer if set)');
    }

    // Apply optional filters
    if (options?.category) {
      queryBuilder = queryBuilder.ilike('category', options.category);
      console.log('🏷️ Filtering by category (case-insensitive):', options.category);
    }

    if (options?.manufacturer) {
      queryBuilder = queryBuilder.ilike('manufacturer', options.manufacturer);
      console.log('🏭 Filtering by manufacturer (case-insensitive):', options.manufacturer);
    }

    // Limit results (default 50)
    queryBuilder = queryBuilder.limit(options?.limit || 50);

    // Order by product name for consistency
    queryBuilder = queryBuilder.order('product_name', { ascending: true });

    const { data, error } = await queryBuilder;

    console.log('✅ Search results:', {
      resultCount: data?.length || 0,
      hasError: !!error,
      errorMessage: error?.message,
      errorDetails: error,
    });

    if (error) {
      console.error('❌ Error searching products:', error);
      return { data: null, error: new Error(error.message) };
    }

    if (data) {
      console.log(
        '📦 Sample products:',
        data.slice(0, 3).map((p: any) => ({
          id: p.id,
          name: p.product_name,
          sku: p.sku,
        }))
      );
    }

    return { data, error: null };
  } catch (err) {
    console.error('💥 Unexpected error in searchProducts:', err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

/**
 * Get product details by ID
 * Useful for fetching full product information when replacing line items
 */
export async function getProductById(
  productId: string
): Promise<{ data: ProductCatalog | null; error: Error | null }> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('id', productId)
      .single();

    if (error) {
      console.error('Error fetching product by ID:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error in getProductById:', err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

/**
 * Get products by category with optional manufacturer filtering
 * Useful for populating category-specific dropdowns
 */
export async function getProductsByCategory(
  category: string,
  manufacturer?: string
): Promise<{ data: ProductCatalog[] | null; error: Error | null }> {
  try {
    const supabase = createClient();

    let queryBuilder = supabase
      .from('product_catalog')
      .select('*')
      .eq('category', category);

    if (manufacturer) {
      queryBuilder = queryBuilder.eq('manufacturer', manufacturer);
    }

    queryBuilder = queryBuilder.order('product_name', { ascending: true });

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Error fetching products by category:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error in getProductsByCategory:', err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

/**
 * Calculate price impact when replacing a product
 * Returns the difference in material and labor costs
 */
export function calculatePriceImpact(
  originalProduct: ProductCatalog,
  replacementProduct: ProductCatalog,
  quantity: number
) {
  const originalMaterialCost =
    (originalProduct.physical_properties as any)?.material_cost || 0;
  const originalLaborCost =
    (originalProduct.physical_properties as any)?.labor_cost || 0;

  const replacementMaterialCost =
    (replacementProduct.physical_properties as any)?.material_cost || 0;
  const replacementLaborCost =
    (replacementProduct.physical_properties as any)?.labor_cost || 0;

  const materialDifference = replacementMaterialCost - originalMaterialCost;
  const laborDifference = replacementLaborCost - originalLaborCost;
  const totalDifference = materialDifference + laborDifference;

  const materialImpactPercent =
    originalMaterialCost > 0
      ? ((materialDifference / originalMaterialCost) * 100).toFixed(2)
      : '0.00';

  const laborImpactPercent =
    originalLaborCost > 0
      ? ((laborDifference / originalLaborCost) * 100).toFixed(2)
      : '0.00';

  return {
    materialDifference,
    laborDifference,
    totalDifference,
    materialDifferenceExtended: materialDifference * quantity,
    laborDifferenceExtended: laborDifference * quantity,
    totalDifferenceExtended: totalDifference * quantity,
    materialImpactPercent,
    laborImpactPercent,
  };
}
