# Exterior Finishes AI Knowledge Seeds

This folder tracks the starter knowledge structure for repetitive document tasks in Exterior Finishes AI.

The live starter templates are defined in:

- `lib/assistant/default-knowledge.ts`
- `lib/assistant/knowledge.ts`
- `lib/assistant/document-references.ts`
- `lib/assistant/material-documents.ts`

The imported redacted reference pack is stored in:

- `docs/assistant-knowledge/reference-pack/`

The starter manufacturer documentation seed is stored in:

- `docs/assistant-knowledge/material-docs/`

Those defaults let the assistant work before Supabase is populated. Once approved company rows exist, the assistant will prefer active rows from:

- `company_rules`
- `prompt_templates`

## Starter Task Categories

These categories came from the shared ChatGPT reference map Anthony provided:

| Category                               | Use                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Proposal - Single Client Reside        | Standard siding/reside proposals for one client/property                          |
| Proposal - Multi-Building / HOA        | Building, unit, or association-style proposals with grouped totals                |
| Proposal - Alternate Scope             | Same proposal style for non-standard work categories                              |
| Contract / Service Agreement Draft     | Fill approved agreement structures without inventing legal terms                  |
| Change Order - Fixed Price Add         | Owner-approved added scope with fixed price and unchanged-terms language          |
| Change Order - T&M / Discovered Damage | Rot repair, concealed damage, labor/material breakdowns, and repair scope         |
| RFI List                               | Questions for missing scope, plan conflicts, product decisions, and pricing risks |
| Client Email                           | Short client-facing emails tied to proposals, RFIs, change orders, or updates     |

## Imported Reference Examples

The current reference pack includes these redacted examples:

- `proposal_reside_colorplus_lap_fastplank_reference`
- `proposal_multi_building_reside_total_sell_reference`
- `proposal_deck_replacement_reference`
- `contract_construction_service_agreement_recladding_reference`
- `change_order_rooftop_ventilation_unit_allocation_reference`
- `change_order_rot_repair_beam_replacement_reference`
- `change_order_fence_modification_reference`
- `proposal_itemized_takeoff_style_reference`

`lib/assistant/document-references.ts` first tries Supabase table `ai_document_references`. If that table is not available or has no matching rows, it falls back to `docs/assistant-knowledge/reference-pack/ai_document_references_seed.json`.

## Manufacturer Documentation

`lib/assistant/material-documents.ts` first tries Supabase table `ai_material_documentation`. If that table is not available or has no matching rows, it falls back to `docs/assistant-knowledge/material-docs/material_documentation_seed.json`.

The current seed is based on the materials already present in `product_catalog` and `v_pricing_current`, with highest coverage for:

- James Hardie
- Nichiha
- LP SmartSide
- Allura
- DuPont Tyvek
- OSI QUAD MAX
- Engage FastPlank
- NewTechWood
- AZEK
- Mid-America
- Fortifiber / Henry
- GAF
- Owens Corning

Use this layer for manufacturer-specific proposal language, RFIs, installation-risk checks, submittal/source references, and Division 7 scope reviews.

## Database Import Path

The document-reference pack includes `docs/assistant-knowledge/reference-pack/supabase_document_reference_schema_and_seed.sql`.

The material documentation table schema is in `migrations/add_ai_material_documentation.sql`.

The material documentation ingestion script stores the seed rows in `ai_material_documentation`, downloads source documents, extracts text, and writes searchable chunks into `documents` / `document_chunks`:

```bash
npm run ingest:material-docs
```

Useful options:

- `--dry-run` downloads/extracts without writing to Supabase.
- `--limit 3` tests the first few sources.
- `--organization-id <uuid>` targets a specific organization.
- `--azure-layout` uses Azure Document Intelligence layout extraction for PDFs first.

By default the importer uses local `pdftotext` for PDFs, HTML extraction for web pages, and automatically falls back to Azure Document Intelligence when a PDF has no extractable text. If a vendor blocks downloading or a source still cannot be extracted, the importer creates a clearly labeled reference-only fallback chunk instead of silently inventing source text.

Use the import path when you want examples and manufacturer source text stored in Supabase instead of local JSON fallback. Do not treat the contract example as production legal approval; it is a structure and formatting reference.

## Safety Rules

- The assistant can draft proposals and change orders from project context.
- Contract/service-agreement output must stay draft-only until approved legal/company clauses are loaded.
- The assistant must not invent quantities, prices, legal terms, payment terms, warranty language, or owner obligations.
- Missing information should be called out before client-facing draft language.
