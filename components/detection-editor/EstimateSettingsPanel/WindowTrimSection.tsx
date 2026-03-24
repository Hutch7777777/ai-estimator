'use client';
import React from 'react';
import { SectionWrapper, ToggleRow, SelectField, NumberField, ReadOnlyValue, ManualOverrideSection } from './SectionWrapper';
import { WINDOW_TRIM_MATERIALS } from './defaults';
import type { TrimSystem, WindowTrimSettings } from './types';

interface WindowTrimSectionProps {
  trimSystem: TrimSystem; settings: WindowTrimSettings;
  onChange: (settings: WindowTrimSettings) => void; calculatedLF?: number;
}
export function WindowTrimSection({ trimSystem, settings, onChange, calculatedLF }: WindowTrimSectionProps) {
  const update = (patch: Partial<WindowTrimSettings>) => onChange({ ...settings, ...patch });
  const materials = WINDOW_TRIM_MATERIALS[trimSystem] || WINDOW_TRIM_MATERIALS.hardie;
  const effectiveLF = settings.manual_lf ?? calculatedLF ?? 0;
  return (
    <SectionWrapper title="Window Trim" badge={settings.include ? 'ON' : 'OFF'} badgeColor={settings.include ? 'green' : 'gray'}>
      <ToggleRow label="Include Window Trim" checked={settings.include} onChange={(v) => update({ include: v })} />
      {settings.include && (
        <>
          <SelectField label="Material" value={settings.material} options={materials} onChange={(v) => update({ material: v })} />
          {trimSystem === 'whitewood' && (
            <ToggleRow label="Include Slope Sill (2x3)" checked={settings.include_slope_sill}
              onChange={(v) => update({ include_slope_sill: v })} hint="Water management at window sills" />
          )}
          <ManualOverrideSection>
            {calculatedLF != null && calculatedLF > 0 && <ReadOnlyValue label="Detected LF" value={Math.round(calculatedLF)} suffix="LF" />}
            <NumberField label="Manual LF Override" value={settings.manual_lf} onChange={(v) => update({ manual_lf: v })}
              placeholder={calculatedLF ? `Auto: ${Math.round(calculatedLF)}` : 'Enter LF'} suffix="LF" hint="Leave blank to use detected value" min={0} />
            {effectiveLF > 0 && <ReadOnlyValue label="Effective LF" value={Math.round(effectiveLF)} suffix="LF" />}
          </ManualOverrideSection>
        </>
      )}
    </SectionWrapper>
  );
}
