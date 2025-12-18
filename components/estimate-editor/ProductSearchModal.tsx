"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, DollarSign, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchProducts, calculatePriceImpact } from "@/lib/supabase/products";
import { Database } from "@/lib/types/database";

type ProductCatalog = Database["public"]["Tables"]["product_catalog"]["Row"];

// Category filter configuration mapping UI labels to database values
const CATEGORY_FILTERS = [
  { label: "Siding", value: "lap_siding" },
  { label: "Trim", value: "trim" },
  { label: "Roofing", value: "shingles" },
  { label: "Windows", value: "window" },
  { label: "Gutters", value: "gutter" },
  { label: "Accessories", value: "accessories" },
];

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProduct: {
    id: string;
    product_name: string;
    sku: string | null;
    quantity: number;
    material_unit_cost: number;
    labor_unit_cost: number;
  } | null;
  onReplace: (product: ProductCatalog) => void;
}

export function ProductSearchModal({
  isOpen,
  onClose,
  currentProduct,
  onReplace,
}: ProductSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductCatalog[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    // Trigger search if either:
    // 1. User has typed a search query
    // 2. User has selected a category (show all products in that category)
    if (!searchQuery.trim() && !selectedCategory) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data, error } = await searchProducts(searchQuery, {
        category: selectedCategory || undefined,
        limit: 50,
      });

      if (!error && data) {
        setSearchResults(data);
      } else {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  const handleReplaceProduct = useCallback(
    (product: ProductCatalog) => {
      console.log('🔄 [ProductSearchModal] Replace clicked');
      console.log('🔄 [ProductSearchModal] Product to replace with:', {
        id: product.id,
        name: product.product_name,
        sku: product.sku,
        physical_properties: product.physical_properties,
      });
      console.log('🔄 [ProductSearchModal] Calling onReplace callback');
      onReplace(product);
      console.log('🔄 [ProductSearchModal] Closing modal');
      onClose();
      setSearchQuery("");
      setSearchResults([]);
    },
    [onReplace, onClose]
  );

  const getPriceImpactBadge = (product: ProductCatalog) => {
    if (!currentProduct) return null;

    const currentProductForCalc = {
      id: currentProduct.id,
      product_name: currentProduct.product_name,
      sku: currentProduct.sku,
      physical_properties: {
        material_cost: currentProduct.material_unit_cost,
        labor_cost: currentProduct.labor_unit_cost,
      },
    } as any as ProductCatalog;

    const impact = calculatePriceImpact(
      currentProductForCalc,
      product,
      currentProduct.quantity
    );

    const totalImpact = impact.totalDifferenceExtended;

    if (Math.abs(totalImpact) < 0.01) {
      return <Badge variant="secondary">Same Price</Badge>;
    }

    if (totalImpact > 0) {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          +${Math.abs(totalImpact).toFixed(2)}
        </Badge>
      );
    }

    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        -${Math.abs(totalImpact).toFixed(2)}
      </Badge>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop - clicking closes modal */}
      <div
        className="fixed inset-0 bg-black/50"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white dark:bg-gray-950 rounded-lg shadow-2xl border dark:border-gray-800 w-full max-w-4xl max-h-[85vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b dark:border-gray-800">
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-1">Replace Material</h2>
              <p className="text-sm text-muted-foreground">
                {currentProduct ? (
                  <>
                    Currently selected: <strong>{currentProduct.product_name}</strong>
                    {currentProduct.sku && <span> ({currentProduct.sku})</span>}
                  </>
                ) : (
                  "Search for a product to replace the selected line item"
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name, SKU, or manufacturer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log('🏷️ Category filter: All Categories');
                  setSelectedCategory(null);
                }}
              >
                All Categories
              </Button>
              {CATEGORY_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  variant={selectedCategory === filter.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    console.log('🏷️ Category filter clicked:', filter.value, '(', filter.label, ')');
                    setSelectedCategory(filter.value);
                  }}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            {/* Search Results */}
            <div className="overflow-y-auto border rounded-lg" style={{ maxHeight: "calc(85vh - 280px)" }}>
              {isSearching ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Searching...
                </div>
              ) : searchResults.length === 0 && searchQuery.trim() ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No products found matching "{searchQuery}"
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Start typing to search for products
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((product) => {
                    const materialCost =
                      (product.physical_properties as any)?.material_cost || 0;
                    const laborCost =
                      (product.physical_properties as any)?.labor_cost || 0;
                    const totalCost = materialCost + laborCost;

                    return (
                      <div
                        key={product.id}
                        className="p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium truncate">
                                {product.product_name}
                              </h4>
                              {product.category && (
                                <Badge variant="outline" className="capitalize shrink-0">
                                  {product.category}
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-2">
                              {product.sku && <span>SKU: {product.sku}</span>}
                              {product.manufacturer && (
                                <span>Mfr: {product.manufacturer}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                <span className="font-mono">
                                  ${totalCost.toFixed(2)}
                                </span>
                                <span className="text-muted-foreground">/ unit</span>
                              </div>
                              {currentProduct && getPriceImpactBadge(product)}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => handleReplaceProduct(product)}
                            className="shrink-0"
                          >
                            Replace
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-6 border-t dark:border-gray-800">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
