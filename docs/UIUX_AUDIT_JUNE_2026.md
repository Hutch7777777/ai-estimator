# EstimatePros.ai UI/UX Audit — June 10, 2026

**Scope:** ai-estimator frontend (Next.js App Router, shadcn/ui, Konva, AG Grid) — audited from code in project knowledge: route structure, component tree, styling patterns, and interaction flows.
**Companion to:** CODEBASE_AUDIT_JUNE_2026.md — several findings here are the UI surface of backend problems identified there.
**Not yet done:** visual pass of the rendered app (available via Claude in Chrome — see Section 8).

---

## Overall Impression

The app isn't badly designed — it's **three apps wearing one trench coat**. The Detection Editor is genuinely sophisticated (local-first editing, undo/redo, draft recovery — that's pro-tool quality). But it's stitched to a tabbed mega-dashboard, a legacy form page, an orphaned CAD markup tool, and four URL namespaces with no consistent navigation between them. "All over the place" is accurate, and the root cause is the same as the backend: three input pipelines, each of which grew its own UI.

---

## 1. Information Architecture — the biggest problem

### 1.1 Four URL namespaces for one workflow

| Route | What it is | Namespace |
|---|---|---|
| `/project` | Tabbed mega-dashboard (overview + new project form + CAD markup + extractions + projects table) | `/project` (singular) |
| `/project/new` | **Legacy** standalone duplicate of the new-project form | `/project` |
| `/projects/[id]` | Estimate editor (AG Grid) | `/projects` (plural) |
| `/projects/[id]/extraction/[jobId]` | Detection Editor | `/projects` |
| `/dashboard/extractions/[jobId]/classify` | Page classification | `/dashboard` |
| `/takeoffs/[id]` | Read-only takeoff view | `/takeoffs` |
| `/test-konva` | Dev test page **shipped in production routes** | — |

A user moving through one job touches `/project` → `/projects/[id]/extraction/[jobId]` → `/dashboard/extractions/...` → `/projects/[id]` → `/takeoffs/[id]`. Singular/plural namespace switching breaks breadcrumbs, back-button intuition, and any mental model of "where am I." 🔴

### 1.2 The tab-as-app antipattern

`/project` crams five distinct applications into tabs: DashboardOverview, ProjectForm (5-step wizard), CADMarkupStep (a full canvas editor!), ExtractionsTable, ProjectsTable. Tabs are for views of the same thing, not for entirely different tools. A canvas markup editor living inside a tab inside a dashboard is why the app feels chaotic. 🔴

### 1.3 No persistent app shell

Only `/project` has a layout with navigation. The Detection Editor, estimate editor, and takeoff view are effectively full-screen islands — once a user is deep in a job, there's no consistent global nav, no breadcrumb showing project → extraction → takeoff lineage, no way home except the browser back button. 🔴

**Recommendation — one spine:** Restructure around the project lifecycle, single namespace:

```
/projects                          → list (the current ProjectsTable)
/projects/[id]                     → project hub: status, stage progress, files, actions
/projects/[id]/measurements        → upload/import (all sources — see §2)
/projects/[id]/review/[jobId]      → Detection Editor
/projects/[id]/estimate            → estimate editor
/projects/[id]/takeoff             → takeoff view + Excel export
```

Persistent top bar everywhere: project name, stage stepper (Upload → Review → Estimate → Export), org switcher, account. Delete `/project/new` (legacy duplicate), `/test-konva`, and fold `/dashboard/extractions/.../classify` into the review flow. The existing `stepper.tsx` component you already have is the right primitive for the stage indicator — promote it from form-widget to app-level navigation.

---

## 2. Upload/Input UX — five doors, no signage

This is the frontend face of the backend's three-pipeline problem:

| Component | Where it lives | What the user thinks |
|---|---|---|
| `PDFUploadStep` | Project form wizard | "Upload HOVER PDF" |
| `HoverUploadStep` | Project form wizard (also?) | "Upload HOVER PDF" — different one |
| `BluebeamFreshImportModal` | Dashboard | "Upload Marked Up Plans" |
| `BluebeamImportModal` | Inside Detection Editor | "Import Bluebeam" — re-import/diff |
| `CADMarkupStep` | Dashboard tab | Manual markup (dead-ends — never reaches calc) |

Two HOVER upload components, two Bluebeam modals with similar names and different jobs, and one tool whose output goes nowhere. A pilot user cannot reliably answer "which button do I press for my file?" 🔴

**Recommendation:** One entry point on the project hub — **"Add Measurements"** — opening a single modal with a source choice: *HOVER report / Marked-up plans (Bluebeam) / Construction plans (AI detection) / Manual markup*. Each routes to the appropriate importer but lands in the same Detection Editor review step. This is exactly the backend Phase 0 decision ("one pipeline, many importers") expressed in UI. Rename `BluebeamImportModal` → `BluebeamReimportModal` or label it "Update from Bluebeam" so the two stop colliding. Either wire CADMarkupStep into the pipeline or remove it from the UI entirely — a tool that visibly accepts work and silently discards it is worse than no tool.

---

## 3. Design System Consistency

### 3.1 Three styling dialects in one app

| Dialect | Where | Example |
|---|---|---|
| Hardcoded hex codes | `app/account/page.tsx` | `text-[#0f172a]`, `bg-[#f8fafc]`, `text-[#00cc6a]`, `border-[#e2e8f0]` |
| Raw Tailwind palette + dark: variants | DetectionEditor modals | `bg-blue-600 hover:bg-blue-700`, `dark:bg-gray-900` |
| shadcn semantic tokens | Most components | `text-muted-foreground`, `bg-muted/50`, `border` |

Consequences: the account page **cannot dark-mode** (hex codes don't respond to theme), the brand green `#00cc6a` exists only as magic strings, and three pages of the same app render three different grays. 🟡 → 🔴 once you have paying pilots comparing screens.

**Fix:** Define the palette once in `globals.css` as CSS variables (`--primary: #00cc6a` etc.), map through Tailwind config, then a mechanical find-and-replace pass: every `[#hex]` → semantic token, every raw `blue-600`/`gray-*` in feature code → token. This is a half-day of tedium that ends the drift permanently.

### 3.2 Brand inconsistency

The account page literally says **"Learn how to use Estimate.ai"** — the product is EstimatePros.ai. Small, but it's the kind of thing a pilot screenshots. 🟡

### 3.3 Component bypass

DetectionEditor's draft-recovery modal and approval-results panel are hand-rolled `<div className="fixed inset-0 z-50">` overlays with raw `<button>` elements — not the shadcn `Dialog`/`Button` used everywhere else. Cost: no focus trap, inconsistent Esc/overlay-click behavior, different focus rings, untracked styling. Same story with the duplicated `MarkupToolbar` (one in detection-editor/, one in cad-markup/). 🟡

**Fix:** Replace hand-rolled overlays with `Dialog`, raw buttons with `Button`. Delete the legacy components still in the tree: `DetectionCanvas.tsx`, `DetectionBox.tsx`, `KonvaDetectionRect.tsx` (marked legacy in your own docs) — dead components get copy-pasted from.

---

## 4. Trust-Killers on Visible Pages

The account page — which every pilot will open — currently shows:

- Usage stats hardcoded to **"0 / 0 / 0"** (Projects Created, PDFs Processed, Exports Generated)
- Resource links pointing to **`href="#"`** (Documentation, Request a Feature)
- A permanently **disabled "Upgrade" button** on a "Free Plan" card

To a contractor evaluating whether to pay you, this reads as *unfinished product*, not *early product*. 🔴 for pilot conversion, trivial to fix.

**Fix:** Wire the three stats to real counts (one Supabase query each), point Documentation at something real (even a Notion page), and delete the billing card until billing exists. Removing fake UI is a feature.

---

## 5. Detection Editor — strong core, overloaded surface

This is your best screen and your most overloaded one.

### 5.1 Cognitive load
- **Toolbar:** 8+ tool modes (select, create, pan, verify, calibrate, line, point, split) plus **three separate class dropdowns** (createClass, lineClass, pointClass) plus zoom, undo/redo, save, approve. That's 15+ interactive controls in one strip. 🟡
- **Three overlapping view toggles:** `showMarkup`, `showOriginalOnly`, `showBluebeamMarkups` — users must understand the difference between "markup," "original only," and "Bluebeam markups," which is your internal pipeline vocabulary leaking into the UI. 🟡

**Fix:** Group the toolbar — *Select/Pan* | *Draw (polygon, line, point — one flyout with one class selector)* | *Measure (calibrate)* — and collapse the three view toggles into one "Layers" popover with checkboxes (Detections / Bluebeam annotations / Original plan). Same capability, half the chrome.

### 5.2 Verb confusion
The primary actions are **"Validate"** (which means *save*), **"Approve & Calculate"** (which means *generate takeoff*), plus auto-save, plus draft recovery. "Validate" is engineering vocabulary; contractors save things. 🟡

**Fix:** Rename Validate → **Save**, Approve & Calculate → **Generate Takeoff**. Keep the words a Mike-Skjei-trained estimator would use.

### 5.3 Persistence metaphor pile-up
Undo/redo stack + 30-second auto-save + localStorage drafts + beforeunload warning + draft-recovery modal = five overlapping safety nets, each with its own UI. The 30s auto-save fires regardless of changes (your own FRONTEND_ANALYSIS flags the perf cost) and the draft modal interrogates users about state they didn't know existed. 🟡

**Fix:** Local-first with explicit Save is the right model — keep it, make auto-save change-triggered (debounced), and make draft recovery silent (auto-restore + toast with "Undo" action) instead of a blocking modal.

### 5.4 Debug residue
`console.log` calls fire on every render (`Job results_summary`, `JobTotals`), and there's a direct-`fetch`-to-Supabase-REST workaround in `handleApplyScale` with the anon key — functional, but it bypasses the typed client and logs internals to any open devtools. 🟢 cleanup item.

---

## 6. Feedback & Status Patterns

- **Status vocabulary varies by surface:** ExtractionsTable badges (`converting → classifying → processing → complete`), ProjectsTable badges (`pending → won/lost`), CAD markup SyncStatus (`idle/unsaved/saving/saved/error` — and "saving" is reused as a *loading* indicator). Three status grammars, no shared component contract beyond `status-badge.tsx` existing. 🟡
- **The HOVER flow's synchronous wait** (up to 120s for Excel with the dev console as the only progress indicator) is the worst moment in the product — a 2-minute spinner with no stages shown. The backend fix (async + Realtime status) is also the UX fix: show the pipeline stages (`Uploading → Extracting → Calculating → Ready`) as they happen. 🔴
- Toasts are used well in the Detection Editor (specific counts, descriptions) — make that the standard everywhere.

---

## 7. Accessibility (quick pass — full audit available)

- **Hand-rolled modals**: no focus trap, unclear Esc handling → keyboard users get stuck. 🟡
- **Konva canvas**: inherently mouse-only; ensure every canvas operation has a sidebar/panel equivalent (most do via PropertiesPanel — verify class change, delete, and notes are all reachable without the canvas). 🟢
- **Hex-gray text** `#64748b` on white passes AA for normal text (~4.7:1); the brand green `#00cc6a` on white is ~2.0:1 — **fails** for text. Fine for fills/accents, never for text or icon-only buttons. 🟡
- Touch targets in the dense toolbar likely sub-44px — matters if pilots review takeoffs on tablets in the field. 🟢

---

## 8. What Works Well (keep these)

- **Local-first editing architecture** in the Detection Editor — optimistic updates, undo/redo, recovery. This is the moat screen; the polish should concentrate here.
- **Database-driven forms** (`trade_configurations` → ProductConfigStep) — the color-swatch system is a genuinely good pattern.
- **shadcn/ui as the base** — the system exists; the problem is bypassing it, not the system.
- **Toast quality** in save/approve flows — specific, actionable copy.

---

## 9. Priority Order

| # | Change | Effort | Why first |
|---|---|---|---|
| 1 | Fix account-page trust-killers (real stats, kill dead links/billing card) | Hours | Pilots see it this week |
| 2 | Single "Add Measurements" entry + retire duplicate upload components | 1–2 days | Ends the "which button?" confusion; aligns with backend Phase 0 |
| 3 | Route consolidation to `/projects/[id]/...` + persistent shell with stage stepper | 2–3 days | Fixes "all over the place" at the structural level |
| 4 | Design-token pass (CSS vars, kill hex codes, brand string fix) | 0.5–1 day | Mechanical; ends visual drift |
| 5 | Detection Editor: toolbar grouping, Layers popover, verb renames | 1–2 days | Highest-traffic screen |
| 6 | Async HOVER flow with staged progress UI | With backend Phase 4 | The 2-minute spinner dies with the sync pipeline |
| 7 | Component hygiene: Dialog/Button adoption, delete legacy canvas components, dedupe MarkupToolbar | 1 day | Stops the drift from regrowing |

Sequencing note: #2, #3, and #6 are the UI halves of backend audit Phases 0, 3, and 4 — do them in the same sprints so you're not redesigning screens for flows that are about to change shape.

---

## 10. Limits of This Audit

This was a code audit — component structure, styling patterns, and flows as implemented. It can't see rendered spacing, real visual hierarchy, responsive breakage, or how the Konva canvas actually feels. A live pass via Claude in Chrome on the running app (dashboard → upload → Detection Editor → takeoff) would verify these findings visually and catch layout issues invisible in code.
