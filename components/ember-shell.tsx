"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  Flame,
  LayoutGrid,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings2,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

const SIDEBAR_STORAGE_KEY = "ember-sidebar-collapsed";

export type EmberNavKey = "overview" | "detections" | "alerts" | "analytics" | "calendar" | "ingestion";

const NAV: Array<{ key: EmberNavKey; to: string; label: string; icon: typeof Flame }> = [
  { key: "overview", to: "/", label: "Overview", icon: LayoutGrid },
  { key: "detections", to: "/detections", label: "Detections", icon: Radio },
  { key: "alerts", to: "/alerts", label: "Alerts", icon: TriangleAlert },
  { key: "analytics", to: "/analytics", label: "Analytics", icon: FileText },
  { key: "calendar", to: "/calendar", label: "Burn calendar", icon: CalendarDays },
  { key: "ingestion", to: "/ingestion", label: "Ingestion", icon: Flame },
];

export interface EmberLiveStatus {
  mode: "sample" | "live";
  state: "idle" | "loading" | "synced" | "error";
  lastSync?: string;
  region?: string;
  errorMessage?: string;
}

export function EmberShell({
  active,
  title,
  liveStatus,
  children,
}: {
  active?: EmberNavKey;
  title: string;
  liveStatus?: EmberLiveStatus;
  children: ReactNode;
}) {
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isLive = liveStatus?.mode === "live";

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable; keep the expanded default.
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Persisting the preference is optional.
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const pillLabel = !isLive
    ? "DEMO PREVIEW"
    : liveStatus.state === "loading"
      ? "SYNCING..."
      : liveStatus.state === "error"
        ? "FEED ERROR"
        : "LIVE FEED";

  const sidebarSubtitle = !isLive
    ? "Sample data preview"
    : liveStatus.state === "loading"
      ? "Syncing NASA FIRMS WFS..."
      : liveStatus.state === "error"
        ? liveStatus.errorMessage || "Connection error"
        : `${liveStatus.region === "Global" ? "Global" : "SE Asia"} · ${liveStatus.lastSync ?? "Just now"}`;

  const updatedLabel = isLive
    ? liveStatus.state === "loading"
      ? "Syncing..."
      : liveStatus.lastSync
        ? `Synced ${liveStatus.lastSync}`
        : "Live feed"
    : "";

  return (
    <main className={`ember-shell min-h-screen bg-background text-foreground ${collapsed ? "ember-shell-collapsed" : ""}`}>
      <aside id="ember-sidebar" className={`ember-sidebar ${menuOpen ? "ember-sidebar-open" : ""}`}>
        <div className="ember-brand" aria-label="EMBER">
          <span className="ember-brand-mark">
            <Flame size={19} strokeWidth={2.4} />
          </span>
          <span className="ember-brand-name">
            EMBER<span className="ember-brand-period">.</span>
          </span>
        </div>
        <div className="ember-side-section-label">WORKSPACE</div>
        <nav className="ember-nav" aria-label="Main navigation">
          {NAV.map((item) => {
            const isActive = active
              ? item.key === active
              : item.to === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.to);

            return (
              <Link
                key={item.key}
                href={item.to}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`ember-nav-item ${isActive ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ember-side-section-label ember-side-section-lower">MONITORING</div>
        <div className="ember-source-status">
          <span className="ember-pulse-dot" />
          <div>
            <p>FIRMS connection</p>
            <span>{sidebarSubtitle}</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="ember-sidebar-bottom">
          <div className="ember-sidebar-hint">
            <CircleHelp size={15} />
            <span>Response guide</span>
            <ChevronRight size={13} />
          </div>
          <button className="ember-profile" type="button">
            <span className="ember-avatar">OC</span>
            <span className="ember-profile-copy">
              <b>Operations Center</b>
              <small>Bukidnon region</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      <div className="ember-main" id="overview">
        <header className="ember-topbar">
          <button
            className="ember-mobile-menu"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="ember-sidebar"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={19} />
          </button>
          <button
            className="ember-collapse"
            type="button"
            aria-expanded={!collapsed}
            aria-controls="ember-sidebar"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="ember-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{title}</b>
          </div>
          <div className="ember-top-actions">
            <div className={`ember-live-status ${isLive ? "" : "ember-demo-status"}`}>
              <span className="ember-pulse-dot" /> {pillLabel}
            </div>
            <span className="ember-top-divider" />
            {updatedLabel && <span className="ember-updated">{updatedLabel}</span>}
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={dark}
              className="ember-icon-button"
              onClick={toggle}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="ember-icon-button"
            >
              <Bell size={17} />
              <i />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Settings" className="ember-icon-button">
              <Settings2 size={17} />
            </Button>
          </div>
        </header>

        <div className="ember-content">{children}</div>
      </div>
      {menuOpen && (
        <button
          type="button"
          className="ember-dismiss"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </main>
  );
}

export default EmberShell;
