# 10 — Deployment (Railway)

> How this app is shipped. Based on `package.json`, `next.config.ts`, `CLAUDE.md`, `RAILWAY_APIS.md`, and the `/pre-deploy` skill description.

## TL;DR

- Railway hosts three services that together make up the system.
- A push to **`main`** auto-deploys the Next.js app. **No staging.**
- Supabase migrations are applied out of band via the Supabase dashboard / CLI.
- n8n workflows must be imported manually into the Railway n8n instance.

## Railway services

| Service | Repo / Source | Role |
|---------|---------------|------|
| `ai-estimator` | **this repo** | Next.js 16 app; all `/app/api/*` routes |
| `n8n-production-293e` | n8n official image | Workflow engine; runs `project-process`, `detection-edit-sync`, `approve-detection-editor`, `multi-trade-coordinator` |
| `extraction-api-production` | separate Python repo (not in this tree) | Wall heights, linear aggregation, siding polygon generator — `/wall-heights`, `/calculate-linear`, `/siding-polygons` |

Supporting services (not on Railway):
- **Supabase Cloud** (`okwtyttfqbfmcqtenize`) — Postgres / Auth / Storage / Realtime.
- **Anthropic**, **Roboflow**, **Replicate**, **Azure Document Intelligence** — SaaS APIs.

## Build & run

Railway uses **Nixpacks** defaults — no `Dockerfile`, no `railway.json`, no `railway.toml` in the repo.

```bash
# Railway install
npm install

# Railway build
npm run build

# Railway start
npm start
```

Scripts are defined in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  }
}
```

## `next.config.ts` notes

```ts
typescript: { ignoreBuildErrors: true }   // build will pass even if TS fails
reactStrictMode: true
poweredByHeader: false
images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] }
experimental: { optimizePackageImports: ['lucide-react'] }
logging: { fetches: { fullUrl: true } }    // verbose fetch logging in prod
```

**Implication**: type errors land in production. `/pre-deploy` must run `npx tsc --noEmit` before every push.

## Environment variables (Railway dashboard)

> Names only — set actual values in the Railway project settings for `ai-estimator`. Mirror the list in `09-local-dev-setup.md`.

**Required**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only — do not prefix `NEXT_PUBLIC_`)
- `ANTHROPIC_API_KEY`

**n8n**
- `NEXT_PUBLIC_N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_URL`

**Extraction API**
- `NEXT_PUBLIC_EXTRACTION_API_URL`

**Vision / segmentation**
- `ROBOFLOW_API_KEY`
- `ROBOFLOW_WORKFLOW_URL`
- `ROBOFLOW_INFERENCE_URL`
- `REPLICATE_API_TOKEN` (SAM is currently disabled; safe to keep configured)

**Azure Document Intelligence**
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- `AZURE_DOCUMENT_INTELLIGENCE_KEY`

**Must be unset or explicitly `false` in production**
- `NEXT_PUBLIC_DEV_BYPASS_AUTH` — if this leaks to prod the entire app is open. Because of the `NEXT_PUBLIC_` prefix it is visible in the client bundle, so it is reviewable via the deployed HTML.

## Deploy flow

```
  developer
     │ git push origin main
     ▼
  GitHub ─────────► Railway (ai-estimator)
                        │  Nixpacks build: npm ci && npm run build
                        │  Start:          npm start
                        ▼
                  Live production URL
```

There is no preview environment, no canary, no feature flag layer. All guardrails are upstream of the push:

1. `/scope-review` — is this the right feature?
2. `/arch-review` — will this implementation work?
3. Build the change.
4. `/takeoff-validate` — MN568 regression.
5. `/pre-deploy` — diff review, config check, DB compat.
6. `git push origin main`.
7. `/retro` if anything broke.

## Supabase & n8n deployment

- **Supabase migrations**: applied from `/migrations/*.sql` via the Supabase dashboard SQL editor or `supabase db push`. They do **not** run automatically on Railway deploy.
- **Type regeneration**: after running a migration, regenerate `lib/types/database.ts` with `npx supabase gen types typescript --project-id okwtyttfqbfmcqtenize > lib/types/database.ts` and commit.
- **n8n workflows**: imported into the Railway n8n UI manually. MCP tooling only sees the Cloud dev n8n instance; don't assume MCP == production.

## Deployment risks (ordered by impact)

1. **No staging** — every push is live. Mitigation: mandatory `/pre-deploy` + MN568 baseline.
2. **`typescript.ignoreBuildErrors: true`** — type errors don't block deploy. Mitigation: `npx tsc --noEmit` in `/pre-deploy`.
3. **Schema drift** — a migration is merged but not run in Supabase, or vice versa. Symptoms are silent because many routes have "column exists?" fallbacks. Mitigation: always run the migration before merging, confirm via `scripts/audit-schema.js`.
4. **n8n workflow drift** — workflow changes live in n8n, not in git. Losing them is a "revert by re-importing a snapshot" operation. Mitigation: export + commit workflow JSON to this repo (not yet done).
5. **n8n 120-second webhook timeout** — Excel exports on large jobs land close to the cliff. Mitigation: split work into multiple workflows, don't raise the timeout.
6. **`NEXT_PUBLIC_DEV_BYPASS_AUTH` leaking to prod** — grep settings before every deploy.
7. **Hot files without tests** — `exportTakeoffExcel.ts` (61 KB), `extractionQueries.ts` (23 KB), `polygonUtils.ts` (22 KB). Changes here have wide blast radius. Mitigation: validate against MN568; manual QA of Materials / Labor / Paint / Summary.
8. **`SUPABASE_SERVICE_ROLE_KEY` exposure** — server-only. Never import from a file that runs on the client; the ESLint config doesn't enforce this.

## Rollback

Revert the offending commit on `main` and push:

```bash
git revert <sha>
git push origin main
```

Railway redeploys the reverted tip. Data-model rollbacks (dropped columns, altered types) need a corresponding Supabase migration; design migrations to be backward-compatible where possible (add-only columns, nullable, with defaults).

## Observability

- Railway logs (stdout / stderr per service).
- `next.config.ts` has `logging: { fetches: { fullUrl: true } }` — outbound fetch URLs appear in logs.
- Claude API responses include `tokens_used` — use it to catch runaway token burn.
- Supabase dashboard → Logs → Auth / DB / Storage for anything not visible in Railway.

## Security boundary

- `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ROBOFLOW_API_KEY`, `REPLICATE_API_TOKEN`, `AZURE_DOCUMENT_INTELLIGENCE_KEY` — **server-side only**. Any import graph that pulls them into a client component is a leak.
- `NEXT_PUBLIC_*` values are bundled into the client — review before each deploy.
- RLS is the multi-tenant boundary. Service-role reads must be scoped deliberately; there's no automatic `organization_id` filter when you bypass RLS.
