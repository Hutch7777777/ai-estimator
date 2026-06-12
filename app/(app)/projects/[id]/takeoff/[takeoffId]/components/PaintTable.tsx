'use client';

import { useState, useMemo } from 'react';
import { Paintbrush, ChevronDown, ChevronRight } from 'lucide-react';
import { TakeoffLineItem } from '@/lib/utils/exportTakeoffExcel';

// =============================================================================
// Types
// =============================================================================

export interface PaintTableProps {
  items: TakeoffLineItem[];
  totalPaintCost: number;
}

// =============================================================================
// Constants
// =============================================================================

const PAINT_CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  paint_material: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-800 dark:text-purple-200',
    border: 'border-purple-200 dark:border-purple-800',
  },
  primer: {
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-800 dark:text-violet-200',
    border: 'border-violet-200 dark:border-violet-800',
  },
  paint_labor: {
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30',
    text: 'text-fuchsia-800 dark:text-fuchsia-200',
    border: 'border-fuchsia-200 dark:border-fuchsia-800',
  },
  paint_supplies: {
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-800 dark:text-pink-200',
    border: 'border-pink-200 dark:border-pink-800',
  },
};

const DEFAULT_CATEGORY_COLORS = {
  bg: 'bg-purple-50 dark:bg-purple-900/20',
  text: 'text-purple-800 dark:text-purple-200',
  border: 'border-purple-200 dark:border-purple-700',
};

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

function formatQuantity(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toFixed(1);
}

/**
 * Categorize a paint item into sub-groups for organized display
 */
function categorizePaintItem(item: TakeoffLineItem): string {
  const desc = (item.description || '').toLowerCase();
  const sku = (item.sku || '').toLowerCase();

  // Check for labor items first
  if (sku.includes('labor-paint') || desc.includes('paint labor')) {
    return 'paint_labor';
  }

  // Check for primer
  if (desc.includes('primer') || sku.includes('primer')) {
    return 'primer';
  }

  // Check for supplies (brushes, rollers, tape, drop cloths, etc.)
  if (desc.includes('supplies') || desc.includes('brush') || desc.includes('roller') ||
      desc.includes('tape') || desc.includes('drop cloth') || desc.includes('tray')) {
    return 'paint_supplies';
  }

  // Default to paint material (gallons of paint)
  return 'paint_material';
}

function getCategoryColors(category: string) {
  return PAINT_CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLORS;
}

function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    paint_material: 'Paint Materials',
    primer: 'Primer',
    paint_labor: 'Paint Labor',
    paint_supplies: 'Paint Supplies',
  };
  return names[category] || 'Other';
}

// =============================================================================
// Component
// =============================================================================

export function PaintTable({ items, totalPaintCost }: PaintTableProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Group items by paint category
  const groupedItems = useMemo(() => {
    if (!items || items.length === 0) return new Map<string, TakeoffLineItem[]>();

    const groups = new Map<string, TakeoffLineItem[]>();
    const categoryOrder = ['paint_material', 'primer', 'paint_labor', 'paint_supplies'];

    items.forEach((item) => {
      const category = categorizePaintItem(item);
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    });

    // Sort by category order
    const sortedEntries = Array.from(groups.entries()).sort(
      ([a], [b]) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
    );

    return new Map(sortedEntries);
  }, [items]);

  // Calculate category subtotal
  const getCategorySubtotal = (categoryItems: TakeoffLineItem[]) => {
    return categoryItems.reduce((sum, item) => {
      // For paint items, use material_extended or calculate from quantity * unit cost
      const materialExt = typeof item.material_extended === 'string'
        ? parseFloat(item.material_extended)
        : item.material_extended;
      const laborExt = typeof item.labor_extended === 'string'
        ? parseFloat(item.labor_extended)
        : item.labor_extended;
      return sum + (materialExt || 0) + (laborExt || 0);
    }, 0);
  };

  // Toggle category collapse
  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      <div
        className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
            <Paintbrush className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex items-center gap-2">
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Paint
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({items.length} {items.length === 1 ? 'item' : 'items'})
            </span>
          </div>
        </div>
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          {formatCurrency(totalPaintCost)}
        </span>
      </div>

      {!isCollapsed && (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Qty
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Unit Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Extended
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {Array.from(groupedItems.entries()).map(([category, categoryItems]) => {
                const colors = getCategoryColors(category);
                const isCategoryCollapsed = collapsedCategories.has(category);
                const categorySubtotal = getCategorySubtotal(categoryItems);

                return (
                  <tr key={category}>
                    <td colSpan={4} className="p-0">
                      <table className="w-full">
                        <tbody>
                          {/* Category Header - Clickable */}
                          <tr
                            className={`${colors.bg} ${colors.border} border-y cursor-pointer hover:opacity-80 transition-opacity`}
                            onClick={() => toggleCategory(category)}
                          >
                            <td
                              colSpan={3}
                              className={`px-4 py-3 text-sm font-semibold ${colors.text}`}
                            >
                              <div className="flex items-center gap-2">
                                {isCategoryCollapsed ? (
                                  <ChevronRight className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                                {formatCategoryName(category)}
                                <span className="font-normal opacity-75">
                                  ({categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'})
                                </span>
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-sm font-semibold text-right font-mono ${colors.text}`}>
                              {formatCurrency(categorySubtotal)}
                            </td>
                          </tr>
                          {/* Category Items - Collapsible */}
                          {!isCategoryCollapsed && categoryItems.map((item, idx) => {
                            // Determine which cost to show based on item type
                            const isLaborItem = category === 'paint_labor';
                            const unitCost = isLaborItem
                              ? (item.labor_unit_cost || item.material_unit_cost || 0)
                              : (item.material_unit_cost || 0);
                            const extended = isLaborItem
                              ? (item.labor_extended || item.material_extended || 0)
                              : (item.material_extended || 0);

                            return (
                              <tr
                                key={item.id || idx}
                                className={`
                                  ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}
                                  hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
                                `}
                              >
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  <div className="max-w-md" title={item.description}>
                                    {item.description}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white whitespace-nowrap">
                                  {formatQuantity(item.quantity)} <span className="text-gray-500 dark:text-gray-400">{item.unit || (isLaborItem ? 'SF' : 'GAL')}</span>
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-mono text-gray-600 dark:text-gray-400">
                                  {formatCurrency(unitCost)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-900 dark:text-white">
                                  {formatCurrency(extended)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 sticky bottom-0">
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-4 text-sm font-semibold text-gray-900 dark:text-white text-right"
                >
                  Paint Total
                </td>
                <td className="px-4 py-4 text-sm text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(totalPaintCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
