# PROMPT: Responsive Regional-overview map (EMBER)

Copy the block below into a design/coding prompt. It describes how the map on `/` behaves at every screen width.

---

## Role and goal

You are implementing the **Regional overview** map on the Overview page of EMBER (Next.js App Router + Tailwind v4).
Goal: one map component that reads as "a maps app" on a phone and as "a map with a floating detail panel" on a desktop, with no horizontal page scroll at any width and no control jumping between breakpoints.

Files: `app/index-client.tsx` (markup + state), `app/globals.css` (all layout rules), `components/ember-map.tsx` (MapLibre map), `components/climate-panel.tsx`.

Treat the DOM structure, class names and numeric values in this prompt as a contract. All cluster names, counts, distances, timestamps and coordinates are **variable data** — bind them, never hardcode them.

## Screen anatomy

```
.ember-map-section
├── .ember-map-screen            (mobile only: one-viewport wrapper)
│   ├── .ember-section-heading   (h2 "Regional overview" + place name)
│   │   └── .ember-map-heading-actions   (GLOBE/FLAT, NORMAL/REALISTIC, LOCATION, Layers, SAMPLE/LIVE, VIIRS/MODIS)
│   └── .ember-map-layout
│       ├── .ember-map-canvas    (MapLibre + absolutely positioned overlays)
│       │   ├── .ember-map-search
│       │   ├── .ember-map-tools      (+ − locate, .ember-fullscreen)
│       │   ├── .ember-map-legend
│       │   ├── .ember-map-compass
│       │   └── .ember-layer-popover
│       └── .ember-incident-panel  or  <ClimatePanel>
└── .ember-timeline              (7-day timeline, normal page flow)
```

## Layout per width

### Desktop — `min-width: 1101px`

- `.ember-map-layout` is `display: block; position: relative`; the canvas fills it (`min-height: clamp(560px, 72vh, 720px)`).
- `.ember-incident-panel` floats over the map: `position: absolute; top/right/bottom: 14px; width: 320px`, card background at 94% opacity, `backdrop-filter: blur(14px)`, `border-radius: var(--radius-card)`, `overflow-y: auto`, thin scrollbar.
- Control row sits to the right of the heading; controls never wrap.
- Fullscreen button (`.ember-fullscreen`) visible bottom-right.

### Tablet — `681px … 1100px`

- `.ember-map-layout` returns to `display: grid; grid-template-columns: minmax(0, 1fr) 270px` (250px at ≤860px) and a fixed `height: clamp(560px, 78vh, 820px)` so a long fire list scrolls inside the panel instead of stretching the map.
- Panel is a column inside the card, `border-left: 1px solid var(--border)`.

### Mobile — `max-width: 680px`

- `.ember-map-screen` owns exactly one viewport: `display: flex; height: calc(100dvh - 52px); flex-direction: column`. The page's horizontal padding is dropped inside it so the map runs edge to edge.
- Heading becomes two stacked rows: title block, then **one** control row: `flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none` plus a right-edge fade mask so the cut-off is discoverable. No page-level horizontal scroll.
- `.ember-map-layout` is `position: relative; display: block; flex: 1 1 auto; min-height: 0; margin: 0 -15px; border-left/right: 0; border-radius: 0`. The canvas is `position: absolute; inset: 0`, so the map literally fills the remaining screen.
- `.ember-incident-panel` becomes a **bottom sheet**: `position: absolute; z-index: 11; bottom: 0; left/right: 0; border-radius: 14px 14px 0 0; background: var(--card); box-shadow: 0 -12px 32px …`; `.ember-panel-header` is `position: sticky; top: 0`.
  - Default state is **collapsed** (`.clusters-collapsed = !climate && !clustersOpen`): `max-height: none` and every child except `.ember-panel-header` is `display: none`, so only a ~60px title bar overlays the map.
  - Expanded: `max-height: 62%; overflow-y: auto; overscroll-behavior: contain`.
  - The `.ember-sheet-toggle` chevron in the header flips `clustersOpen` (`aria-expanded`), rotates 180° when open, and is `display: none` above 680px.
  - Climate view never collapses — that panel has no header, so the collapsed class is not applied.
- Overlay positions: search `top: 10px; left/right: 10px` full width; zoom tools `top: 56px; right: 10px`; legend `top: 56px; left: 10px; max-width: calc(100% - 70px)`; layer popover `top: 54px; right: 10px; max-height: 46%`. Compass and fullscreen are `display: none`.
- MapLibre attribution stays a compact chip above the sheet (bottom offset `calc(62% + 6px)` open, `68px` collapsed via `:has()`); the text expands only when the chip is tapped.
- `.ember-timeline` stays below `.ember-map-screen`, in normal page flow — it is never part of the fixed-height screen.

## Panel content contract

Panel sections, in order: `.ember-window-selector` (SHOW ON MAP: Wildfires / Temperature / Heat index), `.ember-panel-header` (title + zero-padded 2-digit count, "Ranked by proximity & confidence"), `.ember-sort-label` (NEAREST SETTLEMENT), `.ember-incident-list` of `.ember-incident-row` (indicator icon, name + tier badge `HIGH|MEDIUM|LOW`, area line, `HH:MM UTC · N detections`, `x.x km` + `from town`), `.ember-view-incidents` link, then `.ember-selected-detail` (kicker `SELECTED CLUSTER`, name + confidence, `· x.x km from nearest settlement`, thermal pixel count, sensor + brightness, `POINT(lng lat) · SRID 4326`).

Rules:

1. Row click selects (`setSelectedId`); it does not move the camera — only a marker click does.
2. Ranking comes from `clusterHotspots()` (confidence desc, `proximityKm` asc, `count` desc). Never re-sort in JSX.
3. Header count always equals the rendered row count (`00` + `.ember-no-results` when empty).
4. Long area/meta lines use `white-space: nowrap` + ellipsis + `min-width: 0`; no row grows taller to fit text.
5. Every value in the panel is bound data (live FIRMS or the sample set), never literal copy.

## Control sizing contract

Every map-toolbar control and the page export action is **32px tall** (inner segment buttons 24px). Use `.ember-window-selector` / `.ember-layer-button` / `.ember-export-button`; never Tailwind `h-8` or shadcn `size="sm"`.

At ≤680px text labels are dropped (`font-size: 0; width: 32px`) — every such control must already have both `aria-label` and `title`.

## Expanded map

The toggle adds `.map-expanded` to `.ember-map-layout` (never to `.ember-map-canvas` alone), which makes it `position: fixed; inset: 18px; z-index: 60; overflow-y: auto; min-height: 0 !important` so the panel stays visible alongside the bigger canvas. Keep grid columns intact in that state.

## Do not break

1. `overflow: hidden` stays on `.ember-map-layout` (child corner clipping).
2. Panel column is 280px in the map section at ≥1121px.
3. All toolbar controls stay 32px; no new height per breakpoint.
4. Ranking logic stays in `clusterHotspots()`; coordinates print `POINT(lng lat)`.
5. No horizontal page scroll at 320 / 360 / 390 / 680 / 860 / 1120 / 1400px.
6. No new dependency, component or theme token for this work.

## Acceptance checks

| Width | Expect |
|---|---|
| 1400 | canvas ≈ 1081×720, floating panel 320px wide with internal scroll, 6+ markers, expanded mode still shows the panel |
| 860–1120 | two-column card, panel 250–270px, card height `clamp(560px, 78vh, 820px)` |
| 390 | `document.scrollWidth === 390`; canvas ≈ 390×700; sheet collapsed to a ~60px title bar; chevron expands it to 62% with its own scroll; attribution above the sheet; no compass, no fullscreen |
| 320/360 | same as 390, control row scrolls horizontally, nothing overflows the page |

---

### Known limitations (state them, do not silently fix)

1. Expand mode has no Escape handler and no backdrop; only the same button closes it, the icon stays `Maximize2`, no `aria-pressed`.
2. `mapRef.current?.resize()` is not called after toggling expand — add it if canvas sizing ever breaks.
3. Mobile sheet state (`clustersOpen`) is not persisted and resets on reload.
