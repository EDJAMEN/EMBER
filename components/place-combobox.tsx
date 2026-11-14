"use client";

import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { searchPlaces, type GuidePlace } from "@/lib/geocode";

const MIN_CHARS = 2;

/** Search input with worldwide place suggestions (ARIA combobox pattern). */
export function PlaceCombobox({
  value,
  onChange,
  onPick,
  label,
  placeholder,
  className,
  style,
  before,
  after,
  inputId,
}: {
  inputId?: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (place: GuidePlace) => void;
  label: string;
  placeholder: string;
  className?: string;
  style?: CSSProperties;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), 300); // don't geocode every keystroke
    return () => clearTimeout(timer);
  }, [value]);

  const enabled = debounced.length >= MIN_CHARS;
  const query = useQuery({
    queryKey: ["places", debounced.toLowerCase()],
    queryFn: () => searchPlaces(debounced),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
  const items = enabled ? (query.data ?? []) : [];
  const typing = value.trim() !== debounced;
  const showList = open && value.trim().length >= MIN_CHARS;

  const pick = (place: GuidePlace) => {
    setOpen(false);
    setActive(-1);
    onPick(place);
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Enter before suggestions arrive still works: geocode immediately and take the best match.
      const chosen = items[active] ?? (typing || !items.length ? (await searchPlaces(value).catch(() => []))[0] : items[0]);
      if (chosen) pick(chosen);
    }
  };

  const status = query.isError
    ? "Place search is unavailable right now."
    : typing || query.isFetching
      ? "Searching…"
      : items.length === 0
        ? "No places found. Try a city or town name."
        : "";

  return (
    <div className={className} style={style}>
      {before}
      <input
        id={inputId}
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {after}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Place suggestions"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 1000, // above Leaflet panes and controls
            maxHeight: "260px",
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            boxShadow: "0 8px 24px rgb(0 0 0 / 18%)",
            padding: "4px",
            fontSize: "12px",
            textAlign: "left",
          }}
        >
          {status && (
            <li role="status" style={{ padding: "8px", color: "var(--muted-foreground)" }}>
              {status}
            </li>
          )}
          {!typing &&
            items.map((place, index) => (
              <li
                key={`${place.lat},${place.lng}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()} // keep focus so blur doesn't close before click
                onClick={() => pick(place)}
                onMouseEnter={() => setActive(index)}
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start",
                  padding: "7px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  background: index === active ? "var(--accent)" : "transparent",
                  color: index === active ? "var(--accent-foreground)" : undefined,
                }}
              >
                <MapPin size={13} style={{ marginTop: "2px", flex: "0 0 auto" }} />
                <span>
                  <b style={{ fontWeight: 600 }}>{place.name}</b>
                  {place.region && (
                    <span style={{ display: "block", fontSize: "11px", color: "var(--muted-foreground)" }}>
                      {place.region}
                    </span>
                  )}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
