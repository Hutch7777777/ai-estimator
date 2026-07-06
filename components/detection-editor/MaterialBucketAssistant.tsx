'use client';

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Check, Loader2, PackageCheck, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMaterialSearch, type MaterialItem } from '@/lib/hooks/useMaterialSearch';
import type { ExtractionDetection, ExtractionPage } from '@/lib/types/extraction';

type BucketKind =
  | 'main_siding'
  | 'gable_siding'
  | 'stone_veneer'
  | 'windows'
  | 'doors'
  | 'garage_doors'
  | 'roofing'
  | 'trim'
  | 'soffit'
  | 'gutters'
  | 'architectural'
  | 'misc';

interface MaterialBucket {
  key: BucketKind;
  title: string;
  detectionIds: string[];
  detections: ExtractionDetection[];
  trade: string;
  detectionClass: string;
  quantity: number;
  unit: 'SF' | 'LF' | 'EA';
  pageLabels: string[];
  confidence: 'high' | 'medium' | 'review';
}

interface BucketDefinition {
  key: BucketKind;
  title: string;
  trade: string;
  detectionClass: string;
  unit: 'SF' | 'LF' | 'EA';
  confidence: 'high' | 'medium' | 'review';
  priority: number;
}

interface MaterialBucketAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  detections: ExtractionDetection[];
  pages: ExtractionPage[];
  currentPageId: string | null;
  onMaterialAssign: (detectionIds: string[], materialId: string | null) => Promise<void> | void;
}

const BUCKET_DEFINITIONS: Record<BucketKind, BucketDefinition> = {
  main_siding: {
    key: 'main_siding',
    title: 'Main Siding',
    trade: 'siding',
    detectionClass: 'exterior_wall',
    unit: 'SF',
    confidence: 'high',
    priority: 1,
  },
  gable_siding: {
    key: 'gable_siding',
    title: 'Gable Siding',
    trade: 'siding',
    detectionClass: 'gable',
    unit: 'SF',
    confidence: 'medium',
    priority: 2,
  },
  stone_veneer: {
    key: 'stone_veneer',
    title: 'Stone or Brick Veneer',
    trade: 'siding',
    detectionClass: 'stone_veneer',
    unit: 'SF',
    confidence: 'review',
    priority: 3,
  },
  windows: {
    key: 'windows',
    title: 'Windows',
    trade: 'windows',
    detectionClass: 'window',
    unit: 'EA',
    confidence: 'high',
    priority: 4,
  },
  doors: {
    key: 'doors',
    title: 'Doors',
    trade: 'siding',
    detectionClass: 'door',
    unit: 'EA',
    confidence: 'medium',
    priority: 5,
  },
  garage_doors: {
    key: 'garage_doors',
    title: 'Garage Doors',
    trade: 'siding',
    detectionClass: 'garage',
    unit: 'EA',
    confidence: 'medium',
    priority: 6,
  },
  roofing: {
    key: 'roofing',
    title: 'Roofing',
    trade: 'roofing',
    detectionClass: 'roof',
    unit: 'SF',
    confidence: 'medium',
    priority: 7,
  },
  trim: {
    key: 'trim',
    title: 'Trim and Boards',
    trade: 'siding',
    detectionClass: 'trim',
    unit: 'LF',
    confidence: 'medium',
    priority: 8,
  },
  soffit: {
    key: 'soffit',
    title: 'Soffit',
    trade: 'siding',
    detectionClass: 'soffit',
    unit: 'SF',
    confidence: 'medium',
    priority: 9,
  },
  gutters: {
    key: 'gutters',
    title: 'Gutters and Downspouts',
    trade: 'gutters',
    detectionClass: 'gutter',
    unit: 'LF',
    confidence: 'medium',
    priority: 10,
  },
  architectural: {
    key: 'architectural',
    title: 'Accessories',
    trade: 'siding',
    detectionClass: 'corbel',
    unit: 'EA',
    confidence: 'review',
    priority: 11,
  },
  misc: {
    key: 'misc',
    title: 'Other Markups',
    trade: 'siding',
    detectionClass: 'siding',
    unit: 'EA',
    confidence: 'review',
    priority: 12,
  },
};

const STONE_HINTS = ['stone', 'brick', 'veneer', 'masonry'];
const TRIM_CLASSES = new Set(['trim', 'fascia', 'belly_band', 'topout', 'eave', 'rake', 'ridge', 'valley']);
const GUTTER_CLASSES = new Set(['gutter', 'downspout']);
const ARCHITECTURAL_CLASSES = new Set([
  'corbel',
  'bracket',
  'shutter',
  'post',
  'column',
  'vent',
  'gable_vent',
  'light_fixture',
  'outlet',
  'hose_bib',
]);

function normalizeClass(value: string | null | undefined): string {
  return (value || '').toLowerCase().trim().replace(/\s+/g, '_');
}

function noteText(detection: ExtractionDetection): string {
  const values = [
    detection.class,
    detection.matched_tag,
    detection.notes,
    detection.bluebeam_content,
  ];
  return values.filter(Boolean).join(' ').toLowerCase();
}

function getBucketKind(detection: ExtractionDetection): BucketKind {
  const cls = normalizeClass(detection.class);
  const text = noteText(detection);

  if (STONE_HINTS.some((hint) => text.includes(hint))) return 'stone_veneer';
  if (cls === 'gable') return 'gable_siding';
  if (cls === 'siding' || cls === 'exterior_wall' || cls === 'exterior_walls' || cls === 'building' || cls === 'wall') {
    return 'main_siding';
  }
  if (cls === 'window') return 'windows';
  if (cls === 'door') return 'doors';
  if (cls === 'garage' || cls === 'garage_door') return 'garage_doors';
  if (cls === 'roof') return 'roofing';
  if (cls === 'soffit') return 'soffit';
  if (TRIM_CLASSES.has(cls)) return 'trim';
  if (GUTTER_CLASSES.has(cls)) return 'gutters';
  if (ARCHITECTURAL_CLASSES.has(cls)) return 'architectural';
  return 'misc';
}

function detectionQuantity(detection: ExtractionDetection, unit: 'SF' | 'LF' | 'EA'): number {
  if (unit === 'SF') return Number(detection.area_sf || 0);
  if (unit === 'LF') return Number(detection.perimeter_lf || detection.item_count || 0);
  return Number(detection.item_count || 1);
}

function formatQuantity(quantity: number, unit: 'SF' | 'LF' | 'EA'): string {
  if (unit === 'EA') return `${Math.round(quantity)} EA`;
  return `${quantity.toFixed(1)} ${unit}`;
}

function formatCost(cost: number | null, unit: string): string {
  if (cost === null || cost === undefined) return '';
  return `$${cost.toFixed(2)}/${unit || 'ea'}`;
}

function buildBuckets(
  detections: ExtractionDetection[],
  pages: ExtractionPage[],
  currentPageId: string | null,
  scope: 'current' | 'all',
  includeAssigned: boolean
): MaterialBucket[] {
  const pageMap = new Map(pages.map((page) => [page.id, page]));
  const grouped = new Map<BucketKind, ExtractionDetection[]>();

  for (const detection of detections) {
    if (detection.status === 'deleted') continue;
    if (scope === 'current' && detection.page_id !== currentPageId) continue;
    if (!includeAssigned && detection.assigned_material_id) continue;

    const kind = getBucketKind(detection);
    const bucketDetections = grouped.get(kind) || [];
    bucketDetections.push(detection);
    grouped.set(kind, bucketDetections);
  }

  return Array.from(grouped.entries())
    .map(([kind, bucketDetections]) => {
      const definition = BUCKET_DEFINITIONS[kind];
      const pageLabels = Array.from(new Set(
        bucketDetections.map((detection) => {
          const page = pageMap.get(detection.page_id);
          return page?.page_number ? `P${page.page_number}` : 'Page';
        })
      ));

      return {
        key: kind,
        title: definition.title,
        detectionIds: bucketDetections.map((detection) => detection.id),
        detections: bucketDetections,
        trade: definition.trade,
        detectionClass: definition.detectionClass,
        quantity: bucketDetections.reduce(
          (total, detection) => total + detectionQuantity(detection, definition.unit),
          0
        ),
        unit: definition.unit,
        pageLabels,
        confidence: definition.confidence,
      };
    })
    .sort((a, b) => BUCKET_DEFINITIONS[a.key].priority - BUCKET_DEFINITIONS[b.key].priority);
}

function confidenceLabel(confidence: MaterialBucket['confidence']): string {
  if (confidence === 'high') return 'Clear';
  if (confidence === 'medium') return 'Check';
  return 'Review';
}

interface BucketCardProps {
  bucket: MaterialBucket;
  selectedMaterialId: string | null;
  onSelectMaterial: (bucketKey: BucketKind, item: MaterialItem) => void;
  onApply: (bucket: MaterialBucket) => void;
  isApplying: boolean;
}

const BucketCard = memo(function BucketCard({
  bucket,
  selectedMaterialId,
  onSelectMaterial,
  onApply,
  isApplying,
}: BucketCardProps) {
  const [search, setSearch] = useState('');
  const { items, isLoading } = useMaterialSearch({
    trade: bucket.trade,
    detectionClass: bucket.detectionClass,
    search: search || undefined,
    enabled: true,
    limit: 8,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-950">{bucket.title}</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {confidenceLabel(bucket.confidence)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {bucket.detectionIds.length} markup{bucket.detectionIds.length !== 1 ? 's' : ''} ·{' '}
            {formatQuantity(bucket.quantity, bucket.unit)}
            {bucket.pageLabels.length > 0 ? ` · ${bucket.pageLabels.slice(0, 4).join(', ')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onApply(bucket)}
          disabled={!selectedMaterialId || isApplying}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        >
          {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Apply
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 shadow-sm">
        <Search className="h-3.5 w-3.5 text-gray-500" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${bucket.title.toLowerCase()}`}
          className="h-8 min-w-0 flex-1 bg-transparent text-xs text-gray-950 outline-none placeholder:text-gray-400"
        />
      </div>

      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading products
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-gray-500">No matching products</div>
        ) : (
          items.map((item) => {
            const selected = item.id === selectedMaterialId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectMaterial(bucket.key, item)}
                className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                  selected
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="truncate text-xs font-medium text-gray-950">{item.product_name}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-gray-500">
                  <span className="truncate">{item.manufacturer || item.category || item.sku}</span>
                  <span className="shrink-0 font-medium text-emerald-700">{formatCost(item.material_cost, item.unit)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
});

export default function MaterialBucketAssistant({
  isOpen,
  onClose,
  detections,
  pages,
  currentPageId,
  onMaterialAssign,
}: MaterialBucketAssistantProps) {
  const [scope, setScope] = useState<'current' | 'all'>('all');
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<Record<string, MaterialItem>>({});
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const buckets = useMemo(
    () => buildBuckets(detections, pages, currentPageId, scope, includeAssigned),
    [detections, pages, currentPageId, scope, includeAssigned]
  );

  const selectedCount = Object.keys(selectedMaterials).length;

  const handleSelectMaterial = useCallback((bucketKey: BucketKind, item: MaterialItem) => {
    setSelectedMaterials((prev) => ({ ...prev, [bucketKey]: item }));
  }, []);

  const applyBucket = useCallback(async (bucket: MaterialBucket) => {
    const item = selectedMaterials[bucket.key];
    if (!item) return;

    setApplyingKey(bucket.key);
    try {
      await onMaterialAssign(bucket.detectionIds, item.id);
      toast.success(`Assigned ${item.product_name}`, {
        description: `${bucket.detectionIds.length} ${bucket.title.toLowerCase()} markup${bucket.detectionIds.length !== 1 ? 's' : ''}`,
      });
    } finally {
      setApplyingKey(null);
    }
  }, [onMaterialAssign, selectedMaterials]);

  const applyAllSelected = useCallback(async () => {
    const bucketsToApply = buckets.filter((bucket) => selectedMaterials[bucket.key]);
    if (bucketsToApply.length === 0) return;

    setApplyingKey('all');
    try {
      for (const bucket of bucketsToApply) {
        const item = selectedMaterials[bucket.key];
        await onMaterialAssign(bucket.detectionIds, item.id);
      }
      toast.success(`Assigned ${bucketsToApply.length} material bucket${bucketsToApply.length !== 1 ? 's' : ''}`);
    } finally {
      setApplyingKey(null);
    }
  }, [buckets, onMaterialAssign, selectedMaterials]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-4">
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-950">Material Assist</h2>
              <p className="text-xs text-gray-500">
                {buckets.length} bucket{buckets.length !== 1 ? 's' : ''} · {scope === 'all' ? 'All pages' : 'Current page'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === 'all' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All Pages
            </button>
            <button
              type="button"
              onClick={() => setScope('current')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === 'current' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Current Page
            </button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
              <input
                type="checkbox"
                checked={includeAssigned}
                onChange={(event) => setIncludeAssigned(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 bg-white"
              />
              Include assigned
            </label>
          </div>

          <button
            type="button"
            onClick={applyAllSelected}
            disabled={selectedCount === 0 || applyingKey !== null}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            {applyingKey === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply Selected
          </button>
        </div>

        <main className="overflow-y-auto bg-gray-50/50 p-4">
          {buckets.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-center">
              <PackageCheck className="mb-3 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-900">No material buckets found</p>
              <p className="mt-1 text-xs text-gray-500">
                {includeAssigned ? 'This scope has no active markups.' : 'Everything in this scope already has a material.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {buckets.map((bucket) => (
                <BucketCard
                  key={bucket.key}
                  bucket={bucket}
                  selectedMaterialId={selectedMaterials[bucket.key]?.id || null}
                  onSelectMaterial={handleSelectMaterial}
                  onApply={applyBucket}
                  isApplying={applyingKey === bucket.key}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
