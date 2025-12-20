import { createClient } from "./client";

const BUCKET_NAME = "project-pdfs";

/**
 * Upload a PDF file to Supabase Storage
 * @param projectId - The project ID to associate the PDF with
 * @param file - The PDF file to upload
 * @returns The public URL of the uploaded file
 */
export async function uploadProjectPdf(
  projectId: string,
  file: File
): Promise<{ url: string | null; error?: string }> {
  const supabase = createClient();

  try {
    // Create a unique filename: projectId/timestamp_originalname.pdf
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${projectId}/${timestamp}_${sanitizedName}`;

    // Upload the file
    const { data, error } = await (supabase as any).storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading PDF:", error);
      return { url: null, error: error.message };
    }

    // Get the public URL
    const { data: urlData } = (supabase as any).storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return { url: urlData.publicUrl };
  } catch (error) {
    console.error("Error uploading PDF:", error);
    return { url: null, error: String(error) };
  }
}

/**
 * Download a PDF from Supabase Storage as a blob
 * @param pdfUrl - The URL of the PDF to download
 * @returns The PDF as a Blob
 */
export async function downloadProjectPdf(
  pdfUrl: string
): Promise<{ blob: Blob | null; error?: string }> {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return { blob: null, error: `Failed to fetch PDF: ${response.statusText}` };
    }
    const blob = await response.blob();
    return { blob };
  } catch (error) {
    console.error("Error downloading PDF:", error);
    return { blob: null, error: String(error) };
  }
}

/**
 * Delete a project's PDFs from storage
 * @param projectId - The project ID whose PDFs to delete
 */
export async function deleteProjectPdfs(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  try {
    // List all files in the project folder
    const { data: files, error: listError } = await (supabase as any).storage
      .from(BUCKET_NAME)
      .list(projectId);

    if (listError) {
      return { success: false, error: listError.message };
    }

    if (!files || files.length === 0) {
      return { success: true }; // No files to delete
    }

    // Delete all files
    const filePaths = files.map((f: any) => `${projectId}/${f.name}`);
    const { error: deleteError } = await (supabase as any).storage
      .from(BUCKET_NAME)
      .remove(filePaths);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting PDFs:", error);
    return { success: false, error: String(error) };
  }
}
