import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  lazy,
  Suspense,
} from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu as MenuIcon, Plus, Search, CircleHelp } from "lucide-react";
import { useWorkspace } from "./data.js";
import {
  Button,
  IconButton,
  Modal,
  Loading,
  ErrorState,
  RouteBoundary,
} from "./ui.js";
import { Sidebar, SidebarModeMenu } from "./Sidebar.js";
import { useSidebarMode } from "./useSidebarMode.js";

export type CreateKind = "note" | "sheet" | "notebook" | "pdf" | "capture";
const CreateContext = createContext<
  (kind?: CreateKind, subject?: string) => void
>(() => {});
export const useCreate = () => useContext(CreateContext);
const navigation = [
  { to: "/", label: "Home" },
  { to: "/library", label: "Library" },
  { to: "/notebooks", label: "Notebooks" },
  { to: "/practice", label: "Practice" },
  { to: "/review", label: "Review" },
  { to: "/insights", label: "Insights" },
];

const SearchDialog = lazy(() => import("./dialogs/SearchDialog.js"));
const CreateDialog = lazy(() => import("./dialogs/CreateDialog.js"));

export function Shell() {
  const { data, error, isPending, refetch } = useWorkspace();
  const location = useLocation();
  const [search, setSearch] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [sidebarMode, setSidebarMode] = useSidebarMode();
  const [create, setCreate] = useState<{
    kind: CreateKind;
    subject?: string;
  } | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        setCreate({ kind: "note" });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    const setting = data?.settings.appearance || "light";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.setAttribute(
        "data-theme",
        setting === "system" ? (media.matches ? "dark" : "light") : setting,
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [data?.settings.appearance]);
  const section =
    location.pathname === "/"
      ? "Home"
      : navigation.find(
          (n) => n.to !== "/" && location.pathname.startsWith(n.to),
        )?.label ||
        (location.pathname.startsWith("/note/")
          ? "Notes"
          : location.pathname.startsWith("/source/")
            ? "Problem sheet"
            : location.pathname.startsWith("/pdf/")
              ? "PDF reader"
              : location.pathname.startsWith("/document/")
                ? "Document"
                : location.pathname.startsWith("/problem/")
                  ? "Problem"
                  : location.pathname.startsWith("/notebook/")
                    ? "Notebook"
                    : location.pathname.startsWith("/settings")
                      ? "Settings"
                      : location.pathname.startsWith("/trash")
                        ? "Trash"
                        : "Workspace");
  return (
    <CreateContext.Provider
      value={(kind = "note", subject) => setCreate({ kind, subject })}
    >
      <div
        className={`app-shell sidebar-${sidebarMode} ${mobile ? "mobile-open" : ""} ${data?.settings.compact ? "compact" : ""}`}
      >
        <a
          href="#main-content"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          Skip to content
        </a>
        {mobile && (
          <button
            aria-label="Close navigation"
            className="sidebar-scrim"
            onClick={() => setMobile(false)}
          />
        )}
        <Sidebar
          mode={sidebarMode}
          setMode={setSidebarMode}
          mobile={mobile}
          onSearch={() => setSearch(true)}
          onCreate={(kind) => setCreate({ kind })}
        />

        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <span className="mobile-menu">
                <IconButton
                  label="Open navigation"
                  onClick={() => setMobile(true)}
                >
                  <MenuIcon size={20} />
                </IconButton>
              </span>
              <span className="topbar-workspace">Workspace</span>
              <span className="breadcrumb-slash">/</span>
              <span>{section}</span>
            </div>
            <div className="topbar-actions">
              <SidebarModeMenu mode={sidebarMode} setMode={setSidebarMode} />
              <span className="local-status">
                <span />
                Local workspace
              </span>
              <IconButton
                label="Search workspace"
                onClick={() => setSearch(true)}
              >
                <Search size={18} />
              </IconButton>
              <IconButton
                label="Keyboard shortcuts and help"
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={18} />
              </IconButton>
              <Button onClick={() => setCreate({ kind: "note" })}>
                <Plus size={16} />
                <span>Create new</span>
              </Button>
            </div>
          </header>
          <main className="main-content" id="main-content" tabIndex={-1}>
            {isPending ? (
              <Loading />
            ) : error ? (
              <ErrorState error={error} retry={() => void refetch()} />
            ) : (
              <div className="route-content" key={location.pathname}>
                <RouteBoundary>
                  <Suspense fallback={<Loading />}>
                    <Outlet />
                  </Suspense>
                </RouteBoundary>
              </div>
            )}
          </main>
        </div>
        <Suspense fallback={null}>
          {search && <SearchDialog open={search} onOpenChange={setSearch} />}
          {create && (
            <CreateDialog
              initial={create.kind}
              subject={create.subject}
              close={() => setCreate(null)}
            />
          )}
        </Suspense>
        <Modal
          open={help}
          onOpenChange={setHelp}
          title="A little help finding your flow"
          description="Your workspace, at your pace."
        >
          <div className="help-list">
            <p>
              <kbd>Ctrl / ⌘ K</kbd> Search across your workspace
            </p>
            <p>
              <kbd>Ctrl / ⌘ Shift N</kbd> Create a note
            </p>
            <p>
              <kbd>Esc</kbd> Close a dialog
            </p>
            <p>
              Start with a notebook, add sheets or PDFs, then practice. Flag
              tricky problems for review. Notes save automatically; moved items
              can always be restored from Trash.
            </p>
          </div>
        </Modal>
      </div>
    </CreateContext.Provider>
  );
}
