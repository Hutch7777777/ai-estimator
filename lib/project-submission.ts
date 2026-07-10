import { createClient } from "@/lib/supabase/client";
import { ProjectFormData } from "@/lib/types/project-form";
import { getStorageObjectPath } from "@/lib/supabase/storageUrls";

/**
 * Single submission path for the project creation wizard.
 *
 * Both the step-4 "Generate Estimate" button and the step-5 "Submit
 * Project" button call submitProject(). The flow is idempotent: each
 * stage is skipped if the form data shows it already happened, so a
 * retry after a failure (or clicking both buttons) can never upload
 * the PDF twice or insert a duplicate project row.
 */

export interface SubmitProjectCallbacks {
  onUploadStart?: () => void;
  onUploaded?: (pdfUrl: string) => void;
  onProjectSaved?: (projectId: string) => void;
  onProcessingStart?: () => void;
}

export interface SubmitProjectResult {
  projectId: string;
  pdfUrl: string;
}

// Remove empty strings, null, and undefined values from config objects
// (false, 0, and arrays are valid values and are kept)
export function cleanConfig(config: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (value === "" || value === null || value === undefined) {
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      const cleanedNested = cleanConfig(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function resolveMarkupPercent(data: ProjectFormData): number {
  const candidates = [
    data.configurations?.siding?.markup_percent,
    data.markupPercent,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0 && num <= 100) return num;
  }
  return 15;
}

function buildWebhookPayload(data: ProjectFormData, workflowPdfUrl: string, projectId: string) {
  const cleanedSiding = cleanConfig(data.configurations?.siding || {});
  const cleanedRoofing = cleanConfig(data.configurations?.roofing || {});
  const cleanedWindows = cleanConfig(data.configurations?.windows || {});
  const cleanedGutters = cleanConfig(data.configurations?.gutters || {});

  if (data.selectedTrades?.includes("siding") && !cleanedSiding.siding_product_type) {
    console.warn("Warning: siding_product_type is missing but siding trade is selected");
  }

  return {
    project_id: projectId,
    project_name: data.projectName,
    client_name: data.customerName,
    address: data.address,
    selected_trades: data.selectedTrades,
    markup_percent: resolveMarkupPercent(data),
    siding: cleanedSiding,
    roofing: cleanedRoofing,
    windows: cleanedWindows,
    gutters: cleanedGutters,
    hover_pdf_url: workflowPdfUrl,
    created_at: new Date().toISOString(),
  };
}

// Trigger n8n workflow (proxied through Next.js API to avoid CORS)
async function triggerEstimateWorkflow(payload: ReturnType<typeof buildWebhookPayload>, projectName: string) {
  const response = await fetch("/api/n8n/multi-trade-coordinator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Workflow trigger failed: ${errorText}`);
  }

  // The workflow responds synchronously with the generated Excel file
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Estimate_${projectName}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function submitProject(
  data: ProjectFormData,
  organizationId: string,
  callbacks: SubmitProjectCallbacks = {}
): Promise<SubmitProjectResult> {
  if (!organizationId) {
    throw new Error("No organization selected. Please select an organization before creating a project.");
  }

  const supabase = createClient();
  const projectId = data.projectId || crypto.randomUUID();

  // Stage 1: Upload PDF (skipped if already uploaded)
  let pdfUrl = data.pdfUrl;
  if (!pdfUrl) {
    if (!data.pdfFile) {
      throw new Error("Please upload a HOVER PDF before submitting.");
    }
    callbacks.onUploadStart?.();

    const sanitizedName = data.pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${organizationId}/${projectId}/${Date.now()}_${sanitizedName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("hover-pdfs")
      .upload(fileName, data.pdfFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Keep a stable object reference in the database. The bucket is private;
    // consumers receive short-lived signed URLs instead of this URL directly.
    const { data: { publicUrl } } = supabase.storage
      .from("hover-pdfs")
      .getPublicUrl(uploadData.path);

    pdfUrl = publicUrl;
    callbacks.onUploaded?.(pdfUrl);
  }

  const storagePath = getStorageObjectPath(pdfUrl, 'hover-pdfs');
  let workflowPdfUrl = pdfUrl;
  if (storagePath) {
    const { data: signedData, error: signedError } = await supabase.storage
      .from('hover-pdfs')
      .createSignedUrl(storagePath, 60 * 60);
    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Could not authorize PDF processing: ${signedError?.message || 'Unknown storage error'}`);
    }
    workflowPdfUrl = signedData.signedUrl;
  }

  // Stage 2: Save project + trade configurations (skipped if already saved)
  if (!data.projectId) {
    const { error: dbError } = await supabase
      .from("projects")
      .insert({
        id: projectId,
        organization_id: organizationId,
        name: data.projectName,
        client_name: data.customerName,
        address: data.address,
        selected_trades: data.selectedTrades,
        hover_pdf_url: pdfUrl,
        markup_percent: resolveMarkupPercent(data),
        status: "pending" as const,
      });

    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    const configInserts = data.selectedTrades.map((trade) => ({
      project_id: projectId,
      trade,
      configuration_data: data.configurations?.[trade] || {},
    }));

    const { error: configError } = await supabase
      .from("project_configurations")
      .insert(configInserts);

    if (configError) throw new Error(`Configuration save error: ${configError.message}`);

    callbacks.onProjectSaved?.(projectId);
  }

  // Stage 3: Trigger the n8n estimate workflow (always runs — it is the
  // final stage, so reaching here means it hasn't succeeded yet)
  callbacks.onProcessingStart?.();
  const payload = buildWebhookPayload(data, workflowPdfUrl, projectId);
  await triggerEstimateWorkflow(payload, data.projectName);

  return { projectId, pdfUrl };
}
