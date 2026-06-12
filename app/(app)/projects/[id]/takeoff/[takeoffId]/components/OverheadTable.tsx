'use client';

import { useState } from 'react';
import { Receipt, ChevronDown, ChevronRight } from 'lucide-react';
import { OverheadItem } from '@/lib/utils/exportTakeoffExcel';

// =============================================================================
// Types
// =============================================================================

export interface OverheadTableProps {
  items: OverheadItem[];
  totalOverheadCost: number;
}

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

// =============================================================================
// Component
// =============================================================================

export function OverheadTable({ items, totalOverheadCost }: OverheadTableProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
            <Receipt className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex items-center gap-2">
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Overhead
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({items.length} {items.length === 1 ? 'item' : 'items'})
            </span>
          </div>
        </div>
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          {formatCurrency(totalOverheadCost)}
        </span>
      </div>

      {!isCollapsed && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  className={`
                    ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}
                    hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
                  `}
                  title={item.notes || undefined}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-900 dark:text-white">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
              <tr>
                <td className="px-4 py-4 text-sm font-semibold text-gray-900 dark:text-white text-right">
                  Overhead Total
                </td>
                <td className="px-4 py-4 text-sm text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(totalOverheadCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
