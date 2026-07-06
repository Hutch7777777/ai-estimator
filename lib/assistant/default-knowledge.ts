export interface AssistantTaskTemplateSeed {
  templateKey: string;
  name: string;
  description: string;
  category: "proposal" | "contract" | "change_order" | "rfi" | "email" | "review";
  requiresProject: boolean;
  userPrompt: string;
  systemPrompt: string;
  variables: string[];
}

export interface AssistantCompanyRuleSeed {
  title: string;
  ruleType: "proposal" | "contract" | "change_order" | "quality" | "estimating";
  content: string;
}

export const defaultAssistantTaskTemplates: AssistantTaskTemplateSeed[] = [
  {
    templateKey: "proposal_single_client_reside",
    name: "Proposal - Single Client Reside",
    description: "Draft a client-ready siding/reside proposal from project context, takeoff totals, and line items.",
    category: "proposal",
    requiresProject: true,
    variables: [
      "client_name",
      "project_address",
      "scope_summary",
      "takeoff_totals",
      "line_items",
      "exclusions",
      "price",
    ],
    systemPrompt: [
      "Use this template for normal single-client siding/reside proposals.",
      "Structure the draft with: project summary, included scope, material/product assumptions, exclusions, alternates/options, price summary, review notes, and next steps.",
      "Use the selected project context as the source of truth for quantities, scope, and pricing.",
      "If required fields are missing, begin with a short Missing Information section before the draft.",
    ].join(" "),
    userPrompt: "Create a client-ready reside proposal draft for the selected project using the approved Exterior Finishes proposal structure.",
  },
  {
    templateKey: "proposal_multi_building_hoa",
    name: "Proposal - Multi-Building / HOA",
    description: "Draft proposal language for HOA, multi-unit, or multi-building work with building/unit breakdowns.",
    category: "proposal",
    requiresProject: true,
    variables: [
      "community_name",
      "building_or_unit_breakdown",
      "scope_by_location",
      "base_scope_total",
      "alternates",
      "exclusions",
    ],
    systemPrompt: [
      "Use this template for HOA, multi-building, or multi-unit proposals.",
      "Prefer organized tables or grouped bullets by building, address, phase, or unit when the project context supports it.",
      "Include a clearly labeled base scope total and keep alternates separate from the base price.",
      "Do not invent unit allocations or building totals that are not present in the project data.",
    ].join(" "),
    userPrompt: "Create a multi-building or HOA-style proposal draft for the selected project with clear location and pricing breakdowns.",
  },
  {
    templateKey: "proposal_alternate_scope",
    name: "Proposal - Alternate Scope",
    description: "Draft proposal language for non-standard Exterior Finishes work while keeping the company proposal style.",
    category: "proposal",
    requiresProject: true,
    variables: [
      "scope_category",
      "scope_summary",
      "materials",
      "labor_assumptions",
      "exclusions",
      "price",
    ],
    systemPrompt: [
      "Use this template when the request is not a standard reside proposal.",
      "Keep the Exterior Finishes proposal tone, but adapt the scope sections to the actual trade or work category.",
      "Separate base scope, optional adders, unknown conditions, exclusions, and pricing.",
    ].join(" "),
    userPrompt: "Create an alternate-scope proposal draft for the selected project using Exterior Finishes proposal style.",
  },
  {
    templateKey: "change_order_fixed_price",
    name: "Change Order - Fixed Price Add",
    description: "Draft a fixed-price change order for owner-approved added scope.",
    category: "change_order",
    requiresProject: true,
    variables: [
      "change_order_number",
      "original_agreement_reference",
      "added_scope",
      "price",
      "schedule_impact",
      "unchanged_terms",
    ],
    systemPrompt: [
      "Use this template for fixed-price additions or owner-elected scope changes.",
      "Include: change order title/number, project reference, reason for change, added scope, exclusions or assumptions, price, schedule impact, authorization language, and note that all other contract terms remain unchanged.",
      "If the request involves multiple owners, units, or cost allocation, make the allocation explicit only when the data is provided.",
    ].join(" "),
    userPrompt: "Create a fixed-price change order draft for the selected project.",
  },
  {
    templateKey: "change_order_time_material_repair",
    name: "Change Order - T&M / Discovered Damage",
    description: "Draft change-order language for rot repair, concealed damage, or line-item repair work.",
    category: "change_order",
    requiresProject: true,
    variables: [
      "discovered_condition",
      "repair_scope",
      "labor_hours",
      "material_items",
      "estimated_or_actual_cost",
      "schedule_impact",
    ],
    systemPrompt: [
      "Use this template for discovered damage, concealed conditions, rot repair, beam/structural repair, drywall repair, paint repair, or T&M-style repair work.",
      "Include observed condition, why it was outside original scope, proposed or completed repair scope, labor/material breakdown if provided, pricing basis, exclusions, schedule impact, and authorization/payment language.",
      "Do not state structural adequacy, code compliance, or hidden-condition certainty unless supplied by the project record or an approved source.",
    ].join(" "),
    userPrompt: "Create a discovered-damage or T&M repair change order draft for the selected project.",
  },
  {
    templateKey: "contract_service_agreement",
    name: "Contract / Service Agreement Draft",
    description: "Fill an approved service-agreement structure from project facts without inventing legal terms.",
    category: "contract",
    requiresProject: true,
    variables: [
      "owner_name",
      "property_description",
      "scope_of_work",
      "contract_sum",
      "payment_terms",
      "allowances",
      "exclusions",
      "signatures",
    ],
    systemPrompt: [
      "Use this template only as a draft-assistance workflow for an approved service agreement.",
      "Fill project-specific sections from context and flag missing terms.",
      "Do not create new legal terms, warranty language, indemnity language, dispute language, payment terms, or insurance language unless those clauses are provided in approved company rules or uploaded templates.",
      "Mark the output as internal draft language for human review.",
    ].join(" "),
    userPrompt: "Create a service agreement draft from the selected project. Only fill known project-specific fields and flag missing contract terms.",
  },
  {
    templateKey: "rfi_list",
    name: "RFI List",
    description: "Create RFIs for missing scope, plan conflicts, unclear products, or pricing risks.",
    category: "rfi",
    requiresProject: true,
    variables: [
      "project_context",
      "plan_notes",
      "scope_gaps",
      "pricing_risks",
    ],
    systemPrompt: [
      "Use this template to create clear RFI questions.",
      "Group questions by scope, plans/specs, products/materials, access/schedule, and pricing risk.",
      "Each RFI should include why it matters and what decision or document is needed.",
    ].join(" "),
    userPrompt: "Create an RFI list for the selected project based on missing scope, plan conflicts, and estimate risks.",
  },
  {
    templateKey: "client_email",
    name: "Client Email",
    description: "Draft a concise client-facing email tied to a proposal, RFI, change order, or project update.",
    category: "email",
    requiresProject: false,
    variables: [
      "recipient",
      "purpose",
      "project_reference",
      "action_needed",
      "deadline",
    ],
    systemPrompt: [
      "Use this template for concise client-facing emails.",
      "Keep the tone professional, direct, and friendly.",
      "Include only facts from project context or the user request, and make the requested action clear.",
    ].join(" "),
    userPrompt: "Draft a client-facing email for this project or task.",
  },
];

export const defaultAssistantCompanyRules: AssistantCompanyRuleSeed[] = [
  {
    title: "Use Project Data as Source of Truth",
    ruleType: "quality",
    content: "Quantities, totals, client names, addresses, project scope, and pricing must come from selected project context, uploaded approved documents, or explicit user input. If a value is missing, flag it instead of inventing it.",
  },
  {
    title: "Proposal Draft Output Standard",
    ruleType: "proposal",
    content: "Proposal drafts should use this order unless the user asks otherwise: company header, date/title, homeowner/property/client and project address, Project Inclusions, scope sections grouped by trade/system, base price or total sell, Project Options if applicable, Project Exclusions, and appreciation/contact closing. Keep client-facing language direct, contractor-professional, and not overly legalistic.",
  },
  {
    title: "Proposal Pricing and Options",
    ruleType: "proposal",
    content: "Put the base price before add options. Use Total Sell for HOA or multi-building proposals when the customer should see a rolled-up sell price. Use Project Options only for true alternates/add-ons. Do not include sales tax or window options unless explicitly provided/requested.",
  },
  {
    title: "Change Order Output Standard",
    ruleType: "change_order",
    content: "Change orders should use this order: CHANGE ORDER REQUEST, specific title, Change Order No., Reference Contract, Date Issued, Parties, Project, Description of Change, Scope of Added Work, Pricing Breakdown, Cost Allocation or Pricing Basis, Exclusions, Schedule Impact, Payment, All Other Terms Unchanged, Acceptance, and contractor/client signature blocks.",
  },
  {
    title: "Change Order Scope and Exclusions",
    ruleType: "change_order",
    content: "Tie every change order back to the underlying construction service agreement. Include all material, labor, tax, and fixed-price line items in the pricing table when provided. Include All Other Terms Unchanged in every change order. Do not add unrelated scope. Exclusions should protect against hidden damage, engineering, permit fees, hazardous materials, MEP work, and work outside the described scope unless specifically included.",
  },
  {
    title: "Contract Draft Safety",
    ruleType: "contract",
    content: "For contracts and service agreements, only fill approved structures and project-specific fields. Do not create or modify legal clauses, warranties, indemnity, dispute resolution, insurance, or payment terms unless approved language is provided.",
  },
  {
    title: "Contract Section Order",
    ruleType: "contract",
    content: "Contract/service agreement drafts should follow the approved section order: Agreement Details, Contractor and Client, Property Description, Scope of Work, Concealed / Unknown Conditions, Term, Payment Terms, Optional Owner-Elected Escalators, Alternate Package Election if applicable, Exclusions and Tax, Permits and Licenses, Materials and Labor, Contractor Responsibilities, Insurance, Termination, Dispute Resolution, Indemnification, Suspension for Nonpayment, Governing Law, Amendments, Assignment, Entire Agreement, Severability, and Signatures.",
  },
  {
    title: "Construction Plan Uncertainty",
    ruleType: "estimating",
    content: "When plan data, OCR, takeoffs, schedules, or extraction totals conflict or appear incomplete, call out the conflict and recommend a verification step before sending proposal, contract, or change order language.",
  },
];
