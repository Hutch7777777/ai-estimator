'use client';

import React, { memo, useState, useEffect, useRef } from 'react';
import type { ExtractionDetection } from '@/lib/types/extraction';

// =============================================================================
// Types
// =============================================================================

interface NotesFieldProps {
  selectedDetections: ExtractionDetection[];
  onNotesChange: (detectionIds: string[], notes: string) => void;
}

// =============================================================================
// Component
// =============================================================================

const NotesField = memo(function NotesField({
  selectedDetections,
  onNotesChange,
}: NotesFieldProps) {
  const [localNotes, setLocalNotes] = useState('');
  const [hasMixedNotes, setHasMixedNotes] = useState(false);

  // Track last saved value to prevent duplicate saves
  const lastSavedNotesRef = useRef<string>('');

  // Sync local state with selected detection's notes
  useEffect(() => {
    if (selectedDetections.length === 0) {
      setLocalNotes('');
      setHasMixedNotes(false);
      lastSavedNotesRef.current = '';
      return;
    }

    if (selectedDetections.length === 1) {
      const notes = selectedDetections[0].notes || '';
      setLocalNotes(notes);
      setHasMixedNotes(false);
      lastSavedNotesRef.current = notes;
    } else {
      // For multi-select, check if all notes are the same
      const firstNotes = selectedDetections[0].notes || '';
      const allSame = selectedDetections.every((d) => (d.notes || '') === firstNotes);

      if (allSame) {
        setLocalNotes(firstNotes);
        setHasMixedNotes(false);
        lastSavedNotesRef.current = firstNotes;
      } else {
        setLocalNotes('');
        setHasMixedNotes(true);
        lastSavedNotesRef.current = '';
      }
    }
  }, [selectedDetections]);

  const handleBlur = () => {
    console.log('[NotesField] handleBlur triggered');
    console.log('[NotesField] localNotes:', localNotes);
    console.log('[NotesField] selectedDetections:', selectedDetections.length);

    // Save on blur
    if (selectedDetections.length > 0) {
      const ids = selectedDetections.map((d) => d.id);
      console.log('[NotesField] Calling onNotesChange with ids:', ids);
      onNotesChange(ids, localNotes);
      lastSavedNotesRef.current = localNotes;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Save on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  // Debounced auto-save - saves 1 second after user stops typing
  useEffect(() => {
    // Skip if no selections or no changes
    if (selectedDetections.length === 0) return;
    if (localNotes === lastSavedNotesRef.current) return;

    const timer = setTimeout(() => {
      console.log('[NotesField] Auto-save triggered after debounce');
      const ids = selectedDetections.map((d) => d.id);
      onNotesChange(ids, localNotes);
      lastSavedNotesRef.current = localNotes;
    }, 1000);

    return () => clearTimeout(timer);
  }, [localNotes, selectedDetections, onNotesChange]);

  const placeholder = hasMixedNotes
    ? 'Multiple notes - edit to replace all...'
    : selectedDetections.length > 1
      ? 'Add notes to all selected detections...'
      : 'Add notes about this detection...';

  if (selectedDetections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Notes
      </span>
      <textarea
        value={localNotes}
        onChange={(e) => setLocalNotes(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
      />
      {hasMixedNotes && localNotes === '' && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Selected items have different notes
        </p>
      )}
    </div>
  );
});

export default NotesField;
