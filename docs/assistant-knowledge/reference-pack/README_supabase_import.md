# Exterior Finishes AI Estimator Document Reference Pack

This package contains redacted document-generation references for your AI estimator's proposal, contract, and change-order generator.

## Files

- `ai_document_references_seed.json`  
  Full structured JSON reference pack.

- `ai_document_references_seed.jsonl`  
  One document reference per line, useful for ingestion pipelines.

- `supabase_document_reference_schema_and_seed.sql`  
  Supabase/Postgres table schema plus seed inserts.

- `document_generation_rules.md`  
  Rules your AI document generator should follow when drafting proposals, contracts, and change orders.

- `examples_markdown/`  
  Individual redacted examples as Markdown files.

## Supabase import path

### Option 1: SQL

1. Open Supabase SQL Editor.
2. Paste the contents of `supabase_document_reference_schema_and_seed.sql`.
3. Run the script.
4. Confirm rows:
   ```sql
   select doc_type, subtype, title
   from public.ai_document_references
   order by doc_type, subtype;
   ```

### Option 2: JSON

1. Upload `ai_document_references_seed.json` to your codebase.
2. Build a seed script that reads `examples[]`.
3. Upsert by `doc_key`.
4. Store `full_text`, `sections`, `pricing`, `tags`, and `generation_notes`.

## Recommended retrieval logic

Before generating any customer-facing document:

1. Determine `doc_type`.
2. Determine `subtype`.
3. Retrieve the closest 2–4 references.
4. Pass only the relevant reference sections into the LLM.
5. Generate the new document using project-specific data from your estimator/takeoff.
6. Require review before send/signature.

## Redaction

Client names, phone numbers, and project addresses were replaced with placeholders. Pricing structure was retained as an example because it helps the AI learn formatting and document logic.

## Important note

Contract language should be reviewed by counsel before being used as production legal language. Treat the contract example as a formatting and structure reference, not legal advice.
