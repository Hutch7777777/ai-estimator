# Exterior Finishes Document Generation Rules

## Retrieval rule

Retrieve 2–4 examples from `ai_document_references` before generating a document. Filter by:

- `doc_type`: `proposal`, `contract`, or `change_order`
- `subtype`: the closest match to the needed document
- `template_quality`: prefer `final_reference`
- `tags`: scope/material keywords like `hardie`, `fastplank`, `rot_repair`, `deck`, `fence`, `rooftop_ventilation`

## Proposal format

Use this section order unless the user asks otherwise:

1. Company header
2. Date + document title
3. Homeowner/property/client and project address
4. Project Inclusions
5. Scope sections grouped by trade or system
6. Base price / total sell
7. Project Options, if applicable
8. Project Exclusions
9. Appreciation/contact closing

Preferred tone: direct, contractor-professional, not overly legalistic.

## Proposal rules

- Put the base price before add options.
- Use "Total Sell" for HOA/multi-building proposals when the customer should only see a rolled-up sell price.
- Use `Project Options` only for true alternates/add-ons.
- Do not include sales tax unless explicitly provided.
- Do not include window options unless explicitly requested.
- For multi-building proposals, use a unit/building table before detailed scope sections.
- Keep exclusions concise but clear.

## Contract / Construction Service Agreement format

Use this section order:

1. Agreement Details
2. Contractor and Client
3. Property Description
4. Scope of Work
5. Concealed / Unknown Conditions
6. Term
7. Payment Terms
8. Optional Owner-Elected Escalators
9. Alternate Package Election, if applicable
10. Exclusions and Tax
11. Permits and Licenses
12. Materials and Labor
13. Contractor Responsibilities
14. Insurance
15. Termination
16. Dispute Resolution; Mediation; Attorneys' Fees
17. Indemnification
18. Suspension for Nonpayment
19. Governing Law
20. Amendments
21. Assignment
22. Entire Agreement
23. Severability
24. Signatures

## Contract rules

- Do not invent legal terms.
- If the project has carried rot/sheathing/framing allowances, state them clearly.
- For concealed conditions, identify what is included, what is excluded, and how additional work will be handled.
- Optional escalators must clearly say whether they are included at signing or later treated as a change order.
- State sales tax treatment clearly.
- Keep signature blocks for contractor and client.

## Change order format

Use this section order:

1. CHANGE ORDER REQUEST
2. Specific title
3. Change Order No.
4. Reference Contract
5. Date Issued
6. Parties
7. Project
8. Description of Change
9. Scope of Added Work
10. Pricing Breakdown
11. Cost Allocation or Pricing Basis
12. Exclusions
13. Schedule Impact
14. Payment
15. All Other Terms Unchanged
16. Acceptance
17. Contractor and client signature blocks

## Change order rules

- Tie every change order back to the underlying construction service agreement.
- Include all material, labor, tax, and fixed-price line items in the pricing table.
- Use cost-allocation language when the change is unit-specific in a shared building.
- Use pricing-basis language when the scope is intentionally limited.
- Include "All Other Terms Unchanged" in every change order.
- Do not add unrelated scope.
- Exclusions should protect against hidden damage, engineering, permit fees, hazardous materials, MEP work, and work outside the described scope unless specifically included.

## Suggested retrieval examples by task

- Reside proposal with options: `proposal_reside_colorplus_lap_fastplank_reference`
- Multi-building HOA proposal: `proposal_multi_building_reside_total_sell_reference`
- Deck proposal: `proposal_deck_replacement_reference`
- Contract / agreement: `contract_construction_service_agreement_recladding_reference`
- Unit allocation CO: `change_order_rooftop_ventilation_unit_allocation_reference`
- Discovered damage / rot repair CO: `change_order_rot_repair_beam_replacement_reference`
- Site-conflict/fence CO: `change_order_fence_modification_reference`
- GC/takeoff itemized proposal: `proposal_itemized_takeoff_style_reference`
