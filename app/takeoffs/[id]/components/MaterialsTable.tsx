'use client';

import React, { useState, useMemo } from 'react';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import { TakeoffLineItem } from '@/lib/utils/exportTakeoffExcel';

// =============================================================================
// Types
// =============================================================================

export interface MaterialsTableProps {
  items: TakeoffLineItem[];
  totalMaterialCost: number;
}

// =============================================================================
// Constants - Matches exportTakeoffExcel.ts section ordering
// =============================================================================

const SECTION_ORDER: Record<string, number> = {
  'cladding': 1,
  'trims': 2,
  'metals_flashings': 3,
  'waterproofing': 4,
  'accessories': 5,
  'soffit': 6,
  'gutters': 7,
  'labor': 8,
  'overhead': 99,
};

const PRESENTATION_GROUP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  cladding: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-200 dark:border-blue-800',
  },
  trims: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-800 dark:text-purple-200',
    border: 'border-purple-200 dark:border-purple-800',
  },
  metals_flashings: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-800 dark:text-orange-200',
    border: 'border-orange-200 dark:border-orange-800',
  },
  waterproofing: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    border: 'border-green-200 dark:border-green-800',
  },
  accessories: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-200 dark:border-amber-800',
  },
  soffit: {
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-800 dark:text-teal-200',
    border: 'border-teal-200 dark:border-teal-800',
  },
  gutters: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-800 dark:text-cyan-200',
    border: 'border-cyan-200 dark:border-cyan-800',
  },
};

const DEFAULT_GROUP_COLORS = {
  bg: 'bg-gray-100 dark:bg-gray-800',
  text: 'text-gray-800 dark:text-gray-200',
  border: 'border-gray-200 dark:border-gray-700',
};

/**
 * Maps legacy presentation_group values to the new consolidated groups.
 * Ensures backward compatibility with existing takeoff_line_items rows.
 * Matches logic in exportTakeoffExcel.ts
 */
function mapLegacyPresentationGroup(group: string): string {
  const normalized = group.toLowerCase().trim();
  const legacy: Record<string, string> = {
    'siding': 'cladding',
    'siding & underlayment': 'cladding',
    'trim': 'trims',
    'trim & corners': 'trims',
    'corners': 'trims',
    'flashing': 'metals_flashings',
    'flashing & weatherproofing': 'metals_flashings',
    'fasteners': 'accessories',
    'fasteners & accessories': 'accessories',
    'caulk': 'accessories',
    'caulk & sealants': 'accessories',
    'belly_band': 'trims',
    'belly band': 'trims',
    'soffit_fascia': 'soffit',
    'soffit & fascia': 'soffit',
    'fascia': 'trims',
    'roofing_components': 'accessories',
    'roofing components': 'accessories',
    'window_door_trim': 'trims',
    'window & door trim': 'trims',
    'architectural_details': 'accessories',
    'architectural details': 'accessories',
    'unmatched_items': 'accessories',
    'unmatched items': 'accessories',
    'other materials': 'accessories',
    'other': 'accessories',
    'paint': 'accessories',
    'paint & primer': 'accessories',
    'gutters & downspouts': 'gutters',
  };
  return legacy[normalized] || (normalized in SECTION_ORDER ? normalized : 'accessories');
}

const GROUP_DISPLAY_NAMES: Record<string, string> = {
  'cladding': 'Cladding',
  'trims': 'Trims',
  'metals_flashings': 'Metals / Flashings',
  'waterproofing': 'Waterproofing',
  'accessories': 'Accessories',
  'soffit': 'Soffit',
  'gutters': 'Gutters & Downspouts',
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

function getGroupColors(group: string | undefined) {
  if (!group) return DEFAULT_GROUP_COLORS;
  const mapped = mapLegacyPresentationGroup(group);
  return PRESENTATION_GROUP_COLORS[mapped] || DEFAULT_GROUP_COLORS;
}

function formatGroupName(group: string | undefined): string {
  if (!group) return 'Other';
  const mapped = mapLegacyPresentationGroup(group);
  return GROUP_DISPLAY_NAMES[mapped] || group.charAt(0).toUpperCase() + group.slice(1).toLowerCase();
}

function getSectionOrder(sectionName: string): number {
  const mapped = mapLegacyPresentationGroup(sectionName);
  return SECTION_ORDER[mapped] ?? 50;
}

// =============================================================================
// Component
// =============================================================================

export function MaterialsTable({ items, totalMaterialCost }: MaterialsTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Toggle group collapse state
  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Calculate group subtotal
  const getGroupSubtotal = (groupItems: TakeoffLineItem[]) => {
    return groupItems.reduce((sum, item) => {
      const total = typeof item.material_extended === 'string'
        ? parseFloat(item.material_extended)
        : item.material_extended;
      return sum + (total || 0);
    }, 0);
  };

  // Group line items by presentation_group (mapped to consolidated groups) and sort by section order
  const groupedLineItems = useMemo(() => {
    if (!items) return new Map<string, TakeoffLineItem[]>();

    const groups = new Map<string, TakeoffLineItem[]>();
    items.forEach((item) => {
      // Map legacy presentation_group values to consolidated groups
      const rawGroup = item.presentation_group || item.category || 'accessories';
      const group = mapLegacyPresentationGroup(rawGroup);
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(item);
    });

    const sortedEntries = Array.from(groups.entries()).sort(
      ([a], [b]) => getSectionOrder(a) - getSectionOrder(b)
    );

    return new Map(sortedEntries);
  }, [items]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Materials
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({items?.length || 0} items)
          </span>
        </div>
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          {formatCurrency(totalMaterialCost)}
        </span>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
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
            {Array.from(groupedLineItems.entries()).map(([group, groupItems]) => {
              const colors = getGroupColors(group);
              const isCollapsed = collapsedGroups.has(group);
              const groupSubtotal = getGroupSubtotal(groupItems);
              return (
                <React.Fragment key={group}>
                  {/* Group Header - Clickable */}
                  <tr
                    className={`${colors.bg} ${colors.border} border-y cursor-pointer hover:opacity-80 transition-opacity`}
                    onClick={() => toggleGroup(group)}
                  >
                    <td
                      colSpan={3}
                      className={`px-4 py-3 text-sm font-semibold ${colors.text}`}
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        {formatGroupName(group)}
                        <span className="font-normal opacity-75">
                          ({groupItems.length} {groupItems.length === 1 ? 'item' : 'items'})
                        </span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right font-mono ${colors.text}`}>
                      {formatCurrency(groupSubtotal)}
                    </td>
                  </tr>
                  {/* Group Items - Collapsible */}
                  {!isCollapsed && groupItems.map((item, idx) => (
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
                        {formatQuantity(item.quantity)} <span className="text-gray-500 dark:text-gray-400">{item.unit || 'EA'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-600 dark:text-gray-400">
                        {formatCurrency(item.material_unit_cost)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-900 dark:text-white">
                        {formatCurrency(item.material_extended)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          {/* Totals Footer */}
          <tfoot className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 sticky bottom-0">
            <tr>
              <td
                colSpan={3}
                className="px-4 py-4 text-sm font-semibold text-gray-900 dark:text-white text-right"
              >
                Materials Total
              </td>
              <td className="px-4 py-4 text-sm text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalMaterialCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
