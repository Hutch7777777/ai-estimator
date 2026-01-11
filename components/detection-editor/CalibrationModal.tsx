'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Ruler } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixelDistance: number;
  currentScaleRatio: number | null;
  onApplyScale: (pixelsPerFoot: number) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Estimate architectural scale notation from pixels per foot.
 * Common architectural scales at approximately 100 DPI.
 */
function estimateScaleNotation(pixelsPerFoot: number): string | null {
  // Common architectural scales and their ratios
  // ratio = 12 inches per foot / scale fraction in inches
  // e.g., 1/4" = 1'-0" means 0.25" represents 12", so ratio = 12/0.25 = 48
  const scales = [
    { notation: '1" = 1\'-0"', ratio: 12 },
    { notation: '3/4" = 1\'-0"', ratio: 16 },
    { notation: '1/2" = 1\'-0"', ratio: 24 },
    { notation: '3/8" = 1\'-0"', ratio: 32 },
    { notation: '1/4" = 1\'-0"', ratio: 48 },
    { notation: '3/16" = 1\'-0"', ratio: 64 },
    { notation: '1/8" = 1\'-0"', ratio: 96 },
    { notation: '1/16" = 1\'-0"', ratio: 192 },
  ];

  // Find closest matching scale by comparing ratios
  let closest = scales[0];
  let minDiff = Infinity;

  for (const scale of scales) {
    const diff = Math.abs(pixelsPerFoot - scale.ratio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = scale;
    }
  }

  // Only return if reasonably close (within 30%)
  if (minDiff / closest.ratio < 0.3) {
    return closest.notation;
  }

  return null;
}

/**
 * Format feet and inches for display.
 * Examples: "8' 6\"", "8'", "6\""
 */
function formatMeasurement(feet: string, inches: string): string {
  const ft = parseInt(feet) || 0;
  const inch = parseInt(inches) || 0;
  if (ft > 0 && inch > 0) return `${ft}' ${inch}"`;
  if (ft > 0) return `${ft}'`;
  if (inch > 0) return `${inch}"`;
  return '0';
}

// =============================================================================
// Component
// =============================================================================

export default function CalibrationModal({
  isOpen,
  onClose,
  pixelDistance,
  currentScaleRatio,
  onApplyScale,
}: CalibrationModalProps) {
  const [feet, setFeet] = useState<string>('');
  const [inches, setInches] = useState<string>('');
  const feetInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeet('');
      setInches('');
      // Focus the feet input after a short delay to ensure modal is rendered
      setTimeout(() => {
        feetInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Calculate total feet from both inputs
  const totalFeet = useMemo(() => {
    const ft = parseFloat(feet) || 0;
    const inch = parseFloat(inches) || 0;
    return ft + (inch / 12);
  }, [feet, inches]);

  // Calculate new scale based on input
  const newScale = useMemo(() => {
    if (totalFeet <= 0 || !pixelDistance) return null;

    const pixelsPerFoot = pixelDistance / totalFeet;

    return {
      pixelsPerFoot,
      notation: estimateScaleNotation(pixelsPerFoot),
    };
  }, [totalFeet, pixelDistance]);

  const handleApply = () => {
    if (newScale) {
      onApplyScale(newScale.pixelsPerFoot);
    }
  };

  // Handle Enter key to apply
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newScale) {
      e.preventDefault();
      handleApply();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Calibrate Scale
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Pixel distance display */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Line drawn:{' '}
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
              {pixelDistance.toFixed(1)} pixels
            </span>
          </div>

          {/* Measurement input - Feet and Inches */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Enter the real-world measurement:
            </label>
            <div className="flex gap-3">
              {/* Feet input */}
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Feet
                </label>
                <input
                  ref={feetInputRef}
                  type="number"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {/* Inches input */}
              <div className="w-24">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Inches
                </label>
                <input
                  type="number"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  placeholder="0"
                  min="0"
                  max="11"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            {/* Display formatted measurement */}
            {totalFeet > 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                = {formatMeasurement(feet, inches)} ({totalFeet.toFixed(2)} ft)
              </div>
            )}
          </div>

          {/* Scale info panel */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md space-y-2 text-sm">
            {/* Current scale */}
            {currentScaleRatio && (
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                <span>Current scale:</span>
                <span className="font-mono">{currentScaleRatio.toFixed(1)} px/ft</span>
              </div>
            )}

            {/* New scale */}
            {newScale ? (
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 font-medium">
                <span>New scale:</span>
                <span className="font-mono">
                  {newScale.pixelsPerFoot.toFixed(1)} px/ft
                  {newScale.notation && (
                    <span className="ml-2 text-gray-500 dark:text-gray-400 font-normal">
                      ≈ {newScale.notation}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="text-gray-400 dark:text-gray-500 italic">
                Enter a measurement to calculate scale
              </div>
            )}
          </div>

          {/* Help text */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Draw a line along a known dimension (like a window width or door height) and enter
            its real-world measurement to calibrate the scale.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!newScale}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply Scale
          </button>
        </div>
      </div>
    </div>
  );
}
