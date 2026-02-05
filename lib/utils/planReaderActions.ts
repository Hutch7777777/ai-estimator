// =============================================================================
// Plan Reader Action Detection
// Detects when users want to CREATE documents vs just ASK questions
// =============================================================================

export type PlanReaderAction =
  | 'answer'           // Just answer a question
  | 'create_takeoff'   // Generate material takeoff spreadsheet
  | 'create_rfi'       // Generate RFI document
  | 'create_sow'       // Generate scope of work
  | 'create_summary'   // Generate bid summary
  | 'export_schedule'  // Export schedule as spreadsheet
  | 'create_checklist'; // Generate installation checklist

export type DocumentFormat = 'excel' | 'word' | 'pdf' | 'csv';

export interface ActionDetectionResult {
  action: PlanReaderAction;
  subject?: string; // e.g., "windows", "siding", "doors"
  format?: DocumentFormat;
}

// =============================================================================
// Action Pattern Definitions
// =============================================================================

const ACTION_PATTERNS: Array<{
  patterns: RegExp[];
  action: PlanReaderAction;
  defaultFormat: DocumentFormat;
}> = [
  {
    patterns: [
      /create\s+(a\s+)?.*takeoff/i,
      /generate\s+(a\s+)?.*takeoff/i,
      /make\s+(a\s+)?.*takeoff/i,
      /build\s+(a\s+)?.*takeoff/i,
      /export.*as\s+spreadsheet/i,
      /takeoff\s+(spreadsheet|excel)/i,
    ],
    action: 'create_takeoff',
    defaultFormat: 'excel',
  },
  {
    patterns: [
      /create\s+(a\s+)?.*rfi/i,
      /generate\s+(a\s+)?.*rfi/i,
      /make\s+(a\s+)?.*rfi/i,
      /what.*missing.*spec/i,
      /missing\s+information/i,
      /rfi\s+for/i,
      /request\s+for\s+information/i,
    ],
    action: 'create_rfi',
    defaultFormat: 'word',
  },
  {
    patterns: [
      /create\s+(a\s+)?.*scope/i,
      /generate\s+(a\s+)?.*scope/i,
      /scope\s+of\s+work/i,
      /sow\s+for/i,
      /write\s+(a\s+)?.*scope/i,
    ],
    action: 'create_sow',
    defaultFormat: 'word',
  },
  {
    patterns: [
      /create\s+(a\s+)?.*summary/i,
      /bid\s+summary/i,
      /project\s+summary/i,
      /quick\s+summary/i,
      /generate\s+(a\s+)?.*summary/i,
    ],
    action: 'create_summary',
    defaultFormat: 'pdf',
  },
  {
    patterns: [
      /export.*schedule/i,
      /schedule.*spreadsheet/i,
      /schedule.*excel/i,
      /schedule.*csv/i,
      /download.*schedule/i,
      /extract.*schedule/i,
    ],
    action: 'export_schedule',
    defaultFormat: 'excel',
  },
  {
    patterns: [
      /create\s+(a\s+)?.*checklist/i,
      /generate\s+(a\s+)?.*checklist/i,
      /installation\s+checklist/i,
      /make\s+(a\s+)?.*checklist/i,
      /punch\s*list/i,
    ],
    action: 'create_checklist',
    defaultFormat: 'word',
  },
];

// =============================================================================
// Subject Extraction
// =============================================================================

const SUBJECTS = [
  'window', 'windows',
  'door', 'doors',
  'siding',
  'trim',
  'roofing', 'roof',
  'gutter', 'gutters',
  'exterior',
  'fascia',
  'soffit',
  'flashing',
  'all', 'everything', 'full', 'complete',
];

// =============================================================================
// Action Detection Function
// =============================================================================

/**
 * Detect whether a user's question is asking Claude to CREATE something
 * vs just ANSWER a question.
 */
export function detectAction(question: string): ActionDetectionResult {
  const lowerQuestion = question.toLowerCase();

  // Check each action pattern
  for (const { patterns, action, defaultFormat } of ACTION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lowerQuestion)) {
        // Extract subject
        let subject: string | undefined;
        for (const s of SUBJECTS) {
          if (lowerQuestion.includes(s)) {
            // Normalize singular/plural
            subject = s.endsWith('s') && s !== 'glass' ? s : s;
            break;
          }
        }

        // Check for format override
        let format = defaultFormat;
        if (lowerQuestion.includes('excel') || lowerQuestion.includes('xlsx')) format = 'excel';
        if (lowerQuestion.includes('word') || lowerQuestion.includes('docx')) format = 'word';
        if (lowerQuestion.includes('pdf')) format = 'pdf';
        if (lowerQuestion.includes('csv')) format = 'csv';

        return { action, subject, format };
      }
    }
  }

  // Default to answer mode
  return { action: 'answer' };
}

/**
 * Check if an action result indicates document generation is needed
 */
export function isActionMode(result: ActionDetectionResult): boolean {
  return result.action !== 'answer';
}

/**
 * Get a human-readable description of the action
 */
export function getActionDescription(action: PlanReaderAction): string {
  const descriptions: Record<PlanReaderAction, string> = {
    answer: 'Answering question',
    create_takeoff: 'Generating material takeoff spreadsheet',
    create_rfi: 'Generating RFI document',
    create_sow: 'Generating scope of work',
    create_summary: 'Generating project summary',
    export_schedule: 'Exporting schedule',
    create_checklist: 'Generating installation checklist',
  };
  return descriptions[action];
}
