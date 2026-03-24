'use client';
import React from 'react';
import { SectionWrapper, SelectField, ToggleRow, ReadOnlyValue, InfoCallout, ManualOverrideSection } from './SectionWrapper';
import { WRB_PRODUCTS } from './defaults';
import type { WRBSettings, WRBProductId, LayerMode } from './types';

interface WRBSectionProps { settings: WRBSettings; onChange: (settings: WRBSettings) => void; facadeSF?: number; }
export function WRBSection({ settings, onChange, facadeSF }: WRBSectionProps) {
  const update = (patch: Partial<WRBSettings>) => onChange({ ...settings, ...patch });
  const isJumboTex = settings.product === 'henry-jumbotex';
  const layerModeOptions = [
    { value: 'auto', label: isJumboTex ? 'Auto (Double Layer)' : 'Auto (Single Layer)' },
    { value: 'single', label: 'Single Layer' },
    { value: 'double', label: 'Double Layer' },
  ];
  return (
    <SectionWrapper title="WRB / Weather Barrier"
      badge={settings.product ? WRB_PRODUCTS.find(p => p.value === settings.product)?.label.split(' ').pop() || 'SET' : 'NONE'}
      badgeColor={settings.product ? 'green' : 'amber'}>
      <SelectField label="Product" value={settings.product || ''}
        options={[{ value: '', label: '— Select WRB —' }, ...WRB_PRODUCTS.map(p => ({ value: p.value, label: p.label }))]}
        onChange={(v) => update({ product: (v || null) as WRBProductId })} />
      {settings.product && (
        <>
          <SelectField label="Layer Mode" value={settings.layer_mode} options={layerModeOptions} onChange={(v) => update({ layer_mode: v as LayerMode })} />
          <ToggleRow label="Include Seam Tape" checked={settings.include_seam_tape} onChange={(v) => update({ include_seam_tape: v })} />
          {isJumboTex && <InfoCallout>JumboTex requires double-layer on lap siding areas. Labor calculated as (lapArea × 2) + nonLapArea.</InfoCallout>}
          {facadeSF != null && facadeSF > 0 && (
            <ManualOverrideSection label="Calculated Values">
              <ReadOnlyValue label="Coverage Area" value={Math.round(facadeSF)} suffix="SF" />
            </ManualOverrideSection>
          )}
        </>
      )}
    </SectionWrapper>
  );
}
