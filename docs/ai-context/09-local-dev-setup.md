# 09 — Local Development Setup

> How to run `ai-estimator` on your own machine. Based on `package.json`, `next.config.ts`, `CLAUDE.md`, and the env-var inventory.

## Prerequisites

- **Node.js** 20+ (Next.js 16 + React 19 require ≥ 18.17, 20 is safer).
- **npm** (lockfile is `package-lock.json`, not yarn/pnpm).
- **Git**.
- Access to the Supabase project (`okwtyttfqbfmcqtenize`) or a fork of it, and Anthropic API credentials.
- Optional but recommended: `supabase` CLI for regenerating types, `gh` CLI for PRs.

## One-time setup

```bash
git clone <repo-url>
cd ai-estimator
npm install
```

Create `.env.local` at the repo root (see §Environment variables below).

## Run

```bash
npm run dev     # http://localhost:3000
```

Other scripts:

```bash
npm run build   # production build (typescript.ignoreBuildErrors is ON)
npm start       # serve the production build
npm run lint    # ESLint v9 flat config
npx tsc --noEmit  # strict type check (build ignores errors; this does not)
```

## Environment variables

Copy into `.env.local`. The canonical secrets live in Railway; ask an admin for values.

```bash
# ── Supabase (required) ──────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://okwtyttfqbfmcqtenize.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only, never ship to client

# ── Claude / Anthropic (required for AI extractions) ─────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── n8n (optional in dev — disables webhook features if absent) ──────
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://n8n-production-293e.up.railway.app
N8N_WEBHOOK_URL=https://n8n-production-293e.up.railway.app

# ── Extraction API (has a prod default but override to point at dev) ─
NEXT_PUBLIC_EXTRACTION_API_URL=https://extraction-api-production.up.railway.app

# ── Roboflow (detect-region / redetect-page) ─────────────────────────
ROBOFLOW_API_KEY=<key>
ROBOFLOW_WORKFLOW_URL=<workflow-url>
ROBOFLOW_INFERENCE_URL=<inference-url>

# ── Replicate (SAM — currently disabled upstream) ────────────────────
REPLICATE_API_TOKEN=<token>

# ── Azure Document Intelligence (alt schedule extractor) ─────────────
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=<endpoint>
AZURE_DOCUMENT_INTELLIGENCE_KEY=<key>

# ── Dev only ─────────────────────────────────────────────────────────
NEXT_PUBLIC_DEV_BYPASS_AUTH=true    # skip login locally. NEVER set in prod.
```

> `NEXT_PUBLIC_*` values are bundled into the client and visible to any user — don't put secrets behind that prefix.

## Common one-liners

```bash
# Add a shadcn component
npx shadcn@latest add button

# Regenerate Supabase types after a migration
npx supabase gen types typescript --project-id okwtyttfqbfmcqtenize > lib/types/database.ts

# Strict type-check without a full build
npx tsc --noEmit
```

## Audit scripts

Read-only scripts for poking at the DB from your laptop — use these to confirm schema/pricing/rule state before investigating a bug:

```bash
node scripts/audit-autoscope.js        # list active auto-scope rules and triggers
node scripts/audit-pricing-items.js    # dump pricing snapshot contents
node scripts/audit-schema.js           # show schema drift vs. expected
```

They read `.env.local` the same way the app does.

## No automated tests

There is no Jest / Vitest / Playwright. Manual verification path for a new change:

1. Start `npm run dev`.
2. Open `/project/new`, upload a sample PDF (Hover exports under `test-data/` if available; otherwise pick a small architect PDF).
3. Walk through the multi-step form, submit.
4. Wait for the extraction job to complete (n8n must be reachable; Realtime updates surface progress).
5. Open the Detection Editor at `/projects/[id]/extraction/[jobId]`. Confirm detections render; edit a few.
6. Click **Approve & Calculate** → verify redirect to `/takeoffs/[id]`.
7. Check Materials / Labor / Paint / Overhead tables; verify totals and presentation groups.
8. Export Excel; open in Excel / Numbers / LibreOffice; confirm Summary sheet shows per-SQ totals, Profit, Margin.
9. For rule / calculation changes, run the MN568 regression via `/takeoff-validate` (EstimatePros Claude Code skill).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `npm run dev` serves but every query hangs | Supabase browser client hit RLS | Route the query through a server API using the service role key. |
| Detections render but totals are 0 | `scale_ratio` on the page is null | Calibrate the page via the Calibration modal, or run the n8n classify workflow. |
| n8n webhooks return 408 | 120-second proxy timeout hit | Investigate the workflow; don't raise the timeout. |
| Claude returns empty fields | Low confidence — not a bug | Inspect `confidence` / `confidenceNotes` in the response. |
| Polygon area looks doubled on gables | Stale bounding-box code path somewhere | Confirm you're reading `area_sf` from the DB, not recomputing from `width × height`. |
| Every route redirects to `/login` | `middleware.ts` can't see a Supabase session | Confirm cookies, or set `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` (dev only). |
| Build passes but page errors at runtime | `typescript.ignoreBuildErrors: true` hid a real type mismatch | Run `npx tsc --noEmit` manually. |

## Repo orientation checklist for new contributors

1. Read `CLAUDE.md` (top-level playbook).
2. Skim `docs/ai-context/` (this folder) for the big picture.
3. Dive into `DATABASE_ARCHITECTURE.md` + `SYSTEM_INTEGRATION.md` for authoritative depth.
4. Pull up `.claude/skills/arch-review/SKILL.md` before changing the rule engine or calculation code.
5. Run `scripts/audit-autoscope.js` to see real rule data.
