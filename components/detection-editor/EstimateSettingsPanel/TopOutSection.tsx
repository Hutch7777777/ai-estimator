'use client';
import React from 'react';
import { SectionWrapper, ToggleRow, SelectField, NumberField, InfoCallout, ReadOnlyValue, ManualOverrideSection } from './SectionWrapper';
import { TOP_OUT_SIZE_1_OPTIONS, TOP_OUT_SIZE_2_OPTIONS } from './defaults';
import type { TrimSystem, TopOutSettings } from './types';

interface TopOutSectionProps {
  trimSystem: TrimSystem; settings: TopOutSettings;
  onChange: (settings: TopOutSettings) => void; facadePerimeterLF?: number;
}
export function TopOutSection({ trimSystem, settings, onChange, facadePerimeterLF }: TopOutSectionProps) {
  const update = (patch: Partial<TopOutSettings>) => onChange({ ...settings, ...patch });
  const isRelevant = trimSystem === 'whitewood';
  return (
    <SectionWrapper title="Top-Out"
      badge={!isRelevant ? 'N/A' : settings.include ? 'ON' : 'OFF'}
      badgeColor={!isRelevant ? 'gray' : settings.include ? 'green' : 'gray'}>
      {!isRelevant ? (
        <InfoCallout>Top-out is used with WhiteWood trim. Hardie uses Frieze Board instead.</InfoCallout>
      ) : (
        <>
          <ToggleRow label="Include Top-Out" checked={settings.include} onChange={(v) => update({ include: v })} />
          {settings.include && (
            <>
              <SelectField label="Under-Eave Piece" value={settings.size_1} options={TOP_OUT_SIZE_1_OPTIONS} onChange={(v) => update({ size_1: v })} />
              <SelectField label="Roof Transition Piece" value={settings.size_2} options={TOP_OUT_SIZE_2_OPTIONS} onChange={(v) => update({ size_2: v })} />
              <ManualOverrideSection>
                {facadePerimeterLF != null && facadePerimeterLF > 0 && <ReadOnlyValue label="Facade Perimeter (proxy)" value={Math.round(facadePerimeterLF)} suffix="LF" />}
                <NumberField label="Top-Out LF" value={settings.manual_lf} onChange={(v) => update({ manual_lf: v })}
                  placeholder={facadePerimeterLF ? `~${Math.round(facadePerimeterLF)} (perimeter)` : 'Enter LF'}
                  suffix="LF" hint="Manual entry — roofline not detectable from elevations" min={0} />
                <InfoCallout>Top-out follows the roofline. Use facade perimeter as a rough estimate, or enter actual LF from plans.</InfoCallout>
              </ManualOverrideSection>
            </>
          )}
        </>
      )}
    </SectionWrapper>
  );
}
