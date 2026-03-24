'use client';
import React from 'react';
import { SectionWrapper, ToggleRow, SelectField, NumberField, ReadOnlyValue, ManualOverrideSection } from './SectionWrapper';
import { BELLY_BAND_SIZE_OPTIONS, FLASHING_HEAD_OPTIONS } from './defaults';
import type { BellyBandSettings } from './types';

interface BellyBandSectionProps {
  settings: BellyBandSettings; onChange: (settings: BellyBandSettings) => void;
  calculatedLF?: number;
}
export function BellyBandSection({ settings, onChange, calculatedLF }: BellyBandSectionProps) {
  const update = (patch: Partial<BellyBandSettings>) => onChange({ ...settings, ...patch });
  return (
    <SectionWrapper title="Belly Band" badge={settings.include ? 'ON' : 'OFF'} badgeColor={settings.include ? 'green' : 'gray'}>
      <ToggleRow label="Include Belly Band" checked={settings.include} onChange={(v) => update({ include: v })} />
      {settings.include && (
        <>
          <SelectField label="Board Size" value={settings.size} options={BELLY_BAND_SIZE_OPTIONS} onChange={(v) => update({ size: v })} />
          <SelectField label="Flashing Type" value={settings.flashing_type} options={FLASHING_HEAD_OPTIONS}
            onChange={(v) => update({ flashing_type: v as BellyBandSettings['flashing_type'] })} />
          <ManualOverrideSection>
            {calculatedLF != null && calculatedLF > 0 && <ReadOnlyValue label="Level Starter LF (proxy)" value={Math.round(calculatedLF)} suffix="LF" />}
            <NumberField label="Manual LF Override" value={settings.manual_lf} onChange={(v) => update({ manual_lf: v })}
              placeholder={calculatedLF ? `Auto: ${Math.round(calculatedLF)}` : 'Enter LF'}
              suffix="LF" hint="Leave blank to use level starter LF as proxy" min={0} />
          </ManualOverrideSection>
        </>
      )}
    </SectionWrapper>
  );
}
