# Design Consistency

Rules for keeping EMBER's UI visually and verbally consistent. Applies to every page in `app/` and the shared pieces in `components/`.

Scope: card structure, border radius, redundant labels. This is a spec, not a redesign — no new features, no new components beyond the one panel class named below.

---

## 1. One card system

Today, "card" is implemented five different ways with different radii, paddings, and nesting. Fix: one surface, one padding rhythm, one radius per role.

### Surface tokens

| Token | Value | Use |
|---|---|---|
| `--border` | existing | every card / panel border, always `1px solid` |
| `--radius-card` | `6px` | panels, stat grid, map frame, log/step containers, joined timeline |
| `--radius-control` | `5px` | buttons, inputs, selects, segmented controls, popovers, tooltips |
| `--radius-chip` | `3px` | badges, heatmap cells, legend swatches, bar caps |
| `--radius-pill` | `999px` | pulse dots, avatars, marker pills |

Add these once under `:root` in `app/globals.css` and reference them from every `.ember-*` rule and inline style. Do not use the shadcn/Tailwind radius scale (`rounded-sm/md/lg/xl`) in app markup — it resolves to `--radius: 0.625rem` (10px) and does not match the dashboard.

> Note: `components/ui/card.tsx` (`rounded-xl` ≈ 14px) and `components/ui/badge.tsx` are not imported by any page. Leave them alone; do not extend them, and do not mix them into `app/` pages.

### Card anatomy

- Border: `1px solid var(--border)`. No drop shadow on in-page cards.
- Shadow only for floating layers: `.ember-layer-popover`, modals, expanded map.
- Header: `15px 14px 12px`; body: `16px`; footer separated by `1px solid var(--border)`.
- Section title (`h2` + one-line `p`) stays **outside** the card (`.ember-section-heading`). Never put a card title inside a card that already has a section heading above it.
- No card inside a card. `app/ingestion/ingestion-client.tsx:104-137` nests step cards inside `.ember-map-layout`; use a plain grid on the page background instead.
- If the header or footer has a background, the card needs `overflow: hidden` so the radius clips it (as `.ember-map-layout` already does).

### One panel class

`.ember-map-layout` is being used as a generic panel (`style={{ display: "block", padding: "20px" }}`) in analytics, calendar, detections, ingestion, and smart-action-guide. Introduce `.ember-panel` with the card tokens and have `.ember-map-layout` compose it (map layout = panel + 2-column grid). Then remove the `display: block` overrides.

---

## 2. Border radius audit

Current values are ad hoc: `2px, 3px, 4px, 5px, 6px, 8px, 99px, 50%` plus Tailwind `rounded-md/sm/lg/xl`.

| Location | Current | Target |
|---|---|---|
| `app/globals.css:194` `.ember-stat-grid` | 6px | `--radius-card` |
| `app/globals.css:222` `.ember-map-layout` | 6px | `--radius-card` |
| `app/globals.css:305` `.ember-timeline` | `0 0 6px 6px` | `0 0 var(--radius-card) var(--radius-card)` |
| `app/globals.css:297` `.ember-selected-detail` | 4px | `--radius-card` |
| `app/globals.css:258` `.ember-layer-popover` | 5px | `--radius-control` |
| `app/globals.css:193,218,221` export/window/layer buttons | 5px | `--radius-control` |
| `app/globals.css:219` `.ember-window-selector button` | 3px | `--radius-chip` |
| `app/globals.css:263,268,273,287,300` checks, chips, status pills | 3px | `--radius-chip` |
| `app/globals.css:147` `.ember-brand-mark` | 8px | `--radius-control` (it is a control-sized box, not a card) |
| `app/globals.css:152` `.ember-nav-item` | 5px | `--radius-control` |
| map overlays (`:235-256`) | 4px | `--radius-control` |
| `app/ingestion/ingestion-client.tsx:117` step card | 6px | `--radius-card` |
| `app/analytics/analytics-client.tsx:151,159` bar caps | 3px | `--radius-chip` |
| `app/analytics/analytics-client.tsx:206,215,266` | 99px/3px | `--radius-pill` / `--radius-chip` |
| `app/calendar/calendar-client.tsx:143,195,230,232` | 2px/3px | `--radius-chip` |

Rules:

- Never write a literal radius in a `.tsx` file. Use a class, or `var(--radius-*)` when a style prop is unavoidable.
- Nested radius: inner radius = outer radius − padding, and never larger than the outer. A 3px chip inside a 6px card is fine; an 8px child inside a 6px card is not.
- Pill shapes (dots, avatars, marker pills) are the only `999px` / `50%` uses.

---

## 3. Remove redundant labels

The interface says the same thing up to four times on one screen. Rule: **each fact appears once, in the most specific place.** The global topbar already owns data-mode status.

### Data mode ("sample", "simulated", "demo", "not connected")

Owned by `components/ember-shell.tsx` — pill (`DEMO PREVIEW`, line 62) and sidebar subtitle (`Sample data preview`, line 70). Pages must not repeat it.

| File / line | Current | Action |
|---|---|---|
| `app/alerts/alerts-client.tsx:32` | "Sample proximity tiers computed against populated zones." | drop "Sample", keep what the page shows |
| `app/alerts/alerts-client.tsx:87` | "Sample data · live feed not connected" | delete; section subtitle should describe the list |
| `app/ingestion/ingestion-client.tsx:64` | eyebrow "PIPELINE SIMULATION / SAMPLE MODE" | keep the eyebrow concept, drop "/ SAMPLE MODE" |
| `app/ingestion/ingestion-client.tsx:69` | "No live feed connected." | delete |
| `app/ingestion/ingestion-client.tsx:144` | "Simulated daemon output" | "Daemon output" |
| `app/index/index-client.tsx:937` | footer "Demo environment" | delete (topbar pill already says it) |
| `components/ember-shell.tsx:83` | demo mode shows "Updated 2 min ago" | hide in demo mode — it is fabricated freshness |

### Repeated status words

- `app/index-client.tsx:886,904,925` all label the same thing "Live". Keep it on the data itself (line 925) and drop it from the timeline label and axis mark, or vice versa — one occurrence.
- Do not put the region in the eyebrow, the subtitle, and the sidebar (`.ember-eyebrow-date / BUKIDNON`, page subtitle, `Bukidnon region`). Region belongs in the sidebar and topbar breadcrumb; the eyebrow keeps only the page's role.

### Stat cards and foot lines

- `.ember-stat-top` = what the number is. `.ember-stat-foot` = qualifying data (delta, threshold, resolution). It must not restate the label.
  - `app/alerts/alerts-client.tsx:50` "Immediate dispatch required" after "CRITICAL (< 3 KM)" — restatement. Replace with data (dispatched count) or remove.
  - `app/analytics/analytics-client.tsx:89` "Max recorded FRP intensity" after "PEAK RADIATIVE POWER" — restatement. Remove.
- `.ember-stat-foot` holds at most two items; `app/ingestion/ingestion-client.tsx:90-91` already has two — leave it.
- Each page keeps exactly one `.ember-eyebrow` and one `h1`. The eyebrow is a role tag, not a sentence.

### Copy rules

- Sentence case for descriptions, UPPERCASE only for mono micro-labels (eyebrows, stat labels, chips).
- No decorative emoji in button labels (`⚡ Trigger manual ingest`, `✓ Dispatched`). Use a state change instead: `Dispatched` + `aria-pressed`.
- No trailing explanations of a feature the component already shows ("How raw FIRMS payloads are transformed…" is fine; "Sample data, not live" is not).

---

## 4. Typography and controls (apply while touching the above)

| Role | Size / weight |
|---|---|
| Page `h1` | 27px / 650 (23px mobile) |
| Section `h2` | 15px / 650 |
| Card body | 10–12px / 400–500 |
| Mono micro-label | 7–9px / 600, `--font-mono`, uppercase |
| Button label | 10px (`.ember-export-button`, `.ember-layer-button`) |

- `.ember-window-selector` is the only segmented control. Do not rebuild it inline for date ranges or filters.
- `.ember-layer-popover` is the only floating panel. The alerts modal (`alerts-client.tsx:168`) reuses it with an inline `position: static` — extract a `.ember-modal` class instead of overriding position inline.
- Buttons: `.ember-export-button` (34px) for page actions, `.ember-layer-button` (31px) for in-section actions, icon buttons at 25–32px. No new sizes.

---

## 5. Acceptance checklist

- [ ] No literal `borderRadius` or `rounded-*` in `app/**/*.tsx` or `components/ember-*.tsx` (except `--radius-pill` cases).
- [ ] Every card uses `--radius-card`; every control uses `--radius-control`; every chip uses `--radius-chip`.
- [ ] No card nested inside a card; no card title duplicating the section heading.
- [ ] "Sample / demo / simulated / not connected" appears only in the shell topbar and sidebar.
- [ ] No fabricated timestamps in demo mode.
- [ ] Each page states its region and data mode once.
- [ ] No `.ember-stat-foot` line that only restates its `.ember-stat-top` label.

## 6. Suggested order (small, independently shippable diffs)

1. Add the four radius tokens to `:root`; replace the `.ember-*` literals in `globals.css`. Visual diff should be near zero except 4px → 5px overlays.
2. Add `.ember-panel`, compose `.ember-map-layout` from it, replace inline `display: block` panel usages.
3. Replace leftover inline radii in `analytics-client`, `calendar-client`, `ingestion-client`.
4. Cut redundant mode/region strings page by page, starting with `alerts`, then `ingestion`.
5. Fix stat foot lines and demo-mode timestamp.

---

Known gaps: no visual regression tooling exists, so steps 1–3 need a manual side-by-side check in light and dark mode. `components/ui/card.tsx` and `badge.tsx` are unused; this doc deliberately leaves them untouched rather than deleting them.
