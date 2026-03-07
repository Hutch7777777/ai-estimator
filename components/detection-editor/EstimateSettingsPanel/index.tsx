'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronRight, Info, Lock } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export type TrimSystem = 'hardie' | 'whitewood';

export interface WRBProduct {
  id: string;
  name: string;
  sku?: string;
}

export interface EstimateSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  markupPercent: number;
  onMarkupChange: (value: number) => void;
  onMarkupSave?: (value: number) => void;
  trimSystem: TrimSystem;
  onTrimSystemChange: (value: TrimSystem) => void;
  wrbProduct: string | null;
  onWrbProductChange: (value: string | null) => void;
  isLoading?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const TRIM_SYSTEM_OPTIONS = [
  {
    value: 'hardie' as const,
    label: 'Hardie Trim',
    description: 'James Hardie fiber cement trim products',
  },
  {
    value: 'whitewood' as const,
    label: 'WhiteWood Lumber',
    description: 'Uses wood trim, Kynar flashing, Titebond caulk',
  },
];

const DEFAULT_WRB_PRODUCTS: WRBProduct[] = [
  { id: 'henry-jumbotex', name: "Henry's JumboTex 60min", sku: 'JTX-60' },
  { id: 'henry-hydrotex', name: "Henry's HydroTex", sku: 'HTX-01' },
  { id: 'tyvek-homewrap', name: 'Tyvek HomeWrap', sku: 'TYV-HW' },
  { id: 'manual', name: 'Other / Manual', sku: undefined },
];

// Phase 2 sections - coming soon
const COMING_SOON_SECTIONS = [
  { id: 'window-trim', label: 'Window Trim', description: 'Window trim profiles and accessories' },
  { id: 'door-trim', label: 'Door Trim', description: 'Door trim profiles and accessories' },
  { id: 'top-out', label: 'Top-Out', description: 'Top-out frieze and accessories' },
  { id: 'belly-band', label: 'Belly Band', description: 'Belly band and transition trim' },
  { id: 'corners', label: 'Corners', description: 'Inside and outside corners' },
  { id: 'flashing', label: 'Flashing', description: 'Z-flashing and drip cap' },
  { id: 'consumables', label: 'Consumables & Blades', description: 'Nails, caulk, blades, and misc' },
  { id: 'overhead', label: 'Overhead', description: 'Permits, dumpster, and overhead costs' },
];

// =============================================================================
// Section Components
// =============================================================================

interface SectionProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800/50 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
            <span>{title}</span>
          </div>
          {badge && !isOpen && (
            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
              {badge}
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 py-3 space-y-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ComingSoonSectionProps {
  title: string;
}

function ComingSoonSection({ title }: ComingSoonSectionProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 opacity-50">
      <div className="flex items-center gap-2">
        <ChevronRight className="w-4 h-4 text-gray-600" />
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-gray-600" />
        <span className="text-[10px] text-gray-600 uppercase tracking-wide">Coming Soon</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function EstimateSettingsPanel({
  isOpen,
  onClose,
  markupPercent,
  onMarkupChange,
  onMarkupSave,
  trimSystem,
  onTrimSystemChange,
  wrbProduct,
  onWrbProductChange,
  isLoading = false,
}: EstimateSettingsPanelProps) {
  const [localMarkup, setLocalMarkup] = useState<string>(markupPercent.toFixed(1));

  // Sync local markup when prop changes (e.g., loaded from DB)
  useEffect(() => {
    setLocalMarkup(markupPercent.toFixed(1));
  }, [markupPercent]);

  // Handle markup input change (local state only)
  const handleMarkupInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setLocalMarkup(rawValue);

    // Also update parent with parsed value for immediate UI feedback
    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onMarkupChange(parsed);
    }
  }, [onMarkupChange]);

  // Handle markup blur (save)
  const handleMarkupBlur = useCallback(() => {
    const parsed = parseFloat(localMarkup);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onMarkupSave?.(parsed);
    } else {
      // Reset to current value if invalid
      setLocalMarkup(markupPercent.toFixed(1));
    }
  }, [localMarkup, markupPercent, onMarkupSave]);

  // Handle markup key press (save on Enter)
  const handleMarkupKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }, []);

  // Get selected WRB product name for display
  const selectedWrbName = DEFAULT_WRB_PRODUCTS.find((p) => p.id === wrbProduct)?.name || 'Select WRB...';

  // Get current trim system label for badge
  const trimSystemLabel = TRIM_SYSTEM_OPTIONS.find((o) => o.value === trimSystem)?.label || '';

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'w-80 h-full bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden',
        'transition-all duration-200 ease-in-out'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-base">Estimate Settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: General */}
        <Section title="General" badge={`${markupPercent}%`}>
          <div className="space-y-1.5">
            <Label htmlFor="markup-percent" className="text-xs text-gray-400">
              Markup %
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="markup-percent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={localMarkup}
                onChange={handleMarkupInputChange}
                onBlur={handleMarkupBlur}
                onKeyDown={handleMarkupKeyDown}
                disabled={isLoading}
                className="h-8 w-24 text-sm bg-gray-800 border-gray-600 text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </div>
        </Section>

        {/* Section 2: Trim System */}
        <Section title="Trim System" badge={trimSystemLabel}>
          <div className="space-y-1.5">
            <Label htmlFor="trim-system" className="text-xs text-gray-400">
              Trim System
            </Label>
            <Select
              value={trimSystem}
              onValueChange={(value) => onTrimSystemChange(value as TrimSystem)}
              disabled={isLoading}
            >
              <SelectTrigger
                id="trim-system"
                className="h-9 text-sm bg-gray-800 border-gray-600 text-gray-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                {TRIM_SYSTEM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* WhiteWood info callout */}
            {trimSystem === 'whitewood' && (
              <div className="flex items-start gap-1.5 mt-2 p-2 bg-amber-900/20 border border-amber-700/30 rounded text-xs text-amber-300">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Uses wood trim, Kynar flashing, Titebond caulk</span>
              </div>
            )}
          </div>
        </Section>

        {/* Section 3: WRB / Weather Barrier */}
        <Section title="WRB / Weather Barrier" badge={wrbProduct ? selectedWrbName : undefined}>
          <div className="space-y-1.5">
            <Label htmlFor="wrb-product" className="text-xs text-gray-400">
              WRB Product
            </Label>
            <Select
              value={wrbProduct || ''}
              onValueChange={(value) => onWrbProductChange(value || null)}
              disabled={isLoading}
            >
              <SelectTrigger
                id="wrb-product"
                className="h-9 text-sm bg-gray-800 border-gray-600 text-gray-100"
              >
                <SelectValue placeholder="Select WRB...">
                  {wrbProduct ? selectedWrbName : 'Select WRB...'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                {DEFAULT_WRB_PRODUCTS.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    <div className="flex flex-col">
                      <span>{product.name}</span>
                      {product.sku && (
                        <span className="text-xs text-gray-500">{product.sku}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* JumboTex info callout */}
            {wrbProduct === 'henry-jumbotex' && (
              <div className="flex items-start gap-1.5 mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded text-xs text-blue-300">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Double-layer application for lap siding areas</span>
              </div>
            )}
            {/* Manual/Other note */}
            {wrbProduct === 'manual' && (
              <div className="flex items-start gap-1.5 mt-2 p-2 bg-gray-700/50 border border-gray-600 rounded text-xs text-gray-400">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>WRB materials will not auto-scope</span>
              </div>
            )}
          </div>
        </Section>

        {/* Divider */}
        <div className="my-2 mx-3 border-t border-gray-700" />

        {/* Phase 2 Coming Soon Sections */}
        <div className="pb-4">
          <div className="px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">
              Coming in Phase 2
            </span>
          </div>
          {COMING_SOON_SECTIONS.map((section) => (
            <ComingSoonSection
              key={section.id}
              title={section.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Default export is EstimateSettingsPanel - types are already exported inline above
