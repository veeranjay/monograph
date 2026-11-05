import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Subject,
  Source,
  Note,
  PdfDocument,
  PracticeLog,
  AnalyticsSummary,
  Problem,
  NoteBlock,
} from "../types/index.js";

export interface WorkspaceDocument {
  id: string;
  object_id?: string;
  title: string;
  blocks: string;
  created_at: string;
  updated_at: string;
}
export interface Activity {
  id: string;
  problem_id: string;
  result: string;
  created_at: string;
  time_seconds?: number;
  number: string;
  title?: string;
  source_name: string;
}
export interface Workspace {
  subjects: Subject[];
  sources: Source[];
  notes: Note[];
  pdfs: PdfDocument[];
  logs: PracticeLog[];
  analytics: AnalyticsSummary;
  documents: WorkspaceDocument[];
  review: Problem[];
  activity: Activity[];
  state: { item_id: string; pinned: number; trashed_at: string | null }[];
  settings: {
    name?: string;
    appearance?: "light" | "dark" | "system";
    weeklyGoal?: number;
    compact?: boolean;
  };
}
export interface LibraryItem {
  id: string;
  title: string;
  kind: "note" | "pdf" | "sheet" | "document";
  description: string;
  date: string;
  subjectId?: string | null;
  subject?: string | null;
  href: string;
  pinned: boolean;
  trashed: boolean;
}
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || `Unable to complete request (${response.status})`,
    );
  }
  return response.json();
}
export const useWorkspace = () =>
  useQuery({
    queryKey: ["workspace"],
    queryFn: () => request<Workspace>("/workspace"),
    staleTime: 15_000,
  });
export function useAction() {
  const client = useQueryClient();
  return async <T>(action: () => Promise<T>, message?: string): Promise<T> => {
    try {
      const value = await action();
      await client.invalidateQueries();
      if (message) toast.success(message);
      return value;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
      throw error;
    }
  };
}
export function parseBlocks(content?: string | null): NoteBlock[] {
  if (!content) return [];
  try {
    const blocks = JSON.parse(content);
    if (
      Array.isArray(blocks) &&
      blocks.every(
        (block) =>
          block &&
          typeof block === "object" &&
          typeof block.content === "string" &&
          typeof block.type === "string",
      )
    ) {
      return blocks.map((block, index) => ({
        ...block,
        id: typeof block.id === "string" ? block.id : `legacy-${index}`,
      }));
    }
  } catch {
    /* Preserve legacy plain text. */
  }
  return [{ id: "legacy-content", type: "paragraph", content }];
}
export function plainText(content?: string | null) {
  return parseBlocks(content)
    .map((b) => b.content || "")
    .join(" ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function displayTitle(value: string) {
  return value.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}
export function libraryItems(data: Workspace): LibraryItem[] {
  const state = new Map(data.state.map((s) => [s.item_id, s]));
  const items: Omit<LibraryItem, "pinned" | "trashed">[] = [
    ...data.notes.map((n) => ({
      id: n.id,
      title: n.title,
      kind: "note" as const,
      description: plainText(n.content) || "A fresh page for your next idea.",
      date: n.updated_at,
      subjectId: n.subject_id,
      subject: n.subject_name,
      href: `/note/${n.id}`,
    })),
    ...data.pdfs.map((p) => ({
      id: p.id,
      title: p.title,
      kind: "pdf" as const,
      description: `${p.page_count ? `${p.page_count} pages · ` : ""}${(p.file_size / 1024 / 1024).toFixed(1)} MB · ${p.highlight_count || 0} highlights`,
      date: p.updated_at,
      subjectId: p.subject_id,
      subject: p.subject_name,
      href: `/pdf/${p.id}`,
    })),
    ...data.sources.map((s) => ({
      id: s.id,
      title: s.name,
      kind: "sheet" as const,
      description: `${s.problem_count || 0} problems · ${s.attempt_count || 0} attempts`,
      date: s.latest_activity || s.created_at,
      subjectId: s.subject_id,
      subject: s.subject_name,
      href: `/source/${s.id}`,
    })),
    ...data.documents.map((d) => ({
      id: d.id,
      title: d.title,
      kind: "document" as const,
      description: plainText(d.blocks) || "An existing workspace document.",
      date: d.updated_at,
      href: `/document/${d.id}`,
    })),
  ];
  return items
    .map((i) => ({
      ...i,
      pinned: !!state.get(i.id)?.pinned,
      trashed: !!state.get(i.id)?.trashed_at,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function ago(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
export function duration(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export const isHidden = (data: Workspace, id: string) =>
  !!data.state.find((s) => s.item_id === id)?.trashed_at;
export const kindLabel = {
  note: "Note",
  pdf: "PDF",
  sheet: "Problem sheet",
  document: "Document",
};
