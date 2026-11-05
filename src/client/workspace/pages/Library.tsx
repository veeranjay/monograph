import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Grid2X2, List, Plus, Search, BookOpen, RotateCcw } from "lucide-react";
import {
  useWorkspace,
  libraryItems,
  isHidden,
  useAction,
  request,
} from "../data.js";
import { Button, Empty, IconButton, ItemCard, PageHeading } from "../ui.js";
import { useCreate } from "../Shell.js";

export function Library({
  initialKind,
  trash = false,
}: {
  initialKind?: string;
  trash?: boolean;
}) {
  const { data } = useWorkspace();
  const create = useCreate();
  const action = useAction();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState(true);
  if (!data) return null;
  const query = params.get("q") || "";
  const kind = params.get("kind") || initialKind || "all";
  const subject = params.get("notebook") || "";
  const sort = params.get("sort") || "recent";
  const trashedNotebooks =
    trash && kind === "all"
      ? data.subjects.filter(
          (s) =>
            isHidden(data, s.id) &&
            s.name.toLowerCase().includes(query.toLowerCase()),
        )
      : [];
  const update = (key: string, value: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        value ? n.set(key, value) : n.delete(key);
        return n;
      },
      { replace: true },
    );
  const items = libraryItems(data)
    .filter(
      (i) =>
        i.trashed === trash && (trash || !isHidden(data, i.subjectId || "")),
    )
    .filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!subject || i.subjectId === subject) &&
        (!params.get("pinned") || i.pinned) &&
        `${i.title} ${i.description} ${i.subject || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "oldest"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
    );
  return (
    <div className="page">
      <PageHeading
        eyebrow="A HOME FOR YOUR IDEAS"
        title={trash ? "A second chance." : "Your library."}
        description={
          trash
            ? "Nothing here is gone for good. Restore it whenever you need."
            : "Notes, resources, and little discoveries. All in one place."
        }
        action={
          !trash && (
            <Button onClick={() => create("note")}>
              <Plus size={16} />
              Add to library
            </Button>
          )
        }
      />
      <div className="library-toolbar">
        <div className="segmented" role="group" aria-label="Content type">
          {[
            ["all", "Everything"],
            ["note", "Notes"],
            ["pdf", "PDFs"],
            ["sheet", "Sheets"],
            ["document", "Documents"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={kind === k ? "selected" : ""}
              onClick={() => update("kind", k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="view-toggle">
          <IconButton
            label="Grid view"
            aria-pressed={!list}
            onClick={() => setList(false)}
          >
            <Grid2X2 size={17} />
          </IconButton>
          <IconButton
            label="List view"
            aria-pressed={list}
            onClick={() => setList(true)}
          >
            <List size={18} />
          </IconButton>
        </div>
      </div>
      <div className="filter-bar">
        <div className="inline-search">
          <Search size={16} />
          <input
            aria-label="Filter library"
            placeholder="Find something in your library…"
            value={query}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by notebook"
          value={subject}
          onChange={(e) => update("notebook", e.target.value)}
        >
          <option value="">All notebooks</option>
          {data.subjects.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort library"
          value={sort}
          onChange={(e) => update("sort", e.target.value)}
        >
          <option value="recent">Recently updated</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Name A–Z</option>
        </select>
      </div>
      <div className="results-caption">
        <span>
          {items.length + trashedNotebooks.length}{" "}
          {items.length + trashedNotebooks.length === 1 ? "item" : "items"}
          {params.get("pinned") ? " · Pinned" : ""}
        </span>
        {(query || subject || params.get("pinned")) && (
          <button className="text-link" onClick={() => setParams({})}>
            Clear filters
          </button>
        )}
      </div>
      {trashedNotebooks.length > 0 && (
        <div className="trashed-notebooks">
          {trashedNotebooks.map((s) => (
            <article className="review-item" key={s.id}>
              <span className="quick-icon lavender">
                <BookOpen size={19} />
              </span>
              <div>
                <h3>{s.name}</h3>
                <p>Notebook · All contents are preserved</p>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  void action(
                    () =>
                      request(`/workspace/items/${s.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ trashed: false }),
                      }),
                    "Notebook restored",
                  ).catch(() => {})
                }
              >
                <RotateCcw size={14} />
                Restore notebook
              </Button>
            </article>
          ))}
        </div>
      )}
      {items.length ? (
        <div className={list ? "item-list" : "card-grid library-grid"}>
          {items.map((i) => (
            <ItemCard key={i.id} item={i} list={list} />
          ))}
        </div>
      ) : trashedNotebooks.length ? null : (
        <Empty
          title={trash ? "All clear." : "A little room for something new."}
          description={
            query || subject
              ? "Try a different search or clear your filters."
              : trash
                ? "Items you move to trash will be kept here."
                : "Create a note, add a PDF, or collect your next set of problems."
          }
          action={
            !trash && (
              <Button
                onClick={() =>
                  create(
                    kind === "sheet"
                      ? "sheet"
                      : kind === "pdf"
                        ? "pdf"
                        : "note",
                  )
                }
              >
                <Plus size={16} />
                Create something
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
