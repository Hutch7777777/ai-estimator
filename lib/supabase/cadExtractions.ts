import { createClient } from "./client";

// Trade and category constants
export const EXTERIOR_TRADES = [
  "siding",
  "roofing",
  "trim",
  "windows",
  "doors",
  "gutters",
  "decking",
];
export const EXCLUDED_TRADES = ["interior", "masonry", "exclude"];
export const ALL_TRADES = [...EXTERIOR_TRADES, ...EXCLUDED_TRADES, "unknown"];

export const TRADE_CATEGORIES: Record<string, string[]> = {
  siding: ["lap_siding", "panel_siding", "board_batten", "shake_siding"],
  roofing: [
    "metal",
    "metal_5v",
    "standing_seam",
    "asphalt_shingle",
    "architectural",
    "ridge_cap",
    "accessory",
  ],
  trim: [
    "fascia",
    "soffit",
    "corner_boards",
    "frieze",
    "rake",
    "crown",
    "window_trim",
    "door_trim",
    "opening_trim",
    "flashing",
    "column",
    "handrail",
    "astragal",
  ],
  windows: [
    "general",
    "double_hung",
    "casement",
    "slider",
    "fixed",
    "awning",
    "picture",
  ],
  doors: ["exterior", "entry", "garage", "sliding", "french"],
  gutters: ["general", "half_round", "k_style", "downspout"],
  decking: ["floor", "railing"],
  interior: ["flooring", "tile", "paneling", "baseboard", "railing"],
  masonry: ["brick", "stone", "veneer"],
};

// Format category label for display (e.g., "lap_siding" -> "Lap Siding")
export function formatCategoryLabel(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Format trade label for display (e.g., "siding" -> "Siding")
export function formatTradeLabel(trade: string): string {
  return trade.charAt(0).toUpperCase() + trade.slice(1);
}

// Types
export interface CadExtraction {
  id: string;
  project_name: string;
  project_address: string | null;
  source_filename: string;
  status: string;
  extraction_version: string;
  sheet_count: number | null;
  dimension_count: number | null;
  material_callout_count: number | null;
  opening_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface CadHoverMeasurements {
  id: string;
  extraction_id: string;
  facade_total_sqft: number;
  net_siding_sqft: number;
  level_starter_lf: number;
  outside_corners_count: number;
  outside_corners_lf: number;
  inside_corners_count: number;
  inside_corners_lf: number;
  openings_count: number;
  openings_windows_count: number;
  openings_doors_count: number;
  openings_tops_lf: number;
  openings_sills_lf: number;
  openings_sides_lf: number;
  openings_perimeter_lf: number;
  openings_area_sqft: number;
  avg_wall_height_ft: number;
  siding_product: string | null;
  siding_exposure: string | null;
  trim_product: string | null;
  roof_product: string | null;
  gutter_product: string | null;
}

export interface CadMaterialCallout {
  id: string;
  extraction_id: string;
  raw_text: string;
  normalized_text: string;
  trade: string;
  material_type: string | null;
  manufacturer: string | null;
  size_spec: string | null;
  match_confidence: number | null;
  product_id: string | null;
  user_corrected: boolean;
}

// Fetch all CAD extractions (for linking)
export async function fetchCadExtractions(): Promise<{
  data: CadExtraction[] | null;
  error?: string;
}> {
  const supabase = createClient();

  const { data, error } = await (supabase as any)
    .from("cad_extractions")
    .select("*")
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data };
}

// Fetch CAD extraction by ID
export async function getCadExtraction(extractionId: string): Promise<{
  data: CadExtraction | null;
  error?: string;
}> {
  const supabase = createClient();

  const { data, error } = await (supabase as any)
    .from("cad_extractions")
    .select("*")
    .eq("id", extractionId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data };
}

// Fetch HOVER measurements for an extraction
export async function getHoverMeasurements(extractionId: string): Promise<{
  data: CadHoverMeasurements | null;
  error?: string;
}> {
  const supabase = createClient();

  const { data, error } = await (supabase as any)
    .from("cad_hover_measurements")
    .select("*")
    .eq("extraction_id", extractionId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data };
}

// Fetch material callouts for an extraction
export async function getMaterialCallouts(extractionId: string): Promise<{
  data: CadMaterialCallout[] | null;
  error?: string;
}> {
  const supabase = createClient();

  const { data, error } = await (supabase as any)
    .from("cad_material_callouts")
    .select("*")
    .eq("extraction_id", extractionId)
    .order("trade", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data };
}

// Link a CAD extraction to a bluebeam project
export async function linkCadExtraction(
  projectId: string,
  extractionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await (supabase as any)
    .from("bluebeam_projects")
    .update({ cad_extraction_id: extractionId })
    .eq("id", projectId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Unlink CAD extraction from project
export async function unlinkCadExtraction(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await (supabase as any)
    .from("bluebeam_projects")
    .update({ cad_extraction_id: null })
    .eq("id", projectId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Update material callout classification (for training)
export async function updateCalloutClassification(
  calloutId: string,
  updates: {
    trade?: string;
    material_type?: string;
    manufacturer?: string;
    product_id?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await (supabase as any)
    .from("cad_material_callouts")
    .update({
      ...updates,
      user_corrected: true,
    })
    .eq("id", calloutId);

  if (error) {
    return { success: false, error: error.message };
  }

  // TODO: Also update cad_layer_mappings for training

  return { success: true };
}

// Get CAD extraction summary for a project
export async function getCadExtractionSummary(projectId: string): Promise<{
  data: {
    extraction: CadExtraction | null;
    hover: CadHoverMeasurements | null;
    calloutCount: number;
    unknownCallouts: number;
  } | null;
  error?: string;
}> {
  const supabase = createClient();

  // First get the project to find the extraction ID
  const { data: project, error: projectError } = await (supabase as any)
    .from("bluebeam_projects")
    .select("cad_extraction_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project?.cad_extraction_id) {
    return { data: null };
  }

  const extractionId = project.cad_extraction_id;

  // Get extraction details
  const { data: extraction } = await getCadExtraction(extractionId);
  const { data: hover } = await getHoverMeasurements(extractionId);
  const { data: callouts } = await getMaterialCallouts(extractionId);

  const unknownCallouts =
    callouts?.filter((c) => c.trade === "unknown").length || 0;

  return {
    data: {
      extraction,
      hover,
      calloutCount: callouts?.length || 0,
      unknownCallouts,
    },
  };
}

// Get callouts grouped by trade
export async function getCalloutsByTrade(extractionId: string): Promise<{
  data: Record<string, CadMaterialCallout[]> | null;
  error?: string;
}> {
  const { data: callouts, error } = await getMaterialCallouts(extractionId);

  if (error || !callouts) {
    return { data: null, error };
  }

  // Group callouts by trade
  const grouped: Record<string, CadMaterialCallout[]> = {};

  for (const trade of ALL_TRADES) {
    grouped[trade] = [];
  }

  for (const callout of callouts) {
    const trade = callout.trade || "unknown";
    if (!grouped[trade]) {
      grouped[trade] = [];
    }
    grouped[trade].push(callout);
  }

  return { data: grouped };
}

// Update a callout's trade classification
export async function updateCalloutTrade(
  calloutId: string,
  trade: string,
  materialType?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const updates: Record<string, any> = {
    trade,
    user_corrected: true,
  };

  if (materialType !== undefined) {
    updates.material_type = materialType;
  }

  const { error } = await (supabase as any)
    .from("cad_material_callouts")
    .update(updates)
    .eq("id", calloutId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Confirm a callout (increase confidence without changing classification)
export async function confirmCallout(
  calloutId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // First get the current callout to access its normalized_text and trade
  const { data: callout, error: fetchError } = await (supabase as any)
    .from("cad_material_callouts")
    .select("normalized_text, trade, material_type, match_confidence")
    .eq("id", calloutId)
    .single();

  if (fetchError || !callout) {
    return { success: false, error: fetchError?.message || "Callout not found" };
  }

  // Update the callout to mark as user confirmed
  const newConfidence = Math.min((callout.match_confidence || 0.5) + 0.1, 1.0);
  const { error: updateError } = await (supabase as any)
    .from("cad_material_callouts")
    .update({
      match_confidence: newConfidence,
      user_corrected: true,
    })
    .eq("id", calloutId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Record the training example
  await recordTrainingExample(
    callout.normalized_text,
    callout.trade,
    callout.material_type || "",
    false // Not a correction, just a confirmation
  );

  return { success: true };
}

// Record a training example in cad_layer_mappings
export async function recordTrainingExample(
  normalizedText: string,
  trade: string,
  category: string,
  wasCorrection: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Generate a text pattern from the normalized text
  // e.g., "CLAPBOARD SIDING" -> "%CLAPBOARD%SIDING%"
  const words = normalizedText.toUpperCase().split(/\s+/).filter(Boolean);
  const textPattern = words.length > 0 ? `%${words.join("%")}%` : `%${normalizedText.toUpperCase()}%`;

  // Check if a mapping already exists for this pattern
  const { data: existing, error: fetchError } = await (supabase as any)
    .from("cad_layer_mappings")
    .select("*")
    .eq("text_pattern", textPattern)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 = no rows returned, which is fine
    return { success: false, error: fetchError.message };
  }

  if (existing) {
    // Update existing mapping
    const updates: Record<string, any> = {
      times_seen: (existing.times_seen || 0) + 1,
      trade,
      category,
    };

    if (wasCorrection) {
      updates.times_rejected = (existing.times_rejected || 0) + 1;
    } else {
      updates.times_confirmed = (existing.times_confirmed || 0) + 1;
    }

    const { error: updateError } = await (supabase as any)
      .from("cad_layer_mappings")
      .update(updates)
      .eq("id", existing.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }
  } else {
    // Insert new mapping
    const { error: insertError } = await (supabase as any)
      .from("cad_layer_mappings")
      .insert({
        layer_name: `user_${Date.now()}`,
        text_pattern: textPattern,
        trade,
        category,
        times_seen: 1,
        times_confirmed: wasCorrection ? 0 : 1,
        times_rejected: wasCorrection ? 1 : 0,
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  return { success: true };
}

// Bulk confirm all high-confidence callouts
export async function confirmHighConfidenceCallouts(
  extractionId: string,
  threshold: number = 0.8
): Promise<{ success: boolean; confirmedCount: number; error?: string }> {
  const { data: callouts, error } = await getMaterialCallouts(extractionId);

  if (error || !callouts) {
    return { success: false, confirmedCount: 0, error };
  }

  const highConfidence = callouts.filter(
    (c) =>
      (c.match_confidence || 0) >= threshold &&
      !c.user_corrected &&
      c.trade !== "unknown"
  );

  let confirmedCount = 0;
  for (const callout of highConfidence) {
    const result = await confirmCallout(callout.id);
    if (result.success) {
      confirmedCount++;
    }
  }

  return { success: true, confirmedCount };
}
