"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  LocateFixed,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import type { HistoryPayload } from "@/app/api/fire-history/route";
import { EmberShell } from "@/components/ember-shell";
import { PlaceCombobox } from "@/components/place-combobox";
import {
  ACTIVITY,
  MONTHS,
  MONTH_NAMES,
  STATUS_LABEL,
  activityLevel,
  addDays,
  anomaly,
  climatology,
  daysBetween,
  meanStd,
  monthTakeaway,
  monthlyTotals,
  otherYears,
  peakSeason,
  rangeStats,
  sameDatesOtherYears,
  vsNormal,
  type DailyCount,
} from "@/lib/burn-calendar";
import { DEFAULT_PLACE, type GuidePlace } from "@/lib/geocode";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BIG_TEXT_KEY = "ember.bigText";
const PLACE_KEY = "ember.calendar.place";
const OVERVIEW_KEY = "ember.overview.v1"; // start on the place picked on the Overview map, if any

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const longDate = (d: string, withYear = true) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const levelName = (l: number) => (l === 0 ? "No fires" : `${ACTIVITY[l]!.label} Activity`);
const fires = (n: number) => `${n.toLocaleString()} fire${n === 1 ? "" : "s"}`;

// What a period like this means in everyday terms (shown with the answer, read aloud too).
const ADVICE = [
  "No fires were spotted by the satellite. A calm period.",
  "A little burning was seen. Stay alert on dry, windy days.",
  "Burning is common in periods like this. Avoid open burning when it is windy.",
  "This was a busy fire period. In times like this, avoid open burning and keep water nearby.",
];

type HistoryState =
  | { status: "loading"; progress: number; message: string }
  | { status: "error"; message: string }
  | ({ status: "ready" } & HistoryPayload);

const validPlace = (p: unknown): p is GuidePlace =>
  !!p &&
  typeof (p as GuidePlace).name === "string" &&
  Number.isFinite((p as GuidePlace).lat) &&
  Number.isFinite((p as GuidePlace).lng) &&
  ((p as GuidePlace).osm === undefined || /^[NWR]\d{1,12}$/.test((p as GuidePlace).osm!));

async function fetchHistory(place: GuidePlace): Promise<HistoryState> {
  const qs = new URLSearchParams({ lat: String(place.lat), lng: String(place.lng), name: place.name });
  if (place.osm) {
    qs.set("osm", place.osm);
    qs.set("kind", place.kind ?? "");
  }
  const res = await fetch(`/api/fire-history?${qs}`);
  return (await res.json()) as HistoryState;
}

export function CalendarPage() {
  const [place, setPlace] = useState<GuidePlace | null>(null);
  const [search, setSearch] = useState("");
  const [analyst, setAnalyst] = useState(false); // Simple view hides raw counts on the calendar; Analyst shows them
  const [bigText, setBigText] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);

  // Remembered on this device: the calendar's place (else the Overview's), and the text size.
  useEffect(() => {
    let start: GuidePlace = DEFAULT_PLACE;
    try {
      const own = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
      const overview = (JSON.parse(localStorage.getItem(OVERVIEW_KEY) ?? "null") as { place?: unknown } | null)?.place;
      start = validPlace(own) ? own : validPlace(overview) ? overview : DEFAULT_PLACE;
      setBigText(localStorage.getItem(BIG_TEXT_KEY) === "1");
    } catch {
      /* storage blocked: defaults */
    }
    setPlace(start);
  }, []);
  useEffect(() => {
    if (!place) return;
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    } catch {
      /* not remembered this time */
    }
  }, [place]);
  // Bigger text: scales the whole app (everything is sized in rem).
  useEffect(() => {
    document.documentElement.style.fontSize = bigText ? "118.75%" : "";
    try {
      localStorage.setItem(BIG_TEXT_KEY, bigText ? "1" : "0");
    } catch {
      /* still applies for this visit */
    }
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [bigText]);

  const placeKey = place ? (place.osm ?? `${place.lat.toFixed(3)},${place.lng.toFixed(3)}`) : "";
  const history = useQuery({
    queryKey: ["fire-history", placeKey],
    queryFn: () => fetchHistory(place!),
    enabled: !!place,
    // The server builds the history in the background; ask again every few seconds until it's ready.
    refetchInterval: (q) => (q.state.data?.status === "loading" ? 2500 : false),
    staleTime: 10 * 60 * 1000,
  });
  const data = history.data;

  const locateMe = () => {
    if (!navigator.geolocation) return setLocating("This device can't share its location.");
    setLocating("Finding where you are…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(null);
        setPlace({ name: "My location", region: "", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocating("We couldn't get your location. Please type your town in the search box instead."),
      { timeout: 15_000 },
    );
  };

  return (
    <EmberShell active="calendar" title="Burn calendar">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> SEASONALITY
          </div>
          <h1>
            Burning calendar<span>.</span>
          </h1>
          <p>Real fire records from NASA satellites for any place. Pick a day or a few dates to see what happened, in plain words.</p>
        </div>
        <div className="ember-page-actions no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={bigText}
            onClick={() => setBigText(!bigText)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium ${bigText ? "bg-accent text-accent-foreground" : "bg-card"}`}
          >
            <Type size={16} aria-hidden /> {bigText ? "Normal text" : "Bigger text"}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium">
            <Printer size={16} aria-hidden /> Print
          </button>
          <div className="ember-window-selector" role="radiogroup" aria-label="Level of detail">
            {(
              [
                [false, "Simple view"],
                [true, "Analyst view"],
              ] as const
            ).map(([on, label]) => (
              <button type="button" role="radio" key={label} aria-checked={analyst === on} className={`px-2 ${analyst === on ? "selected" : ""}`} onClick={() => setAnalyst(on)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Which place: the same search as the Overview map */}
      <section className="no-print rounded-md border border-border bg-card p-4" aria-label="Choose a place">
        <p className="text-sm font-semibold">Which place do you want to look at?</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PlaceCombobox
            className="relative flex h-12 min-w-0 flex-1 basis-72 items-center gap-2 rounded-md border border-border bg-background px-3 [&>input]:h-full [&>input]:min-w-0 [&>input]:flex-1 [&>input]:bg-transparent [&>input]:text-base [&>input]:outline-none"
            label="Search for a town, city, province or country"
            placeholder="Type a town, city, province or country…"
            value={search}
            onChange={setSearch}
            onPick={(p) => {
              setSearch("");
              setLocating(null);
              setPlace(p);
            }}
            before={<Search size={18} className="shrink-0 text-muted-foreground" aria-hidden />}
            after={
              search ? (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="grid size-8 place-items-center rounded">
                  <X size={16} />
                </button>
              ) : null
            }
          />
          <button type="button" onClick={locateMe} className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-background px-4 text-base font-medium">
            <LocateFixed size={18} aria-hidden /> Use my location
          </button>
        </div>
        {locating && <p className="mt-2 text-sm text-muted-foreground">{locating}</p>}
        {place && (
          <p className="mt-3 flex items-center gap-2 text-base">
            <MapPin size={18} className="shrink-0 text-[#c2410c]" aria-hidden />
            <span>
              Showing <b>{data?.status === "ready" ? data.area.name : place.name}</b>
              {data?.status === "ready" && data.area.kind ? ` (${data.area.kind}${data.area.country && data.area.name !== data.area.country ? `, ${data.area.country}` : ""})` : place.region ? ` · ${place.region}` : ""}
            </span>
          </p>
        )}
      </section>

      {!place || !data || data.status === "loading" ? (
        <LoadingPanel name={place?.name ?? "your place"} state={data?.status === "loading" ? data : null} failed={history.isError} onRetry={() => history.refetch()} />
      ) : data.status === "error" ? (
        <div role="alert" className="mt-4 rounded-md border border-[#a8231b]/50 bg-[#a8231b]/10 p-4 text-base">
          <p className="font-semibold">We couldn&apos;t get the fire records right now.</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.message}</p>
          <button type="button" onClick={() => history.refetch()} className="mt-3 inline-flex h-11 items-center gap-2 rounded-md bg-[#c2410c] px-4 font-semibold text-white">
            <RefreshCw size={18} aria-hidden /> Try again
          </button>
        </div>
      ) : (
        <CalendarBody key={placeKey} h={data} analyst={analyst} />
      )}
    </EmberShell>
  );
}

function LoadingPanel({ name, state, failed, onRetry }: { name: string; state: { progress: number; message: string } | null; failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <div role="alert" className="mt-4 rounded-md border border-border bg-card p-4">
        <p className="text-base font-semibold">We couldn&apos;t reach the server.</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex h-11 items-center gap-2 rounded-md bg-[#c2410c] px-4 font-semibold text-white">
          <RefreshCw size={18} aria-hidden /> Try again
        </button>
      </div>
    );
  }
  const pct = state?.progress ?? 0;
  return (
    <div role="status" aria-live="polite" className="mt-4 rounded-md border border-border bg-card p-6">
      <p className="text-lg font-semibold">Getting NASA fire records for {name}…</p>
      <p className="mt-1 text-sm text-muted-foreground">{state?.message ?? "Starting…"}</p>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-[#ee8a26] transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">The first time for a new place can take up to a minute. After that it opens straight away.</p>
    </div>
  );
}

type Tip = { text: string; x: number; y: number };
type Range = { from: string; to: string };

/** Everything the calendar derives from one place's history. */
function useModel(h: HistoryPayload) {
  return useMemo(() => {
    const days: DailyCount[] = h.counts.map((count, i) => ({ date: addDays(h.firstDate, i), count }));
    const index = new Map(days.map((d) => [d.date, d.count]));
    const monthly = monthlyTotals(days);
    const years = [...monthly.keys()].sort((a, b) => a - b);
    // Scale: a high day = the 95th percentile of days that had any fire, so busy places and quiet places both read well.
    const nonzero = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
    const dayScale = Math.max(1, nonzero[Math.floor(nonzero.length * 0.95)] ?? 1);
    const monthScale = Math.max(1, ...[...monthly.values()].flat().map((v) => v ?? 0));
    return {
      days,
      index,
      monthly,
      years,
      first: h.firstDate,
      last: h.lastDate,
      lastYear: Number(h.lastDate.slice(0, 4)),
      lastMonth: Number(h.lastDate.slice(5, 7)) - 1,
      lastDay: Number(h.lastDate.slice(8, 10)),
      peak: peakSeason(climatology(monthly).mean),
      dayScale,
      monthScale,
    };
  }, [h]);
}
type Model = ReturnType<typeof useModel>;

/** Any fire at all is at least "Low": a day with fires must never read as "No fires". */
const level = (count: number, scale: number) => (count <= 0 ? 0 : Math.max(1, activityLevel(count, scale)));

function CalendarBody({ h, analyst }: { h: HistoryPayload; analyst: boolean }) {
  const M = useModel(h);
  const [year, setYear] = useState(M.lastYear); // month shown on the calendar
  const [month, setMonth] = useState(M.lastMonth);
  const [range, setRange] = useState<Range>({ from: iso(M.lastYear, M.lastMonth, 1), to: M.last });
  const [pendingStart, setPendingStart] = useState<string | null>(null); // first tap of a two-tap range
  const [speaking, setSpeaking] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const calendarRef = useRef<HTMLElement>(null);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const clamp = (d: string) => (d < M.first ? M.first : d > M.last ? M.last : d);

  // ---- Status cards (the month on the calendar) ----
  const row = M.monthly.get(year)!;
  const busiest = row.reduce<number>((best, v, m) => ((v ?? -1) > (row[best] ?? -1) ? m : best), 0);
  const value = row[month];
  const partial = year === M.lastYear && month === M.lastMonth;
  // Month in progress: compare with the same days of other years, not their whole month.
  const others = otherYears(M.days, year, month, partial ? M.lastDay : 31);
  const base = meanStd(others);
  const status = value !== null && others.length && (value > 0 || base.mean > 0) ? monthStatus(value, base.mean, base.std) : null;
  const takeaway = value !== null ? monthTakeaway(value, others, year, month, partial) : null;
  const yearTotal = row.reduce<number>((a, v) => a + (v ?? 0), 0);

  const answer = describeRange(M, range, analyst);

  const showMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };
  const choose = (from: string, to: string) => {
    const r = { from: clamp(from <= to ? from : to), to: clamp(from <= to ? to : from) };
    setRange(r);
    setPendingStart(null);
    showMonth(Number(r.from.slice(0, 4)), Number(r.from.slice(5, 7)) - 1);
  };
  const tapDay = (d: string) => {
    if (pendingStart === null) {
      setRange({ from: d, to: d });
      setPendingStart(d);
    } else {
      setRange(pendingStart <= d ? { from: pendingStart, to: d } : { from: d, to: pendingStart });
      setPendingStart(null);
    }
  };
  const step = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    showMonth(d.getUTCFullYear(), d.getUTCMonth());
  };
  const canPrev = iso(year, month, 1) > M.first;
  const canNext = iso(year, month, daysIn(year, month)) < M.last;

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      return setSpeaking(false);
    }
    const u = new SpeechSynthesisUtterance(answer.speech);
    u.rate = 0.9; // a little slower than default: easier to follow
    u.onend = u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  const showTip = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!el) return setTip(null);
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip!, x: r.left + r.width / 2, y: r.top });
  };

  const peakFrom = M.peak[0], peakTo = M.peak.at(-1);
  const presets: { label: string; from: string; to: string }[] = [
    { label: "Yesterday", from: M.last, to: M.last },
    { label: "Last 7 days", from: addDays(M.last, -6), to: M.last },
    { label: "Last 30 days", from: addDays(M.last, -29), to: M.last },
    { label: `All of ${MONTH_NAMES[month]}`, from: iso(year, month, 1), to: iso(year, month, daysIn(year, month)) },
    ...(peakFrom !== undefined && peakTo !== undefined
      ? [{ label: `Fire season ${year}`, from: iso(year, peakFrom, 1), to: iso(year, peakTo, daysIn(year, peakTo)) }]
      : []),
    { label: `All of ${year}`, from: iso(year, 0, 1), to: iso(year, 11, 31) },
  ];

  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells = daysIn(year, month);

  return (
    <>
      {h.area.approximate && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-[#ee8a26]/40 bg-[#ee8a26]/10 px-3 py-2 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-[#c2410c]" aria-hidden />
          This place has no mapped border, so we counted fires within 5 km of it.
        </p>
      )}

      {/* Plain-English insight cards */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Summary">
        <article className="rounded-md border border-border bg-card p-4">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {MONTH_NAMES[month]} {year}
            {partial ? " · right now" : ""}
          </p>
          {status && value !== null ? (
            <>
              <span className="mt-2 inline-block rounded-full px-2.5 py-1 text-sm font-semibold" style={statusStyle(status.level)}>
                {STATUS_LABEL[status.level]}
              </span>
              <p className="mt-2 text-sm leading-snug">{statusSentence(value, base.mean, others.length, month, year, partial)}</p>
              {analyst && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {value} vs avg {base.mean.toFixed(1)} · z = {status.z.toFixed(2)}
                  {partial ? ` · days 1–${M.lastDay} of each year` : ""}
                </p>
              )}
            </>
          ) : value !== null ? (
            <p className="mt-2 text-sm leading-snug">No fires were spotted in {MONTH_NAMES[month]} {year}{others.length ? `, the same as in past years` : ""}.</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No records for this month.</p>
          )}
        </article>

        <article className="rounded-md border border-border bg-card p-4">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Peak fire season</p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold">
            <Flame size={20} className="text-[#c2410c]" aria-hidden />
            {/* shortcut: assumes the peak months are contiguous, true for a single dry season */}
            {peakFrom !== undefined && peakTo !== undefined ? `${MONTHS[peakFrom]} – ${MONTHS[peakTo]}` : "None found"}
          </p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {M.peak.length ? "Historically the hottest, driest months, when fire risk peaks." : "Too few fires here to show a fire season."}
          </p>
          {M.peak.length > 0 && <p className="mt-2 rounded bg-muted px-2 py-1 text-sm font-medium">{countdown(M)}</p>}
          {analyst && <p className="mt-1 font-mono text-[10px] text-muted-foreground">Months at ≥ 50% of the busiest month, average of all years</p>}
        </article>

        <article className="rounded-md border border-border bg-card p-4">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Most active month</p>
          {yearTotal > 0 ? (
            <>
              <p className="mt-1 text-2xl font-semibold">{MONTH_NAMES[busiest]}</p>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                Highest fire activity recorded in {year}
                {year === M.lastYear ? " so far" : ""}
                {` — ${fires(row[busiest] ?? 0)}.`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-snug">No fires were spotted here in {year}.</p>
          )}
        </article>
      </section>

      {/* The calendar */}
      <section ref={calendarRef} className="ember-map-section scroll-mt-4" aria-label="Calendar">
        <div className="ember-section-heading">
          <div>
            <h2>Fire calendar · {h.area.name}</h2>
            <p>Each day shows how many fires the satellite spotted. Tap a day, or tap two days to choose a range.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="ember-panel">
            <div className="no-print mb-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => step(-1)} disabled={!canPrev} className="inline-flex h-11 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium disabled:opacity-40">
                <ChevronLeft size={18} aria-hidden /> Previous
              </button>
              <label className="sr-only" htmlFor="cal-month">
                Month
              </label>
              <select id="cal-month" value={month} onChange={(e) => showMonth(year, Number(e.target.value))} className="h-11 rounded-md border border-border bg-card px-2 text-base font-semibold">
                {MONTH_NAMES.map((n, i) => (
                  <option key={n} value={i} disabled={iso(year, i, 1) > M.last}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="cal-year">
                Year
              </label>
              <select
                id="cal-year"
                value={year}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  showMonth(y, iso(y, month, 1) > M.last ? M.lastMonth : month);
                }}
                className="h-11 rounded-md border border-border bg-card px-2 text-base font-semibold"
              >
                {M.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => step(1)} disabled={!canNext} className="inline-flex h-11 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium disabled:opacity-40">
                Next <ChevronRight size={18} aria-hidden />
              </button>
              <button type="button" onClick={() => choose(M.last, M.last)} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-[#c2410c] px-3 text-sm font-semibold text-white sm:ml-auto">
                <CalendarDays size={18} aria-hidden /> Go to latest day
              </button>
            </div>
            <p className="mb-2 hidden text-lg font-semibold print:block">
              {MONTH_NAMES[month]} {year}
            </p>

            <p role="status" className="no-print mb-3 rounded-md bg-muted px-3 py-2 text-sm">
              {pendingStart
                ? `Start: ${longDate(pendingStart)}. Now tap the last day — or tap the same day again for just that day.`
                : `Showing ${range.from === range.to ? longDate(range.from) : `${longDate(range.from)} – ${longDate(range.to)}`}. Tap any day to choose a new date.`}
            </p>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-xs font-semibold text-muted-foreground sm:text-sm" aria-hidden>
                  {w}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`b${i}`} />
              ))}
              {Array.from({ length: cells }, (_, i) => {
                const d = iso(year, month, i + 1);
                const count = M.index.get(d);
                const has = count !== undefined;
                const l = has ? level(count, M.dayScale) : 0;
                const inRange = d >= range.from && d <= range.to;
                const edge = d === range.from ? "Start" : d === range.to ? "End" : null;
                const a = ACTIVITY[l]!;
                return (
                  <button
                    type="button"
                    key={d}
                    disabled={!has}
                    onClick={() => tapDay(d)}
                    aria-pressed={inRange}
                    aria-label={`${longDate(d)}: ${has ? (count ? `${fires(count)}, ${levelName(l)}` : "no fires") : "no records yet"}${inRange ? ", selected" : ""}`}
                    className="relative flex min-h-14 flex-col items-start justify-between rounded-md p-1.5 text-left transition-transform active:scale-95 disabled:cursor-default sm:min-h-[72px] sm:p-2"
                    style={{
                      background: has ? a.color : "transparent",
                      color: has ? a.ink : "var(--muted-foreground)",
                      border: has ? "none" : "1px dashed var(--border)",
                      // Blue selection ring: reads on every fill colour (the theme text colour vanishes on sand in dark mode).
                      boxShadow: inRange ? "inset 0 0 0 3px #2563eb" : undefined,
                    }}
                  >
                    <span className="text-base leading-none font-bold sm:text-lg">{i + 1}</span>
                    <span className="text-[10px] leading-tight font-semibold sm:text-xs">
                      {!has ? "—" : analyst ? String(count) : count ? (count === 1 ? "1 fire" : `${count} fires`) : "None"}
                    </span>
                    {(edge || d === M.last) && (
                      <span className="absolute top-1 right-1 rounded bg-black/70 px-1 text-[9px] font-semibold text-white">{edge ?? "Latest"}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <Legend />
          </div>

          {/* Choose dates + the answer */}
          <aside className="ember-panel flex flex-col gap-4">
            <div className="no-print">
              <h3 className="text-base font-semibold">Choose dates</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-sm">
                  From
                  <input
                    type="date"
                    min={M.first}
                    max={M.last}
                    value={range.from}
                    onChange={(e) => e.target.value && choose(e.target.value, range.to < e.target.value ? e.target.value : range.to)}
                    className="mt-1 block h-11 w-full rounded-md border border-border bg-card px-2 text-base"
                  />
                </label>
                <label className="text-sm">
                  To
                  <input
                    type="date"
                    min={M.first}
                    max={M.last}
                    value={range.to}
                    onChange={(e) => e.target.value && choose(range.from > e.target.value ? e.target.value : range.from, e.target.value)}
                    className="mt-1 block h-11 w-full rounded-md border border-border bg-card px-2 text-base"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick choices">
                {presets.map((p) => (
                  <button
                    type="button"
                    key={p.label}
                    disabled={p.from > M.last}
                    onClick={() => choose(p.from, p.to)}
                    className={`min-h-10 rounded-full border px-3 text-sm font-medium disabled:opacity-40 ${
                      range.from === clamp(p.from) && range.to === clamp(p.to) ? "border-[#c2410c] bg-[#c2410c]/15" : "border-border bg-card"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border-2 p-4" style={{ borderColor: ACTIVITY[answer.level]!.color }}>
              <p className="text-sm font-medium text-muted-foreground">{answer.when}</p>
              <p className="mt-1 inline-block rounded-full px-3 py-1 text-base font-bold" style={{ background: ACTIVITY[answer.level]!.color, color: ACTIVITY[answer.level]!.ink }}>
                {answer.headline}
              </p>
              <ul className="mt-3 space-y-2 text-base leading-snug">
                {answer.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <button type="button" onClick={speak} className="no-print mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-base font-semibold">
                {speaking ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
                {speaking ? "Stop reading" : "Read this to me"}
              </button>
            </div>
          </aside>
        </div>
      </section>

      {/* Monthly comparison */}
      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Month by month, year by year</h2>
            <p>
              Tap a month to open it on the calendar. <Flame size={11} className="inline text-[#c2410c]" aria-hidden /> marks peak fire season.
            </p>
          </div>
        </div>
        <div className="ember-panel">
          <div className="overflow-x-auto" onMouseOver={showTip} onFocus={showTip} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
            <table className="border-separate" style={{ borderSpacing: 3 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card" />
                  {MONTHS.map((m, i) => (
                    <th
                      key={m}
                      scope="col"
                      className={`rounded-t px-1 font-mono text-[10px] ${i === month ? "bg-accent text-accent-foreground" : M.peak.includes(i) ? "text-foreground" : "font-normal text-muted-foreground"}`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {M.peak.includes(i) && <Flame size={10} className="text-[#c2410c]" aria-label="peak season" />}
                        {m}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {M.years.map((y) => (
                  <tr key={y}>
                    <th scope="row" className={`sticky left-0 z-10 bg-card pr-2 font-mono text-[10px] ${y === year ? "text-foreground" : "font-normal text-muted-foreground"}`}>
                      {y}
                    </th>
                    {M.monthly.get(y)!.map((v, m) => {
                      const selected = y === year && m === month;
                      const l = v === null ? 0 : level(v, M.monthScale);
                      const vsAvg = v === null ? "" : vsNormal(v, climatology(M.monthly, y).mean[m]!);
                      const what = v === null ? "" : v ? `${fires(v)} • ${vsAvg}` : "no fires";
                      return (
                        <td key={m} className={`p-0.5 ${m === month ? "bg-accent" : ""}`}>
                          <button
                            type="button"
                            disabled={v === null}
                            aria-pressed={selected}
                            aria-label={v === null ? `${MONTH_NAMES[m]} ${y}: no records yet` : `${MONTH_NAMES[m]} ${y}: ${what}`}
                            data-tip={v === null ? undefined : `${MONTH_NAMES[m]} ${y}${y === M.lastYear && m === M.lastMonth ? " (so far)" : ""} — ${levelName(l)} (${what})`}
                            onClick={() => {
                              choose(iso(y, m, 1), iso(y, m, daysIn(y, m)));
                              calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="block h-9 w-11 rounded-[3px] font-mono text-[10px] font-semibold disabled:cursor-default"
                            style={{
                              background: v === null ? "transparent" : ACTIVITY[l]!.color,
                              color: ACTIVITY[l]!.ink,
                              border: v === null ? "1px dashed var(--border)" : "none",
                              outline: selected ? "2px solid #2563eb" : "none",
                              outlineOffset: 1,
                            }}
                          >
                            {analyst && v !== null ? v : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {takeaway && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-[#ee8a26]/40 bg-[#ee8a26]/10 px-3 py-2 text-sm">
              <Info size={16} className="mt-0.5 shrink-0 text-[#c2410c]" aria-hidden />
              <span>{takeaway.replace(/heat spots/g, "fires")}</span>
            </p>
          )}
          <Legend />
          <p className="mt-3 text-xs text-muted-foreground">
            Note: Dots represent satellite heat detections (including agricultural burning), not necessarily confirmed wildfires.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Source: {h.source}. Records up to {longDate(M.last)} (local dates). We left out {h.removed.lowConfidence.toLocaleString()} low-confidence detection
            {h.removed.lowConfidence === 1 ? "" : "s"} and {h.removed.notVegetation.toLocaleString()} heat source{h.removed.notVegetation === 1 ? "" : "s"} that are not
            vegetation fires (factories, gas flares, volcanoes).
          </p>
        </div>
      </section>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}

/** "Fire season usually starts in about 15 weeks (in March)" / "Fire season is happening now…" */
function countdown(M: Model): string {
  const start = M.peak[0]!, end = M.peak.at(-1)!;
  if (M.peak.includes(M.lastMonth)) return `Fire season is happening now. It usually lasts until the end of ${MONTH_NAMES[end]}.`;
  const startYear = M.lastMonth < start ? M.lastYear : M.lastYear + 1;
  const days = daysBetween(M.last, iso(startYear, start, 1)) - 1;
  const when = days < 14 ? `in ${days} day${days === 1 ? "" : "s"}` : `in about ${Math.round(days / 7)} weeks`;
  return `Fire season usually starts ${when} (in ${MONTH_NAMES[start]}).`;
}

/** Plain-words answer for a date range: what was seen, how it compares, the busiest day, what it means. */
function describeRange(M: Model, { from, to }: Range, analyst: boolean) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const when = from === to ? `On ${longDate(from)}` : `From ${longDate(from, !sameYear)} to ${longDate(to)}`;
  const stats = rangeStats(M.index, from, to);
  if (!stats.days) {
    const lines = ["We have no records for these dates yet."];
    return { when, headline: "No records", level: 0, lines, speech: `${when}. ${lines[0]}` };
  }
  let fireDays = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if ((M.index.get(d) ?? 0) > 0) fireDays++;
  const perDay = stats.total / stats.days;
  // One day is judged against busy days; a longer range against the busiest month's daily rate, so "April 2024"
  // reads the same here as in the month table (a month is never as intense as its single worst day).
  const scale = stats.days === 1 ? M.dayScale : M.monthScale / 30;
  const l = stats.total ? Math.max(1, activityLevel(perDay, scale)) : 0;
  const others = sameDatesOtherYears(M.index, from, to, M.years);
  const avg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;

  const lines: string[] = [];
  lines.push(
    stats.total === 0
      ? from === to
        ? "The satellite spotted no fires that day."
        : "The satellite spotted no fires on any of these days."
      : from === to
        ? `The satellite spotted ${fires(stats.total)} that day.`
        : `The satellite spotted ${fires(stats.total)}, on ${fireDays} of these ${stats.days} days.`,
  );
  if (avg !== null) {
    if (stats.total === 0 && avg === 0) lines.push("That is normal: past years had none on these dates either.");
    else if (avg === 0) lines.push("That is more than usual: past years had no fires on these dates.");
    else if (avg < SMALL) lines.push(`Past years usually had ${usualFires(avg)} on these dates${Math.abs(stats.total - avg) <= 2 ? ", so this is normal" : ""}.`);
    else {
      const pct = Math.round(((stats.total - avg) / avg) * 100);
      const typical = `the same dates in past years (usually ${usualFires(avg)})`;
      lines.push(`That is ${compare(stats.total, avg)} ${typical}.`);
    }
  } else lines.push("We can't compare these dates with past years.");
  if (stats.busiest && stats.busiest.count > 0 && from !== to) lines.push(`The busiest day was ${longDate(stats.busiest.date)}, with ${fires(stats.busiest.count)}.`);
  if (analyst) lines.push(`Average: ${perDay < 10 ? perDay.toFixed(2) : Math.round(perDay)} detections a day.`);
  if (stats.days < daysBetween(from, to)) lines.push(`Our records only go up to ${longDate(M.last)}.`);
  lines.push(ADVICE[l]!);
  return { when, headline: levelName(l), level: l, lines, speech: `${when}. ${lines.join(" ")}` };
}

// Below this many fires a month, percentages mislead ("100% fewer" = 0 instead of 1): use plain counts.
const SMALL = 5;
/** An average count in everyday words: "less than 1 fire", "about 1 fire", "about 27 fires". */
const usualFires = (avg: number) => (avg < 1 ? "less than 1 fire" : `about ${fires(Math.round(avg))}`);

/** Status for a month; with small numbers a difference of 1–2 fires is not "unusual". */
function monthStatus(value: number, mean: number, std: number) {
  const a = anomaly(value, mean, std);
  return mean < SMALL && Math.abs(value - mean) <= 2 ? { ...a, level: "normal" as const } : a;
}

function statusSentence(value: number, mean: number, years: number, month: number, year: number, partial: boolean) {
  const span = `our ${years}-year average for ${MONTH_NAMES[month]}`;
  const subject = partial ? `${MONTH_NAMES[month]} ${year} so far has` : `${MONTH_NAMES[month]} ${year} had`;
  if (mean < SMALL) {
    return `${subject} ${value === 0 ? "no fires" : fires(value)}. Past years usually had ${mean === 0 ? "none" : usualFires(mean)} ${partial ? "by this date" : `in ${MONTH_NAMES[month]}`}.`;
  }
  return `${subject} ${compare(value, mean).replace(/^about the same as$/, "about the same number of fires as").replace(/(more|fewer) than$/, "$1 fires than").replace(/times as many as$/, "times as many fires as")} ${span}.`;
}

/** "about the same as" / "35% more than" / "3.7 times as many as" — big percentages are hard to picture. */
function compare(value: number, usual: number): string {
  const ratio = value / usual;
  if (ratio >= 2) return `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10} times as many as`;
  const pct = Math.round((ratio - 1) * 100);
  if (Math.abs(pct) < 10) return "about the same as";
  return `${Math.abs(pct)}% ${pct > 0 ? "more" : "fewer"} than`;
}

function statusStyle(level: keyof typeof STATUS_LABEL) {
  const a = level === "well-above" || level === "above" ? ACTIVITY[3] : level === "normal" ? ACTIVITY[1] : ACTIVITY[0];
  return { background: a.color, color: a.ink };
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {ACTIVITY.map((a, i) => (
        <span key={a.label} className="inline-flex items-center gap-1">
          <span className="inline-block size-3.5 rounded-[3px]" style={{ background: a.color }} />
          {i === 0 ? "No fires" : a.label}
        </span>
      ))}
    </div>
  );
}
