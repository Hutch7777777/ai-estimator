# Estimate.ai

Construction estimating SaaS for turning plan and HOVER PDFs into reviewed
takeoffs, material scopes, pricing, and client-ready exports.

## Local development

Requirements: Node.js 20+ and access to the Estimate.ai Supabase project.

Create `.env.local` with the required public Supabase values and optional
server-side integration values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=false
EXTRACTION_API_URL=
EXTRACTION_API_KEY=
EXTRACTION_API_SIGNING_SECRET=
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
```

Copy `.env.example` as a starting point. `EXTRACTION_API_KEY`,
`EXTRACTION_API_SIGNING_SECRET`, and `N8N_WEBHOOK_SECRET` are server-only
secrets. Never prefix them with `NEXT_PUBLIC_`.

```bash
npm ci
npm run dev
```

## Release verification

```bash
npm run check
git diff --check
```

`npm run check` runs TypeScript, correctness-focused ESLint, and the optimized
Next.js production build. Use `npm run lint:report` to see the complete legacy
warning backlog.

## Architecture

- Next.js 16 / React 19 frontend and authenticated server routes
- Supabase Auth, Postgres, Realtime, and private PDF storage
- Railway extraction service for plan processing
- n8n workflows and the exterior estimation engine for takeoff generation

Browser requests to extraction and workflow services must use the authenticated
same-origin API routes. Direct public service URLs must not be added to client
code.

## Launching

Read [docs/LAUNCH_RUNBOOK.md](docs/LAUNCH_RUNBOOK.md) before applying database
migrations or deploying. Estimate accuracy work is tracked separately in
[docs/WASTE_FACTOR_AUDIT.md](docs/WASTE_FACTOR_AUDIT.md).
