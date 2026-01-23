'use client';

import { Package, Wrench, Receipt } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface CostSummaryCardProps {
  totals: {
    material_cost: number;
    labor_cost: number;
    overhead_cost: number;
    subtotal: number;
    markup_percent: number;
    final_price: number;
  };
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

export function CostSummaryCard({ totals }: CostSummaryCardProps) {
  const markupAmount = (totals.final_price || 0) - (totals.subtotal || 0);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      <div className="p-8">
        {/* Final Price - Hero Section */}
        <div className="text-center mb-8">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Final Price
          </p>
          <p className="text-5xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(totals.final_price)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            includes {totals.markup_percent || 0}% markup
          </p>
        </div>

        {/* Cost Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Materials Card */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Materials</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {formatCurrency(totals.material_cost)}
            </p>
          </div>

          {/* Labor Card */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Labor</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {formatCurrency(totals.labor_cost)}
            </p>
          </div>

          {/* Overhead Card */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Overhead</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {formatCurrency(totals.overhead_cost)}
            </p>
          </div>
        </div>

        {/* Subtotal and Markup - Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Subtotal:</span>
            <span className="font-mono font-medium text-gray-900 dark:text-white">
              {formatCurrency(totals.subtotal)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Markup ({totals.markup_percent || 0}%):</span>
            <span className="font-mono font-medium text-gray-900 dark:text-white">
              {formatCurrency(markupAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
