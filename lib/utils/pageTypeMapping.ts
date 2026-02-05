// =============================================================================
// Page Type Mapping Utility
// Maps question keywords to relevant page types for smart page selection
// =============================================================================

/**
 * Mapping of question keywords to relevant page types.
 * Page types match the labels shown on page thumbnails (cover, schedule, floor Plan, etc.)
 */
export const QUESTION_TO_PAGE_TYPES: Record<string, string[]> = {
  // Window questions - include notes/spec pages for manufacturer info
  'window': ['schedule', 'notes', 'spec', 'elevation', 'front', 'rear', 'left', 'right', 'east', 'west', 'north', 'south'],
  'windows': ['schedule', 'notes', 'spec', 'elevation', 'front', 'rear', 'left', 'right', 'east', 'west', 'north', 'south'],
  'glazing': ['schedule', 'notes', 'spec', 'elevation'],
  'milgard': ['schedule', 'notes', 'spec', 'elevation'],
  'andersen': ['schedule', 'notes', 'spec', 'elevation'],
  'pella': ['schedule', 'notes', 'spec', 'elevation'],
  'marvin': ['schedule', 'notes', 'spec', 'elevation'],
  'takeoff': ['schedule', 'notes', 'spec', 'elevation', 'front', 'rear'],  // For takeoff requests

  // Door questions - include notes/spec pages for manufacturer info
  'door': ['schedule', 'notes', 'spec', 'elevation', 'floor plan', 'front', 'rear'],
  'doors': ['schedule', 'notes', 'spec', 'elevation', 'floor plan', 'front', 'rear'],
  'entry': ['schedule', 'notes', 'spec', 'elevation', 'front'],
  'garage': ['elevation', 'front', 'schedule', 'notes'],

  // Siding/exterior questions
  'siding': ['elevation', 'front', 'rear', 'left', 'right', 'east', 'west', 'north', 'south', 'detail', 'section'],
  'hardie': ['elevation', 'front', 'rear', 'detail', 'notes'],
  'hardieplank': ['elevation', 'detail', 'notes'],
  'hardietrim': ['elevation', 'detail', 'notes'],
  'lap': ['elevation', 'detail', 'section'],
  'panel': ['elevation', 'detail', 'section'],
  'shake': ['elevation', 'detail'],
  'shingle': ['elevation', 'detail', 'roof'],
  'exterior': ['elevation', 'front', 'rear', 'left', 'right', 'detail'],
  'cladding': ['elevation', 'detail', 'section'],
  'lp smartside': ['elevation', 'detail', 'notes'],
  'smartside': ['elevation', 'detail', 'notes'],
  'cedar': ['elevation', 'detail', 'notes'],
  'vinyl': ['elevation', 'detail', 'notes'],
  'stucco': ['elevation', 'detail', 'notes'],
  'board and batten': ['elevation', 'detail'],

  // Trim questions
  'trim': ['elevation', 'detail', 'section', 'front', 'rear'],
  'fascia': ['elevation', 'detail', 'section', 'roof'],
  'soffit': ['elevation', 'detail', 'section'],
  'corner': ['elevation', 'detail'],
  'casing': ['elevation', 'detail', 'section'],
  'belly band': ['elevation', 'detail'],
  'band board': ['elevation', 'detail'],
  'frieze': ['elevation', 'detail'],
  'azek': ['elevation', 'detail', 'notes'],
  'pvc': ['elevation', 'detail', 'notes'],

  // Roofing questions
  'roof': ['roof', 'elevation', 'front', 'rear', 'detail'],
  'roofing': ['roof', 'elevation', 'detail', 'notes'],
  'gutter': ['roof', 'elevation', 'detail'],
  'downspout': ['roof', 'elevation', 'detail'],
  'flashing': ['roof', 'detail', 'section'],
  'gaf': ['roof', 'notes', 'detail'],
  'certainteed': ['roof', 'notes', 'detail'],
  'owens corning': ['roof', 'notes', 'detail'],
  'metal roof': ['roof', 'elevation', 'detail'],

  // WRB/Housewrap questions
  'wrb': ['detail', 'section', 'notes'],
  'housewrap': ['detail', 'section', 'notes'],
  'tyvek': ['detail', 'section', 'notes'],
  'zip': ['detail', 'section', 'notes'],
  'weather barrier': ['detail', 'section', 'notes'],

  // Color questions
  'color': ['elevation', 'front', 'rear', 'notes', 'schedule'],
  'colors': ['elevation', 'front', 'rear', 'notes', 'schedule'],
  'paint': ['elevation', 'notes'],
  'finish': ['elevation', 'detail', 'notes'],

  // General/all
  'material': ['elevation', 'schedule', 'detail', 'notes', 'front', 'rear'],
  'materials': ['elevation', 'schedule', 'detail', 'notes'],
  'spec': ['notes', 'schedule', 'detail', 'cover'],
  'specification': ['notes', 'schedule', 'detail'],
  'specifications': ['notes', 'schedule', 'detail'],
  'callout': ['elevation', 'front', 'rear', 'left', 'right', 'detail'],
  'callouts': ['elevation', 'front', 'rear', 'left', 'right', 'detail'],
  'manufacturer': ['schedule', 'notes', 'detail'],
  'brand': ['schedule', 'notes', 'detail'],
  'product': ['schedule', 'notes', 'detail'],
  'note': ['notes', 'detail', 'cover'],
  'notes': ['notes', 'detail', 'cover'],
};

/**
 * Page type priority for sorting selected pages.
 * Lower number = higher priority.
 */
const PAGE_TYPE_PRIORITY: Record<string, number> = {
  'schedule': 1,
  'notes': 2,
  'detail': 3,
  'front': 4,
  'elevation': 5,
  'rear': 6,
  'left': 7,
  'right': 7,
  'east': 7,
  'west': 7,
  'north': 7,
  'south': 7,
  'section': 8,
  'roof': 9,
  'floor plan': 10,
  'cover': 11,
};

/**
 * Get relevant page types for a question based on keyword matching.
 * @param question - The user's question
 * @returns Array of relevant page type strings
 */
export function getRelevantPageTypes(question: string): string[] {
  const lowerQuestion = question.toLowerCase();
  const relevantTypes = new Set<string>();

  // Always include 'current' to represent the currently viewed page
  relevantTypes.add('current');

  // Check each keyword
  for (const [keyword, pageTypes] of Object.entries(QUESTION_TO_PAGE_TYPES)) {
    if (lowerQuestion.includes(keyword)) {
      pageTypes.forEach(type => relevantTypes.add(type.toLowerCase()));
    }
  }

  // If no specific matches found, default to elevations and schedules
  if (relevantTypes.size === 1) { // Only 'current'
    ['elevation', 'schedule', 'front', 'rear', 'detail', 'notes'].forEach(t => relevantTypes.add(t));
  }

  return Array.from(relevantTypes);
}

/**
 * Page selection result with metadata
 */
export interface SelectedPage {
  id: string;
  page_number: number;
  reason: string;
  image_url: string | null;
}

/**
 * Input page type for filtering
 */
export interface PageInput {
  id: string;
  page_number: number;
  page_type?: string | null;
  page_label?: string | null;
  thumbnail_url?: string | null;
  image_url?: string | null;
  original_image_url?: string | null;
}

/**
 * Filter and select the most relevant pages for a question.
 * @param pages - All available pages
 * @param relevantTypes - Page types to look for (from getRelevantPageTypes)
 * @param currentPageId - ID of the currently viewed page
 * @param maxPages - Maximum number of pages to select (default: 4)
 * @returns Array of selected pages with metadata
 */
export function filterRelevantPages(
  pages: PageInput[],
  relevantTypes: string[],
  currentPageId: string,
  maxPages: number = 4
): SelectedPage[] {
  const selected: Array<SelectedPage & { priority: number }> = [];
  const addedIds = new Set<string>();

  for (const page of pages) {
    // Skip if already added
    if (addedIds.has(page.id)) continue;

    const pageType = (page.page_type || page.page_label || '').toLowerCase();
    const imageUrl = page.original_image_url || page.image_url || page.thumbnail_url || null;

    // Current page always included with highest priority
    if (page.id === currentPageId) {
      selected.push({
        id: page.id,
        page_number: page.page_number,
        reason: 'current page',
        image_url: imageUrl,
        priority: 0
      });
      addedIds.add(page.id);
      continue;
    }

    // Check if page type matches any relevant type
    for (const relevantType of relevantTypes) {
      if (relevantType === 'current') continue;

      // Check for partial match in either direction
      if (pageType.includes(relevantType) || relevantType.includes(pageType)) {
        const priority = PAGE_TYPE_PRIORITY[relevantType] ?? PAGE_TYPE_PRIORITY[pageType] ?? 10;
        selected.push({
          id: page.id,
          page_number: page.page_number,
          reason: pageType || 'unknown',
          image_url: imageUrl,
          priority
        });
        addedIds.add(page.id);
        break;
      }
    }
  }

  // Sort by priority (lower = better) and limit to maxPages
  return selected
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxPages)
    .map(({ id, page_number, reason, image_url }) => ({ id, page_number, reason, image_url }));
}

/**
 * Format selected pages into a human-readable string for display.
 * @param selectedPages - Pages that were selected for analysis
 * @returns Formatted string like "Pages 1, 3, 5"
 */
export function formatSelectedPages(selectedPages: SelectedPage[]): string {
  if (selectedPages.length === 0) return 'No pages';
  if (selectedPages.length === 1) return `Page ${selectedPages[0].page_number}`;
  return `Pages ${selectedPages.map(p => p.page_number).join(', ')}`;
}
