"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface ColorSwatchProps {
  color: string;
  label: string;
  hex?: string; // Optional hex code from database
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ColorSwatch({ color, label, hex, selected, onClick, className }: ColorSwatchProps) {
  // Map common color names to hex values for visual display (fallback)
  const colorMap: Record<string, string> = {
    // Generic colors (for non-ColorPlus products)
    white: "#ffffff",
    black: "#000000",
    gray: "#6b7280",
    grey: "#6b7280",
    silver: "#94a3b8",
    navy: "#0f172a",
    blue: "#3b82f6",
    red: "#ef4444",
    green: "#10b981",
    yellow: "#f59e0b",
    orange: "#f97316",
    brown: "#78350f",
    beige: "#d4b896",
    tan: "#d2b48c",
    cream: "#fffdd0",

    // James Hardie ColorPlus Colors (Official Hex Codes - 25 colors)
    "arctic white": "#F5F5F0",
    "aged pewter": "#6B6B63",
    "autumn tan": "#B89F7E",
    "boothbay blue": "#5B7A8A",
    "cobble stone": "#7A7568",
    "country lane red": "#6B3232",
    "deep ocean": "#2B4553",
    "evening blue": "#2B3A4D",
    "heathered moss": "#5A6B52",
    "iron gray": "#4A4F4F",
    "khaki brown": "#7D6B5A",
    "light mist": "#D8D8D0",
    "midnight blue": "#1E2A3A",
    "monterey taupe": "#8B7D6B",
    "mountain sage": "#7A8B7A",
    "navajo beige": "#C4B9A7",
    "night gray": "#3D4242",
    "pearl gray": "#9A9A94",
    "sandstone beige": "#C9B99A",
    "sierra": "#8B5A42",
    "slate gray": "#5A5F63",
    "timber bark": "#5D4E42",
    "traditional red": "#7B2D26",
    "tuscan gold": "#C4A35A",
    "woodstock brown": "#5A4A3A",
  };

  const getColorValue = (colorName: string, hexOverride?: string): string => {
    // Priority 1: Use hex from database if provided
    if (hexOverride) return hexOverride;

    // Priority 2: Look up in colorMap
    const normalized = colorName.toLowerCase().trim();
    return colorMap[normalized] || "#94a3b8"; // Default to silver
  };

  const bgColor = getColorValue(color, hex);
  const isLight = isLightColor(bgColor);

  // Helper to detect very light colors that need enhanced borders for visibility
  const isVeryLightColor = (hexColor: string): boolean => {
    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Use higher threshold for "very light" detection
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 200;
  };

  const needsStrongerBorder = isVeryLightColor(bgColor);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all",
        selected
          ? "border-[#00cc6a] bg-[#dcfce7] shadow-sm ring-2 ring-[#00cc6a]/20"
          : "border-[#e2e8f0] hover:border-[#00cc6a]/50 hover:bg-[#f8fafc]",
        className
      )}
    >
      {/* Color circle */}
      <div className="relative">
        <div
          className={cn(
            "h-12 w-12 rounded-full border-2 shadow-sm transition-transform group-hover:scale-105",
            selected
              ? "border-[#00cc6a]"
              : needsStrongerBorder
                ? "border-[#94a3b8]"
                : "border-[#e2e8f0]"
          )}
          style={{ backgroundColor: bgColor }}
        >
          {selected && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Check
                className={cn(
                  "h-6 w-6",
                  isLight ? "text-[#0f172a]" : "text-white"
                )}
                strokeWidth={3}
              />
            </div>
          )}
        </div>
      </div>

      {/* Label */}
      <span
        className={cn(
          "text-xs font-medium text-center transition-colors",
          selected ? "text-[#00cc6a]" : "text-[#475569] group-hover:text-[#0f172a]"
        )}
      >
        {label}
      </span>
    </button>
  );
}

// Helper function to determine if a color is light or dark
function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

interface ColorSwatchGridProps {
  colors: Array<{ value: string; label: string; hex?: string }>;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function ColorSwatchGrid({ colors, value, onChange, className }: ColorSwatchGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5", className)}>
      {colors.map((color) => (
        <ColorSwatch
          key={color.value}
          color={color.value}
          label={color.label}
          hex={color.hex}
          selected={value === color.value}
          onClick={() => onChange?.(color.value)}
        />
      ))}
    </div>
  );
}
