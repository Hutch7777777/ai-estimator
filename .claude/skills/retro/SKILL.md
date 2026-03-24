---
name: retro
description: Engineering retrospective after fixing a bug, completing a feature, or resolving an incident. Use this skill after any debugging session, after closing a material gap on MN568, after a production issue, or when wrapping up a multi-session piece of work. It captures what went wrong, why, and encodes the lesson into the appropriate skill's checklist so the same bug never happens again. Use when someone says "let's do a retro", "what did we learn", "wrap up", "document this", or after any significant debugging session.
---

# /retro — Engineering Retrospective

You are the team's memory. Your job is to make sure every hard-won lesson gets written down in a place where it will actually be SEEN the next time it matters.

## Trigger This After

- Fixing a bug that took > 30 minutes to diagnose
- Closing a material gap on MN568
- Any production incident
- Completing a multi-session feature
- Discovering a new failure pattern
- Any time something was harder than it should have been

## Retro Template

### 1. What Happened

```
Date: [DATE]
Duration: [How long did this take?]
Severity: [P0 production down / P1 wrong numbers / P2 cosmetic / P3 tech debt]

Symptom: [What the user/contractor would have seen]
Root Cause: [The actual technical reason]
Fix Applied: [What code/data change resolved it]
```

### 2. Timeline

```
[TIME] First noticed: [how]
[TIME] Initial hypothesis: [what we thought]
[TIME] Hypothesis proved wrong because: [why]
[TIME] Actual cause found: [how]
[TIME] Fix applied
[TIME] Fix verified
```

### 3. Why Did This Happen?

Pick all that apply:
- [ ] Missing validation / guard clause
- [ ] Assumption about data type (JSONB boolean, null vs undefined)
- [ ] Assumption about code path (generic vs manufacturer-specific)
- [ ] Missing test / regression check
- [ ] Stale knowledge (code changed but mental model didn't)
- [ ] Database constraint not documented
- [ ] Two systems out of sync (frontend/API, n8n/Railway, etc.)
- [ ] Missing error handling (silent failure)
- [ ] Copy-paste from similar code without adapting

### 4. What Would Have Caught This Earlier?

- [ ] A checklist item in `/arch-review`
- [ ] A validation query in `/rule-add`
- [ ] A regression check in `/takeoff-validate`
- [ ] A pattern scan in `/pre-deploy`
- [ ] A question in `/scope-review`
- [ ] Better error messages in the code
- [ ] A unit test

### 5. Encode the Lesson

**This is the most important step.** The lesson must be written into a skill file, not just this retro document.

For each lesson, identify WHERE it belongs:

| Lesson Type | Encode In | How |
|------------|-----------|-----|
| New code failure pattern | `/arch-review` SKILL.md | Add to appropriate checklist section |
| New database constraint | `/rule-add` SKILL.md | Add to Column Validation table |
| New formula gotcha | `/calc-engine` SKILL.md | Add to Change Checklist |
| New deployment failure | `/pre-deploy` SKILL.md | Add to Known Failure Pattern Scan |
| New baseline expectation | `/takeoff-validate` SKILL.md | Update Baseline Totals |
| New onboarding step | `/material-onboard` SKILL.md | Add to appropriate phase |

**Format for encoding a lesson:**

```markdown
### [Added YYYY-MM-DD from retro: Brief description]
- [ ] **[Check description]** — [What to verify]. This was discovered when [brief context]. The failure mode is [what goes wrong]. The fix is [what to do instead].
```

### 6. Verify Encoding

After writing the lesson into the skill file:
- [ ] Read the skill file back — does the lesson make sense to someone who wasn't here?
- [ ] Is it in the right section? (Will it be seen at the right time?)
- [ ] Is it specific enough to act on? (Not just "be careful" but "check X before Y")

---

## Output Format

```
## Retro: [Brief Title]

**Date:** [DATE]
**Severity:** P0/P1/P2/P3
**Time to Fix:** [duration]

**What:** [1-2 sentence summary]

**Root Cause:** [Technical explanation]

**Fix:** [What was changed]

**Lesson Encoded In:**
- /arch-review: [new checklist item added]
- /pre-deploy: [new pattern scan added]

**Prevention:** This class of bug is now caught by [skill] at [which step]

**MN568 Impact:** Gap changed from $X to $Y
```

---

## Meta: Improving This Process

If you notice patterns across retros:
- Same ROOT CAUSE appearing multiple times → The encoded lesson isn't working. Strengthen it or move it earlier in the workflow.
- Retros always finding the SAME skill needs updating → That skill might need restructuring.
- Bugs that NO skill would have caught → New skill needed? New automated check?

The goal is that over time, the same bug NEVER happens twice. Every retro should make the system permanently smarter.
