'use client';

import React, { memo, useState, useCallback, useMemo } from 'react';
import { X, Search, Package, Loader2 } from 'lucide-react';
import { useMaterialSearch, type MaterialItem } from '@/lib/hooks/useMaterialSearch';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface BulkMaterialPickerProps {
  selectedDetections: ExtractionDetection[];
  onMaterialSelect: (materialId: string | null) => void;
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

// Map detection classes to trades for filtering products
const CLASS_TO_TRADE: Record<string, string> = {
  siding: 'siding',
  window: 'windows',
  door: 'siding',
  garage: 'siding',
  roof: 'roofing',
  gable: 'siding',
  trim: 'siding',
  fascia: 'siding',
  gutter: 'gutters',
  eave: 'siding',
  rake: 'siding',
  ridge: 'roofing',
  soffit: 'siding',
  '': 'siding',
};

// Friendly display names for manufacturers
const MANUFACTURER_DISPLAY_NAMES: Record<string, string> = {
  'LP Building Solutions': 'LP SmartSide',
  'Engage Building Products': 'FastPlank',
  'James Hardie': 'James Hardie',
  'Allura': 'Allura',
  'CertainTeed': 'CertainTeed',
  'Ply Gem': 'Ply Gem',
  'Mastic': 'Mastic',
  'Alcoa': 'Alcoa',
  'Milgard': 'Milgard',
  'Marvin': 'Marvin',
  'Pella': 'Pella',
  'Andersen': 'Andersen',
};

function getManufacturerDisplayName(manufacturer: string): string {
  return MANUFACTURER_DISPLAY_NAMES[manufacturer] || manufacturer;
}

function getTradeFromClass(detectionClass: DetectionClass | undefined): string {
  if (!detectionClass) return 'siding';
  return CLASS_TO_TRADE[detectionClass] || 'siding';
}

function formatCost(cost: number | null, unit: string): string {
  if (cost === null || cost === undefined) return '—';
  return `$${cost.toFixed(2)}/${unit}`;
}

// =============================================================================
// Product Item Component
// =============================================================================

interface ProductItemProps {
  item: MaterialItem;
  onClick: () => void;
}

const ProductItem = memo(function ProductItem({ item, onClick }: ProductItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-gray-700 border border-transparent"
    >
      <div className="text-sm font-medium text-gray-100 truncate">
        {item.product_name}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400 mt-0.5">
        <span className="truncate">{item.category || item.sku}</span>
        <span className="flex-shrink-0 ml-2 font-medium text-green-400">
          {formatCost(item.material_cost, item.unit)}
        </span>
      </div>
    </button>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const BulkMaterialPicker = memo(function BulkMaterialPicker({
  selectedDetections,
  onMaterialSelect,
  onClose,
}: BulkMaterialPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('');

  // Determine the trade and class from selected detections
  const { trade, detectionClass } = useMemo(() => {
    if (selectedDetections.length === 0) {
      return { trade: 'siding', detectionClass: '' };
    }
    // Use the most common class among selected detections
    const classCounts = new Map<string, number>();
    for (const d of selectedDetections) {
      const cls = d.class || '';
      classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
    }
    let maxClass = '';
    let maxCount = 0;
    for (const [cls, count] of classCounts) {
      if (count > maxCount) {
        maxClass = cls;
        maxCount = count;
      }
    }
    return {
      trade: getTradeFromClass(maxClass as DetectionClass),
      detectionClass: maxClass,
    };
  }, [selectedDetections]);

  // Fetch products filtered by trade and detection class
  const { items, categories, manufacturers, isLoading, error } = useMaterialSearch({
    trade,
    detectionClass: detectionClass || undefined,
    category: selectedCategory || undefined,
    manufacturer: selectedManufacturer || undefined,
    search: searchQuery || undefined,
    enabled: selectedDetections.length > 0,
    limit: 30,
  });

  // Handle material selection
  const handleSelectMaterial = useCallback((item: MaterialItem) => {
    onMaterialSelect(item.id);
  }, [onMaterialSelect]);

  // Handle clear assignment
  const handleClearAssignment = useCallback(() => {
    onMaterialSelect(null);
  }, [onMaterialSelect]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-lg font-medium text-gray-100">
              Assign Material
            </h3>
            <p className="text-sm text-gray-400">
              {selectedDetections.length} item{selectedDetections.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 space-y-2 border-b border-gray-700">
          {/* Manufacturer Filter */}
          {manufacturers.length > 0 && (
            <select
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-gray-600 bg-gray-700 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map((mfr) => (
                <option key={mfr} value={mfr}>
                  {getManufacturerDisplayName(mfr)}
                </option>
              ))}
            </select>
          )}

          {/* Category Filter */}
          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-gray-600 bg-gray-700 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-8 pl-8 pr-2 text-sm rounded-md border border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading products...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-400">
              Error loading products
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Package className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-sm">No products found</span>
            </div>
          ) : (
            items.map((item) => (
              <ProductItem
                key={item.id}
                item={item}
                onClick={() => handleSelectMaterial(item)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex gap-2">
          <button
            type="button"
            onClick={handleClearAssignment}
            className="flex-1 h-9 px-4 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
          >
            Clear Assignment
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});

export default BulkMaterialPicker;
