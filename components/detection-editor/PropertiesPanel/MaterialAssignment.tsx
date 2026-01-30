'use client';

import React, { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X, Package, Loader2, Zap } from 'lucide-react';
import { useMaterialSearch, getMaterialById, isAutoScopeOnlyClass, type MaterialItem } from '@/lib/hooks/useMaterialSearch';
import type { ExtractionDetection, DetectionClass } from '@/lib/types/extraction';
import EditablePrice from './EditablePrice';

// =============================================================================
// Types
// =============================================================================

interface MaterialAssignmentProps {
  selectedDetections: ExtractionDetection[];
  onMaterialAssign: (detectionIds: string[], materialId: string | null) => void;
  /** Callback when user edits the price - receives null to clear override */
  onPriceOverride?: (price: number | null) => void;
  /** Current price override from the selected detection (only used for single selection) */
  currentPriceOverride?: number | null;
  /** Callback to assign material AND set price override in one action */
  onMaterialAssignWithPrice?: (detectionIds: string[], materialId: string, priceOverride: number) => void;
}

// =============================================================================
// Constants
// =============================================================================

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

// Get display name for manufacturer (fallback to original if not mapped)
function getManufacturerDisplayName(manufacturer: string): string {
  return MANUFACTURER_DISPLAY_NAMES[manufacturer] || manufacturer;
}

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
  /** Enable price editing in the list */
  onPriceEdit?: (newPrice: number) => void;
  /** Whether price editing is enabled */
  priceEditable?: boolean;
}

const ProductItem = memo(function ProductItem({
  item,
  isSelected,
  onClick,
  onPriceEdit,
  priceEditable = false
}: ProductItemProps) {
  // Handle price change from EditablePrice - assigns material with custom price
  const handlePriceChange = useCallback((newPrice: number | null) => {
    if (newPrice !== null && onPriceEdit) {
      onPriceEdit(newPrice);
    }
  }, [onPriceEdit]);

  // Handle click on the row - but not when clicking on editable price
  const handleRowClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger if clicking on an input or button inside EditablePrice
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('[data-price-editor]')) {
      return;
    }
    console.log('[ProductItem] Row clicked, calling onClick for:', item.product_name);
    onClick();
  }, [onClick, item.product_name]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`
        w-full text-left px-2 py-1.5 rounded-md transition-colors cursor-pointer
        ${isSelected
          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
        }
      `}
    >
      {/* Product name */}
      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
        {item.product_name}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span className="truncate">{item.category || item.sku}</span>
        {/* Price - either editable or static */}
        <span
          className="flex-shrink-0 ml-2 font-medium text-green-600 dark:text-green-400"
          data-price-editor={priceEditable ? 'true' : undefined}
        >
          {priceEditable && onPriceEdit ? (
            <EditablePrice
              basePrice={item.material_cost}
              unit={item.unit}
              onPriceChange={handlePriceChange}
              size="sm"
            />
          ) : (
            formatCost(item.material_cost, item.unit)
          )}
        </span>
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const MaterialAssignment = memo(function MaterialAssignment({
  selectedDetections,
  onMaterialAssign,
  onPriceOverride,
  currentPriceOverride,
  onMaterialAssignWithPrice,
}: MaterialAssignmentProps) {
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('');
  const [assignedMaterial, setAssignedMaterial] = useState<MaterialItem | null>(null);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  // Determine the trade and class from selected detections
  const { trade, detectionClass, isAutoScopeOnly } = useMemo(() => {
    if (selectedDetections.length === 0) {
      return { trade: 'siding', detectionClass: '', isAutoScopeOnly: false };
    }
    const cls = selectedDetections[0].class || '';
    return {
      trade: getTradeFromClass(cls as DetectionClass),
      detectionClass: cls,
      isAutoScopeOnly: isAutoScopeOnlyClass(cls),
    };
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
  const { items, categories, manufacturers, isLoading, error } = useMaterialSearch({
    trade,
    detectionClass: detectionClass || undefined,
    category: selectedCategory || undefined,
    manufacturer: selectedManufacturer || undefined,
    search: searchQuery || undefined,
    enabled: selectedDetections.length > 0,
    limit: 20,
  });

  // Load assigned material details when selection changes
  useEffect(() => {
    console.log('[MaterialAssignment] currentAssignedId changed:', currentAssignedId);

    if (!currentAssignedId) {
      console.log('[MaterialAssignment] No assigned ID, clearing material');
      setAssignedMaterial(null);
      return;
    }

    setLoadingAssigned(true);
    console.log('[MaterialAssignment] Fetching material for ID:', currentAssignedId);

    getMaterialById(currentAssignedId)
      .then((material) => {
        console.log('[MaterialAssignment] Got material:', material);
        setAssignedMaterial(material);
      })
      .catch((err) => {
        console.error('[MaterialAssignment] Error fetching material:', err);
        setAssignedMaterial(null);
      })
      .finally(() => {
        setLoadingAssigned(false);
      });
  }, [currentAssignedId]);

  // Handle material selection
  const handleSelectMaterial = useCallback((item: MaterialItem) => {
    const ids = selectedDetections.map((d) => d.id);
    console.log('[MaterialAssignment] handleSelectMaterial called:', {
      detectionIds: ids,
      materialId: item.id,
      productName: item.product_name,
      currentAssignedId,
      selectedDetectionsCount: selectedDetections.length,
    });

    if (ids.length === 0) {
      console.warn('[MaterialAssignment] No detection IDs to assign material to!');
      return;
    }

    // Call the parent handler
    onMaterialAssign(ids, item.id);
    console.log('[MaterialAssignment] onMaterialAssign callback executed');
  }, [selectedDetections, currentAssignedId, onMaterialAssign]);

  // Handle clear assignment
  const handleClearAssignment = () => {
    const ids = selectedDetections.map((d) => d.id);
    onMaterialAssign(ids, null);
  };

  // Handle assigning a material with a custom price (from product list price edit)
  const handleAssignWithPrice = useCallback((item: MaterialItem, customPrice: number) => {
    const ids = selectedDetections.map((d) => d.id);
    if (onMaterialAssignWithPrice) {
      onMaterialAssignWithPrice(ids, item.id, customPrice);
    } else {
      // Fallback: assign material then set price override
      onMaterialAssign(ids, item.id);
      if (onPriceOverride) {
        onPriceOverride(customPrice);
      }
    }
  }, [selectedDetections, onMaterialAssign, onMaterialAssignWithPrice, onPriceOverride]);

  // Handle price override for assigned material
  const handleAssignedPriceChange = useCallback((newPrice: number | null) => {
    if (onPriceOverride) {
      onPriceOverride(newPrice);
    }
  }, [onPriceOverride]);

  if (selectedDetections.length === 0) {
    return null;
  }

  // For auto-scope-only classes (vents, outlets, corners, etc.), show informative message
  if (isAutoScopeOnly) {
    const classLabel = detectionClass.replace(/_/g, ' ');
    return (
      <div className="space-y-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Material
        </span>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3">
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Auto-Generated
              </div>
              <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                Materials for <span className="capitalize font-medium">{classLabel}</span> are automatically calculated based on count. No manual assignment needed.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
              {/* Editable Price Display using EditablePrice component */}
              <EditablePrice
                basePrice={assignedMaterial.material_cost}
                unit={assignedMaterial.unit}
                currentOverride={currentPriceOverride}
                onPriceChange={handleAssignedPriceChange}
                disabled={selectedDetections.length !== 1 || !onPriceOverride}
                size="sm"
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Manufacturer Filter - only show if there are manufacturers to choose from */}
      {manufacturers.length > 0 && (
        <select
          value={selectedManufacturer}
          onChange={(e) => setSelectedManufacturer(e.target.value)}
          className="w-full h-8 px-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Manufacturers</option>
          {manufacturers.map((mfr) => (
            <option key={mfr} value={mfr}>
              {getManufacturerDisplayName(mfr)}
            </option>
          ))}
        </select>
      )}

      {/* Category Filter - only show if there are categories to choose from */}
      {categories.length > 0 && (
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
      )}

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
              priceEditable={selectedDetections.length === 1 && !!onPriceOverride}
              onPriceEdit={(customPrice) => handleAssignWithPrice(item, customPrice)}
            />
          ))
        )}
      </div>
    </div>
  );
});

export default MaterialAssignment;
