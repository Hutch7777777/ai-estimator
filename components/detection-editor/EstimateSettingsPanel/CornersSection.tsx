'use client';
import React from 'react';
import { SectionWrapper, ToggleRow, NumberField, ReadOnlyValue, InfoCallout } from './SectionWrapper';
import type { TrimSystem, CornersSettings } from './types';

interface CornersSectionProps {
  trimSystem: TrimSystem; settings: CornersSettings; onChange: (settings: CornersSettings) => void;
  detectedOutsideCount?: number; detectedInsideCount?: number;
}
export function CornersSection({ trimSystem, settings, onChange, detectedOutsideCount, detectedInsideCount }: CornersSectionProps) {
  const update = (patch: Partial<CornersSettings>) => onChange({ ...settings, ...patch });
  const outsideCount = settings.outside_count ?? detectedOutsideCount ?? 0;
  const insideCount = settings.inside_count ?? detectedInsideCount ?? 0;
  const autoOutsideLF = outsideCount * settings.default_height;
  const autoInsideLF = insideCount * settings.default_height;
  const materialLabel = trimSystem === 'whitewood' ? 'WhiteWood 1x3 + 1x4 combo' : 'Hardie Corner Trim';
  return (
    <SectionWrapper title="Corners" badge={outsideCount > 0 ? `${outsideCount} O/S` : 'SET'} badgeColor={outsideCount > 0 ? 'green' : 'gray'}>
      <div className="text-xs text-gray-400 pb-1">Material: <span className="text-gray-300">{materialLabel}</span></div>
      <NumberField label="Default Corner Height" value={settings.default_height} onChange={(v) => update({ default_height: v ?? 9 })} suffix="ft" min={1} max={30} step={0.5} />
      <div className="border-t border-gray-800 pt-2 mt-1">
        <div className="text-[11px] font-medium text-gray-400 mb-1.5">Outside Corners</div>
        {detectedOutsideCount != null && detectedOutsideCount > 0 && <ReadOnlyValue label="Detected" value={detectedOutsideCount} suffix="corners" />}
        <NumberField label="Count" value={settings.outside_count} onChange={(v) => {
          const count = v ?? 0;
          update({ outside_count: v, outside_lf: settings.outside_lf ?? (count > 0 ? count * settings.default_height : null) });
        }} placeholder={detectedOutsideCount ? `Auto: ${detectedOutsideCount}` : '0'} min={0} />
        <NumberField label="Total LF" value={settings.outside_lf} onChange={(v) => update({ outside_lf: v })}
          placeholder={autoOutsideLF > 0 ? `Auto: ${autoOutsideLF}` : 'count × height'} suffix="LF" hint="Override: count × height" min={0} />
      </div>
      <div className="border-t border-gray-800 pt-2 mt-1">
        <ToggleRow label="Include Inside Corners" checked={settings.include_inside} onChange={(v) => update({ include_inside: v })} />
        {settings.include_inside && (
          <>
            {detectedInsideCount != null && detectedInsideCount > 0 && <ReadOnlyValue label="Detected" value={detectedInsideCount} suffix="corners" />}
            <NumberField label="Count" value={settings.inside_count} onChange={(v) => {
              const count = v ?? 0;
              update({ inside_count: v, inside_lf: settings.inside_lf ?? (count > 0 ? count * settings.default_height : null) });
            }} placeholder={detectedInsideCount ? `Auto: ${detectedInsideCount}` : '0'} min={0} />
            <NumberField label="Total LF" value={settings.inside_lf} onChange={(v) => update({ inside_lf: v })}
              placeholder={autoInsideLF > 0 ? `Auto: ${autoInsideLF}` : 'count × height'} suffix="LF" min={0} />
          </>
        )}
      </div>
      <InfoCallout>Mark corners as point markers in the Detection Editor for auto-count. LF = count × height.</InfoCallout>
    </SectionWrapper>
  );
}
