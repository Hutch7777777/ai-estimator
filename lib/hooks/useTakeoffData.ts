"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTakeoffByProjectId } from "@/lib/supabase/takeoffs";
import {
  Takeoff,
  TakeoffSection,
  LineItemWithState,
} from "@/lib/types/database";

interface UseTakeoffDataReturn {
  takeoff: Takeoff | null;
  sections: TakeoffSection[];
  lineItems: LineItemWithState[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage takeoff data for a project
 *
 * Fetches takeoff, sections, and line items from the database.
 * Sets up Realtime subscriptions for live updates.
 */
export function useTakeoffData(projectId: string): UseTakeoffDataReturn {
  const [takeoff, setTakeoff] = useState<Takeoff | null>(null);
  const [sections, setSections] = useState<TakeoffSection[]>([]);
  const [lineItems, setLineItems] = useState<LineItemWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await getTakeoffByProjectId(supabase, projectId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setTakeoff(result.takeoff);
      setSections(result.sections);
      setLineItems(result.lineItems);
    } catch (err) {
      console.error("Error in useTakeoffData:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId, supabase]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Setup Realtime subscriptions
  useEffect(() => {
    if (!takeoff?.id) return;

    const channel = supabase
      .channel(`takeoff-${takeoff.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "takeoffs",
          filter: `id=eq.${takeoff.id}`,
        },
        (payload) => {
          console.log("Takeoff updated:", payload);
          if (payload.new) {
            setTakeoff(payload.new as Takeoff);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "takeoff_sections",
          filter: `takeoff_id=eq.${takeoff.id}`,
        },
        (payload) => {
          console.log("Section changed:", payload);
          fetchData(); // Refresh all data when sections change
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "takeoff_line_items",
          filter: `takeoff_id=eq.${takeoff.id}`,
        },
        (payload) => {
          console.log("Line item changed:", payload);

          if (payload.eventType === "INSERT" && payload.new) {
            setLineItems((prev) => [...prev, payload.new as LineItemWithState]);
          } else if (payload.eventType === "UPDATE" && payload.new) {
            setLineItems((prev) =>
              prev.map((item) =>
                item.id === payload.new.id ? (payload.new as LineItemWithState) : item
              )
            );
          } else if (payload.eventType === "DELETE" && payload.old) {
            setLineItems((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [takeoff?.id, supabase, fetchData]);

  return {
    takeoff,
    sections,
    lineItems,
    loading,
    error,
    refresh: fetchData,
  };
}
