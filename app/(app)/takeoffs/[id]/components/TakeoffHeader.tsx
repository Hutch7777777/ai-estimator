'use client';

import Link from 'next/link';
import { ArrowLeft, Download, Loader2, Home, FileSpreadsheet, FileImage, Mail, FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// =============================================================================
// Types
// =============================================================================

export interface TakeoffHeaderProps {
  takeoffName?: string;
  createdAt?: string;
  status?: string;
  projectId?: string;
  extractionJobId?: string;
  onDownloadExcel: () => void;
  onDownloadVendor: () => void;
  onDownloadMarkup: () => void;
  onGenerateRFI?: () => void;
  onExportBluebeam?: () => void;
  isDownloading: boolean;
  isDownloadingVendor: boolean;
  isDownloadingMarkup: boolean;
  isExportingBluebeam?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function TakeoffHeader({
  takeoffName,
  createdAt,
  status,
  projectId,
  extractionJobId,
  onDownloadExcel,
  onDownloadVendor,
  onDownloadMarkup,
  onGenerateRFI,
  onExportBluebeam,
  isDownloading,
  isDownloadingVendor,
  isDownloadingMarkup,
  isExportingBluebeam = false,
}: TakeoffHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Navigation Row */}
      <div className="flex items-center gap-2">
        {projectId && extractionJobId && (
          <Link
            href={`/projects/${projectId}/extraction/${extractionJobId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Editor
          </Link>
        )}
        <Link
          href="/project"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <Home className="w-4 h-4" />
          Dashboard
        </Link>
      </div>

      {/* Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {takeoffName || 'Untitled Takeoff'}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            {createdAt && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {new Date(createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            )}
            {status && (
              <>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <Badge variant="outline" className="capitalize">
                  {status}
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {projectId && (
            <button
              onClick={onDownloadMarkup}
              disabled={isDownloadingMarkup}
              title="Download elevation drawings with detection overlays (ZIP)"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {isDownloadingMarkup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileImage className="w-4 h-4" />
              )}
              Markup Plans
            </button>
          )}
          {extractionJobId && onExportBluebeam && (
            <button
              onClick={onExportBluebeam}
              disabled={isExportingBluebeam}
              title="Export detections to Bluebeam-compatible PDF"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {isExportingBluebeam ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Export to Bluebeam
            </button>
          )}
          <button
            onClick={onDownloadVendor}
            disabled={isDownloadingVendor}
            title="Export materials list for vendor quotes (no pricing)"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isDownloadingVendor ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Vendor Takeoff
          </button>
          {onGenerateRFI && (
            <button
              onClick={onGenerateRFI}
              title="Generate RFI email for missing specifications"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Mail className="w-4 h-4" />
              RFI
            </button>
          )}
          <button
            onClick={onDownloadExcel}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
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
