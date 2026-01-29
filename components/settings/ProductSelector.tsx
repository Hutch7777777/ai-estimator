'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChevronDown, X, Search, Package, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface PricingItem {
  id: string;
  sku: string;
  product_name: string;
  category: string;
  manufacturer: string | null;
  material_cost: number | null;
  unit: string;
}

interface ProductSelectorProps {
  /** Field label */
  label: string;

  /** Help text shown below the selector */
  helpText?: string;

  /** Filter by category (single or array) */
  category?: string | string[];

  /** Filter by trade */
  trade?: string;

  /** Currently selected SKU */
  value: string | null | undefined;

  /** Callback when selection changes */
  onChange: (sku: string | null) => void;

  /** Placeholder text when nothing selected */
  placeholder?: string;

  /** Whether the field is disabled */
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ProductSelector({
  label,
  helpText,
  category,
  trade,
  value,
  onChange,
  placeholder = 'Select a product...',
  disabled = false,
}: ProductSelectorProps) {
  const [products, setProducts] = useState<PricingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Fetch products on mount or when filters change
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('pricing_items')
          .select('id, sku, product_name, category, manufacturer, material_cost, unit')
          .order('product_name', { ascending: true });

        // Apply category filter
        if (category) {
          if (Array.isArray(category)) {
            query = query.in('category', category);
          } else {
            query = query.eq('category', category);
          }
        }

        // Apply trade filter
        if (trade) {
          query = query.eq('trade', trade);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error('Error fetching products:', fetchError);
          setError('Failed to load products');
          setProducts([]);
        } else {
          setProducts(data || []);
        }
      } catch (err) {
        console.error('Product fetch exception:', err);
        setError('Failed to load products');
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [category, trade, supabase]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure dropdown is rendered
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Find currently selected product
  const selectedProduct = useMemo(
    () => products.find((p) => p.sku === value) || null,
    [value, products]
  );

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;

    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  // Group products by category for display
  const groupedProducts = useMemo(() => {
    const groups: Record<string, PricingItem[]> = {};

    filteredProducts.forEach((product) => {
      const cat = product.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(product);
    });

    return groups;
  }, [filteredProducts]);

  const handleSelect = (sku: string) => {
    onChange(sku);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  // Format category name for display
  const formatCategoryName = (cat: string) => {
    return cat
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div ref={containerRef} className="space-y-2" onKeyDown={handleKeyDown}>
      <Label className="text-sm font-medium text-[#0f172a]">{label}</Label>

      <div className="relative">
        {/* Trigger Button */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-left',
            'border border-[#e2e8f0] rounded-md bg-white text-sm',
            'focus:outline-none focus:ring-2 focus:ring-[#00cc6a] focus:border-transparent',
            'transition-colors',
            isOpen && 'ring-2 ring-[#00cc6a] border-transparent',
            disabled && 'bg-[#f8fafc] cursor-not-allowed opacity-60'
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-[#94a3b8]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading products...
            </span>
          ) : error ? (
            <span className="text-red-500">{error}</span>
          ) : selectedProduct ? (
            <span className="flex items-center gap-2 truncate">
              <Package className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
              <span className="truncate text-[#0f172a]">
                {selectedProduct.product_name}
              </span>
              <span className="text-xs text-[#94a3b8] flex-shrink-0">
                ({selectedProduct.sku})
              </span>
            </span>
          ) : (
            <span className="text-[#94a3b8]">{placeholder}</span>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            {selectedProduct && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-[#f1f5f9] rounded transition-colors"
                aria-label="Clear selection"
              >
                <X className="h-4 w-4 text-[#94a3b8]" />
              </button>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[#94a3b8] transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Dropdown */}
        {isOpen && !disabled && (
          <>
            <div className="absolute z-50 mt-1 w-full bg-white border border-[#e2e8f0] rounded-md shadow-lg max-h-80 overflow-hidden">
              {/* Search Input */}
              <div className="p-2 border-b border-[#e2e8f0]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search by name or SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 border-[#e2e8f0]"
                  />
                </div>
              </div>

              {/* Product List */}
              <div className="max-h-56 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-[#94a3b8] text-sm">
                    {products.length === 0
                      ? 'No products available'
                      : 'No products match your search'}
                  </div>
                ) : Object.keys(groupedProducts).length === 1 ? (
                  // Single category - no headers
                  filteredProducts.map((product) => (
                    <ProductOption
                      key={product.id}
                      product={product}
                      isSelected={value === product.sku}
                      onSelect={handleSelect}
                    />
                  ))
                ) : (
                  // Multiple categories - show headers
                  Object.entries(groupedProducts).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-[#64748b] bg-[#f8fafc] uppercase tracking-wide">
                        {formatCategoryName(cat)}
                      </div>
                      {items.map((product) => (
                        <ProductOption
                          key={product.id}
                          product={product}
                          isSelected={value === product.sku}
                          onSelect={handleSelect}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Backdrop to close dropdown */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setIsOpen(false);
                setSearchQuery('');
              }}
            />
          </>
        )}
      </div>

      {helpText && (
        <p className="text-xs text-[#94a3b8]">{helpText}</p>
      )}
    </div>
  );
}

// =============================================================================
// Product Option Component
// =============================================================================

interface ProductOptionProps {
  product: PricingItem;
  isSelected: boolean;
  onSelect: (sku: string) => void;
}

function ProductOption({ product, isSelected, onSelect }: ProductOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product.sku)}
      className={cn(
        'w-full px-3 py-2 text-left flex items-center gap-3 text-sm',
        'hover:bg-[#f0fdf4] transition-colors',
        isSelected && 'bg-[#f0fdf4]'
      )}
    >
      <Package className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="font-medium text-[#0f172a] truncate">
          {product.product_name}
        </div>
        <div className="text-xs text-[#94a3b8]">
          {product.sku}
          {product.manufacturer && ` • ${product.manufacturer}`}
        </div>
      </div>

      <div className="text-sm font-medium text-[#00cc6a] flex-shrink-0">
        ${product.material_cost?.toFixed(2) ?? 'N/A'}
        <span className="text-xs text-[#94a3b8]">/{product.unit}</span>
      </div>
    </button>
  );
}
