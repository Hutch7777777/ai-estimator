'use client';

import React, { memo, useState, useRef, useCallback } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface EditablePriceProps {
  /** Base price from the material/product */
  basePrice: number | null;
  /** Unit for display (e.g., 'SF', 'LF', 'ea') */
  unit: string;
  /** Current override price (if any) */
  currentOverride?: number | null;
  /** Callback when price is changed - null to clear override */
  onPriceChange: (newPrice: number | null) => void;
  /** Disable editing */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatPrice(price: number | null, unit: string): string {
  if (price === null || price === undefined) return '—';
  return `$${price.toFixed(2)}/${unit}`;
}

// =============================================================================
// EditablePrice Component
// =============================================================================

const EditablePrice = memo(function EditablePrice({
  basePrice,
  unit,
  currentOverride,
  onPriceChange,
  disabled = false,
  size = 'sm',
}: EditablePriceProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine effective price and override status
  const hasOverride = currentOverride !== undefined && currentOverride !== null;
  const effectivePrice = hasOverride ? currentOverride : basePrice;

  // Size-based classes
  const sizeClasses = {
    sm: {
      text: 'text-[10px]',
      input: 'w-14 h-4 px-1 text-[10px]',
      icon: 'w-2.5 h-2.5',
    },
    md: {
      text: 'text-xs',
      input: 'w-16 h-5 px-1 text-xs',
      icon: 'w-3 h-3',
    },
  };

  const classes = sizeClasses[size];

  // Start editing
  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(effectivePrice?.toFixed(2) ?? '');
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [disabled, effectivePrice]);

  // Save the edited price
  const handleSave = useCallback(() => {
    console.log('[EditablePrice] handleSave called, editValue:', editValue);
    const parsed = parseFloat(editValue);

    // Validate
    if (isNaN(parsed) || parsed < 0) {
      console.log('[EditablePrice] Invalid price, canceling edit');
      setIsEditing(false);
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    console.log('[EditablePrice] Parsed price:', rounded, 'basePrice:', basePrice);

    // If price matches base, clear override
    if (basePrice !== null && Math.abs(rounded - basePrice) < 0.001) {
      console.log('[EditablePrice] Same as base, clearing override');
      onPriceChange(null);
    } else {
      console.log('[EditablePrice] Setting override to:', rounded);
      onPriceChange(rounded);
    }

    setIsEditing(false);
  }, [editValue, basePrice, onPriceChange]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  // Reset to base price
  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPriceChange(null);
    },
    [onPriceChange]
  );

  // Editing mode
  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-0.5">
        <span className={`text-gray-500 dark:text-gray-400 ${classes.text}`}>$</span>
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`${classes.input} rounded border border-blue-400 dark:border-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500`}
        />
        <span className={`text-gray-500 dark:text-gray-400 ${classes.text}`}>/{unit}</span>
      </div>
    );
  }

  // Display mode
  return (
    <span className="inline-flex items-center gap-0.5 group">
      {disabled ? (
        // Static display when disabled
        <span className={`${classes.text} text-gray-500 dark:text-gray-400`}>
          {formatPrice(effectivePrice, unit)}
        </span>
      ) : (
        // Clickable button with hover effects
        <button
          type="button"
          onClick={handleStartEdit}
          className={`
            inline-flex items-center gap-0.5 transition-colors
            ${hasOverride
              ? `${classes.text} text-blue-600 dark:text-blue-400 font-medium`
              : `${classes.text} text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400`
            }
            hover:underline
          `}
          title="Click to edit price"
        >
          {formatPrice(effectivePrice, unit)}
          <Pencil
            className={`${classes.icon} opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-gray-500`}
          />
        </button>
      )}

      {/* Override indicator and reset button */}
      {hasOverride && !disabled && (
        <>
          <span className={`${classes.text} text-blue-600 dark:text-blue-400 italic`}>(edited)</span>
          <button
            type="button"
            onClick={handleReset}
            className="ml-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="Reset to default price"
          >
            <RotateCcw className={classes.icon} />
          </button>
        </>
      )}
    </span>
  );
});

export default EditablePrice;
