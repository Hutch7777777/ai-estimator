// EstimateSettingsPanel/SectionWrapper.tsx
'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// =============================================================================
// Manual Override Section — Collapsible wrapper for measurement overrides
// =============================================================================

interface ManualOverrideSectionProps {
  children: React.ReactNode;
  label?: string;
}

export function ManualOverrideSection({ children, label = 'Manual Override' }: ManualOverrideSectionProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 pt-2 border-t border-gray-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label}
      </button>
      {expanded && (
        <div className="mt-2 pl-2 border-l-2 border-gray-800 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Section Wrapper — Collapsible section with badge
// =============================================================================

interface SectionWrapperProps {
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: 'green' | 'gray' | 'amber';
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function SectionWrapper({
  title, icon, badge, badgeColor = 'green', defaultExpanded = false, children,
}: SectionWrapperProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const badgeColors = {
    green: 'bg-emerald-900/50 text-emerald-400 border-emerald-700/50',
    gray: 'bg-gray-800 text-gray-500 border-gray-700',
    amber: 'bg-amber-900/40 text-amber-400 border-amber-700/50',
  };
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-800/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        )}
        {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
        <span className="text-sm font-medium text-gray-300 flex-1">{title}</span>
        {badge && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badgeColors[badgeColor]}`}>
            {badge}
          </span>
        )}
      </button>
      {expanded && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

interface FieldLabelProps { label: string; hint?: string; }
export function FieldLabel({ label, hint }: FieldLabelProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

interface ToggleRowProps {
  label: string; checked: boolean; onChange: (checked: boolean) => void;
  hint?: string; disabled?: boolean;
}
export function ToggleRow({ label, checked, onChange, hint, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-400">{label}</span>
        {hint && <p className="text-[10px] text-gray-600">{hint}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${checked ? 'bg-emerald-600' : 'bg-gray-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </button>
    </div>
  );
}

interface SelectFieldProps {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; hint?: string;
}
export function SelectField({ label, value, options, onChange, hint }: SelectFieldProps) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} hint={hint} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-600 appearance-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

interface NumberFieldProps {
  label: string; value: number | null; onChange: (value: number | null) => void;
  placeholder?: string; suffix?: string; hint?: string; readOnly?: boolean;
  min?: number; max?: number; step?: number;
}
export function NumberField({ label, value, onChange, placeholder, suffix, hint, readOnly, min, max, step = 1 }: NumberFieldProps) {
  return (
    <div className="space-y-1">
      {label && <FieldLabel label={label} hint={hint} />}
      <div className="relative">
        <input
          type="number" value={value ?? ''} placeholder={placeholder}
          onChange={(e) => { const v = e.target.value; onChange(v === '' ? null : parseFloat(v)); }}
          readOnly={readOnly} min={min} max={max} step={step}
          className={`w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-600 ${readOnly ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed' : ''} ${suffix ? 'pr-8' : ''} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}

export function InfoCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-900/15 border border-amber-800/30 rounded px-2.5 py-2 text-[11px] text-amber-300/80 leading-relaxed">
      {children}
    </div>
  );
}

export function ReadOnlyValue({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-400 font-mono">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-gray-600 ml-1">{suffix}</span>}
      </span>
    </div>
  );
}
