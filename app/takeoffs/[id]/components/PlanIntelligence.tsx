'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Package,
  Ruler,
  Square,
  DoorOpen,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface PlanIntelligenceProps {
  takeoffId: string;
  jobId?: string;
  projectId?: string;
}

interface ValidationItem {
  label: string;
  fromSchedule: number | null;
  fromDetections: number;
  status: 'match' | 'discrepancy' | 'schedule-only' | 'detection-only';
}

interface MaterialCallout {
  id: string;
  trade: string;
  rawText: string;
  matchedProduct?: string;
  pageRef?: string;
  confidence?: number;
}

interface DimensionItem {
  id: string;
  category: string;
  label: string;
  value: string;
  source?: string;
}

interface ScheduleItem {
  id: string;
  mark: string;
  size: string;
  quantity: number;
  type: string;
  notes?: string;
}

interface NoteItem {
  id: string;
  category: string;
  text: string;
  pageRef?: string;
}

// =============================================================================
// Placeholder Data (will be replaced with API data)
// =============================================================================

const PLACEHOLDER_VALIDATION: ValidationItem[] = [
  { label: 'Windows', fromSchedule: null, fromDetections: 0, status: 'detection-only' },
  { label: 'Doors', fromSchedule: null, fromDetections: 0, status: 'detection-only' },
  { label: 'Garages', fromSchedule: null, fromDetections: 0, status: 'detection-only' },
];

// =============================================================================
// Collapsible Section Component
// =============================================================================

function CollapsibleSection({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${iconColor} flex items-center justify-center`}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {badge}
        </div>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Info className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
    </div>
  );
}

// =============================================================================
// Validation Card Component
// =============================================================================

function ValidationCard({ item }: { item: ValidationItem }) {
  const getStatusStyles = () => {
    switch (item.status) {
      case 'match':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          icon: <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />,
          label: 'Match',
          labelColor: 'text-green-600 dark:text-green-400',
        };
      case 'discrepancy':
        return {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-800',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
          label: 'Discrepancy',
          labelColor: 'text-amber-600 dark:text-amber-400',
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-800/50',
          border: 'border-gray-200 dark:border-gray-700',
          icon: <Info className="w-5 h-5 text-gray-400 dark:text-gray-500" />,
          label: 'No schedule data',
          labelColor: 'text-gray-500 dark:text-gray-400',
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div className={`${styles.bg} ${styles.border} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {item.label}
        </span>
        {styles.icon}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">From Schedule</span>
          <span className="font-mono font-medium text-gray-900 dark:text-white">
            {item.fromSchedule !== null ? item.fromSchedule : '—'}
          </span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs">From Detections</span>
          <span className="font-mono font-medium text-gray-900 dark:text-white">
            {item.fromDetections}
          </span>
        </div>
      </div>
      <div className={`mt-2 text-xs font-medium ${styles.labelColor}`}>
        {styles.label}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PlanIntelligence({ takeoffId, jobId, projectId }: PlanIntelligenceProps) {
  // Placeholder state - will be populated from API
  const [validationData] = useState<ValidationItem[]>(PLACEHOLDER_VALIDATION);
  const [materialCallouts] = useState<MaterialCallout[]>([]);
  const [dimensions] = useState<DimensionItem[]>([]);
  const [windowSchedule] = useState<ScheduleItem[]>([]);
  const [doorSchedule] = useState<ScheduleItem[]>([]);
  const [notes] = useState<NoteItem[]>([]);

  // Group material callouts by trade
  const calloutsByTrade = materialCallouts.reduce((acc, callout) => {
    const trade = callout.trade || 'Other';
    if (!acc[trade]) acc[trade] = [];
    acc[trade].push(callout);
    return acc;
  }, {} as Record<string, MaterialCallout[]>);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Plan Intelligence
            </h4>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              This section will display OCR-extracted data from your construction plans, including
              window/door schedules, material callouts, and specifications. Data extraction is coming soon.
            </p>
          </div>
        </div>
      </div>

      {/* Validation Summary */}
      <CollapsibleSection
        title="Validation Summary"
        icon={CheckCircle2}
        iconColor="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400"
        defaultOpen={true}
      >
        <div className="pt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Compare counts from schedule pages with detected elements from elevation drawings.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {validationData.map((item, index) => (
              <ValidationCard key={index} item={item} />
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Material Callouts */}
      <CollapsibleSection
        title="Material Callouts"
        icon={Package}
        iconColor="bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400"
        badge={
          materialCallouts.length > 0 && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
              {materialCallouts.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {materialCallouts.length === 0 ? (
            <EmptyState message="No material callouts extracted yet. OCR extraction will identify siding, trim, and other material specifications from your plans." />
          ) : (
            <div className="space-y-4">
              {Object.entries(calloutsByTrade).map(([trade, callouts]) => (
                <div key={trade}>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 capitalize">
                    {trade}
                  </h4>
                  <div className="space-y-2">
                    {callouts.map((callout) => (
                      <div
                        key={callout.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {callout.rawText}
                          </span>
                          {callout.matchedProduct && (
                            <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                              Matched
                            </span>
                          )}
                        </div>
                        {callout.pageRef && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {callout.pageRef}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Dimensions */}
      <CollapsibleSection
        title="Dimensions Extracted"
        icon={Ruler}
        iconColor="bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
        badge={
          dimensions.length > 0 && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {dimensions.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {dimensions.length === 0 ? (
            <EmptyState message="No dimensions extracted yet. OCR will identify wall heights, exposures, and other measurements from your plans." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dimensions.map((dim) => (
                <div
                  key={dim.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">
                      {dim.category}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {dim.label}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {dim.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Window Schedule */}
      <CollapsibleSection
        title="Window Schedule"
        icon={Square}
        iconColor="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
        badge={
          windowSchedule.length > 0 && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
              {windowSchedule.length} types
            </span>
          )
        }
      >
        <div className="pt-4">
          {windowSchedule.length === 0 ? (
            <EmptyState message="No window schedule extracted yet. OCR will read window schedules from your plans to provide accurate counts and sizes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {windowSchedule.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.mark}</td>
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.size}</td>
                      <td className="py-2 px-3 text-center font-mono text-gray-900 dark:text-white">{item.quantity}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.type}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Door Schedule */}
      <CollapsibleSection
        title="Door Schedule"
        icon={DoorOpen}
        iconColor="bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400"
        badge={
          doorSchedule.length > 0 && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
              {doorSchedule.length} types
            </span>
          )
        }
      >
        <div className="pt-4">
          {doorSchedule.length === 0 ? (
            <EmptyState message="No door schedule extracted yet. OCR will read door schedules from your plans to provide accurate counts and sizes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {doorSchedule.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.mark}</td>
                      <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.size}</td>
                      <td className="py-2 px-3 text-center font-mono text-gray-900 dark:text-white">{item.quantity}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.type}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Notes & Specifications */}
      <CollapsibleSection
        title="Notes & Specifications"
        icon={FileText}
        iconColor="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
        badge={
          notes.length > 0 && (
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
              {notes.length} found
            </span>
          )
        }
      >
        <div className="pt-4">
          {notes.length === 0 ? (
            <EmptyState message="No notes or specifications extracted yet. OCR will identify general notes, installation instructions, and other specifications from your plans." />
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      {note.category}
                    </span>
                    {note.pageRef && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ({note.pageRef})
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {note.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
