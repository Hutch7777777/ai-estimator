/**
 * Shared form data type for the 5-step project creation wizard.
 *
 * Lives here (not in a page file) so step components, the shared
 * ProjectForm, and the submission logic can all import it without
 * coupling to a specific route.
 */
export interface ProjectFormData {
  // Step 1: Project Info
  projectName: string;
  customerName: string;
  address: string;

  // Step 2: Trade Selection
  selectedTrades: string[];

  // Step 3: Product Configuration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configurations: Record<string, any>;

  // Step 4: PDF Upload
  pdfFile: File | null;
  pdfUrl: string;

  // Step 5: Review & Submit
  notes: string;
  markupPercent: number; // Markup percentage (default 15%)

  // Set once the project row has been created, so retries and the
  // final submit button never insert a duplicate project.
  projectId?: string | null;
}
