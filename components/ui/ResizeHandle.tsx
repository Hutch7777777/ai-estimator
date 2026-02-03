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
        'absolute top-0 bottom-0 w-1 cursor-col-resize z-10',
        'hover:bg-blue-500/50 transition-colors',
        direction === 'right' ? 'right-0' : 'left-0',
        isResizing && 'bg-blue-500/70'
      )}
      onMouseDown={onMouseDown}
    >
      {/* Wider invisible hit area */}
      <div
        className={cn(
          'absolute top-0 bottom-0 w-3',
          direction === 'right' ? '-right-1' : '-left-1'
        )}
      />
    </div>
  );
}
