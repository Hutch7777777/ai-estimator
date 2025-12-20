"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { MARKUP_COLOR_PRESETS } from "./types";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function ColorPicker({ color, onChange, disabled = false }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(color);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync custom color with prop
  useEffect(() => {
    setCustomColor(color);
  }, [color]);

  const handlePresetClick = (presetColor: string) => {
    onChange(presetColor);
    setIsOpen(false);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomColor(value);
    // Only update if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value);
    }
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomColor(value);
    onChange(value);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-9"
          disabled={disabled}
        >
          <div
            className="w-5 h-5 rounded border border-gray-300 shadow-sm"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-mono">{color}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          {/* Preset colors grid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Presets</p>
            <div className="grid grid-cols-5 gap-2">
              {MARKUP_COLOR_PRESETS.map((presetColor) => (
                <button
                  key={presetColor}
                  onClick={() => handlePresetClick(presetColor)}
                  className={`w-8 h-8 rounded-md border-2 transition-all hover:scale-110 ${
                    color === presetColor
                      ? "border-gray-900 ring-2 ring-gray-400"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                />
              ))}
            </div>
          </div>

          {/* Custom color input */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Custom</p>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="text"
                value={customColor}
                onChange={handleCustomChange}
                placeholder="#000000"
                className="font-mono text-sm h-9"
                maxLength={7}
              />
              <input
                type="color"
                value={color}
                onChange={handleNativeColorChange}
                className="w-9 h-9 rounded border border-gray-200 cursor-pointer"
                title="Pick a custom color"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
