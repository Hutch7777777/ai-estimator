import { z } from "zod";

/**
 * Validation schemas for the multi-step project form
 * These schemas validate user input without modifying data structure
 */

// Step 1: Project Information
export const projectInfoSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .min(3, "Project name must be at least 3 characters")
    .max(100, "Project name must be less than 100 characters"),
  customerName: z
    .string()
    .min(1, "Customer name is required")
    .min(2, "Customer name must be at least 2 characters")
    .max(100, "Customer name must be less than 100 characters"),
  address: z
    .string()
    .min(1, "Address is required")
    .min(5, "Please enter a complete address")
    .max(200, "Address must be less than 200 characters"),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
});

export type ProjectInfoFormData = z.infer<typeof projectInfoSchema>;

// Step 2: Trade Selection
export const tradeSelectionSchema = z.object({
  selectedTrades: z
    .array(z.string())
    .min(1, "Please select at least one trade")
    .refine(
      (trades) => trades.every(t => ['siding', 'roofing', 'windows', 'gutters'].includes(t)),
      "Invalid trade selected"
    ),
});

export type TradeSelectionFormData = z.infer<typeof tradeSelectionSchema>;

// Step 3: Product Configuration (dynamic validation)
// This is more complex because fields are loaded from database
export const createProductConfigSchema = (selectedTrades: string[]) => {
  // Base schema - can be extended based on loaded fields
  return z.object({
    configurations: z.record(z.string(), z.any()).optional(),
  });
};

// Step 4: PDF Upload
export const pdfUploadSchema = z.object({
  pdfFile: z
    .instanceof(File)
    .refine((file) => file.type === 'application/pdf', "File must be a PDF")
    .refine((file) => file.size <= 25 * 1024 * 1024, "File size must be less than 25MB")
    .nullable()
    .refine((file) => file !== null, "Please upload a HOVER PDF"),
});

export type PdfUploadFormData = z.infer<typeof pdfUploadSchema>;

// Combined form schema (for final validation)
export const completeProjectSchema = projectInfoSchema
  .merge(tradeSelectionSchema)
  .merge(z.object({
    pdfFile: z.instanceof(File).nullable(),
    pdfUrl: z.string().optional(),
    configurations: z.record(z.string(), z.any()).optional(),
  }));

export type CompleteProjectFormData = z.infer<typeof completeProjectSchema>;

/**
 * Helper function to validate a single field
 */
export function validateField<T extends z.ZodType>(
  schema: T,
  fieldName: keyof z.infer<T>,
  value: any
): { success: boolean; error?: string } {
  try {
    // Create a schema for just this field
    const fieldSchema = (schema as any).shape[fieldName];
    if (!fieldSchema) {
      return { success: true };
    }

    const result = fieldSchema.safeParse(value);

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error.errors[0]?.message || "Invalid value",
      };
    }
  } catch (error) {
    return { success: true }; // If validation fails, don't block
  }
}

/**
 * Helper function to validate entire schema
 */
export function validateSchema<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: boolean; errors?: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true };
  }

  const errors: Record<string, string> = {};
  result.error.issues.forEach((err: any) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });

  return { success: false, errors };
}
