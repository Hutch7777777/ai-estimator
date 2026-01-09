'use client';

import React, { memo, useState, useEffect, useMemo } from 'react';
import { Search, X, Package, Loader2 } from 'lucide-react';
import { useMaterialSearch, getMaterialById, type MaterialItem } from '@/lib/hooks/useMaterialSearch';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface MaterialAssignmentProps {
  selectedDetections: ExtractionDetection[];
  onMaterialAssign: (detectionIds: string[], materialId: string | null) => void;
}

// =============================================================================
// Constants
// =============================================================================

// Map detection classes to trades for filtering products
const CLASS_TO_TRADE: Record<string, string> = {
  // Area classes (SF)
  siding: 'siding',
  window: 'windows',
  door: 'siding',
  garage: 'siding',
  roof: 'roofing',
  gable: 'siding',
  // Linear classes (LF)
  trim: 'siding',
  fascia: 'siding',
  gutter: 'gutters',
  eave: 'siding',
  rake: 'siding',
  ridge: 'roofing',
  soffit: 'siding',
  '': 'siding',
};

// =============================================================================
// Helper Functions
// =============================================================================

function formatCost(cost: number | null, unit: string): string {
  if (cost === null || cost === undefined) return '—';
  return `$${cost.toFixed(2)}/${unit}`;
}

function getTradeFromClass(detectionClass: DetectionClass | undefined): string {
  if (!detectionClass) return 'siding';
  return CLASS_TO_TRADE[detectionClass] || 'siding';
}

// =============================================================================
// Product Item Component
// =============================================================================

interface ProductItemProps {
  item: MaterialItem;
  isSelected: boolean;
  onClick: () => void;
}

const ProductItem = memo(function ProductItem({ item, isSelected, onClick }: ProductItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left px-2 py-1.5 rounded-md transition-colors
        ${isSelected
          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
        }
      `}
    >
      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
        {item.product_name}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span className="truncate">{item.manufacturer}</span>
        <span className="flex-shrink-0 ml-2">{formatCost(item.material_cost, item.unit)}</span>
      </div>
    </button>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const MaterialAssignment = memo(function MaterialAssignment({
  selectedDetections,
  onMaterialAssign,
}: MaterialAssignmentProps) {
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [assignedMaterial, setAssignedMaterial] = useState<MaterialItem | null>(null);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  // Determine the trade and class from selected detections
  const { trade, detectionClass } = useMemo(() => {
    if (selectedDetections.length === 0) {
      return { trade: 'siding', detectionClass: '' };
    }
    const cls = selectedDetections[0].class || '';
    return { trade: getTradeFromClass(cls as DetectionClass), detectionClass: cls };
  }, [selectedDetections]);

  // Get current assigned material ID (use first detection if multi-select)
  const currentAssignedId = useMemo(() => {
    if (selectedDetections.length === 0) return null;
    return selectedDetections[0].assigned_material_id || null;
  }, [selectedDetections]);

  // Check if all selected detections have same material assigned
  const hasMixedAssignment = useMemo(() => {
    if (selectedDetections.length <= 1) return false;
    const firstId = selectedDetections[0].assigned_material_id;
    return selectedDetections.some((d) => d.assigned_material_id !== firstId);
  }, [selectedDetections]);

  // Fetch products filtered by trade and detection class
  const { items, categories, isLoading, error } = useMaterialSearch({
    trade,
    detectionClass: detectionClass || undefined,
    category: selectedCategory || undefined,
    search: searchQuery || undefined,
    enabled: selectedDetections.length > 0,
    limit: 20,
  });

  // Load assigned material details when selection changes
  useEffect(() => {
    if (!currentAssignedId) {
      setAssignedMaterial(null);
      return;
    }

    setLoadingAssigned(true);
    getMaterialById(currentAssignedId)
      .then((material) => {
        setAssignedMaterial(material);
      })
      .finally(() => {
        setLoadingAssigned(false);
      });
  }, [currentAssignedId]);

  // Handle material selection
  const handleSelectMaterial = (item: MaterialItem) => {
    const ids = selectedDetections.map((d) => d.id);
    onMaterialAssign(ids, item.id);
  };

  // Handle clear assignment
  const handleClearAssignment = () => {
    const ids = selectedDetections.map((d) => d.id);
    onMaterialAssign(ids, null);
  };

  if (selectedDetections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Section Header */}
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Material
      </span>

      {/* Currently Assigned */}
      {(assignedMaterial || hasMixedAssignment || loadingAssigned) && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Assigned</span>
            {assignedMaterial && !hasMixedAssignment && (
              <button
                type="button"
                onClick={handleClearAssignment}
                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Clear assignment"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {loadingAssigned ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading...
            </div>
          ) : hasMixedAssignment ? (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              Mixed assignments
            </div>
          ) : assignedMaterial ? (
            <div>
              <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                {assignedMaterial.product_name}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {formatCost(assignedMaterial.material_cost, assignedMaterial.unit)}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Category Filter */}
      <select
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        className="w-full h-8 px-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All Categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search products..."
          className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Product List */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading products...</span>
          </div>
        ) : error ? (
          <div className="py-4 text-center text-xs text-red-500">
            Error loading products
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-gray-400">
            <Package className="w-6 h-6 mb-1 opacity-50" />
            <span className="text-xs">No products found</span>
          </div>
        ) : (
          items.map((item) => (
            <ProductItem
              key={item.id}
              item={item}
              isSelected={item.id === currentAssignedId}
              onClick={() => handleSelectMaterial(item)}
            />
          ))
        )}
      </div>
    </div>
  );
});

export default MaterialAssignment;
