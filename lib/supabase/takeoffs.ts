/**
 * Supabase Helper Functions for Takeoffs
 *
 * Type-safe database operations for takeoffs, sections, and line items.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  Database,
  Takeoff,
  TakeoffSection,
  TakeoffLineItem,
  LineItemWithState,
} from "@/lib/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

/**
 * Get complete takeoff data for a project (takeoff + sections + line items)
 */
export async function getTakeoffByProjectId(
  supabase: TypedSupabaseClient,
  projectId: string
) {
  try {
    // Fetch takeoff
    const { data: takeoff, error: takeoffError } = await supabase
      .from("takeoffs")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (takeoffError) {
      if (takeoffError.code === "PGRST116") {
        // No takeoff found
        return { takeoff: null, sections: [], lineItems: [], error: null };
      }
      throw takeoffError;
    }

    if (!takeoff) {
      return { takeoff: null, sections: [], lineItems: [], error: null };
    }

    // Fetch sections
    const { data: sections, error: sectionsError } = await supabase
      .from("takeoff_sections")
      .select("*")
      .eq("takeoff_id", takeoff.id)
      .order("display_order", { ascending: true });

    if (sectionsError) throw sectionsError;

    // Fetch line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from("takeoff_line_items")
      .select("*")
      .eq("takeoff_id", takeoff.id)
      .order("item_number", { ascending: true });

    if (lineItemsError) throw lineItemsError;

    return {
      takeoff,
      sections: sections || [],
      lineItems: lineItems || [],
      error: null,
    };
  } catch (error) {
    console.error("Error fetching takeoff:", error);
    return {
      takeoff: null,
      sections: [],
      lineItems: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Create a new line item
 */
export async function createLineItem(
  supabase: TypedSupabaseClient,
  lineItem: Database["public"]["Tables"]["takeoff_line_items"]["Insert"]
) {
  try {
    const { data, error } = await supabase
      .from("takeoff_line_items")
      .insert(lineItem)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error creating line item:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update an existing line item
 */
export async function updateLineItem(
  supabase: TypedSupabaseClient,
  lineItemId: string,
  updates: Database["public"]["Tables"]["takeoff_line_items"]["Update"]
) {
  try {
    const { data, error } = await supabase
      .from("takeoff_line_items")
      .update(updates)
      .eq("id", lineItemId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error updating line item:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete a line item (hard delete)
 */
export async function deleteLineItem(
  supabase: TypedSupabaseClient,
  lineItemId: string
) {
  try {
    const { error } = await supabase
      .from("takeoff_line_items")
      .delete()
      .eq("id", lineItemId);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error("Error deleting line item:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Bulk upsert line items (create new or update existing)
 */
export async function upsertLineItems(
  supabase: TypedSupabaseClient,
  lineItems: LineItemWithState[]
) {
  try {
    // Separate new items from existing items
    const newItems = lineItems.filter((item) => item.isNew);
    const existingItems = lineItems.filter((item) => item.isModified && !item.isNew);

    const results: {
      inserted: TakeoffLineItem[];
      updated: TakeoffLineItem[];
      errors: string[];
    } = {
      inserted: [],
      updated: [],
      errors: [],
    };

    // Insert new items
    if (newItems.length > 0) {
      const insertData = newItems.map((item) => ({
        takeoff_id: item.takeoff_id,
        section_id: item.section_id,
        item_number: item.item_number,
        description: item.description,
        sku: item.sku,
        product_id: item.product_id,
        quantity: item.quantity,
        unit: item.unit,
        material_unit_cost: item.material_unit_cost,
        labor_unit_cost: item.labor_unit_cost,
        equipment_unit_cost: item.equipment_unit_cost,
        calculation_source: item.calculation_source,
        source_id: item.source_id,
        formula_used: item.formula_used,
        notes: item.notes,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("takeoff_line_items")
        .insert(insertData)
        .select();

      if (insertError) {
        results.errors.push(`Insert error: ${insertError.message}`);
      } else if (inserted) {
        results.inserted = inserted;
      }
    }

    // Update existing items
    for (const item of existingItems) {
      const { data: updated, error: updateError } = await supabase
        .from("takeoff_line_items")
        .update({
          item_number: item.item_number,
          description: item.description,
          sku: item.sku,
          product_id: item.product_id,
          quantity: item.quantity,
          unit: item.unit,
          material_unit_cost: item.material_unit_cost,
          labor_unit_cost: item.labor_unit_cost,
          equipment_unit_cost: item.equipment_unit_cost,
          notes: item.notes,
        })
        .eq("id", item.id)
        .select()
        .single();

      if (updateError) {
        results.errors.push(`Update error for ${item.id}: ${updateError.message}`);
      } else if (updated) {
        results.updated.push(updated);
      }
    }

    return { data: results, error: results.errors.length > 0 ? results.errors.join("; ") : null };
  } catch (error) {
    console.error("Error upserting line items:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Recalculate totals for a section (triggers database function)
 */
export async function recalculateSectionTotals(
  supabase: TypedSupabaseClient,
  sectionId: string
) {
  try {
    const { error } = await supabase.rpc("recalculate_section_totals", {
      section_uuid: sectionId,
    });

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error("Error recalculating section totals:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Recalculate totals for a takeoff (triggers database function)
 */
export async function recalculateTakeoffTotals(
  supabase: TypedSupabaseClient,
  takeoffId: string
) {
  try {
    const { error } = await supabase.rpc("recalculate_takeoff_totals", {
      takeoff_uuid: takeoffId,
    });

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error("Error recalculating takeoff totals:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update takeoff status
 */
export async function updateTakeoffStatus(
  supabase: TypedSupabaseClient,
  takeoffId: string,
  status: Database["public"]["Tables"]["takeoffs"]["Update"]["status"]
) {
  try {
    const { data, error } = await supabase
      .from("takeoffs")
      .update({ status })
      .eq("id", takeoffId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error updating takeoff status:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get line items for a specific section
 */
export async function getLineItemsBySection(
  supabase: TypedSupabaseClient,
  sectionId: string
) {
  try {
    const { data, error } = await supabase
      .from("takeoff_line_items")
      .select("*")
      .eq("section_id", sectionId)
      .order("item_number", { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error("Error fetching line items:", error);
    return {
      data: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
