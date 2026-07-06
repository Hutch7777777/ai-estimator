# Material Documentation Knowledge Seed

This folder seeds the assistant with manufacturer documentation references for products that already appear in the product/pricing catalog.

The seed is intentionally source-first. It stores:

- manufacturer and product-family matching terms
- official source URL
- trade/category applicability
- estimator-focused risk flags
- proposal/RFI guidance

The runtime loads Supabase table `ai_material_documentation` when available and falls back to `material_documentation_seed.json` when the table has not been created yet. `npm run ingest:material-docs` also downloads the official source documents and writes extracted chunks into `documents` / `document_chunks` for searchable RAG.

Current focus:

- James Hardie fiber cement
- Nichiha AWP
- LP SmartSide / ExpertFinish
- Allura fiber cement
- DuPont Tyvek WRB/flashing
- OSI QUAD MAX sealants
- Engage FastPlank
- NewTechWood All Weather Siding
- AZEK trim/moulding
- Mid-America accessories
- Fortifiber/Henry flashing
- GAF and Owens Corning roofing docs

Extraction currently supports local PDF text extraction, HTML text extraction, table-like layout preservation, automatic Azure Document Intelligence fallback for image-like PDFs, and optional Azure-first layout mode with `npm run ingest:material-docs -- --azure-layout`. Blocked sources are stored as reference-only fallback chunks so the assistant can point to the source without pretending exact text was extracted.
