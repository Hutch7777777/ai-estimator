/**
 * Shared state shape for the multi-step project creation form
 * (ProjectForm and its step components).
 *
 * Extracted from the deleted legacy /project/new page, which was a
 * standalone duplicate of the form already embedded in /project?tab=new.
 */
export interface ProjectFormData {
  // Step 1: Project Info
  projectName: string;
  customerName: string;
  address: string;

  // Step 2: Trade Selection
  selectedTrades: string[];

  // Step 3: Product Configuration
  configurations: Record<string, any>;

  // Step 4: PDF Upload
  pdfFile: File | null;
  pdfUrl: string;

  // Step 5: Review & Submit
  notes: string;
  markupPercent: number; // Markup percentage (default 15%)
}
