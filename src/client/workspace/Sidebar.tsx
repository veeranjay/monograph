import React from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Home,
  Library,
  BookOpen,
  Play,
  RotateCcw,
  ChartNoAxesCombined,
  Inbox,
  Settings,
  Search,
  Plus,
  Trash2,
  PanelLeft,
  PanelLeftClose,
  Maximize2,
  ChevronDown,
  Feather,
} from "lucide-react";
import { useWorkspace, isHidden } from "./data.js";
import { IconButton, Menu } from "./ui.js";
import type { CreateKind } from "./Shell.js";
import { sidebarModes, type SidebarMode } from "./useSidebarMode.js";

const modes = {
  expanded: {
    label: "Expanded",
    icon: PanelLeft,
    description: "Your whole workspace",
  },
  rail: {
    label: "Compact rail",
    icon: PanelLeftClose,
    description: "Just the essentials",
  },
  focus: {
    label: "Focus",
    icon: Maximize2,
    description: "Room for what matters",
  },
};
const links = [
  { to: "/", label: "Home", icon: Home },
  { to: "/library", label: "Library", icon: Library },
  { to: "/notebooks", label: "Notebooks", icon: BookOpen },
  { to: "/practice", label: "Practice", icon: Play },
  { to: "/review", label: "Review", icon: RotateCcw },
  { to: "/insights", label: "Insights", icon: ChartNoAxesCombined },
];

export function SidebarModeMenu({
  mode,
  setMode,
}: {
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
}) {
  const Icon = modes[mode].icon;
  return (
    <Menu
      trigger={
        <button
          type="button"
          className="layout-trigger"
          aria-label="Workspace layout"
          title="Workspace layout"
        >
          <Icon size={17} />
          <span>{modes[mode].label}</span>
          <ChevronDown size={13} />
        </button>
      }
      items={sidebarModes.map((value) => {
        const ItemIcon = modes[value].icon;
        return {
          label: modes[value].label,
          icon: <ItemIcon size={16} />,
          onSelect: () => setMode(value),
        };
      })}
    />
  );
}

export function Sidebar({
  mode,
  setMode,
  mobile,
  onSearch,
  onCreate,
}: {
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  mobile: boolean;
  onSearch: () => void;
  onCreate: (kind: CreateKind) => void;
}) {
  const { data } = useWorkspace();
  const compact = mode === "rail" && !mobile;
  return (
    <aside className="sidebar" aria-label="Workspace sidebar">
      <div className="sidebar-brand-row">
        <Link to="/" className="brand" aria-label="Monograph home">
          <span className="brand-symbol" aria-hidden="true">
            m.
          </span>
          <span className="brand-name">monograph</span>
        </Link>
      </div>
      <button
        className="sidebar-command"
        onClick={onSearch}
        aria-label="Search your workspace"
      >
        <Search size={18} />
        <span>Find anything</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav aria-label="Main navigation">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              "nav-item" + (isActive ? " active" : "")
            }
            aria-label={label}
            title={compact ? label : undefined}
          >
            <Icon size={19} strokeWidth={1.65} />
            <span>{label}</span>
            {label === "Review" && !!data?.review.length && (
              <small className="nav-count">{data.review.length}</small>
            )}
            <i className="nav-active-mark" aria-hidden="true" />
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-divider" />
      <section className="sidebar-notebooks">
        <div className="sidebar-section-title">
          <span>NOTEBOOKS</span>
          <IconButton
            label="Create notebook"
            onClick={() => onCreate("notebook")}
          >
            <Plus size={15} />
          </IconButton>
        </div>
        {data?.subjects
          .filter((s) => !isHidden(data, s.id))
          .map((s) => (
            <NavLink
              key={s.id}
              to={`/notebook/${s.id}`}
              className="notebook-nav"
              title={compact ? s.name : undefined}
            >
              <span
                className="color-dot"
                style={{ background: s.color || "#858585" }}
              />
              <span>{s.name}</span>
              <small>{s.sheet_count || s.sources_count || 0}</small>
            </NavLink>
          ))}
      </section>
      <button
        className="sidebar-capture"
        onClick={() => onCreate("capture")}
        aria-label="Quick capture"
        title={compact ? "Quick capture" : undefined}
      >
        <Feather size={18} />
        <span>Quick capture</span>
        <Plus size={14} />
      </button>
      <div className="sidebar-bottom">
        <NavLink
          to="/inbox"
          className="nav-item"
          aria-label="Inbox"
          title={compact ? "Inbox" : undefined}
        >
          <Inbox size={18} />
          <span>Inbox</span>
        </NavLink>
        <NavLink
          to="/trash"
          className="nav-item"
          aria-label="Trash"
          title={compact ? "Trash" : undefined}
        >
          <Trash2 size={18} />
          <span>Trash</span>
        </NavLink>
        <NavLink
          to="/settings"
          className="nav-item"
          aria-label="Settings"
          title={compact ? "Settings" : undefined}
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
        <div className="sidebar-layout">
          <span className="sidebar-local">
            <i />
            Local
          </span>
        </div>
      </div>
    </aside>
  );
}
