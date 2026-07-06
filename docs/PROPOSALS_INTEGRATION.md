# Proposals & Assistant Integration

Ported the working assistant/RAG engine and the structured-estimates
("Proposals") platform from the `ai-estimator` prototype **into this app**,
reusing the existing shell, auth, org context, UI system, and the shared
production Supabase database. No separate app, auth, or branding was added.

## Integration map (what plugged into what)

| Prototype capability | Where it now lives in this app |
| --- | --- |
| Estimate pricing/workflow/types | `lib/estimates/*` (money in integer cents, bps pricing, lifecycle) |
| Estimate persistence | `lib/supabase/estimates.ts` — calls the `create_estimate` / `list_estimates` / `get_estimate_detail` / `update_estimate_content` / `set_estimate_status` / `revise_estimate` / `snapshot_estimate` RPCs already applied to the production DB |
| Assistant RAG engine (was a stub here) | `lib/assistant/engine.ts` (OpenAI + deterministic mock fallback) wired behind the existing `createChatAnswer` in `lib/assistant/rag.ts`, which now embeds the query and calls the existing `match_document_chunks` RPC |
| Proposals list | `components/proposals/ProposalsPanel.tsx` |
| Proposal editor | `components/proposals/ProposalEditor.tsx` → `/proposals/[estimateId]` |
| Proposal document (print/PDF) | `components/proposals/ProposalDocument.tsx` → `/proposals/[estimateId]/document/[snapshotId]` |
| Assistant → structured estimate | "Convert to proposal" button in `AssistantShell.tsx` when an answer includes a proposal |

## How it fits the existing app

- **Nav**: a sixth "Proposals" tab on the Project Dashboard hub
  (`app/project/page.tsx`), and a **Proposals tab inside each project**
  (`app/projects/[id]/page.tsx`, alongside the existing "Takeoff" editor).
  Projects with no HOVER takeoff still get a Proposals section.
- **Auth/org**: new routes use the same per-route guard layout
  (`app/proposals/layout.tsx`, cloned from the existing pattern) and scope
  every query through `useOrganization().organization.id`. `canEdit`
  (owner/admin/estimator) gates writes.
- **UI**: reuses `Button`, `EmptyState`, `StatusBadge` (mapped to the
  proposal lifecycle in `proposal-status-badge.tsx`), `Tabs`, sonner toasts,
  and the app's design tokens. No new design system.
- **Data safety**: every write is a single transactional SECURITY INVOKER
  RPC — RLS applies to the signed-in user, and the SQL re-verifies all
  totals, project↔org ownership, and the status workflow. Safe to call from
  the browser with the anon key (this app's data convention); **no
  service-role key is used**.

## Vocabulary

This app already labels the HOVER takeoff editor "Estimate Editor", so the
ported structured-estimate domain is surfaced to users as **Proposals**
(what it produces: versioned, priced, client-ready proposal documents).

## AI Assistant

The assistant was a stub (canned `assistant-rag-stub` reply, no model
call). It now runs a real grounded pipeline: embed the question → retrieve
via `match_document_chunks` → answer with citations restricted to retrieved
chunks, capped confidence, and an optional convertible proposal. Set
`OPENAI_API_KEY` (optional `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`) for
live answers; without it a deterministic mock keeps the feature exercisable.
Knowledge documents still need embeddings (existing `documents` /
`document_chunks` tables); until then answers run in mock mode.

## Verification

- `npx tsc --noEmit`: no new type errors (the 19 pre-existing baseline
  errors in `excelExport*`/CAD are unchanged; `next.config.ts` sets
  `ignoreBuildErrors`).
- `npx eslint` on all ported/changed files: clean.
- `npm run build`: succeeds; `/proposals`, `/proposals/[estimateId]`,
  `/proposals/[estimateId]/document/[snapshotId]` registered.
- Runtime: `/proposals` 307-redirects unauthenticated to
  `/login?redirectTo=/proposals`, identical to the existing protected routes.
- **Production DB integration test** (as the real org owner, under real RLS,
  rolled back with zero rows persisted): create → approve-locks-edit →
  snapshot (captured real org + project names) → revise (v2) → list
  (latest-per-group) → cleanup. All passed.
