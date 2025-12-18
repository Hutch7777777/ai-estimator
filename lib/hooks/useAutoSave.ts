"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

interface UseAutoSaveOptions<T> {
  key: string;
  data: T;
  interval?: number; // milliseconds
  enabled?: boolean;
  onSave?: (data: T) => void;
  onRestore?: (data: T) => void;
}

interface SavedData<T> {
  data: T;
  timestamp: number;
}

export function useAutoSave<T>({
  key,
  data,
  interval = 30000, // 30 seconds default
  enabled = true,
  onSave,
  onRestore,
}: UseAutoSaveOptions<T>) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialized = useRef(false);

  // Save data to localStorage
  const saveData = useCallback(() => {
    if (!enabled) return;

    try {
      const savedData: SavedData<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(savedData));
      setLastSaved(new Date());
      setHasDraft(true);
      onSave?.(data);
    } catch (error) {
      console.error("Failed to save draft:", error);
      toast.error("Failed to save draft");
    }
  }, [data, enabled, key, onSave]);

  // Load data from localStorage
  const loadData = useCallback((): T | null => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const savedData: SavedData<T> = JSON.parse(stored);
      return savedData.data;
    } catch (error) {
      console.error("Failed to load draft:", error);
      return null;
    }
  }, [key]);

  // Get draft metadata
  const getDraftMetadata = useCallback((): {
    timestamp: Date | null;
    age: number | null;
  } => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return { timestamp: null, age: null };

      const savedData: SavedData<T> = JSON.parse(stored);
      const timestamp = new Date(savedData.timestamp);
      const age = Date.now() - savedData.timestamp;

      return { timestamp, age };
    } catch (error) {
      return { timestamp: null, age: null };
    }
  }, [key]);

  // Clear saved draft
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setHasDraft(false);
      setLastSaved(null);
    } catch (error) {
      console.error("Failed to clear draft:", error);
    }
  }, [key]);

  // Check for existing draft on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const stored = localStorage.getItem(key);
    if (stored) {
      setHasDraft(true);
      const { timestamp, age } = getDraftMetadata();

      if (timestamp) {
        setLastSaved(timestamp);

        // Show recovery toast if draft is less than 24 hours old
        if (age && age < 24 * 60 * 60 * 1000) {
          const ageInMinutes = Math.floor(age / 60000);
          const timeAgo =
            ageInMinutes < 60
              ? `${ageInMinutes} minute${ageInMinutes !== 1 ? "s" : ""} ago`
              : `${Math.floor(ageInMinutes / 60)} hour${Math.floor(ageInMinutes / 60) !== 1 ? "s" : ""} ago`;

          toast.info("Draft recovered", {
            description: `Last saved ${timeAgo}`,
            action: {
              label: "Dismiss",
              onClick: () => {},
            },
          });

          const restoredData = loadData();
          if (restoredData) {
            onRestore?.(restoredData);
          }
        }
      }
    }
  }, [key, getDraftMetadata, loadData, onRestore]);

  // Set up auto-save interval
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      saveData();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, saveData]);

  // Format last saved time
  const getLastSavedText = useCallback((): string | null => {
    if (!lastSaved) return null;

    const now = Date.now();
    const diff = now - lastSaved.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return lastSaved.toLocaleString();
  }, [lastSaved]);

  return {
    saveData,
    loadData,
    clearDraft,
    lastSaved,
    lastSavedText: getLastSavedText(),
    hasDraft,
    getDraftMetadata,
  };
}
