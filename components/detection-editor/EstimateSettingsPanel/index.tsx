// EstimateSettingsPanel/index.tsx — Phase 2 (Simplified Save Flow)
'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Settings } from 'lucide-react';

import type {
  TrimSystem, EstimateSettingsPanelProps, EstimateConfig,
  WindowTrimSettings, DoorTrimSettings, TopOutSettings, BellyBandSettings,
  CornersSettings, WRBSettings, FlashingSettings, ConsumablesSettings, OverheadSettings,
} from './types';
import {
  DEFAULT_ESTIMATE_CONFIG, DEFAULT_OVERHEAD,
  TRIM_SYSTEM_CASCADES, TRIM_SYSTEM_INFO,
} from './defaults';
import { SectionWrapper, NumberField, InfoCallout, SelectField } from './SectionWrapper';
import { WindowTrimSection } from './WindowTrimSection';
import { DoorTrimSection } from './DoorTrimSection';
import { TopOutSection } from './TopOutSection';
import { BellyBandSection } from './BellyBandSection';
import { CornersSection } from './CornersSection';
import { WRBSection } from './WRBSection';
import { FlashingSection } from './FlashingSection';
import { ConsumablesSection } from './ConsumablesSection';
import { OverheadSection } from './OverheadSection';

export type { TrimSystem, EstimateSettingsPanelProps, EstimateConfig };
export type { CalculatedMeasurements } from './types';

// Simple debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: NodeJS.Timeout | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export default function EstimateSettingsPanel({
  isOpen, onClose,
  markupPercent, onMarkupChange, onMarkupSave,
  trimSystem, onTrimSystemChange,
  wrbProduct, onWrbProductChange,
  estimateConfig, onEstimateConfigChange,
  calculatedValues, overheadDefaults,
}: EstimateSettingsPanelProps) {
  // Local config state - initialized with defaults, will be populated from DB
  const [config, setConfig] = useState<EstimateConfig>(() => ({
    ...DEFAULT_ESTIMATE_CONFIG,
    trim_system: trimSystem,
    wrb_product: wrbProduct as EstimateConfig['wrb_product'],
    overhead: { ...DEFAULT_OVERHEAD, ...overheadDefaults },
  }));

  // Track if we've initialized from DB config (prevents saving defaults)
  const [hasInitialized, setHasInitialized] = useState(false);
  const [localMarkup, setLocalMarkup] = useState<string>(String(markupPercent));

  // 2-second mount guard: prevents saving defaults before DB data loads
  const [canSave, setCanSave] = useState(false);
  const mountTimeRef = useRef<number>(Date.now());

  // Enable saves after 2 seconds (gives DB time to load)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCanSave(true);
      console.log('✅ EstimateSettingsPanel: save guard lifted after 2s');
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);

  // Initialize from DB config when it arrives (runs once)
  useEffect(() => {
    if (!hasInitialized && estimateConfig && Object.keys(estimateConfig).length > 0) {
      setConfig({
        ...DEFAULT_ESTIMATE_CONFIG,
        ...estimateConfig,
        // Deep merge sections to preserve defaults for missing fields
        window_trim: { ...DEFAULT_ESTIMATE_CONFIG.window_trim, ...estimateConfig.window_trim },
        door_trim: { ...DEFAULT_ESTIMATE_CONFIG.door_trim, ...estimateConfig.door_trim },
        top_out: { ...DEFAULT_ESTIMATE_CONFIG.top_out, ...estimateConfig.top_out },
        belly_band: { ...DEFAULT_ESTIMATE_CONFIG.belly_band, ...estimateConfig.belly_band },
        corners: { ...DEFAULT_ESTIMATE_CONFIG.corners, ...estimateConfig.corners },
        wrb: { ...DEFAULT_ESTIMATE_CONFIG.wrb, ...estimateConfig.wrb },
        flashing: { ...DEFAULT_ESTIMATE_CONFIG.flashing, ...estimateConfig.flashing },
        consumables: { ...DEFAULT_ESTIMATE_CONFIG.consumables, ...estimateConfig.consumables },
        overhead: { ...DEFAULT_OVERHEAD, ...overheadDefaults, ...estimateConfig.overhead },
      });
      setHasInitialized(true);
      console.log('✅ EstimateSettingsPanel initialized from DB config');
    }
  }, [estimateConfig, hasInitialized, overheadDefaults]);

  // Sync full estimateConfig prop into local state when it changes (after initialization)
  // This ensures DB-loaded config is reflected even if it arrives after hasInitialized is set
  const prevEstimateConfigRef = useRef(estimateConfig);
  useEffect(() => {
    // Skip if this is the same reference or we haven't initialized yet
    if (!hasInitialized || estimateConfig === prevEstimateConfigRef.current) return;

    // Only sync if the incoming config has meaningful data (not just defaults)
    if (estimateConfig && Object.keys(estimateConfig).length > 0) {
      console.log('🔄 Syncing estimateConfig prop changes to local state');
      setConfig(prev => ({
        ...prev,
        ...estimateConfig,
        // Deep merge sections
        window_trim: { ...prev.window_trim, ...estimateConfig.window_trim },
        door_trim: { ...prev.door_trim, ...estimateConfig.door_trim },
        top_out: { ...prev.top_out, ...estimateConfig.top_out },
        belly_band: { ...prev.belly_band, ...estimateConfig.belly_band },
        corners: { ...prev.corners, ...estimateConfig.corners },
        wrb: { ...prev.wrb, ...estimateConfig.wrb },
        flashing: { ...prev.flashing, ...estimateConfig.flashing },
        consumables: { ...prev.consumables, ...estimateConfig.consumables },
        overhead: { ...prev.overhead, ...estimateConfig.overhead },
      }));
    }
    prevEstimateConfigRef.current = estimateConfig;
  }, [estimateConfig, hasInitialized]);

  // If no DB config after 1 second, initialize anyway so saves work
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasInitialized) {
        setHasInitialized(true);
        console.log('✅ EstimateSettingsPanel initialized with defaults (no DB config)');
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [hasInitialized]);

  // Sync trimSystem prop changes
  useEffect(() => { setConfig(prev => ({ ...prev, trim_system: trimSystem })); }, [trimSystem]);

  // Sync wrbProduct prop changes
  useEffect(() => {
    setConfig(prev => ({
      ...prev, wrb_product: wrbProduct as EstimateConfig['wrb_product'],
      wrb: { ...prev.wrb, product: wrbProduct as EstimateConfig['wrb_product'] },
    }));
  }, [wrbProduct]);

  // Sync markup prop changes
  useEffect(() => { setLocalMarkup(String(markupPercent)); }, [markupPercent]);

  // Debounced save - fires 500ms after last config change
  // Guard: requires both hasInitialized AND canSave (2-second mount guard)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Must be initialized AND past the 2-second mount guard
    if (!hasInitialized || !canSave) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      console.log('💾 Auto-saving estimate config...', {
        overhead_dumpster: config.overhead?.include_dumpster,
        overhead_toilet: config.overhead?.include_toilet,
        consumables_paintable: config.consumables?.include_paintable_caulk,
      });
      onEstimateConfigChange?.(config);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [config, hasInitialized, canSave, onEstimateConfigChange]);

  // Update a single config key
  const updateConfig = useCallback(<K extends keyof EstimateConfig>(key: K, value: EstimateConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Handle trim system change with cascading updates
  const handleTrimSystemChange = useCallback((newSystem: TrimSystem) => {
    onTrimSystemChange(newSystem);
    const cascade = TRIM_SYSTEM_CASCADES[newSystem];
    setConfig(prev => ({
      ...prev, trim_system: newSystem,
      window_trim: { ...prev.window_trim, ...cascade.window_trim },
      door_trim: { ...prev.door_trim, ...cascade.door_trim },
      flashing: { ...prev.flashing, ...cascade.flashing },
      consumables: { ...prev.consumables, ...cascade.consumables },
    }));
  }, [onTrimSystemChange]);

  // Handle WRB change
  const handleWRBChange = useCallback((wrb: WRBSettings) => {
    onWrbProductChange(wrb.product);
    updateConfig('wrb', wrb);
  }, [onWrbProductChange, updateConfig]);

  // Handle markup blur (save on blur)
  const handleMarkupBlur = useCallback(() => {
    const value = parseFloat(localMarkup);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      onMarkupChange(value); onMarkupSave(value);
    } else { setLocalMarkup(String(markupPercent)); }
  }, [localMarkup, markupPercent, onMarkupChange, onMarkupSave]);

  const handleMarkupKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleMarkupBlur();
  }, [handleMarkupBlur]);

  if (!isOpen) return null;
  const trimInfo = TRIM_SYSTEM_INFO[trimSystem];

  return (
    <div className="w-80 h-full bg-gray-900 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-200">Estimate Settings</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded transition-colors" title="Close settings (E)">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* General */}
        <SectionWrapper title="General" defaultExpanded={true}>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Markup %</label>
            <div className="relative">
              <input type="number" value={localMarkup} onChange={(e) => setLocalMarkup(e.target.value)}
                onBlur={handleMarkupBlur} onKeyDown={handleMarkupKeyDown} min={0} max={100} step={0.5}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-600 pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">%</span>
            </div>
            <p className="text-[10px] text-gray-600">Mike Skjei standard: 26%. Saves on blur.</p>
          </div>
        </SectionWrapper>

        {/* Trim System */}
        <SectionWrapper title="Trim System" defaultExpanded={true} badge={trimInfo.label} badgeColor="green">
          <SelectField label="System" value={trimSystem}
            options={[{ value: 'hardie', label: 'James Hardie' }, { value: 'whitewood', label: 'WhiteWood' }]}
            onChange={(v) => handleTrimSystemChange(v as TrimSystem)} />
          <InfoCallout>{trimInfo.hint}</InfoCallout>
        </SectionWrapper>

        <WindowTrimSection trimSystem={trimSystem} settings={config.window_trim} onChange={(s) => updateConfig('window_trim', s)} calculatedLF={calculatedValues?.window_trim_lf} />
        <DoorTrimSection trimSystem={trimSystem} settings={config.door_trim} onChange={(s) => updateConfig('door_trim', s)} calculatedLF={calculatedValues?.door_trim_lf} />
        <TopOutSection trimSystem={trimSystem} settings={config.top_out} onChange={(s) => updateConfig('top_out', s)} facadePerimeterLF={calculatedValues?.facade_perimeter_lf} />
        <BellyBandSection settings={config.belly_band} onChange={(s) => updateConfig('belly_band', s)} calculatedLF={calculatedValues?.belly_band_lf} />
        <CornersSection trimSystem={trimSystem} settings={config.corners} onChange={(s) => updateConfig('corners', s)} detectedOutsideCount={calculatedValues?.outside_corner_count} detectedInsideCount={calculatedValues?.inside_corner_count} />
        <WRBSection settings={config.wrb} onChange={handleWRBChange} facadeSF={calculatedValues?.facade_sf} />
        <FlashingSection trimSystem={trimSystem} settings={config.flashing} onChange={(s) => updateConfig('flashing', s)} />
        <ConsumablesSection trimSystem={trimSystem} settings={config.consumables} onChange={(s) => updateConfig('consumables', s)} />
        <OverheadSection settings={config.overhead} onChange={(s) => updateConfig('overhead', s)} />

        <div className="h-4" />
      </div>
    </div>
  );
}
