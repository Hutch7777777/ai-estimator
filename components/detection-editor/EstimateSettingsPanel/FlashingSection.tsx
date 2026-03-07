'use client';
import React from 'react';
import { SectionWrapper, SelectField, ToggleRow } from './SectionWrapper';
import { FLASHING_HEAD_OPTIONS, FLASHING_BASE_OPTIONS } from './defaults';
import type { TrimSystem, FlashingSettings, FlashingHeadType, FlashingBaseType } from './types';

interface FlashingSectionProps {
  trimSystem: TrimSystem; settings: FlashingSettings; onChange: (settings: FlashingSettings) => void;
}
export function FlashingSection({ trimSystem, settings, onChange }: FlashingSectionProps) {
  const update = (patch: Partial<FlashingSettings>) => onChange({ ...settings, ...patch });
  const enabledCount = [
    settings.window_head !== 'none', settings.door_head !== 'none', settings.base_starter !== 'none',
    settings.include_kickout, settings.include_corner_flashing, settings.include_fortiflash,
    settings.include_moistop, settings.include_rolled_galv, settings.include_joint_flashing,
  ].filter(Boolean).length;
  return (
    <SectionWrapper title="Flashing" badge={`${enabledCount} items`} badgeColor={enabledCount > 0 ? 'green' : 'gray'}>
      <SelectField label="Window Head Flashing" value={settings.window_head} options={FLASHING_HEAD_OPTIONS} onChange={(v) => update({ window_head: v as FlashingHeadType })} />
      <SelectField label="Door Head Flashing" value={settings.door_head} options={FLASHING_HEAD_OPTIONS} onChange={(v) => update({ door_head: v as FlashingHeadType })} />
      <SelectField label="Base / Starter Flashing" value={settings.base_starter} options={FLASHING_BASE_OPTIONS} onChange={(v) => update({ base_starter: v as FlashingBaseType })} />
      <div className="border-t border-gray-800 pt-2 mt-1 space-y-2">
        <ToggleRow label="Kickout Flashing" checked={settings.include_kickout} onChange={(v) => update({ include_kickout: v })} hint="At roof-to-wall transitions" />
        <ToggleRow label="Corner Flashing" checked={settings.include_corner_flashing} onChange={(v) => update({ include_corner_flashing: v })} />
        <ToggleRow label="FortiFlash (penetrations)" checked={settings.include_fortiflash} onChange={(v) => update({ include_fortiflash: v })} hint="Self-adhered at all openings" />
        <ToggleRow label="Moistop Membrane" checked={settings.include_moistop} onChange={(v) => update({ include_moistop: v })} />
        <ToggleRow label="Rolled Galv Flashing" checked={settings.include_rolled_galv} onChange={(v) => update({ include_rolled_galv: v })} hint={trimSystem === 'whitewood' ? 'Recommended for WhiteWood' : ''} />
        <ToggleRow label="Joint Flashing / Tape" checked={settings.include_joint_flashing} onChange={(v) => update({ include_joint_flashing: v })} />
      </div>
    </SectionWrapper>
  );
}
