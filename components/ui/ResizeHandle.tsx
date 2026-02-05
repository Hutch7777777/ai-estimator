import React from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  direction: 'left' | 'right';
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({ direction, isResizing, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className={cn(
        // Position at edge, no z-index needed - let DOM order handle stacking
        'absolute top-0 bottom-0 w-1 cursor-col-resize group',
        direction === 'right' ? 'right-0' : 'left-0',
      )}
      onMouseDown={onMouseDown}
    >
      {/* Visible handle line */}
      <div
        className={cn(
          'absolute top-0 bottom-0 w-1 transition-colors',
          direction === 'right' ? 'right-0' : 'left-0',
          isResizing ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-400'
        )}
      />
      {/* Wider invisible hit area - extends OUTWARD only (away from panel content) */}
      <div
        className={cn(
          'absolute top-0 bottom-0 w-4 cursor-col-resize',
          // For left handle (on right-side panel): extend leftward into canvas area
          // For right handle (on left-side panel): extend rightward into canvas area
          direction === 'left' ? 'right-0 -translate-x-full' : 'left-0 translate-x-full'
        )}
        onMouseDown={onMouseDown}
      />
    </div>
  );
}
