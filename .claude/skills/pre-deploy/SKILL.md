---
name: pre-deploy
description: Pre-deployment safety check before pushing to main (which auto-deploys to Railway production). Use this skill BEFORE every git push to main on the exterior-estimation-api repo. There is no staging environment — every push goes directly to production. This skill reviews the diff, checks for common deployment failures, verifies calculation engine integrity, and confirms database compatibility. Use when someone says "push to main", "deploy", "ship this", "git push", or is about to merge a PR. Required for any change touching autoscope-v2.ts, orchestrator-v2.ts, pricing.ts, or any API endpoint.
---

# /pre-deploy — Railway Production Deployment Guard

You are the release engineer. Your ONE JOB is to prevent broken code from reaching production. There is no staging. There is no rollback button. Every push to main auto-deploys.

## STOP — Before Pushing, Complete ALL Steps

### Step 1: Review the Diff

```bash
git diff main --stat
git diff main -- src/
```

Categorize every changed file:

| File | Risk | Requires Validation |
|------|------|-------------------|
| `src/calculations/siding/autoscope-v2.ts` | 🔴 CRITICAL | /takeoff-validate required |
| `src/calculations/siding/orchestrator-v2.ts` | 🔴 CRITICAL | /takeoff-validate required |
| `src/services/pricing.ts` | 🔴 CRITICAL | /takeoff-validate required |
| `src/routes/*.ts` | 🟡 HIGH | Manual endpoint test required |
| `src/excel/*.ts` | 🟡 HIGH | Excel output visual check required |
| `src/utils/*.ts` | 🟢 MEDIUM | Unit test if available |
| `package.json` | 🟡 HIGH | Check for breaking dependency changes |
| Config files | 🟡 HIGH | Check env var compatibility |

### Step 2: Calculation Engine Check

If ANY calculation file changed:

- [ ] Run `/takeoff-validate` on MN568
- [ ] Verify gap did not regress
- [ ] Spot-check at least 2 line items by hand
- [ ] Confirm no NaN, null, or 0-quantity items

### Step 3: Known Failure Pattern Scan

Scan the diff for these patterns that have caused production issues:

```
PATTERN: === true or === false on JSONB values
FIX: Use isTrue() / isFalse() helpers
FILES: autoscope-v2.ts, orchestrator-v2.ts

PATTERN: measurements.variable_name (prefixed)
FIX: Use variable_name directly (context is flattened)
FILES: autoscope-v2.ts quantity formulas

PATTERN: backtick template literals in strings going to n8n
FIX: Use string concatenation
FILES: Any n8n integration code

PATTERN: is_active (wrong column name)
FIX: Column is just 'active'
FILES: Any Supabase query

PATTERN: Missing executeOnce: true on aggregation queries
FIX: Add executeOnce to prevent N× duplication
FILES: n8n workflow JSON

PATTERN: Hardcoded prices instead of database lookups
FIX: Query pricing_items by SKU
FILES: Any calculation code

PATTERN: console.log with sensitive data
FIX: Remove or redact
FILES: Any file
```

### Step 4: Database Compatibility

- [ ] Does this change require new database columns? If yes, ADD THEM FIRST via Supabase SQL Editor before deploying.
- [ ] Does this change expect new tables? Same — create first.
- [ ] Does this change modify how existing columns are read? Verify the column still exists and has the expected type.
- [ ] Are there new Supabase queries? Check that they work with current RLS policies.

### Step 5: API Contract Check

- [ ] Do any API response shapes change? If yes, does the frontend handle the new shape?
- [ ] Are there new required request parameters? If yes, is the frontend sending them?
- [ ] Did any endpoint URLs change? If yes, update frontend API calls first.

### Step 6: Environment Variables

```bash
# Check for new env vars referenced in code
grep -r "process.env\." src/ --include="*.ts" | grep -v node_modules | sort -u
```

- [ ] All referenced env vars exist in Railway environment
- [ ] No env vars were removed that are still needed

### Step 7: Dependencies

If `package.json` changed:
```bash
git diff main -- package.json
```

- [ ] No major version bumps without testing
- [ ] No removed dependencies that are still imported
- [ ] `npm install` / `yarn install` runs without errors

---

## Deployment Decision

```
All checks pass?
├── YES → Proceed to push
│         git add -A && git commit -m "descriptive message" && git push origin main
│         Then monitor Railway deploy logs for 2 minutes
│
└── NO  → Which check failed?
          ├── Calculation regression → FIX FIRST, re-run /takeoff-validate
          ├── Database not ready → Run migrations in Supabase SQL Editor first
          ├── Known failure pattern → Fix the pattern, re-review
          └── API contract change → Deploy frontend change first or together
```

---

## Post-Deploy Verification

After Railway shows "Deploy successful":

1. **Health check** — Hit a known API endpoint and verify response
2. **Smoke test** — If calc engine changed, trigger one MN568 calculation via the API
3. **Monitor logs** — Watch Railway logs for 2 minutes for any error spikes

```bash
# Quick health check (update URL to your Railway domain)
curl -s https://your-railway-api.up.railway.app/health | jq
```

---

## Output Format

```
## Pre-Deploy Check: [Branch/Commit Description]

**Files Changed:** [count]
**Risk Level:** 🔴 CRITICAL / 🟡 HIGH / 🟢 LOW

**Checks:**
- [ ] Diff reviewed
- [ ] Calculation engine: [N/A / PASSED / FAILED]
- [ ] Known patterns: [CLEAR / FOUND: list]
- [ ] Database compatibility: [OK / NEEDS MIGRATION]
- [ ] API contract: [UNCHANGED / CHANGED: details]
- [ ] Env vars: [OK / MISSING: list]
- [ ] Dependencies: [OK / CHANGED: details]

**Decision:** ✅ SAFE TO PUSH / 🔴 DO NOT PUSH — [reason]
```

## REMEMBER

There is no undo. There is no staging. If you push broken code, real contractors doing real bids will get wrong numbers. When in doubt, DON'T push.
