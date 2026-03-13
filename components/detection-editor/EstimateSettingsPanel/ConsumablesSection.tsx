'use client';
import React from 'react';
import { SectionWrapper, SelectField, ToggleRow } from './SectionWrapper';
import { CAULK_TYPE_OPTIONS } from './defaults';
import type { TrimSystem, ConsumablesSettings, CaulkType } from './types';

interface ConsumablesSectionProps {
  trimSystem: TrimSystem; settings: ConsumablesSettings; onChange: (settings: ConsumablesSettings) => void;
}
export function ConsumablesSection({ trimSystem, settings, onChange }: ConsumablesSectionProps) {
  const update = (patch: Partial<ConsumablesSettings>) => onChange({ ...settings, ...patch });
  const caulkOptions = CAULK_TYPE_OPTIONS[trimSystem] || CAULK_TYPE_OPTIONS.hardie;
  return (
    <SectionWrapper title="Consumables & Fasteners" badge="SET" badgeColor="green">
      <SelectField label="Caulk Type" value={settings.caulk_type} options={caulkOptions} onChange={(v) => update({ caulk_type: v as CaulkType })} />
      {trimSystem === 'whitewood' && (
        <ToggleRow label="Titebond III Caulk" checked={settings.include_titebond_caulk} onChange={(v) => update({ include_titebond_caulk: v })} hint="WhiteWood trim caulk (rule 194)" />
      )}
      <ToggleRow label="Paintable Caulk" checked={settings.include_paintable_caulk} onChange={(v) => update({ include_paintable_caulk: v })} hint={trimSystem === 'whitewood' ? 'Not typical with WhiteWood' : ''} />
      <ToggleRow label="Color-Matched Caulk" checked={settings.include_color_matched_caulk} onChange={(v) => update({ include_color_matched_caulk: v })} hint={trimSystem === 'whitewood' ? 'Not typical with WhiteWood' : ''} />
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <ToggleRow label="Primer Spray Cans" checked={settings.include_primer_cans} onChange={(v) => update({ include_primer_cans: v })} hint="For primed products — seal cut ends" />
        <ToggleRow label="Spackle" checked={settings.include_spackle} onChange={(v) => update({ include_spackle: v })} hint="Fill nail holes" />
      </div>
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <ToggleRow label="Wood Blades" checked={settings.include_wood_blades} onChange={(v) => update({ include_wood_blades: v })} hint={trimSystem === 'whitewood' ? 'For cutting WhiteWood trim' : ''} />
        <ToggleRow label="Hardie / Fiber Cement Blades" checked={settings.include_hardie_blades} onChange={(v) => update({ include_hardie_blades: v })} />
      </div>
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <ToggleRow label="Siding Nails" checked={settings.include_siding_nails} onChange={(v) => update({ include_siding_nails: v })} />
        <ToggleRow label="Trim Nails (SS)" checked={settings.include_trim_nails} onChange={(v) => update({ include_trim_nails: v })} />
      </div>
    </SectionWrapper>
  );
}
