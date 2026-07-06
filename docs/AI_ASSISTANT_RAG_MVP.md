# AI Assistant RAG MVP

## Goal

Add a ChatGPT-style assistant inside the existing EstimatePros app without creating a separate app or switching database providers. The first pass adds a global assistant page, sidebar navigation, chat UI, RAG service stubs, Supabase tables for future retrieval, and a project-aware chat path that can use current project/takeoff/extraction data.

## App Placement

- Standalone AI workspace route: `/ai`
- Embedded assistant route: `/assistant`
- Navigation: `components/layout/AppSidebar.tsx`
- Standalone UI shell: `components/assistant/AiWorkspace.tsx`
- Embedded UI shell: `components/assistant/AssistantShell.tsx`
- Chat endpoint: `app/api/assistant/chat/route.ts`
- Project list endpoint: `app/api/assistant/projects/route.ts`
- Project context loader: `lib/assistant/project-context.ts`
- RAG contracts: `lib/assistant/rag.ts`
- Default document-task knowledge: `lib/assistant/default-knowledge.ts`
- Database/default knowledge loader: `lib/assistant/knowledge.ts`
- Document reference retrieval: `lib/assistant/document-references.ts`
- DOCX export helper: `lib/assistant/docx.ts`
- DOCX export endpoint: `app/api/assistant/document/route.ts`
- Knowledge seed notes: `docs/assistant-knowledge/README.md`

## Scope Model

- `organization_id` scopes all knowledge and chat data to the company.
- `project_id = null` means global/company assistant.
- `project_id = <uuid>` means project-level assistant.

## MVP Tables

Migration: `migrations/add_ai_assistant_rag_mvp.sql`

- `knowledge_collections`
- `documents`
- `document_chunks`
- `chat_threads`
- `chat_messages`
- `assistant_feedback`
- `company_rules`
- `prompt_templates`

## Current Chat Behavior

- Global chat answers from general estimating guidance until knowledge retrieval is populated.
- Project chat passes `project_id` and loads project metadata, configurations, latest extraction job, extraction totals, latest takeoff, takeoff sections, and line items.
- Document tasks now have default proposal, contract, change-order, RFI, and client-email templates.
- Chat prompts include approved/default company rules and task templates. If `company_rules` or `prompt_templates` contain active organization rows, those database rows are used; otherwise the assistant falls back to local defaults.
- Proposal, contract, and change-order requests retrieve redacted document references from `ai_document_references` when available, or from `docs/assistant-knowledge/reference-pack/ai_document_references_seed.json` as a local fallback.
- Assistant answers can be exported as `.docx` files through `/api/assistant/document`.
- If `ANTHROPIC_API_KEY` is configured, the assistant sends that context to Anthropic and returns the answer with citations.
- If no model key is configured, the endpoint returns a context-loaded stub so the plumbing remains testable.

## Next Build Steps

1. Apply the migration in Supabase.
2. Wire document upload to Supabase Storage.
3. Extract text from PDF, DOCX, XLSX, and TXT files.
4. Chunk document text and store `document_chunks`.
5. Generate embeddings and use `match_document_chunks`.
6. Persist chat threads/messages and feedback to the new assistant tables.
7. Add project-level assistant entry points that deep-link or preselect `project_id`.
8. Upload approved Exterior Finishes proposal, contract, and change-order examples, then replace starter defaults with reviewed `company_rules` and `prompt_templates` rows.
