"use client";

import type React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Droplets, MapPin, Thermometer, Wind } from "lucide-react";
import type { HeatLevel } from "@/lib/action-guide";
import type { Conditions } from "@/lib/conditions";
import type { GuidePlace } from "@/lib/geocode";
import { HEAT_SCALE, HEAT_TICKS, heatColor } from "@/lib/heat-grid";
import { HEAT_BADGE } from "@/components/smart-action-guide";

/** Color scale bar matching the "Max Heat Index" reference legend. */
export function HeatScaleLegend({ title, dark = false }: { title: string; dark?: boolean }) {
  const swatches = HEAT_SCALE.map(([, color]) => color);
  return (
    <div role="img" aria-label={`${title}: color scale from 0 to above 50 °C`} style={{ fontSize: "9px", color: dark ? "oklch(0.97 0.01 90)" : undefined }}>
      <div style={{ fontWeight: 700, textAlign: "center", marginBottom: "4px" }}>{title}</div>
      <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", border: "1px solid rgb(0 0 0 / 35%)" }}>
        {swatches.map((c) => (
          <span key={c} style={{ flex: 1, background: c }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", marginTop: "3px" }}>
        {HEAT_TICKS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: "2px", opacity: 0.8 }}>°C</div>
    </div>
  );
}

const SCALE_MAX = 55; // the legend runs 0 → 50+; 55 gives the dark-red "above 50" band some room

/**
 * The map legend as a slider: drag the two handles along the full color scale (each legend temperature
 * marked) and only areas inside that range stay covered on the map.
 */
export function HeatScaleSlider({
  title,
  range,
  domain,
  onRangeChange,
}: {
  title: string;
  range: [number, number] | null;
  domain: [number, number] | null; // what the area around the place actually has
  onRangeChange: (range: [number, number]) => void;
}) {
  const pct = (v: number) => `${(Math.max(0, Math.min(SCALE_MAX, v)) / SCALE_MAX) * 100}%`;
  // Hard color stops so each band reads exactly like the reference legend.
  const bands = HEAT_SCALE.map(([min, color], i) => {
    const from = pct(Math.max(0, min));
    const next = HEAT_SCALE[i + 1]?.[0] ?? SCALE_MAX;
    return `${color} ${from}, ${color} ${pct(next)}`;
  }).join(", ");
  const thumb: React.CSSProperties = {
    display: "block",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#fff",
    border: "2px solid #111",
    boxShadow: "0 1px 5px rgb(0 0 0 / 45%)",
    cursor: "grab",
  };
  const clamp = (v: number) => (domain ? Math.max(domain[0], Math.min(domain[1], v)) : v);
  return (
    <div style={{ fontSize: "9px", color: "oklch(0.97 0.01 90)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: "6px" }}>
        <span>{title}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>{range ? `${range[0]}–${range[1]}°C` : "loading…"}</span>
      </div>
      <SliderPrimitive.Root
        min={0}
        max={SCALE_MAX}
        step={1}
        minStepsBetweenThumbs={0}
        value={range ?? [0, SCALE_MAX]}
        disabled={!range}
        // Handles stay within the temperatures that actually occur around this place.
        onValueChange={(v) => onRangeChange([clamp(v[0]!), clamp(v[1]!)])}
        aria-label={`${title} range`}
        style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: "24px", touchAction: "none", userSelect: "none" }}
      >
        <SliderPrimitive.Track
          style={{ position: "relative", flexGrow: 1, height: "12px", borderRadius: "6px", background: `linear-gradient(to right, ${bands})`, border: "1px solid rgb(0 0 0 / 45%)" }}
        >
          {domain && (
            // Faint marker of the temperatures present around this place.
            <span
              aria-hidden
              style={{ position: "absolute", top: "-4px", bottom: "-4px", left: pct(domain[0]), right: `calc(100% - ${pct(domain[1])})`, border: "1px dashed rgb(255 255 255 / 55%)", borderRadius: "4px" }}
            />
          )}
          <SliderPrimitive.Range style={{ position: "absolute", height: "100%", borderRadius: "6px", boxShadow: "0 0 0 2px #fff" }} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={`Lowest ${title.toLowerCase()}`} style={thumb} />
        <SliderPrimitive.Thumb aria-label={`Highest ${title.toLowerCase()}`} style={thumb} />
      </SliderPrimitive.Root>
      <div style={{ position: "relative", height: "12px", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
        {HEAT_TICKS.map((t) => (
          <button
            type="button"
            key={t}
            // Click a legend temperature to jump the nearest handle there.
            onClick={() => {
              if (!range) return;
              const v = clamp(t);
              onRangeChange(Math.abs(v - range[0]) <= Math.abs(v - range[1]) ? [Math.min(v, range[1]), range[1]] : [range[0], Math.max(v, range[0])]);
            }}
            style={{ position: "absolute", left: pct(t), transform: "translateX(-50%)", color: "inherit", fontSize: "9px", cursor: "pointer" }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: "2px", opacity: 0.8 }}>°C · dashed box = temperatures around this place</div>
    </div>
  );
}

/** Full-width two-handle slider: pick a °C range; the map covers only areas inside it. */
function RangePicker({
  what,
  domain,
  range,
  onRangeChange,
  coverage,
  loading,
  coverageOf,
}: {
  what: string;
  domain: [number, number] | null;
  range: [number, number] | null;
  onRangeChange: (range: [number, number]) => void;
  coverage: number | null;
  loading: boolean;
  coverageOf: string | null; // name of the place the areas are clipped to
}) {
  if (!domain || !range) {
    return (
      <p style={{ marginTop: "14px", color: "var(--muted-foreground)" }}>
        {loading ? "Loading the area around this place…" : "Area data is unavailable right now."}
      </p>
    );
  }
  const [min, max] = domain;
  // Track painted with the legend colors across this place's own min–max.
  const stops = Array.from({ length: 11 }, (_, k) => {
    const v = min + ((max - min) * k) / 10;
    return `${heatColor(v)} ${k * 10}%`;
  }).join(", ");
  const full = range[0] === min && range[1] === max;
  const thumb: React.CSSProperties = {
    display: "block",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "var(--background)",
    border: "2px solid var(--foreground)",
    boxShadow: "0 1px 4px rgb(0 0 0 / 30%)",
    cursor: "grab",
  };
  return (
    <div style={{ marginTop: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontWeight: 700 }}>
          Show areas {range[0]}–{range[1]}°C
        </span>
        {!full && (
          <button
            type="button"
            onClick={() => onRangeChange([min, max])}
            style={{ fontSize: "11px", textDecoration: "underline", color: "var(--muted-foreground)" }}
          >
            Show all
          </button>
        )}
      </div>
      <SliderPrimitive.Root
        min={min}
        max={max}
        step={1}
        minStepsBetweenThumbs={0}
        value={range}
        onValueChange={(v) => onRangeChange([v[0]!, v[1]!])}
        aria-label={`Select ${what} range`}
        style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: "28px", marginTop: "8px", touchAction: "none", userSelect: "none" }}
      >
        <SliderPrimitive.Track
          style={{ position: "relative", flexGrow: 1, height: "10px", borderRadius: "5px", background: `linear-gradient(to right, ${stops})`, border: "1px solid rgb(0 0 0 / 25%)" }}
        >
          <SliderPrimitive.Range style={{ position: "absolute", height: "100%", borderRadius: "5px", boxShadow: "0 0 0 2px var(--foreground)" }} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={`Lowest ${what}`} style={thumb} />
        <SliderPrimitive.Thumb aria-label={`Highest ${what}`} style={thumb} />
      </SliderPrimitive.Root>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--muted-foreground)" }}>
        <span>{min}°C</span>
        <span>{max}°C</span>
      </div>
      <p style={{ marginTop: "6px", fontSize: "11px" }}>
        {coverage === null
          ? ""
          : coverage === 0
            ? `No part of ${coverageOf ?? "the area around this place"} has a ${what} in this range.`
            : `Covers about ${Math.max(1, Math.round(coverage * 100))}% of ${coverageOf ?? "the ~100 km area around this place"}.`}
      </p>
    </div>
  );
}

function Big({ value, label }: { value: number | null; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "10px 0 6px" }}>
      <span
        aria-hidden
        style={{
          width: "14px",
          height: "40px",
          borderRadius: "4px",
          background: value === null ? "var(--muted)" : heatColor(value),
          border: "1px solid rgb(0 0 0 / 25%)",
        }}
      />
      <div>
        <div style={{ fontSize: "32px", fontWeight: 700, lineHeight: 1 }}>{value === null ? "…" : `${Math.round(value)}°C`}</div>
        <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{label}</div>
      </div>
    </div>
  );
}

export function ClimatePanel({
  view,
  place,
  conditions,
  error,
  heatIndexNow,
  heat,
  domain,
  range,
  onRangeChange,
  coverage,
  areasLoading,
  coverageOf,
}: {
  view: "temperature" | "heatindex";
  place: GuidePlace;
  conditions: Conditions | undefined;
  error: boolean;
  heatIndexNow: number | null;
  heat: HeatLevel;
  domain: [number, number] | null;
  range: [number, number] | null;
  onRangeChange: (range: [number, number]) => void;
  coverage: number | null;
  areasLoading: boolean;
  coverageOf: string | null;
}) {
  const badge = HEAT_BADGE[heat];
  const maxHi = conditions?.maxHeatIndexC ?? null;
  return (
    <div style={{ padding: "14px 16px", fontSize: "12px" }} aria-live="polite">
      <div className="ember-detail-kicker">
        {view === "temperature" ? <Thermometer size={13} /> : <Droplets size={13} />}{" "}
        {view === "temperature" ? "TEMPERATURE" : "HEAT INDEX"}
      </div>
      <div style={{ fontWeight: 700, fontSize: "14px", marginTop: "6px", display: "flex", gap: "5px", alignItems: "center" }}>
        <MapPin size={14} /> {place.name}
      </div>
      <div style={{ color: "var(--muted-foreground)", fontSize: "11px" }}>{place.region}</div>

      {error ? (
        <p style={{ marginTop: "10px" }}>Weather data is unavailable right now.</p>
      ) : view === "temperature" ? (
        <>
          <Big value={conditions?.tempC ?? null} label="Air temperature now" />
          <ul style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
            <li>
              <Droplets size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Humidity{" "}
              <b>{conditions?.humidity != null ? `${Math.round(conditions.humidity)}%` : "…"}</b>
            </li>
            <li>
              <Wind size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Wind{" "}
              <b>{conditions?.windKmh != null ? `${Math.round(conditions.windKmh)} km/h` : "…"}</b>
            </li>
            <li>
              Feels like (heat index) <b>{heatIndexNow !== null ? `${Math.round(heatIndexNow)}°C` : "…"}</b>
            </li>
          </ul>
        </>
      ) : (
        <>
          <Big value={maxHi} label="Max heat index today" />
          <ul style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
            <li>
              Right now <b>{heatIndexNow !== null ? `${Math.round(heatIndexNow)}°C` : "…"}</b>
            </li>
            <li>
              Level{" "}
              <b style={{ color: badge.color === "var(--muted-foreground)" ? undefined : badge.color }}>
                {badge.icon} {heat === "None" ? "No heat warning" : heat}
              </b>{" "}
              <span style={{ color: "var(--muted-foreground)" }}>(PAGASA, current)</span>
            </li>
            <li>
              Temperature <b>{conditions?.tempC != null ? `${Math.round(conditions.tempC)}°C` : "…"}</b> · Humidity{" "}
              <b>{conditions?.humidity != null ? `${Math.round(conditions.humidity)}%` : "…"}</b>
            </li>
          </ul>
        </>
      )}

      <RangePicker
        what={view === "temperature" ? "temperature" : "max heat index"}
        domain={domain}
        range={range}
        onRangeChange={onRangeChange}
        coverage={coverage}
        loading={areasLoading}
        coverageOf={coverageOf}
      />

      <div style={{ marginTop: "16px" }}>
        <HeatScaleLegend title={view === "temperature" ? "Temperature" : "Max Heat Index"} />
      </div>
      <p style={{ marginTop: "12px", fontSize: "10px", color: "var(--muted-foreground)" }}>
        Click anywhere on the map, or search a place, to check another spot. Colored areas cover only the selected city or municipality (its dashed border), or the surrounding ~100 km where no border is found.
        Source: Open-Meteo.
      </p>
    </div>
  );
}
