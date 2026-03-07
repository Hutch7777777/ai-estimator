'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, ChevronDown, ChevronRight, Info } from 'lucide-react';
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

export interface EstimateSettingsValues {
  markupPercent: number;
  trimSystem: TrimSystem;
  wrbProduct: string | null;
}

export interface EstimateSettingsProps {
  /** Current markup percentage (0-100) */
  markupPercent: number;
  /** Callback when markup changes */
  onMarkupChange: (value: number) => void;
  /** Callback when markup is saved (on blur) */
  onMarkupSave?: (value: number) => void;

  /** Current trim system selection */
  trimSystem: TrimSystem;
  /** Callback when trim system changes */
  onTrimSystemChange: (value: TrimSystem) => void;

  /** Current WRB product ID or null */
  wrbProduct: string | null;
  /** Callback when WRB product changes */
  onWrbProductChange: (value: string | null) => void;

  /** Available WRB products from database */
  wrbProducts?: WRBProduct[];

  /** Whether settings are loading */
  isLoading?: boolean;

  /** Whether the panel starts collapsed */
  defaultCollapsed?: boolean;

  /** Additional CSS class */
  className?: string;

  /** Ref to the anchor element (canvas container) for positioning */
  anchorRef?: React.RefObject<HTMLDivElement | null>;

  /** Position relative to anchor: bottom-left, bottom-right, etc. */
  anchorPosition?: 'bottom-left' | 'bottom-right';
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

// Panel dimensions for positioning calculations
const PANEL_WIDTH = 224; // w-56 = 14rem = 224px
const PANEL_OFFSET = 12; // 12px offset from edge (similar to left-3)

// =============================================================================
// Component
// =============================================================================

export default function EstimateSettings({
  markupPercent,
  onMarkupChange,
  onMarkupSave,
  trimSystem,
  onTrimSystemChange,
  wrbProduct,
  onWrbProductChange,
  wrbProducts = DEFAULT_WRB_PRODUCTS,
  isLoading = false,
  defaultCollapsed = false,
  className,
  anchorRef,
  anchorPosition = 'bottom-left',
}: EstimateSettingsProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  const [localMarkup, setLocalMarkup] = useState<string>(markupPercent.toFixed(1));
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Create portal container on mount
  const [portalContainer] = useState(() => {
    if (typeof document === 'undefined') return null;
    const div = document.createElement('div');
    div.id = 'estimate-settings-portal';
    return div;
  });

  // Append/remove portal container from document.body
  useEffect(() => {
    if (!portalContainer) return;
    document.body.appendChild(portalContainer);
    return () => {
      document.body.removeChild(portalContainer);
    };
  }, [portalContainer]);

  // Sync local markup when prop changes (e.g., loaded from DB)
  useEffect(() => {
    setLocalMarkup(markupPercent.toFixed(1));
  }, [markupPercent]);

  // Position tracking - keep panel anchored to the canvas container
  useEffect(() => {
    if (!anchorRef?.current) return;

    const updatePosition = () => {
      if (!anchorRef?.current) return;
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight || 200;

      if (anchorPosition === 'bottom-left') {
        setPosition({
          top: anchorRect.bottom - panelHeight - PANEL_OFFSET,
          left: anchorRect.left + PANEL_OFFSET,
        });
      } else {
        // bottom-right
        setPosition({
          top: anchorRect.bottom - panelHeight - PANEL_OFFSET,
          left: anchorRect.right - PANEL_WIDTH - PANEL_OFFSET,
        });
      }
    };

    // Initial position
    updatePosition();

    // Observe anchor size changes
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(anchorRef.current);

    // Listen for scroll and resize events
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorRef, anchorPosition, isOpen]); // Re-calculate when isOpen changes (panel height changes)

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
  const selectedWrbName = wrbProducts.find((p) => p.id === wrbProduct)?.name || 'Select WRB...';

  // Don't render if no portal container (SSR)
  if (!portalContainer) return null;

  const panelContent = (
    <div
      ref={panelRef}
      className={cn('bg-gray-800 rounded-lg border border-gray-700 shadow-xl', className)}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
        width: PANEL_WIDTH,
      }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700/50 rounded-t-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" />
              <span>Estimate Settings</span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            {/* Markup Percentage */}
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
                  className="h-8 w-20 text-sm bg-gray-900 border-gray-600 text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-gray-400">%</span>
              </div>
            </div>

            {/* Trim System Selector */}
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
                  className="h-8 text-sm bg-gray-900 border-gray-600 text-gray-100"
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
              {/* WhiteWood note */}
              {trimSystem === 'whitewood' && (
                <div className="flex items-start gap-1.5 mt-1.5 p-2 bg-amber-900/20 border border-amber-700/30 rounded text-xs text-amber-300">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Uses wood trim, Kynar flashing, Titebond caulk</span>
                </div>
              )}
            </div>

            {/* WRB Product Selector */}
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
                  className="h-8 text-sm bg-gray-900 border-gray-600 text-gray-100"
                >
                  <SelectValue placeholder="Select WRB...">
                    {wrbProduct ? selectedWrbName : 'Select WRB...'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  {wrbProducts.map((product) => (
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
              {/* Manual note */}
              {wrbProduct === 'manual' && (
                <div className="flex items-start gap-1.5 mt-1.5 p-2 bg-gray-700/50 border border-gray-600 rounded text-xs text-gray-400">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>WRB materials will not auto-scope</span>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  return createPortal(panelContent, portalContainer);
}

// =============================================================================
// Exports
// =============================================================================

export { EstimateSettings };
