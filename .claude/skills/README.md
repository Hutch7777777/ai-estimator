# EstimatePros.ai — Custom Claude Code Skills

8 sub-agent skills for Claude Code, built specifically for the EstimatePros.ai estimation platform. Inspired by Garry Tan's gstack pattern, but encoded with project-specific tribal knowledge, failure patterns, and workflows.

## Skills Overview

| Skill | Role | When to Use |
|-------|------|-------------|
| `/scope-review` | Product strategist | Before starting any new feature |
| `/arch-review` | Senior engineer | Before implementing any code change |
| `/rule-add` | Database specialist | When adding auto-scope rules |
| `/material-onboard` | Onboarding lead | When adding new products/manufacturers |
| `/calc-engine` | Calculation engineer | When modifying formulas or pricing logic |
| `/takeoff-validate` | QA engineer | After any change to verify MN568 output |
| `/pre-deploy` | Release engineer | Before every git push to main |
| `/retro` | Team memory | After fixing bugs or completing features |

## Installation

### Option A: Project-level install (recommended)

This makes the skills available to anyone working on the repo.

```bash
# From your repo root (ai-estimator or exterior-estimation-api)
mkdir -p .claude/skills

# Copy all skills
cp -r /path/to/estimatepros-skills/* .claude/skills/

# Verify
ls .claude/skills/
# Should show: scope-review/ arch-review/ rule-add/ material-onboard/
#              calc-engine/ takeoff-validate/ pre-deploy/ retro/
```

### Option B: Global install

This makes skills available across all your repos.

```bash
# Copy to global Claude Code skills directory
mkdir -p ~/.claude/skills
cp -r /path/to/estimatepros-skills/* ~/.claude/skills/
```

### Add to CLAUDE.md

Add the following section to your repo's `CLAUDE.md` file (create one if it doesn't exist):

```markdown
## EstimatePros Skills

Custom workflow skills for the EstimatePros.ai estimation platform.

### Available Skills

- `/scope-review` — Product-level planning review. Use BEFORE starting any new feature.
- `/arch-review` — Engineering architecture review. Use BEFORE implementing code changes to calc engine, auto-scope rules, or data flow.
- `/rule-add` — Structured auto-scope rule insertion. Use when adding rules to siding_auto_scope_rules.
- `/material-onboard` — Complete manufacturer/product onboarding workflow.
- `/calc-engine` — Safe calculation engine modification workflow.
- `/takeoff-validate` — MN568 regression testing. Use AFTER any calculation change.
- `/pre-deploy` — Railway production deployment safety check. Use BEFORE every git push to main.
- `/retro` — Engineering retrospective. Use AFTER fixing bugs to encode lessons.

### Workflow

Standard development flow:
1. `/scope-review` — Is this the right thing to build?
2. `/arch-review` — Will this implementation work safely?
3. Build the feature (use `/rule-add`, `/material-onboard`, `/calc-engine` as needed)
4. `/takeoff-validate` — Did this break anything?
5. `/pre-deploy` — Is this safe to ship?
6. Push to main
7. `/retro` — What did we learn?
```

## Customization

Each skill is a standalone Markdown file. Edit them freely:

- Add new checklist items to `/arch-review` when you discover new failure patterns
- Update baseline totals in `/takeoff-validate` after validated deploys
- Add new rule patterns to `/rule-add` as you onboard more manufacturers
- Add deployment patterns to `/pre-deploy` as infrastructure evolves

## The Self-Improving System

The `/retro` skill is the key to the whole system. After every bug fix:

1. Run `/retro` to document what happened
2. The retro identifies which skill should encode the lesson
3. The lesson gets added as a checklist item to that skill
4. Next time, the bug is caught BEFORE it ships

Over time, the skills get smarter. The same bug never happens twice.
