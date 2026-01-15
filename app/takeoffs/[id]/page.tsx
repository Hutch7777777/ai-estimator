'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, AlertCircle, Home, FolderOpen, Wrench, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { exportTakeoffToExcel, TakeoffLineItem, TakeoffHeader, LaborItem, OverheadItem } from '@/lib/utils/exportTakeoffExcel';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

interface TakeoffRecord extends TakeoffHeader {
  id: string;
  project_id?: string;
  status?: string;
}

interface ApiResponse {
  success: boolean;
  takeoff: TakeoffRecord;
  line_items: TakeoffLineItem[];
  labor_items: LaborItem[];
  overhead_items: OverheadItem[];
  totals: {
    material_cost: number;
    labor_cost: number;
    overhead_cost: number;
    subtotal: number;
    markup_percent: number;
    final_price: number;
  };
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const PRESENTATION_GROUP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  siding: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-200 dark:border-blue-800',
  },
  trim: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-800 dark:text-purple-200',
    border: 'border-purple-200 dark:border-purple-800',
  },
  accessories: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-200 dark:border-amber-800',
  },
  corners: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    border: 'border-green-200 dark:border-green-800',
  },
  openings: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-800 dark:text-orange-200',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

const DEFAULT_GROUP_COLORS = {
  bg: 'bg-gray-100 dark:bg-gray-800',
  text: 'text-gray-800 dark:text-gray-200',
  border: 'border-gray-200 dark:border-gray-700',
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
  const normalized = group.toLowerCase();
  return PRESENTATION_GROUP_COLORS[normalized] || DEFAULT_GROUP_COLORS;
}

function formatGroupName(group: string | undefined): string {
  if (!group) return 'Other';
  return group.charAt(0).toUpperCase() + group.slice(1).toLowerCase();
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function LoadingSkeleton() {
  return (
    <div className="container mx-auto py-8 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="space-y-2">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>

      {/* Cost summary skeleton */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Error State
// =============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="container mx-auto py-8">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Failed to load takeoff
            </h3>
            <p className="mt-1 text-red-600 dark:text-red-400">{message}</p>
            <button
              onClick={onRetry}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function TakeoffDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const takeoffId = params.id as string;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch takeoff data
  const fetchTakeoff = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/takeoffs/${takeoffId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load takeoff');
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (takeoffId) {
      fetchTakeoff();
    }
  }, [takeoffId]);

  // Group line items by presentation_group
  const groupedLineItems = useMemo(() => {
    if (!data?.line_items) return new Map<string, TakeoffLineItem[]>();

    const groups = new Map<string, TakeoffLineItem[]>();
    data.line_items.forEach((item) => {
      const group = item.presentation_group || 'Other';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(item);
    });

    return groups;
  }, [data?.line_items]);

  // Handle Excel download
  const handleDownloadExcel = async () => {
    if (!data?.takeoff || !data?.line_items) return;

    setIsDownloading(true);
    try {
      const filename = `takeoff_${data.takeoff.takeoff_name?.replace(/\s+/g, '_') || takeoffId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportTakeoffToExcel(
        {
          takeoff: data.takeoff,
          line_items: data.line_items,
          labor_items: data.labor_items || [],
          overhead_items: data.overhead_items || [],
        },
        filename
      );
      toast.success('Excel downloaded successfully');
    } catch (err) {
      console.error('Excel export error:', err);
      toast.error('Failed to download Excel');
    } finally {
      setIsDownloading(false);
    }
  };

  // Loading state
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error) {
    return <ErrorState message={error} onRetry={fetchTakeoff} />;
  }

  // No data state
  if (!data?.takeoff) {
    return <ErrorState message="Takeoff not found" onRetry={fetchTakeoff} />;
  }

  const { takeoff, totals, labor_items, overhead_items } = data;
  const markupAmount = (totals.final_price || 0) - (totals.subtotal || 0);

  // Calculate labor and overhead totals
  const laborTotal = labor_items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
  const overheadTotal = overhead_items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto py-8 space-y-6 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Back navigation */}
            <div className="flex items-center gap-2">
              {takeoff.project_id && (
                <Link
                  href={`/projects/${takeoff.project_id}`}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Back to Project</span>
                </Link>
              )}
              <Link
                href="/project"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </div>

            {/* Title and meta */}
            <div className="border-l border-gray-200 dark:border-gray-700 pl-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {takeoff.takeoff_name || 'Untitled Takeoff'}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                {takeoff.status && (
                  <Badge variant="outline" className="capitalize">
                    {takeoff.status}
                  </Badge>
                )}
                {takeoff.created_at && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Created {new Date(takeoff.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadExcel}
              disabled={isDownloading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium transition-colors"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download Excel
            </button>
          </div>
        </div>

        {/* Cost Summary Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cost Summary</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Material Cost</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
                  {formatCurrency(totals.material_cost)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Labor Cost</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
                  {formatCurrency(totals.labor_cost)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Overhead Cost</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
                  {formatCurrency(totals.overhead_cost)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Subtotal</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
                  {formatCurrency(totals.subtotal)}
                </p>
              </div>
            </div>

            {/* Markup and Final Price */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Markup ({totals.markup_percent || 0}%)
                  </p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
                    {formatCurrency(markupAmount)}
                  </p>
                </div>
                <div className="col-span-2 md:col-span-1 md:col-start-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 -m-2">
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                      Final Price
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {formatCurrency(totals.final_price)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table (Materials) */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Materials ({data.line_items?.length || 0} items)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unit Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Labor
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {Array.from(groupedLineItems.entries()).map(([group, items]) => {
                  const colors = getGroupColors(group);
                  return (
                    <React.Fragment key={group}>
                      {/* Group Header */}
                      <tr className={`${colors.bg} ${colors.border} border-y`}>
                        <td
                          colSpan={7}
                          className={`px-4 py-2 text-sm font-semibold ${colors.text}`}
                        >
                          {formatGroupName(group)} ({items.length} items)
                        </td>
                      </tr>
                      {/* Group Items */}
                      {items.map((item, idx) => (
                        <tr
                          key={item.id || idx}
                          className={
                            idx % 2 === 0
                              ? 'bg-white dark:bg-gray-900'
                              : 'bg-gray-50 dark:bg-gray-800/50'
                          }
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            <div className="max-w-xs truncate" title={item.description}>
                              {item.description}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white">
                            {formatQuantity(item.quantity)}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-500 dark:text-gray-400">
                            {item.unit || 'EA'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white">
                            {formatCurrency(item.material_unit_cost)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white">
                            {formatCurrency(item.material_extended)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white">
                            {formatCurrency(item.labor_extended)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-900 dark:text-white">
                            {formatCurrency(item.line_total)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {/* Totals Footer */}
              <tfoot className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white text-right"
                  >
                    Materials Total
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(totals.material_cost)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-semibold text-gray-900 dark:text-white">
                    -
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(totals.material_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Labor Costs Table */}
        {labor_items && labor_items.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                  Labor Costs ({labor_items.length} items)
                </h2>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {labor_items.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      className={
                        idx % 2 === 0
                          ? 'bg-white dark:bg-gray-900'
                          : 'bg-gray-50 dark:bg-gray-800/50'
                      }
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {item.description}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-500 dark:text-gray-400">
                        {item.unit || 'SQ'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-900 dark:text-white">
                        {formatCurrency(item.rate)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-900 dark:text-white">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {item.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-200 dark:border-blue-800">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-3 text-sm font-semibold text-blue-800 dark:text-blue-200 text-right"
                    >
                      Labor Total
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(laborTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Overhead Costs Table */}
        {overhead_items && overhead_items.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-lg font-semibold text-purple-800 dark:text-purple-200">
                  Overhead Costs ({overhead_items.length} items)
                </h2>
              </div>
            </div>

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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {overhead_items.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      className={
                        idx % 2 === 0
                          ? 'bg-white dark:bg-gray-900'
                          : 'bg-gray-50 dark:bg-gray-800/50'
                      }
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {item.description}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-900 dark:text-white">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {item.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-purple-50 dark:bg-purple-900/20 border-t-2 border-purple-200 dark:border-purple-800">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-purple-800 dark:text-purple-200 text-right">
                      Overhead Total
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(overheadTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {takeoff.project_id && (
              <Link
                href={`/projects/${takeoff.project_id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Back to Project
              </Link>
            )}
            <Link
              href="/project"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Home className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
          <button
            onClick={handleDownloadExcel}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium transition-colors"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download Excel
          </button>
        </div>
      </div>
    </div>
  );
}
