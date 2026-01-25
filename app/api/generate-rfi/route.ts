import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  RFIItem,
  RFIListData,
  TakeoffNote,
  TakeoffNoteCategory,
  NotesSpecsData,
} from '@/lib/types/extraction';

// =============================================================================
// RFI Generation API Route
// Generates RFI items from missing/incomplete specifications in notes_specs_data
// =============================================================================

interface GenerateRFIRequest {
  job_id: string;
}

interface GenerateRFIResponse {
  success: boolean;
  data?: RFIListData;
  error?: string;
}

// Critical specifications that should always be present for exterior finishing
const CRITICAL_SPECS: Array<{
  category: TakeoffNoteCategory;
  item: string;
  question: string;
  impact: string;
  suggested_default?: string;
  priority: 'high' | 'medium' | 'low';
}> = [
  // Siding
  {
    category: 'siding_specs',
    item: 'Siding Manufacturer',
    question: 'What siding manufacturer should be used?',
    impact: 'Affects material cost, labor rate, and warranty requirements',
    suggested_default: 'James Hardie',
    priority: 'high',
  },
  {
    category: 'siding_specs',
    item: 'Siding Product/Profile',
    question: 'What siding product and profile is specified?',
    impact: 'Determines product SKU, exposure, and installation method',
    suggested_default: 'HardiePlank Lap Siding, 7" exposure',
    priority: 'high',
  },
  {
    category: 'siding_specs',
    item: 'Siding Finish',
    question: 'Is the siding primed or ColorPlus (factory finished)?',
    impact: 'Affects material cost and whether painting is required',
    suggested_default: 'Primed (field paint required)',
    priority: 'medium',
  },
  // Weather Barrier
  {
    category: 'weather_barrier',
    item: 'WRB/Housewrap',
    question: 'What weather resistive barrier is specified?',
    impact: 'Required for code compliance and warranty',
    suggested_default: 'Tyvek HomeWrap',
    priority: 'high',
  },
  // Trim
  {
    category: 'trim_details',
    item: 'Trim Product',
    question: 'What trim product should be used?',
    impact: 'Affects material cost and compatibility with siding',
    suggested_default: 'HardieTrim 5/4',
    priority: 'medium',
  },
  {
    category: 'trim_details',
    item: 'Corner Board Size',
    question: 'What size corner boards are specified?',
    impact: 'Affects material quantity and appearance',
    suggested_default: '1x4 outside corners',
    priority: 'medium',
  },
  // Flashing
  {
    category: 'flashing_waterproofing',
    item: 'Window/Door Flashing',
    question: 'What flashing method is specified for windows and doors?',
    impact: 'Critical for waterproofing and warranty compliance',
    suggested_default: 'Flexible flashing tape per manufacturer specs',
    priority: 'high',
  },
  // Fasteners
  {
    category: 'fasteners_adhesives',
    item: 'Fastener Type',
    question: 'What fastener type and size is specified for siding?',
    impact: 'Affects installation method and warranty compliance',
    suggested_default: 'Hot-dipped galvanized siding nails, 2-1/4"',
    priority: 'medium',
  },
  // Code
  {
    category: 'code_requirements',
    item: 'Building Code Version',
    question: 'Which building code version applies?',
    impact: 'Determines compliance requirements',
    suggested_default: 'IRC 2021',
    priority: 'low',
  },
];

function generateRFIItemId(): string {
  return `rfi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function analyzeNotesForGaps(notes: TakeoffNote[]): RFIItem[] {
  const rfiItems: RFIItem[] = [];
  const foundSpecs = new Set<string>();

  // Track what we found in the notes
  notes.forEach((note) => {
    // Create a searchable key from category + item
    const key = `${note.category}:${note.item.toLowerCase()}`;
    foundSpecs.add(key);

    // Also track general categories
    foundSpecs.add(note.category);

    // Check for specific keywords
    const details = note.details.toLowerCase();
    if (details.includes('hardie') || details.includes('smartside') || details.includes('certainteed')) {
      foundSpecs.add('siding_specs:manufacturer');
    }
    if (details.includes('hardieplank') || details.includes('panel') || details.includes('lap')) {
      foundSpecs.add('siding_specs:product');
    }
    if (details.includes('colorplus') || details.includes('primed') || details.includes('factory')) {
      foundSpecs.add('siding_specs:finish');
    }
    if (details.includes('tyvek') || details.includes('housewrap') || details.includes('wrb') || details.includes('blueskin')) {
      foundSpecs.add('weather_barrier:wrb');
    }
    if (details.includes('flashing') || details.includes('flex tape') || details.includes('peel and stick')) {
      foundSpecs.add('flashing_waterproofing:window_door');
    }
    if (details.includes('trim') || details.includes('hardietrim') || details.includes('smarttrim')) {
      foundSpecs.add('trim_details:product');
    }
    if (details.includes('corner') && (details.includes('1x4') || details.includes('1x6') || details.includes('board'))) {
      foundSpecs.add('trim_details:corner');
    }
    if (details.includes('nail') || details.includes('fastener') || details.includes('screw')) {
      foundSpecs.add('fasteners_adhesives:type');
    }
    if (details.includes('irc') || details.includes('ibc') || details.includes('code')) {
      foundSpecs.add('code_requirements:version');
    }
  });

  // Check each critical spec
  CRITICAL_SPECS.forEach((spec) => {
    const categoryKey = spec.category;
    const itemKey = `${spec.category}:${spec.item.toLowerCase()}`;

    // Check various ways the spec might have been found
    const isFound =
      foundSpecs.has(itemKey) ||
      (spec.item === 'Siding Manufacturer' && foundSpecs.has('siding_specs:manufacturer')) ||
      (spec.item === 'Siding Product/Profile' && foundSpecs.has('siding_specs:product')) ||
      (spec.item === 'Siding Finish' && foundSpecs.has('siding_specs:finish')) ||
      (spec.item === 'WRB/Housewrap' && foundSpecs.has('weather_barrier:wrb')) ||
      (spec.item === 'Window/Door Flashing' && foundSpecs.has('flashing_waterproofing:window_door')) ||
      (spec.item === 'Trim Product' && foundSpecs.has('trim_details:product')) ||
      (spec.item === 'Corner Board Size' && foundSpecs.has('trim_details:corner')) ||
      (spec.item === 'Fastener Type' && foundSpecs.has('fasteners_adhesives:type')) ||
      (spec.item === 'Building Code Version' && foundSpecs.has('code_requirements:version'));

    if (!isFound) {
      rfiItems.push({
        id: generateRFIItemId(),
        category: categoryKey,
        question: spec.question,
        impact: spec.impact,
        suggested_default: spec.suggested_default,
        status: 'unresolved',
        priority: spec.priority,
      });
    }
  });

  // Also flag notes marked as "critical" importance that have ambiguous details
  notes
    .filter((note) => note.importance === 'critical')
    .forEach((note) => {
      const details = note.details.toLowerCase();
      // Check for vague language
      if (
        details.includes('per manufacturer') ||
        details.includes('see spec') ||
        details.includes('to be determined') ||
        details.includes('tbd') ||
        details.includes('verify') ||
        details.includes('coordinate with')
      ) {
        rfiItems.push({
          id: generateRFIItemId(),
          source_note_id: note.id,
          category: note.category as TakeoffNoteCategory,
          question: `Clarify: ${note.item}`,
          details: `The specification "${note.details}" needs clarification.`,
          impact: 'Critical specification with incomplete information',
          status: 'unresolved',
          priority: 'medium',
          source_page: note.source_page,
        });
      }
    });

  return rfiItems;
}

function calculateSummary(items: RFIItem[]): RFIListData['summary'] {
  return {
    total: items.length,
    unresolved: items.filter((i) => i.status === 'unresolved').length,
    will_clarify: items.filter((i) => i.status === 'will_clarify').length,
    resolved: items.filter((i) => i.status === 'resolved').length,
    not_applicable: items.filter((i) => i.status === 'not_applicable').length,
    high_priority: items.filter((i) => i.priority === 'high').length,
    medium_priority: items.filter((i) => i.priority === 'medium').length,
    low_priority: items.filter((i) => i.priority === 'low').length,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateRFIResponse>> {
  try {
    const body = (await request.json()) as GenerateRFIRequest;
    const { job_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: job_id' },
        { status: 400 }
      );
    }

    console.log(`[generate-rfi] Generating RFI for job ${job_id}`);

    const supabase = await createClient();

    // Fetch notes_specs_data from the job
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error: jobError } = await (supabase as any)
      .from('extraction_jobs')
      .select('id, notes_specs_data, rfi_list_data')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      console.error('[generate-rfi] Job not found:', jobError);
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    // If RFI already exists, return it
    if (job.rfi_list_data) {
      console.log('[generate-rfi] Returning existing RFI list');
      return NextResponse.json({
        success: true,
        data: job.rfi_list_data as RFIListData,
      });
    }

    const notesData = job.notes_specs_data as NotesSpecsData | null;

    // Generate RFI items based on notes analysis
    const rfiItems = notesData?.notes ? analyzeNotesForGaps(notesData.notes) : [];

    // If no notes extracted, generate full RFI from critical specs
    if (!notesData || !notesData.notes || notesData.notes.length === 0) {
      console.log('[generate-rfi] No notes found, generating full RFI list');
      CRITICAL_SPECS.forEach((spec) => {
        rfiItems.push({
          id: generateRFIItemId(),
          category: spec.category,
          question: spec.question,
          impact: spec.impact,
          suggested_default: spec.suggested_default,
          status: 'unresolved',
          priority: spec.priority,
        });
      });
    }

    // Sort by priority (high first) then by category
    rfiItems.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.category.localeCompare(b.category);
    });

    // Build RFI list data
    const rfiListData: RFIListData = {
      id: `rfi-list-${job_id}`,
      job_id,
      items: rfiItems,
      summary: calculateSummary(rfiItems),
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 'v1',
    };

    // Store in database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_jobs')
      .update({ rfi_list_data: rfiListData })
      .eq('id', job_id);

    if (updateError) {
      console.error('[generate-rfi] Failed to save RFI list:', updateError);
      // Don't fail - still return the generated data
    } else {
      console.log(`[generate-rfi] Saved RFI list with ${rfiItems.length} items`);
    }

    return NextResponse.json({
      success: true,
      data: rfiListData,
    });
  } catch (error) {
    console.error('[generate-rfi] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Category display labels
const CATEGORY_LABELS: Record<TakeoffNoteCategory, string> = {
  siding_specs: 'Siding Specifications',
  trim_details: 'Trim Details',
  flashing_waterproofing: 'Flashing & Waterproofing',
  weather_barrier: 'Weather Barrier',
  fasteners_adhesives: 'Fasteners & Adhesives',
  code_requirements: 'Code Requirements',
  installation_notes: 'Installation Notes',
  special_conditions: 'Special Conditions',
};

// Generate professional RFI email text
function generateRFIEmail(
  items: RFIItem[],
  projectName?: string,
  address?: string
): { subject: string; body: string; items_count: number } {
  // Group items by category
  const itemsByCategory = items.reduce((acc, item) => {
    const category = item.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, RFIItem[]>);

  const projectRef = projectName || address || 'your project';
  const subject = `Request for Information - Exterior Finishes Specifications - ${projectRef}`;

  let body = `Hi,

I'm preparing the siding estimate for ${projectRef} and need clarification on a few specifications that weren't clear from the plans.

Could you please confirm the following:\n\n`;

  // Add numbered questions grouped by category
  let questionNumber = 1;
  const categoryOrder: TakeoffNoteCategory[] = [
    'siding_specs',
    'weather_barrier',
    'trim_details',
    'flashing_waterproofing',
    'fasteners_adhesives',
    'code_requirements',
    'installation_notes',
    'special_conditions',
  ];

  for (const category of categoryOrder) {
    const categoryItems = itemsByCategory[category];
    if (!categoryItems || categoryItems.length === 0) continue;

    const categoryLabel = CATEGORY_LABELS[category] || category.replace(/_/g, ' ');
    body += `**${categoryLabel}**\n`;

    for (const item of categoryItems) {
      body += `${questionNumber}. ${item.question}`;
      if (item.suggested_default) {
        body += `\n   (If not specified, we typically use: ${item.suggested_default})`;
      }
      body += '\n\n';
      questionNumber++;
    }
  }

  body += `Please let me know if you have any questions or if it would be easier to discuss by phone.

Thanks!`;

  return {
    subject,
    body,
    items_count: items.length,
  };
}

// GET endpoint to retrieve existing RFI list or generate email
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');
    const format = searchParams.get('format'); // 'email' or undefined

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Missing job_id parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error } = await (supabase as any)
      .from('extraction_jobs')
      .select('id, project_name, notes_specs_data, rfi_list_data')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    // If format=email, generate and return email text
    if (format === 'email') {
      let rfiItems: RFIItem[] = [];

      // Use existing RFI list if available
      if (job.rfi_list_data?.items) {
        rfiItems = job.rfi_list_data.items;
      } else if (job.notes_specs_data?.notes) {
        // Generate RFI items from notes
        rfiItems = analyzeNotesForGaps(job.notes_specs_data.notes);
      } else {
        // Use all critical specs if no notes
        rfiItems = CRITICAL_SPECS.map((spec) => ({
          id: generateRFIItemId(),
          category: spec.category,
          question: spec.question,
          impact: spec.impact,
          suggested_default: spec.suggested_default,
          status: 'unresolved' as const,
          priority: spec.priority,
        }));
      }

      // Filter to only unresolved items
      const unresolvedItems = rfiItems.filter((i) => i.status === 'unresolved');

      if (unresolvedItems.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            subject: '',
            body: 'All specifications have been addressed. No RFI needed.',
            items_count: 0,
          },
        });
      }

      const email = generateRFIEmail(unresolvedItems, job.project_name);

      return NextResponse.json({
        success: true,
        data: email,
      });
    }

    // Default: return RFI list data
    return NextResponse.json({
      success: true,
      data: job.rfi_list_data,
    });
  } catch (error) {
    console.error('[generate-rfi] GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch RFI data' }, { status: 500 });
  }
}

// PUT endpoint to update RFI list
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { job_id, rfi_list_data } = body as { job_id: string; rfi_list_data: RFIListData };

    if (!job_id || !rfi_list_data) {
      return NextResponse.json(
        { success: false, error: 'Missing job_id or rfi_list_data' },
        { status: 400 }
      );
    }

    // Recalculate summary
    rfi_list_data.summary = calculateSummary(rfi_list_data.items);
    rfi_list_data.updated_at = new Date().toISOString();

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('extraction_jobs')
      .update({ rfi_list_data })
      .eq('id', job_id);

    if (updateError) {
      console.error('[generate-rfi] PUT error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update RFI list' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: rfi_list_data,
    });
  } catch (error) {
    console.error('[generate-rfi] PUT error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update RFI data' }, { status: 500 });
  }
}
