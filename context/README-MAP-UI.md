# Map UI: incident panel, control sizing, expanded layout

Design notes for the Regional overview map on the Overview page (`/`). Three changes are documented here so future edits do not undo them:

1. the incident panel (cards) inside the map frame,
2. the one control height across the map toolbar and page actions,
3. the expand ("fullscreen") layout that keeps the incident panel visible.

Files touched: `app/index-client.tsx`, `app/globals.css`, `components/ember-map.tsx`, `components/climate-panel.tsx`.

---

## 1. Incident panel inside the map

> **This panel is a placeholder.** Nothing below is fixed copy. Cluster names, counts, distances, timestamps, sensor values and coordinates all change with the live feed, the selected day, the sensor filters, confidence filters and any place search. Treat the markup and classes as the contract; treat the text as sample output. When editing, keep the labelled slots and their data bindings, and free to swap the illustrative values.

### Placeholder template

```text
SHOW ON MAP                        <- shared selector, both modes
  Wildfires | Temperature | Heat index

Priority clusters  NN              <- cluster count, zero-padded
  Ranked by proximity & confidence

NEAREST SETTLEMENT                 <- sort label

<cluster name>        <tier>        <- repeated row, 0..n
<settlement>, <municipality>
<acquisition time>  ·  <n> detections
                    <x.x> km
                    from town

View all incidents

SELECTED CLUSTER                   <- only when a row is active
<cluster name>   <tier confidence>
<settlement> · <x.x> km from nearest settlement
<n> thermal pixels
<sensor> · <brightness> K
POINT(<lng> <lat>) · SRID 4326
```

Sample rendering used during the redesign, for reference only:

```text
Priority clusters 03 / Ranked by proximity & confidence
NEAREST SETTLEMENT
Malaybalay Ridge  HIGH   Malaybalay City, Bukidnon   05:22 UTC · 18 detections   1.8 km from town
Valencia Flat     HIGH   Valencia City, Bukidnon     04:55 UTC · 12 detections   2.7 km from town
Maramag Grove     MEDIUM Maramag, Bukidnon            05:22 UTC ·  9 detections   4.6 km from town
SELECTED CLUSTER
Maramag Grove  MEDIUM confidence
Upper Pulangi Watershed · 4.6 km from nearest settlement
9 thermal pixels / VIIRS · 316.5 K / POINT(125.0065 7.7583) · SRID 4326
```

Those values are not assertions about the data. They show which slot each value occupies.

### Structure

```
.ember-map-section
└── .ember-map-layout              card surface + 2-column grid
    ├── .ember-map-canvas          MapLibre canvas, overlays, legend, compass
    └── .ember-incident-panel      right column, 280px at >=1121px
        ├── .ember-window-selector   SHOW ON MAP: Wildfires / Temperature / Heat index
        ├── .ember-panel-header      "Priority clusters 03" + "Ranked by proximity & confidence"
        ├── .ember-sort-label        "NEAREST SETTLEMENT"
        ├── .ember-incident-list     .ember-incident-row per cluster
        ├── .ember-view-incidents    "View all incidents" -> /detections
        └── .ember-selected-detail   SELECTED CLUSTER block (selected row only)
```

`app/globals.css`:

| Rule | Purpose |
|---|---|
| `.ember-panel, .ember-map-layout` | one card surface: `1px solid var(--border)`, `var(--radius-card)`, `var(--card)` |
| `.ember-map-layout` | `grid-template-columns: minmax(0, 1fr) 300px`, `overflow: hidden`, `min-height: 404px` |
| `.ember-map-section .ember-map-layout` | `minmax(0, 1fr) 280px`, `min-height: 560px` |
| `.ember-incident-panel` | `flex` column, `min-width: 0`, `border-left: 1px solid var(--border)` |
| `.ember-selected-detail` | `margin: auto 11px 11px` — pins the selected-cluster card to the panel bottom |

`overflow: hidden` on the layout is what lets the panel and canvas share the rounded corner. Do not remove it without adding a clip to each child.

### What each label is bound to

Samples in the left column are placeholder output; the middle column is the real source.

| Text | Source | Notes |
|---|---|---|
| `Priority clusters` + `03` | `visibleHotspots.length`, zero-padded to two digits | reflects current search / day / sensor filters |
| `Ranked by proximity & confidence` | static explanation | ranking happens in `clusterHotspots()` in `lib/firms-client.ts` (confidence first, then `proximityKm`, then pixel count) |
| Cluster name, `HIGH` / `MEDIUM` badge | `hotspot.name`, `BADGE_OF[hotspot.confidence]` | badge tone: `.confidence-high` vs `.confidence-nominal` |
| `Malaybalay City, Bukidnon` | `hotspot.municipality` | becomes `"<x> km from <place>"` when a place search is active |
| `05:22 UTC · 18 detections` | `hotspot.acqTime`, `hotspot.count` | monospace `.ember-incident-meta` |
| `1.8 km` / `from town` | `hotspot.proximityKm` | nearest settlement distance, not distance from map centre |
| `SELECTED CLUSTER` detail | `selectedHotspot` | name, confidence, settlement, thermal-pixel total, sensor + brightness, `POINT(lng lat) · SRID 4326` |

Coordinates print as `POINT(<lng> <lat>)`, the PostGIS order, not the `lat, lng` order used elsewhere in the UI. Keep it that way if the text is meant to be pasted into SQL.

### Panel states

| State | What renders |
|---|---|
| Sample data (LIVE off) | illustrative clusters from `lib/hotspots.ts`; fixed text like `05:22 UTC` |
| Live feed | clusters from `/api/firms/hotspots`, values differ per fetch |
| Clustered hot spots layer off | `visibleHotspots` empties; `.ember-no-results` and `00` |
| Place search active | row subtitle switches to `km from <place>`, list narrows to that bbox |
| Climate mode | the whole list is replaced by `ClimatePanel`; only the selector above stays |

### Interaction rules

- A row click sets `selectedId`; the active row gets `.active` with an inset 2px left bar, and the detail card re-renders. No map fly-to on row click (only the map's own marker click selects).
- Empty filter result renders `.ember-no-results` instead of an empty list, but the header count still shows `00`.
- Selecting `Temperature` or `Heat index` swaps the *entire* list for `ClimatePanel`, keeping the "SHOW ON MAP" selector above it. That selector is shared by both modes, so any change to it applies to both.
- Header and row sizes are fixed on purpose: `min-height: 68px` row, `15px 14px 12px` header, `7px` mono labels. Longer settlement names ellipsis via `.ember-incident-area`.

---

## 2. One control height

Every toolbar control is **32px tall**. The page heading's export action is also 32px so the two rows read as the same system.

| Control | Class | Height |
|---|---|---|
| GLOBE / FLAT, NORMAL / REALISTIC, SAMPLE / LIVE, VIIRS / MODIS | `.ember-window-selector` (outer) | 32px |
| — inner button | `.ember-window-selector button` | 24px (`26px` inside `.ember-page-actions` before the change) |
| LOCATION, Layers | `.ember-layer-button` | 32px |
| Export briefing | `.ember-export-button` | 32px |

`app/globals.css`:

```css
/* One control height across the map toolbar. */
.ember-map-heading-actions .ember-window-selector { height: 32px; align-items: center; }
.ember-map-heading-actions .ember-window-selector button { height: 24px; }
.ember-map-heading-actions .ember-layer-button { height: 32px; }
```

`LOCATION` and `Layers` are standalone `Button`s, not segmented groups, so they reuse `.ember-layer-button` to look like the group chrome instead of the shadcn `size="sm"` default:

```css
.ember-layer-button {
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--card);
  box-shadow: none;
  padding: 0 10px;
  gap: 6px;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 9px;
}
.ember-layer-button:hover { background: var(--accent); color: var(--accent-foreground); }
.ember-layer-button > svg { width: 12px; height: 12px; }
```

Rules:

- New map-toolbar button: give it 32px height, `var(--radius-control)`, `1px solid var(--border)`, `var(--card)` background, no shadow. Segmented options use `.ember-window-selector` + `selected`.
- Do not use Tailwind `h-8` or `size="sm"` alone; `size="sm"` is 36px and will drift.
- Below 680px, `.ember-layer-button` becomes icon-only (`width: 32px; padding: 0; font-size: 0`). Any new text-only control added there must provide an `aria-label`, or it becomes unreadable to assistive tech.
- `.ember-map-heading-actions` wraps: controls stay on one line when they fit and wrap to a second line instead of scrolling the page horizontally. Group clustering is `.ember-map-control-group`, with a left divider between groups.

---

## 3. Expanding the map

### Behaviour

The expand button toggles `.map-expanded` on the **whole map layout**, not just the canvas:

```tsx
document.querySelector(".ember-map-section .ember-map-layout")?.classList.toggle("map-expanded")
```

This is the change that keeps the incident panel on screen. Expanding only `.ember-map-canvas` left the panel behind in the normal page flow, so fullscreen showed the map and hid the cluster list.

```css
.map-expanded {
  position: fixed !important;
  z-index: 60;
  inset: 18px;
  overflow-y: auto;
  min-height: 0 !important;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: 0 12px 60px oklch(0.12 0.02 170 / 45%);
}
.map-expanded .ember-map-canvas { height: 100%; min-height: 0; }
```

- `min-height: 0 !important` defeats `.ember-map-section .ember-map-layout { min-height: 560px }`; without it the fixed box cannot shrink on short viewports and the panel scrolls out of reach.
- The canvas fills the layout row (`height: 100%`), so the panel's 280px column controls the remaining width.
- Measured at 1400×1000: layout 1364×964 at (18,18), incident panel 320×934 at top-right, `Priority clusters` present.

### Known limits

- No Escape key handler and no backdrop; you close by pressing the same button. The icon does not switch to a collapse glyph, and `aria-label` stays "Expand map". Both are unfixed.
- Below 1101px the layout keeps its responsive grid (270px panel, then 250px at 860px), so the expanded panel is narrower. At 680px `.ember-map-layout` becomes `flex-direction: column`, and the panel sits **below** the map inside the scrolling expanded box instead of beside it.
- Above 1600px the layout grows to `min-height: 640px`; the expanded box still wins because of `min-height: 0`.
- MapLibre needs a resize after the toggle to avoid a stale canvas size; today it survives because the container size change happens synchronously with the class toggle. If resize bugs appear, call `mapRef.current?.resize()` after toggling.

---

## Change checklist

1. New panel content goes inside `.ember-incident-panel`; do not widen it past 280px in the map section without re-checking the 860px and 680px breakpoints. Panel copy is placeholder text — change the data binding, not the sample wording.
2. Any new toolbar control: 32px, `.ember-layer-button` or `.ember-window-selector`.
3. Never point `.map-expanded` at `.ember-map-canvas` again; the panel must travel with the map.
4. Verify with: `npm run dev`, open `/`, press expand, confirm `Priority clusters` is visible and the page does not scroll horizontally.
