import { createClient } from '@/lib/supabase/client';
import { getStorageObjectPath } from '@/lib/supabase/storageUrls';

const BUCKET_NAME = "project-pdfs";

/**
 * Upload a PDF file to Supabase Storage
 * @param projectId - The project ID to associate the PDF with
 * @param file - The PDF file to upload
 * @returns A stable storage reference. Access still requires an authenticated download or signed URL.
 */
export async function uploadProjectPdf(
  projectId: string,
  file: File
): Promise<{ url: string | null; error?: string }> {
  try {
    // Create a unique filename: projectId/timestamp_originalname.pdf
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${projectId}/${timestamp}_${sanitizedName}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (uploadError) return { url: null, error: `Upload failed: ${uploadError.message}` };

    // Keep a stable reference even though the bucket itself is private.
    const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return { url: publicUrl };
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
    const objectPath = getStorageObjectPath(pdfUrl, BUCKET_NAME);
    if (!objectPath) return { blob: null, error: 'Invalid PDF storage reference' };

    const supabase = createClient();
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(objectPath);
    if (error) return { blob: null, error: `Failed to fetch PDF: ${error.message}` };
    return { blob: data };
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
  try {
    const supabase = createClient();
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(projectId);
    if (listError) return { success: false, error: `List failed: ${listError.message}` };

    if (!files || files.length === 0) {
      return { success: true }; // No files to delete
    }

    // Delete all files
    const filePaths = files.map((file) => `${projectId}/${file.name}`);
    const { error: deleteError } = await supabase.storage.from(BUCKET_NAME).remove(filePaths);
    if (deleteError) return { success: false, error: `Delete failed: ${deleteError.message}` };

    return { success: true };
  } catch (error) {
    console.error("Error deleting PDFs:", error);
    return { success: false, error: String(error) };
  }
}
