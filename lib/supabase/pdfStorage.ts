// Using direct fetch for storage operations due to Supabase client issues

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
  try {
    // Create a unique filename: projectId/timestamp_originalname.pdf
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${projectId}/${timestamp}_${sanitizedName}`;

    // Upload the file using direct fetch to Supabase Storage API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${filePath}`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': file.type,
          'Cache-Control': '3600',
          'x-upsert': 'false'
        },
        body: file
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error uploading PDF:", errorText);
      return { url: null, error: `Upload failed: ${response.statusText}` };
    }

    // Construct the public URL
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`;

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
    // Validate URL - must be a full URL, not a relative path
    if (!pdfUrl || (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://'))) {
      console.warn('Invalid PDF URL (not a full URL):', pdfUrl);
      return { blob: null, error: 'Invalid PDF URL - not a full URL' };
    }

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
  try {
    // List all files in the project folder
    const listResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/list/${BUCKET_NAME}`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefix: projectId })
      }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return { success: false, error: `List failed: ${errorText}` };
    }

    const files = await listResponse.json();

    if (!files || files.length === 0) {
      return { success: true }; // No files to delete
    }

    // Delete all files
    const filePaths = files.map((f: { name: string }) => `${projectId}/${f.name}`);
    const deleteResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: filePaths })
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      return { success: false, error: `Delete failed: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting PDFs:", error);
    return { success: false, error: String(error) };
  }
}
