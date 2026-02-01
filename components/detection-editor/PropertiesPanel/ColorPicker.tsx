'use client';

import React, { useState, useCallback } from 'react';
import { getDetectionColor } from '@/lib/types/extraction';
import type { DetectionClass } from '@/lib/types/extraction';

// Preset colors for quick selection
const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#6B7280', // Gray
  '#FFFFFF', // White
  '#000000', // Black
];

interface ColorPickerProps {
  currentColor: string | null | undefined;
  defaultColor: string;  // Class-based default
  detectionClass: DetectionClass;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}

export function ColorPicker({
  currentColor,
  defaultColor,
  detectionClass,
  onChange,
  disabled
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor || defaultColor);

  const effectiveColor = currentColor || defaultColor;
  const hasOverride = !!currentColor;

  const handlePresetClick = useCallback((color: string) => {
    if (color === defaultColor) {
      onChange(null); // Reset to default
    } else {
      onChange(color);
    }
    setIsOpen(false);
  }, [defaultColor, onChange]);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    onChange(color);
  }, [onChange]);

  const handleReset = useCallback(() => {
    onChange(null);
    setIsOpen(false);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Color
        </label>
        {hasOverride && (
          <button
            onClick={handleReset}
            disabled={disabled}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            Reset to default
          </button>
        )}
      </div>

      <div className="relative">
        {/* Current color display / toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full flex items-center gap-3 p-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div
            className="w-6 h-6 rounded border border-gray-600"
            style={{ backgroundColor: effectiveColor }}
          />
          <span className="text-sm text-gray-300 flex-1 text-left">
            {hasOverride ? 'Custom color' : `Default (${detectionClass})`}
          </span>
          <span className="text-xs text-gray-500 font-mono">
            {effectiveColor.toUpperCase()}
          </span>
        </button>

        {/* Dropdown panel */}
        {isOpen && (
          <div className="absolute z-50 mt-1 w-full p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
            {/* Preset color grid */}
            <div className="grid grid-cols-8 gap-1.5 mb-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handlePresetClick(color)}
                  className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                    effectiveColor === color
                      ? 'border-white ring-1 ring-white'
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Default class color option */}
            <button
              onClick={handleReset}
              className="w-full flex items-center gap-2 p-2 mb-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300"
            >
              <div
                className="w-4 h-4 rounded border border-gray-500"
                style={{ backgroundColor: defaultColor }}
              />
              <span>Use default ({detectionClass})</span>
            </button>

            {/* Custom color input */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={handleCustomChange}
                className="w-8 h-8 rounded cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                    setCustomColor(e.target.value);
                    if (e.target.value.length === 7) {
                      onChange(e.target.value);
                    }
                  }
                }}
                placeholder="#000000"
                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 font-mono"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
