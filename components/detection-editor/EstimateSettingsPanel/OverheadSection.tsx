'use client';
import React from 'react';
import { SectionWrapper, ToggleRow, NumberField, InfoCallout } from './SectionWrapper';
import type { OverheadSettings } from './types';

interface OverheadSectionProps { settings: OverheadSettings; onChange: (settings: OverheadSettings) => void; }
export function OverheadSection({ settings, onChange }: OverheadSectionProps) {
  const update = (patch: Partial<OverheadSettings>) => onChange({ ...settings, ...patch });
  return (
    <SectionWrapper title="Overhead" badge={`$${Math.round(settings.mobilization)}`} badgeColor="green">
      <div className="flex items-start gap-3">
        <div className="flex-1"><ToggleRow label="Dumpster" checked={settings.include_dumpster} onChange={(v) => update({ include_dumpster: v })} /></div>
        {settings.include_dumpster && <div className="w-24"><NumberField label="" value={settings.dumpster_cost} onChange={(v) => update({ dumpster_cost: v ?? 0 })} suffix="$" min={0} step={10} /></div>}
      </div>
      <div className="flex items-start gap-3">
        <div className="flex-1"><ToggleRow label="Porta Potty" checked={settings.include_toilet} onChange={(v) => update({ include_toilet: v })} /></div>
        {settings.include_toilet && <div className="w-24"><NumberField label="" value={settings.toilet_cost} onChange={(v) => update({ toilet_cost: v ?? 0 })} suffix="$" min={0} step={10} /></div>}
      </div>
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <NumberField label="Mobilization" value={settings.mobilization} onChange={(v) => update({ mobilization: v ?? 0 })} suffix="$" min={0} step={10} />
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Note</label>
          <input type="text" value={settings.mobilization_note} onChange={(e) => update({ mobilization_note: e.target.value })}
            placeholder="Field Walks/Fuel" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-600" />
        </div>
      </div>
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <NumberField label="L&I Rate" value={settings.li_rate} onChange={(v) => update({ li_rate: v ?? 0 })} suffix="$/hr" min={0} step={0.01} />
        <NumberField label="Insurance Rate" value={settings.insurance_rate} onChange={(v) => update({ insurance_rate: v ?? 0 })} suffix="$/1K" min={0} step={0.5} />
      </div>
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <div className="flex gap-3">
          <div className="flex-1"><NumberField label="Crew Size" value={settings.crew_size} onChange={(v) => update({ crew_size: v ?? 4 })} min={1} max={20} /></div>
          <div className="flex-1"><NumberField label="Est. Weeks" value={settings.estimated_weeks} onChange={(v) => update({ estimated_weeks: v ?? 1 })} min={0.5} max={52} step={0.5} /></div>
        </div>
      </div>
      <InfoCallout>Pre-loaded from org settings. Changes here apply to this job only.</InfoCallout>
    </SectionWrapper>
  );
}
