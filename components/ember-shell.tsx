"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  Flame,
  LayoutGrid,
  Menu,
  Moon,
  MoreHorizontal,
  Radio,
  Settings2,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export type EmberNavKey = "overview" | "detections" | "alerts" | "analytics" | "ingestion";

const NAV: Array<{ key: EmberNavKey; to: string; label: string; icon: typeof Flame }> = [
  { key: "overview", to: "/", label: "Overview", icon: LayoutGrid },
  { key: "detections", to: "/detections", label: "Detections", icon: Radio },
  { key: "alerts", to: "/alerts", label: "Alerts", icon: TriangleAlert },
  { key: "analytics", to: "/analytics", label: "Analytics", icon: FileText },
  { key: "ingestion", to: "/ingestion", label: "Ingestion", icon: Flame },
];

export function EmberShell({
  active,
  title,
  children,
}: {
  active?: EmberNavKey;
  title: string;
  children: ReactNode;
}) {
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <main className="ember-shell min-h-screen bg-background text-foreground">
      <aside className={`ember-sidebar ${menuOpen ? "ember-sidebar-open" : ""}`}>
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
            <span>Sample data preview</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="ember-sidebar-bottom">
          <div className="ember-sidebar-hint">
            <CircleHelp size={15} />
            <span>Response guide</span>
            <ChevronRight size={13} />
          </div>
          <button className="ember-profile" type="button" onClick={() => setMenuOpen(!menuOpen)}>
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
            aria-label="Open navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={19} />
          </button>
          <div className="ember-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{title}</b>
          </div>
          <div className="ember-top-actions">
            <div className="ember-live-status ember-demo-status">
              <span className="ember-pulse-dot" /> DEMO PREVIEW
            </div>
            <span className="ember-top-divider" />
            <span className="ember-updated">Updated 2 min ago</span>
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
