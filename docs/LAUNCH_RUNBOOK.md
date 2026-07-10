# Estimate.ai Launch Runbook

Last updated: July 9, 2026

## Current release status

The web app now passes `npm run check` and its anonymous route/API smoke tests.
It is suitable for an internal or closely supervised pilot only after the
deployment steps below are completed. Do not upload real client plans to the
current production environment before the RLS migration is applied and
verified.

Completed in the launch-hardening change:

- Verified server-side authentication for protected pages and every `/api/*`
  route.
- Same-origin, allowlisted proxies for extraction and n8n operations.
- Resource authorization before forwarding job, page, project, or takeoff IDs.
- HMAC-signed extraction requests containing user, organization, body digest,
  timestamp, and request ID claims; Railway rejects expired or altered claims.
- Private PDF upload paths and signed download/processing URLs.
- Tenant RLS/storage migration drafted for extraction, CAD, Bluebeam, and PDFs.
- Public Terms and Privacy pages.
- Support requests persist to a tenant-scoped database table.
- TypeScript, correctness-focused lint, and optimized production build pass.
- Extraction backend: 58 tests pass, including signed-request contract,
  ownership, state vocabulary, and MN568 facade normalization regressions.
- Estimation engine: 78 tests pass; project/org waste settings now share one
  resolver across material assignments, dynamic detections, and formula context.
  Railway ingress fails closed unless n8n supplies `ESTIMATION_API_KEY`.

## Required deployment sequence

Use a maintenance window until the sequence is complete.

1. Review and back up Supabase.
2. Create real, monitored inboxes for `legal@estimate.ai` and
   `privacy@estimate.ai`, or replace those addresses in the legal pages.
3. Keep `NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=false` for the pilot. Disable new
   user registration in Supabase Auth (or enforce an invite allowlist in an
   Auth hook); the UI flag alone is not an authorization boundary. Invite
   approved users manually.
4. Generate three different high-entropy values:
   `EXTRACTION_API_KEY`, `EXTRACTION_API_SIGNING_SECRET`, and
   `ESTIMATION_API_KEY`. Store the extraction values in Railway and Vercel;
   store the estimation key in the estimation Railway service and n8n. Never
   expose any of them with a `NEXT_PUBLIC_` prefix.
5. Set Vercel server-only variables:
   - `EXTRACTION_API_URL`
   - `EXTRACTION_API_KEY`
   - `EXTRACTION_API_SIGNING_SECRET`
   - `N8N_WEBHOOK_URL`
   - `N8N_WEBHOOK_SECRET`
6. Update each exposed n8n workflow to reject requests without the matching
   `X-Webhook-Secret` value. Configure every n8n call to the estimation API to
   send `X-API-Key: <ESTIMATION_API_KEY>`.
7. Deploy the estimation engine with `ESTIMATION_API_KEY` and
   `ESTIMATION_REQUIRE_API_KEY=true`. Verify unsigned calculation calls return
   401 while `/health` and `/webhook/health` remain available.
8. Apply `supabase/migrations/20260709000000_launch_security_hardening.sql`.
   Review the existing storage policy list first; the migration deliberately
   adds restrictive client-PDF boundaries without deleting policies for other
   buckets. Inspect any legacy extraction jobs left without an organization,
   backfill or quarantine them, then validate the migration's `NOT VALID`
   organization/status constraints.
9. Deploy the extraction API with the shared key and signing secret. For the
   maintenance-window rollout, initially set
   `EXTRACTION_REQUIRE_SIGNED_REQUESTS=false`; keep `/health` unauthenticated
   for Railway monitoring.
10. Deploy this frontend release. Run one extraction request and confirm the
   same `X-Request-Id` appears in Vercel and Railway logs.
11. Set Railway `EXTRACTION_REQUIRE_SIGNED_REQUESTS=true`, redeploy, and verify
    that an unsigned request is rejected while `/health` remains available.
12. Probe Supabase with the anonymous key. The following must return zero rows
   or permission errors: draft/validated detections, detection detail views,
   elevation calculations, CAD extractions/callouts, Bluebeam projects, and
   client PDF objects.
13. Run the two-account isolation test below before inviting a client.

## Authenticated end-to-end acceptance test

Use a non-client test PDF and two organizations, A and B.

1. Sign up, complete onboarding, and create a project in A.
2. Upload a PDF and verify the extraction job remains visible after refresh.
3. Classify pages, process the job, edit detections, approve the estimate, and
   generate both the Excel takeoff and proposal.
4. Download the source PDF through the project screen; direct public storage
   URLs must fail.
5. Sign in as B and try A's copied project, job, page, takeoff, and PDF URLs.
   Every attempt must return 404/403 or redirect to a safe page without data.
6. Submit a support request and confirm the row is stored with A's user and
   organization IDs.
7. Inspect Vercel, Railway, Supabase, and n8n logs for secrets, client data,
   stack traces, or unhandled errors.

## Estimate correctness gate

Security readiness does not establish estimate accuracy. Before unsupervised
client use:

1. Review and deploy the local engine waste-factor work described in
   `docs/WASTE_FACTOR_AUDIT.md`; it is tested but not pushed or deployed.
2. Apply the auto-scope formula migration in controlled batches. The engine
   now supports `waste_factor`, but current production formulas still contain
   hardcoded literals.
3. Re-run MN568 and compare every line item's quantity, formula, unit, material
   price, labor price, waste, and markup—not only the grand total.
4. Resolve the known baseline difference between the expected `$19,333` and
   current `$18,657`, and record the approved fixture output.
5. Preserve the verified SKU invariant: all 172 active rule SKUs currently
   resolve to `pricing_items`. Do not rewrite rule `material_category` values
   merely because they differ from pricing categories; those fields represent
   output/behavior categories, while price lookup is SKU-based and assignment
   triggers use `trigger_condition.material_category`.

## Pilot operating decisions

- Billing is intentionally presented as manually managed pilot access; no
  self-serve checkout is implemented.
- Support tickets are stored, but an owner still needs a notification or daily
  ticket-review process.
- Have counsel confirm the legal entity, governing law, retention promises,
  limitation of liability, and privacy disclosures before broad public launch.

## Release commands

```bash
npm ci
npm run check
git diff --check
```

Do not treat a successful build as authorization to apply the migration, push
backend working trees, or deploy. Those operations change live customer-facing
systems and should be performed deliberately in the sequence above.
