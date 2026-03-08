// EstimateSettingsPanel/index.tsx — Phase 2
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
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

export default function EstimateSettingsPanel({
  isOpen, onClose,
  markupPercent, onMarkupChange, onMarkupSave,
  trimSystem, onTrimSystemChange,
  wrbProduct, onWrbProductChange,
  isLoading = false,
  estimateConfig, onEstimateConfigChange,
  calculatedValues, overheadDefaults,
}: EstimateSettingsPanelProps) {
  const [config, setConfig] = useState<EstimateConfig>(() => ({
    ...DEFAULT_ESTIMATE_CONFIG,
    trim_system: trimSystem,
    wrb_product: wrbProduct as EstimateConfig['wrb_product'],
    ...estimateConfig,
    overhead: { ...DEFAULT_OVERHEAD, ...overheadDefaults, ...estimateConfig?.overhead },
  }));

  const [localMarkup, setLocalMarkup] = useState<string>(String(markupPercent));

  useEffect(() => { setConfig(prev => ({ ...prev, trim_system: trimSystem })); }, [trimSystem]);
  useEffect(() => {
    setConfig(prev => ({
      ...prev, wrb_product: wrbProduct as EstimateConfig['wrb_product'],
      wrb: { ...prev.wrb, product: wrbProduct as EstimateConfig['wrb_product'] },
    }));
  }, [wrbProduct]);
  useEffect(() => { setLocalMarkup(String(markupPercent)); }, [markupPercent]);

  // Emit initial config on mount so DetectionEditor has full merged state for buildApprovePayload
  const hasEmittedInitial = useRef(false);
  useEffect(() => {
    if (!hasEmittedInitial.current && onEstimateConfigChange) {
      hasEmittedInitial.current = true;
      // Use setTimeout to ensure state is fully initialized
      setTimeout(() => {
        setConfig(currentConfig => {
          onEstimateConfigChange(currentConfig);
          return currentConfig;
        });
      }, 0);
    }
  }, [onEstimateConfigChange]);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const emitConfigChange = useCallback((newConfig: EstimateConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { onEstimateConfigChange?.(newConfig); }, 500);
  }, [onEstimateConfigChange]);

  const updateConfig = useCallback(<K extends keyof EstimateConfig>(key: K, value: EstimateConfig[K]) => {
    setConfig(prev => {
      const next = { ...prev, [key]: value };
      emitConfigChange(next);
      return next;
    });
  }, [emitConfigChange]);

  const handleTrimSystemChange = useCallback((newSystem: TrimSystem) => {
    onTrimSystemChange(newSystem);
    const cascade = TRIM_SYSTEM_CASCADES[newSystem];
    setConfig(prev => {
      const next: EstimateConfig = {
        ...prev, trim_system: newSystem,
        window_trim: { ...prev.window_trim, ...cascade.window_trim },
        door_trim: { ...prev.door_trim, ...cascade.door_trim },
        flashing: { ...prev.flashing, ...cascade.flashing },
        consumables: { ...prev.consumables, ...cascade.consumables },
      };
      emitConfigChange(next);
      return next;
    });
  }, [onTrimSystemChange, emitConfigChange]);

  const handleWRBChange = useCallback((wrb: WRBSettings) => {
    onWrbProductChange(wrb.product);
    updateConfig('wrb', wrb);
  }, [onWrbProductChange, updateConfig]);

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

      {isLoading && (
        <div className="px-3 py-2 bg-blue-900/20 border-b border-blue-800/30">
          <span className="text-xs text-blue-400">Loading settings...</span>
        </div>
      )}

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
