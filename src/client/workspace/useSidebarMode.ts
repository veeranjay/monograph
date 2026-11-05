import { useState } from "react";

export type SidebarMode = "expanded" | "rail" | "focus";
export const sidebarModes: SidebarMode[] = ["expanded", "rail", "focus"];
const key = "monograph:sidebar-mode";

export function useSidebarMode(): [SidebarMode, (mode: SidebarMode) => void] {
  const [mode, setMode] = useState<SidebarMode>(() => {
    try {
      const saved = localStorage.getItem(key);
      return sidebarModes.includes(saved as SidebarMode)
        ? (saved as SidebarMode)
        : "expanded";
    } catch {
      return "expanded";
    }
  });
  return [
    mode,
    (next) => {
      setMode(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* The layout still works without browser storage. */
      }
    },
  ];
}
