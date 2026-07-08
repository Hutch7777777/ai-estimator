"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertLineItems, deleteLineItems } from "@/lib/supabase/takeoffs";
import { LineItemWithState } from "@/lib/types/database";

interface UseLineItemsSaveReturn {
  saveLineItems: (items: LineItemWithState[], deletedIds?: string[]) => Promise<void>;
  isSaving: boolean;
  error: string | null;
  lastSaved: Date | null;
}

/**
 * Hook for saving line items to the database
 *
 * Handles bulk upsert (create new and update existing) plus deletion of
 * removed rows. Deletes run before updates so renumbered item numbers
 * never collide with rows that are going away.
 */
export function useLineItemsSave(): UseLineItemsSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const supabase = createClient();

  const saveLineItems = useCallback(
    async (items: LineItemWithState[], deletedIds: string[] = []) => {
      // Only save items that are new or modified
      const itemsToSave = items.filter((item) => item.isNew || item.isModified);

      if (itemsToSave.length === 0 && deletedIds.length === 0) {
        return;
      }

      try {
        setIsSaving(true);
        setError(null);

        // Delete removed rows first — frees their item numbers before
        // the remaining rows are renumbered
        if (deletedIds.length > 0) {
          const deleteResult = await deleteLineItems(supabase, deletedIds);
          if (deleteResult.error) {
            throw new Error(`Delete failed: ${deleteResult.error}`);
          }
        }

        if (itemsToSave.length > 0) {
          const result = await upsertLineItems(supabase, itemsToSave);

          if (result.error) {
            throw new Error(result.error);
          }

          const { errors } = result.data!;

          if (errors.length > 0) {
            console.warn("Some items failed to save:", errors);
            setError(`Partial save: ${errors.join("; ")}`);
          }
        }

        setLastSaved(new Date());
      } catch (err) {
        console.error("Error saving line items:", err);
        setError(err instanceof Error ? err.message : "Failed to save");
        throw err; // Re-throw so caller can handle
      } finally {
        setIsSaving(false);
      }
    },
    [supabase]
  );

  return {
    saveLineItems,
    isSaving,
    error,
    lastSaved,
  };
}
