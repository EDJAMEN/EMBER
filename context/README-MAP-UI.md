# SPEC: Map UI — incident panel, control sizing, expanded layout

Machine-readable spec for the Regional overview map on Overview page `/`.
Project: EMBER, Next.js App Router + Tailwind v4. Files: `app/index-client.tsx`, `app/globals.css`, `components/ember-map.tsx`, `components/climate-panel.tsx`.

Read this as: the listed markup, classes and numeric values are the contract. Sample text is placeholder output, not content requirements.

---

## 1. Incident panel

### Placeholder notice

All text in the panel is variable. Cluster names, counts, distances, timestamps, sensor values and coordinates change with: live feed on/off, `dayCursor`, `showViirs`, `showModis`, `confidence`, place search. The markup and data bindings are fixed; the copy is not.

### Required DOM

```
.ember-map-section
└── .ember-map-layout
    ├── .ember-map-canvas
    └── .ember-incident-panel
        ├── .ember-window-selector        [SHOW ON MAP, role=radiogroup]
        ├── .ember-panel-header           [title + count, sort explanation]
        ├── .ember-sort-label             [NEAREST SETTLEMENT]
        ├── .ember-incident-list          [0..n × .ember-incident-row]
        ├── .ember-view-incidents         [link → /detections]
        └── .ember-selected-detail        [rendered only when selectedHotspot exists]
```

### Slots (placeholder → binding)

| Slot | Binding | Format |
|---|---|---|
| cluster count | `visibleHotspots.length` | zero-padded 2 digits, e.g. `03` |
| row name | `hotspot.name` | plain text |
| tier badge | `BADGE_OF[hotspot.confidence]` | `HIGH` / `MEDIUM` / `LOW` |
| row subtitle | `hotspot.municipality`, or `"<x> km from <place>"` when place search active | one line, ellipsis |
| row meta | `hotspot.acqTime`, `hotspot.count` | `HH:MM UTC · N detections` |
| row distance | `hotspot.proximityKm.toFixed(1)` | `x.x km` + `from town` |
| detail kicker | static | `SELECTED CLUSTER` |
| detail title | `selectedHotspot.name` + confidence | `HIGH confidence` |
| detail subtitle | `settlement` + `proximityKm` | `· x.x km from nearest settlement` |
| detail stats | thermal pixel total, sensor, brightness | `N thermal pixels`, `VIIRS · K` |
| detail coordinate | `POINT(lng lat) · SRID 4326` | PostGIS order, lng first |

### CSS contract

| Selector | Required declarations |
|---|---|
| `.ember-panel, .ember-map-layout` | `border: 1px solid var(--border)`, `border-radius: var(--radius-card)`, `background: var(--card)` |
| `.ember-map-layout` | `display: grid`, `grid-template-columns: minmax(0, 1fr) 300px`, `overflow: hidden`, `min-height: 404px` |
| `.ember-map-section .ember-map-layout` | `grid-template-columns: minmax(0, 1fr) 280px`, `min-height: 560px` |
| `.ember-incident-panel` | `display: flex`, `flex-direction: column`, `min-width: 0`, `border-left: 1px solid var(--border)` |
| `.ember-panel-header` | `padding: 15px 14px 12px` |
| `.ember-sort-label` | `font-family: var(--font-mono)`, `font-size: 7px`, top+bottom border, `padding: 7px 14px` |
| `.ember-incident-row` | `min-height: 68px`, bottom border, `padding: 8px 12px`, cursor pointer |
| `.ember-incident-row.active` | `box-shadow: inset 2px 0 var(--primary)` + accent background mix |
| `.ember-incident-name` | `font-size: 10px`, `font-weight: 650` |
| `.ember-incident-area, .ember-incident-meta` | ellipsis, `white-space: nowrap`, `min-width: 0` |
| `.ember-selected-detail` | `margin: auto 11px 11px`, `border-radius: var(--radius-card)` |

`overflow: hidden` on `.ember-map-layout` is required for child corner clipping. Do not remove without clipping each child.

### States

| State | Expected render |
|---|---|
| LIVE off (sample) | clusters from `lib/hotspots.ts` |
| LIVE on | clusters from `/api/firms/hotspots`, counts may differ per fetch |
| `clusteredHotspots: false` | `visibleHotspots` empty → `00` + `.ember-no-results`, no detail card |
| place search | rows filtered to bbox; subtitle uses `km from <place>` |
| `view = temperature` or `heatindex` | incident list replaced by `<ClimatePanel>`; `.ember-window-selector` above it stays rendered |

### Behaviour rules

1. Row click calls `setSelectedId(hotspot.id)`; does not move the map camera. Marker click is the only camera-affecting selection.
2. Ranking done in `clusterHotspots()` (`lib/firms-client.ts`): confidence desc, then `proximityKm` asc, then `count` desc. Panel must not re-sort.
3. Header count and list length must always agree.
4. Climate mode replaces the list, never the "SHOW ON MAP" selector.
5. Coordinates use `POINT(lng lat)`, not `lat, lng`.

---

## 2. Control sizing

Rule: every map-toolbar control and the page export action is **32px tall**.

| Control | Class | Outer | Inner |
|---|---|---|---|
| GLOBE/FLAT, NORMAL/REALISTIC, SAMPLE/LIVE, VIIRS/MODIS | `.ember-window-selector` | 32px | 24px |
| LOCATION, Layers | `.ember-layer-button` | 32px | — |
| Export briefing | `.ember-export-button` | 32px | — |
| page-heading segmented control | `.ember-page-actions .ember-window-selector` | 32px | 24px |

```css
.ember-map-heading-actions .ember-window-selector { height: 32px; align-items: center; }
.ember-map-heading-actions .ember-window-selector button { height: 24px; }
.ember-map-heading-actions .ember-layer-button { height: 32px; }
.ember-window-selector { display: inline-flex; gap: 2px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); padding: 3px; }
.ember-window-selector button { min-width: 39px; height: 24px; border: 0; border-radius: var(--radius-chip); background: transparent; color: var(--muted-foreground); font-family: var(--font-mono); font-size: 9px; cursor: pointer; }
.ember-window-selector button.selected { background: var(--accent); color: var(--accent-foreground); font-weight: 650; }
.ember-layer-button { height: 32px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); box-shadow: none; padding: 0 10px; gap: 6px; color: var(--muted-foreground); font-family: var(--font-mono); font-size: 9px; }
.ember-layer-button:hover { background: var(--accent); color: var(--accent-foreground); }
.ember-layer-button > svg { width: 12px; height: 12px; }
.ember-export-button { height: 32px; border-color: var(--border); border-radius: var(--radius-control); padding: 0 12px; gap: 6px; font-size: 10px; }
```

Constraints:

1. Do not size toolbar buttons with Tailwind `h-8` or shadcn `size="sm"` (36px). Use the classes above.
2. Standalone controls reuse `.ember-layer-button` so they match segmented-group chrome.
3. `.ember-map-heading-actions` and `.ember-map-control-group` must wrap (`flex-wrap: wrap`), never cause horizontal page scroll.
4. `@media (max-width: 680px)`: `.ember-layer-button` collapses to icon-only (`width: 32px; padding: 0; font-size: 0`). Every control that loses its text label must already have `aria-label` and `title`.
5. Page markdown must not introduce a new control height; extend one of the tables above.

---

## 3. Expanded map layout

### Contract

Toggle target is the layout, not the canvas:

```tsx
document.querySelector(".ember-map-section .ember-map-layout")?.classList.toggle("map-expanded")
```

This is why the incident panel stays visible in expand mode.

```css
.map-expanded { position: fixed !important; z-index: 60; inset: 18px; overflow-y: auto; min-height: 0 !important; border: 1px solid var(--border); border-radius: var(--radius-card); box-shadow: 0 12px 60px oklch(0.12 0.02 170 / 45%); }
.map-expanded .ember-map-canvas { height: 100%; min-height: 0; }
```

1. `min-height: 0 !important` is required. It overrides `.ember-map-section .ember-map-layout { min-height: 560px }` and the `min-height: 640px` rule at `min-width: 1600px`.
2. Grid columns stay intact in expand mode: canvas `1fr`, panel `280px`.
3. `z-index: 60` is above sidebar (`40`) and below nothing else in-page.

### Verification reference

Headless Chrome, 1400×1000:

| Element | Rect |
|---|---|
| expanded layout | 1364×964 at (18,18) |
| incident panel | 320×934 at (1047,33) |
| canvas | 1362×962 |
| `Priority clusters` text | present |

### Known limitations

1. No Escape handler, no backdrop. Only the same button closes it.
2. Icon stays `Maximize2`; `aria-label` stays `Expand map`; no `aria-pressed` state.
3. `≤1100px`: panel narrows with the responsive grid (270px at ≤1120px, 250px at ≤860px).
4. `≤680px`: `.ember-map-layout` becomes `flex-direction: column`; the panel stacks below the map inside the scrolling expanded box.
5. MapLibre resize is not called explicitly after toggling. Add `mapRef.current?.resize()` if canvas sizing breaks.

---

## Invariants (do not break)

1. `.map-expanded` is never applied to `.ember-map-canvas` alone.
2. Panel column width stays 280px in the map section at ≥1121px.
3. All toolbar controls 32px; no other heights.
4. `overflow: hidden` stays on `.ember-map-layout`.
5. Ranking lives in `clusterHotspots()`, not in JSX.
6. Coordinates print `POINT(lng lat)`.
7. Panel copy is placeholder; bind data, do not hardcode strings.
8. No new dependency, no new component, no theme token for these three changes.

## Acceptance checks

1. `npm run dev`, open `/`: map canvas and incident panel share one bordered card, panel on the right.
2. Compare control heights: GLOBE/FLAT, NORMAL/REALISTIC, LOCATION, Layers, Export briefing all visually 32px in a single row set.
3. Click expand: `Priority clusters` and the selected-cluster card remain visible at 1400×1000.
4. Narrow to 680px: no horizontal page scroll; LOCATION and Layers icon-only.
5. Clear search / disable clustered hot spots: panel shows `00` and the no-results message, not stale rows.
