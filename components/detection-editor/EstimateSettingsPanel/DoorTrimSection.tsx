'use client';
import React from 'react';
import { SectionWrapper, ToggleRow, SelectField, NumberField, ReadOnlyValue, ManualOverrideSection } from './SectionWrapper';
import { DOOR_TRIM_MATERIALS } from './defaults';
import type { TrimSystem, DoorTrimSettings } from './types';

interface DoorTrimSectionProps {
  trimSystem: TrimSystem; settings: DoorTrimSettings;
  onChange: (settings: DoorTrimSettings) => void; calculatedLF?: number;
}
export function DoorTrimSection({ trimSystem, settings, onChange, calculatedLF }: DoorTrimSectionProps) {
  const update = (patch: Partial<DoorTrimSettings>) => onChange({ ...settings, ...patch });
  const materials = DOOR_TRIM_MATERIALS[trimSystem] || DOOR_TRIM_MATERIALS.hardie;
  return (
    <SectionWrapper title="Door Trim" badge={settings.include ? 'ON' : 'OFF'} badgeColor={settings.include ? 'green' : 'gray'}>
      <ToggleRow label="Include Door Trim" checked={settings.include} onChange={(v) => update({ include: v })} />
      {settings.include && (
        <>
          <SelectField label="Material" value={settings.material} options={materials} onChange={(v) => update({ material: v })} />
          <ManualOverrideSection>
            {calculatedLF != null && calculatedLF > 0 && <ReadOnlyValue label="Detected LF" value={Math.round(calculatedLF)} suffix="LF" />}
            <NumberField label="Manual LF Override" value={settings.manual_lf} onChange={(v) => update({ manual_lf: v })}
              placeholder={calculatedLF ? `Auto: ${Math.round(calculatedLF)}` : 'Enter LF'} suffix="LF" hint="Leave blank to use detected value" min={0} />
          </ManualOverrideSection>
        </>
      )}
    </SectionWrapper>
  );
}
