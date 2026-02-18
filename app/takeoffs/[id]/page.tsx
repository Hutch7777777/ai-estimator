'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { AlertCircle } from 'lucide-react';
import { exportTakeoffToExcel, exportVendorTakeoff, TakeoffLineItem, TakeoffHeader as TakeoffHeaderType, LaborItem, OverheadItem } from '@/lib/utils/exportTakeoffExcel';
import { toast } from 'sonner';
import { renderMarkupImage } from '@/lib/utils/markupRenderer';

// Import extracted components
import {
  TakeoffHeader,
  CostSummaryCard,
  MaterialsTable,
  LaborTable,
  OverheadTable,
  PaintTable,
  PlanIntelligence,
} from './components';
import RFIEmailModal from './components/RFIEmailModal';

// =============================================================================
// Types
// =============================================================================

interface TakeoffRecord extends TakeoffHeaderType {
  id: string;
  project_id?: string;
  extraction_job_id?: string | null;
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
    paint_cost?: number;
    labor_cost: number;
    overhead_cost: number;
    subtotal: number;
    markup_percent: number;
    final_price: number;
  };
  error?: string;
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
  const takeoffId = params.id as string;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingVendor, setIsDownloadingVendor] = useState(false);
  const [isDownloadingMarkup, setIsDownloadingMarkup] = useState(false);
  const [isExportingBluebeam, setIsExportingBluebeam] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'plan-intelligence'>('summary');
  const [showRFIModal, setShowRFIModal] = useState(false);

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

  // Handle Vendor Takeoff download (materials only, no pricing)
  const handleDownloadVendorTakeoff = async () => {
    if (!data?.takeoff || !data?.line_items) return;

    setIsDownloadingVendor(true);
    try {
      const filename = `${data.takeoff.client_name?.replace(/[^a-z0-9]/gi, '_') || data.takeoff.takeoff_name?.replace(/\s+/g, '_') || takeoffId.slice(0, 8)}_material_request_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportVendorTakeoff(
        {
          takeoff: data.takeoff,
          line_items: data.line_items,
          labor_items: [],
          overhead_items: [],
        },
        filename
      );
      toast.success('Vendor takeoff downloaded successfully');
    } catch (err) {
      console.error('Vendor takeoff export error:', err);
      toast.error('Failed to download vendor takeoff');
    } finally {
      setIsDownloadingVendor(false);
    }
  };

  // Handle Markup Plans download (elevation images with detection overlays)
  const handleDownloadMarkupPlans = async () => {
    if (!data?.takeoff?.project_id) {
      toast.error('No project linked to this takeoff');
      return;
    }

    setIsDownloadingMarkup(true);
    try {
      // Fetch extraction pages with detections for this project
      const response = await fetch(`/api/extraction-pages?project_id=${data.takeoff.project_id}`);
      const result = await response.json();

      if (!result.success || !result.pages?.length) {
        toast.error('No elevation pages found for this project');
        setIsDownloadingMarkup(false);
        return;
      }

      const pages = result.pages as Array<{
        id: string;
        page_number: number;
        elevation_name: string | null;
        image_url: string;
        detections: Array<{
          id: string;
          class: string;
          pixel_x: number;
          pixel_y: number;
          pixel_width: number;
          pixel_height: number;
          polygon_points?: Array<{x: number, y: number}> | null;
          area_sf: number | null;
          perimeter_lf: number | null;
        }>;
      }>;

      // Create zip file
      const zip = new JSZip();
      const folder = zip.folder('markup_plans');

      toast.info(`Rendering ${pages.length} elevation pages with detections...`);

      // Render each page with detection overlays
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        try {
          toast.info(`Rendering ${page.elevation_name || `page ${page.page_number}`}...`);

          // Render detections onto the image
          const markupBlob = await renderMarkupImage(
            page.image_url,
            page.detections || [],
            page.elevation_name
          );

          // Create filename from elevation name or page number
          const elevationLabel = page.elevation_name
            ? page.elevation_name.replace(/[^a-z0-9]/gi, '_')
            : `page_${page.page_number}`;
          const filename = `elevation_${String(i + 1).padStart(2, '0')}_${elevationLabel}_markup.png`;

          folder?.file(filename, markupBlob);
        } catch (imgErr) {
          console.error(`Error rendering page ${page.page_number}:`, imgErr);
          // Continue with other pages
        }
      }

      // Generate and download the zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFilename = `${data.takeoff.client_name?.replace(/[^a-z0-9]/gi, '_') || data.takeoff.takeoff_name?.replace(/\s+/g, '_') || 'project'}_markup_plans_${new Date().toISOString().split('T')[0]}.zip`;

      saveAs(zipBlob, zipFilename);
      toast.success(`Downloaded ${pages.length} markup plans with detection overlays!`);
    } catch (err) {
      console.error('Markup plans download error:', err);
      toast.error('Failed to download markup plans');
    } finally {
      setIsDownloadingMarkup(false);
    }
  };

  // Handle Export to Bluebeam
  const handleExportBluebeam = async () => {
    if (!data?.takeoff?.extraction_job_id) {
      toast.error('No extraction job linked to this takeoff');
      return;
    }

    setIsExportingBluebeam(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_EXTRACTION_API_URL || 'https://extraction-api-production.up.railway.app';

      const response = await fetch(`${apiUrl}/export-bluebeam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: data.takeoff.extraction_job_id,
          include_materials: true,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Export failed');
      }

      // Download as a file instead of opening in new tab
      if (result.download_url) {
        try {
          // Fetch the PDF as a blob
          const pdfResponse = await fetch(result.download_url);
          const blob = await pdfResponse.blob();

          // Create blob URL and trigger download
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = result.filename || 'bluebeam_export.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);

          toast.success('Bluebeam PDF exported successfully');
        } catch (downloadErr) {
          console.error('[ExportBluebeam] Download error, falling back to window.open:', downloadErr);
          // Fallback to opening in new tab if blob download fails
          window.open(result.download_url, '_blank');
          toast.success('Bluebeam PDF exported (opened in new tab)');
        }
      } else {
        throw new Error('No download URL returned');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Export failed');
      console.error('[ExportBluebeam] Error:', error);
      toast.error(`Failed to export to Bluebeam: ${error.message}`);
    } finally {
      setIsExportingBluebeam(false);
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

  const { takeoff, totals, labor_items, overhead_items, line_items } = data;

  // Separate paint items from material items (paint items have item_type='paint')
  const paintItems = line_items?.filter(item => (item as any).item_type === 'paint') || [];
  const materialItems = line_items?.filter(item => (item as any).item_type !== 'paint') || [];

  // Use paint_cost from API if available, otherwise calculate from items
  const paintTotal = totals.paint_cost ?? paintItems.reduce((sum, item) => {
    const materialExt = typeof item.material_extended === 'string'
      ? parseFloat(item.material_extended)
      : item.material_extended;
    const laborExt = typeof item.labor_extended === 'string'
      ? parseFloat(item.labor_extended)
      : item.labor_extended;
    return sum + (materialExt || 0) + (laborExt || 0);
  }, 0);

  // Calculate labor and overhead totals for the table components
  const laborTotal = labor_items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
  const overheadTotal = overhead_items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;

  // Totals already include paint_cost from API
  const totalsWithPaint = {
    ...totals,
    paint_cost: paintTotal,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto py-8 space-y-6 px-4">
        {/* Header */}
        <TakeoffHeader
          takeoffName={takeoff.takeoff_name}
          createdAt={takeoff.created_at}
          status={takeoff.status}
          projectId={takeoff.project_id}
          extractionJobId={takeoff.extraction_job_id ?? undefined}
          onDownloadExcel={handleDownloadExcel}
          onDownloadVendor={handleDownloadVendorTakeoff}
          onDownloadMarkup={handleDownloadMarkupPlans}
          onGenerateRFI={takeoff.extraction_job_id ? () => setShowRFIModal(true) : undefined}
          onExportBluebeam={takeoff.extraction_job_id ? handleExportBluebeam : undefined}
          isDownloading={isDownloading}
          isDownloadingVendor={isDownloadingVendor}
          isDownloadingMarkup={isDownloadingMarkup}
          isExportingBluebeam={isExportingBluebeam}
        />

        {/* RFI Email Modal */}
        {takeoff.extraction_job_id && (
          <RFIEmailModal
            isOpen={showRFIModal}
            onClose={() => setShowRFIModal(false)}
            jobId={takeoff.extraction_job_id}
          />
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'summary'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('plan-intelligence')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'plan-intelligence'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Plan Intelligence
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' ? (
          <>
            {/* Cost Summary Card */}
            <CostSummaryCard totals={totalsWithPaint} />

            {/* Materials Table (excludes paint items) */}
            <MaterialsTable
              items={materialItems}
              totalMaterialCost={totals.material_cost}
            />

            {/* Paint Table (if paint items exist) */}
            {paintItems.length > 0 && (
              <PaintTable
                items={paintItems}
                totalPaintCost={paintTotal}
              />
            )}

            {/* Labor Table */}
            <LaborTable
              items={labor_items || []}
              totalLaborCost={laborTotal}
            />

            {/* Overhead Table */}
            <OverheadTable
              items={overhead_items || []}
              totalOverheadCost={overheadTotal}
            />
          </>
        ) : (
          <PlanIntelligence
            takeoffId={takeoffId}
            jobId={takeoff.extraction_job_id ?? undefined}
            projectId={takeoff.project_id}
          />
        )}
      </div>
    </div>
  );
}
