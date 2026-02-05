'use client';

import React, { useEffect, useRef, memo } from 'react';
import { Copy, Trash2, Palette, Paintbrush } from 'lucide-react';
import type { DetectionClass } from '@/lib/types/extraction';
import { DETECTION_CLASS_COLORS, getClassDisplayLabel } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface DetectionContextMenuProps {
  /** Screen position where menu should appear */
  position: ContextMenuPosition;
  /** ID of the detection being acted upon */
  detectionId: string;
  /** Current class of the detection (for showing in Change Class submenu) */
  currentClass: DetectionClass;
  /** Current custom color override (if any) */
  currentColor?: string | null;
  /** Callback when user clicks Duplicate */
  onDuplicate: (detectionId: string) => void;
  /** Callback when user clicks Delete */
  onDelete: (detectionId: string) => void;
  /** Callback when user selects a new class */
  onChangeClass: (detectionId: string, newClass: DetectionClass) => void;
  /** Callback when user selects a new color */
  onChangeColor: (detectionId: string, newColor: string | null) => void;
  /** Callback to close the menu */
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

// Common classes for the Change Class submenu
const CLASS_OPTIONS: DetectionClass[] = [
  'siding',
  'soffit',
  'window',
  'door',
  'garage',
  'roof',
  'gable',
  'trim',
  'fascia',
  'gutter',
  'eave',
  'rake',
];

// Color options for the Change Color submenu
const COLOR_OPTIONS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Gray', value: '#6B7280' },
  { name: 'White', value: '#FFFFFF' },
];

// =============================================================================
// Component
// =============================================================================

const DetectionContextMenu = memo(function DetectionContextMenu({
  position,
  detectionId,
  currentClass,
  currentColor,
  onDuplicate,
  onDelete,
  onChangeClass,
  onChangeColor,
  onClose,
}: DetectionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showClassSubmenu, setShowClassSubmenu] = React.useState(false);
  const [showColorSubmenu, setShowColorSubmenu] = React.useState(false);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Use setTimeout to avoid closing immediately from the same click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position if menu would go off-screen
  const adjustedPosition = React.useMemo(() => {
    const menuWidth = 180;
    const menuHeight = (showClassSubmenu || showColorSubmenu) ? 400 : 160;
    const padding = 10;

    let x = position.x;
    let y = position.y;

    // Check if menu would go off the right edge
    if (typeof window !== 'undefined') {
      if (x + menuWidth + padding > window.innerWidth) {
        x = window.innerWidth - menuWidth - padding;
      }
      // Check if menu would go off the bottom edge
      if (y + menuHeight + padding > window.innerHeight) {
        y = window.innerHeight - menuHeight - padding;
      }
    }

    return { x, y };
  }, [position, showClassSubmenu, showColorSubmenu]);

  const handleDuplicate = () => {
    onDuplicate(detectionId);
    onClose();
  };

  const handleDelete = () => {
    onDelete(detectionId);
    onClose();
  };

  const handleClassSelect = (newClass: DetectionClass) => {
    onChangeClass(detectionId, newClass);
    onClose();
  };

  const handleColorSelect = (newColor: string | null) => {
    onChangeColor(detectionId, newColor);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Duplicate */}
      <button
        type="button"
        onClick={handleDuplicate}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
      >
        <Copy className="w-4 h-4" />
        Duplicate
      </button>

      {/* Change Class - with submenu */}
      <div
        className="relative"
        onMouseEnter={() => { setShowClassSubmenu(true); setShowColorSubmenu(false); }}
      >
        <button
          type="button"
          onClick={() => setShowClassSubmenu(!showClassSubmenu)}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 justify-between"
        >
          <span className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Change Class
          </span>
          <span className="text-gray-400">▸</span>
        </button>

        {/* Class Submenu */}
        {showClassSubmenu && (
          <div
            className="absolute left-full top-0 ml-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] max-h-[300px] overflow-y-auto"
            onMouseLeave={() => setShowClassSubmenu(false)}
          >
            {CLASS_OPTIONS.map((cls) => {
              const isCurrentClass = cls === currentClass;
              const color = DETECTION_CLASS_COLORS[cls] || '#6B7280';
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => handleClassSelect(cls)}
                  className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                    isCurrentClass
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                    style={{ backgroundColor: color }}
                  />
                  {getClassDisplayLabel(cls)}
                  {isCurrentClass && <span className="ml-auto text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Change Color - with submenu */}
      <div
        className="relative"
        onMouseEnter={() => { setShowColorSubmenu(true); setShowClassSubmenu(false); }}
      >
        <button
          type="button"
          onClick={() => setShowColorSubmenu(!showColorSubmenu)}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 justify-between"
        >
          <span className="flex items-center gap-2">
            <Paintbrush className="w-4 h-4" />
            Change Color
          </span>
          <span className="text-gray-400">▸</span>
        </button>

        {/* Color Submenu */}
        {showColorSubmenu && (
          <div
            className="absolute left-full top-0 ml-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] max-h-[300px] overflow-y-auto"
            onMouseLeave={() => setShowColorSubmenu(false)}
          >
            {/* Reset to default option */}
            <button
              type="button"
              onClick={() => handleColorSelect(null)}
              className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                !currentColor
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: DETECTION_CLASS_COLORS[currentClass] || '#6B7280' }}
              />
              Use Default
              {!currentColor && <span className="ml-auto text-xs">✓</span>}
            </button>

            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

            {/* Color options */}
            {COLOR_OPTIONS.map((colorOption) => {
              const isCurrentColor = currentColor === colorOption.value;
              return (
                <button
                  key={colorOption.value}
                  type="button"
                  onClick={() => handleColorSelect(colorOption.value)}
                  className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                    isCurrentColor
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                    style={{ backgroundColor: colorOption.value }}
                  />
                  {colorOption.name}
                  {isCurrentColor && <span className="ml-auto text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      {/* Delete */}
      <button
        type="button"
        onClick={handleDelete}
        className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>
    </div>
  );
});

export default DetectionContextMenu;
