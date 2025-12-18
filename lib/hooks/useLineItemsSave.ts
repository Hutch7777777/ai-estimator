"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertLineItems } from "@/lib/supabase/takeoffs";
import { LineItemWithState } from "@/lib/types/database";

interface UseLineItemsSaveReturn {
  saveLineItems: (items: LineItemWithState[]) => Promise<void>;
  isSaving: boolean;
  error: string | null;
  lastSaved: Date | null;
}

/**
 * Hook for saving line items to the database
 *
 * Handles bulk upsert of line items (create new and update existing).
 * Provides loading state and error handling.
 */
export function useLineItemsSave(): UseLineItemsSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const supabase = createClient();

  const saveLineItems = useCallback(
    async (items: LineItemWithState[]) => {
      // Only save items that are new or modified
      const itemsToSave = items.filter((item) => item.isNew || item.isModified);

      if (itemsToSave.length === 0) {
        console.log("No changes to save");
        return;
      }

      try {
        setIsSaving(true);
        setError(null);

        console.log(`Saving ${itemsToSave.length} line items...`);

        const result = await upsertLineItems(supabase, itemsToSave);

        if (result.error) {
          throw new Error(result.error);
        }

        const { inserted, updated, errors } = result.data!;

        console.log(
          `Successfully saved: ${inserted.length} inserted, ${updated.length} updated`
        );

        if (errors.length > 0) {
          console.warn("Some items failed to save:", errors);
          setError(`Partial save: ${errors.join("; ")}`);
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
