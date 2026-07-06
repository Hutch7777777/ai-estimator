# AI Assistant RAG MVP

## Goal

Add a ChatGPT-style assistant inside the existing AI Estimator app without introducing a separate app, database provider, or takeoff automation workflow. The first version creates the global assistant shell, organization-scoped knowledge tables, and RAG service contracts that can later power project-specific chat.

## Architecture Fit

- Frontend: Next.js App Router routes under `app/`, reusable UI in `components/`, Supabase browser/server clients in `lib/supabase/`.
- Auth and company scope: users belong to `organizations` through `organization_memberships`; assistant records should always include `organization_id`.
- Global vs project assistant: `project_id` is nullable on assistant tables. `project_id = null` is the company/global assistant. A project UUID scopes chat and retrieval to one project.
- Storage: keep Supabase Postgres and Storage for the MVP. Use pgvector through Supabase Postgres for embeddings.

## MVP Modules

### Global AI Assistant

Route: `/assistant`

Sections:
- Chat
- Knowledge Library
- Saved Rules
- Templates

The chat UI sends messages to `/api/assistant/chat`. For now the API calls `createChatAnswer`, which returns a safe stub response until retrieval and LLM calls are connected.

### Company Brain

Company-level knowledge uses `project_id = null` and can include:
- Company standards
- Product preferences
- Estimating rules
- Proposal language
- Manufacturer documents

### Project Brain

Project-level knowledge uses the same tables with `project_id` populated:
- Uploaded project documents
- Extracted HOVER/takeoff context
- Estimate notes
- Project-specific conversation history

### Core Siding Brain

Core siding knowledge can live as organization-scoped collections with `collection_type = 'core'` or as seeded templates/rules later. Keep it in the same retrieval pipeline so the assistant uses one source-ranking path.

## Database Tables

Migration: `migrations/add_ai_assistant_rag_mvp.sql`

- `knowledge_collections`
- `documents`
- `document_chunks`
- `chat_threads`
- `chat_messages`
- `assistant_feedback`
- `company_rules`
- `prompt_templates`

All tables include `organization_id`. Tables that need global/project behavior include nullable `project_id`.

## Service Contracts

File: `lib/assistant/rag.ts`

- `uploadKnowledgeDocument`
- `extractDocumentText`
- `chunkDocumentText`
- `embedDocumentChunks`
- `retrieveRelevantChunks`
- `createChatAnswer`

These are intentionally minimal contracts with TODOs for Supabase Storage, text extraction, embeddings, retrieval, and LLM answer generation.

## Next Phases

1. Apply the migration in Supabase.
2. Wire Knowledge Library upload to Supabase Storage and `documents`.
3. Add text extraction for PDF, DOCX, XLSX, and TXT.
4. Chunk extracted text into `document_chunks`.
5. Generate embeddings and store them in pgvector.
6. Replace the chat stub with retrieval plus an LLM call.
7. Add a project-level AI Assistant tab that passes `project_id`.
8. Add feedback save-as-rule and template creation flows.

## Risks

- Existing generated database types do not currently include all organization tables used by the app, so new assistant tables are typed manually until Supabase types are regenerated.
- Existing project creation paths are still being edited in the worktree; this MVP avoids changing them.
- RLS depends on `organization_memberships` and `auth.uid()`. Apply and test policies in the target Supabase project before uploading real company knowledge.
