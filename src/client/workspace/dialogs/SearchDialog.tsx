import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowUpRight, FileText } from "lucide-react";
import { api } from "../../lib/api.js";
import { useWorkspace, libraryItems, isHidden } from "../data.js";
import { Modal, ItemIcon, Loading, ErrorState } from "../ui.js";

export default function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const { data } = useWorkspace();
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.trim().length > 0,
  });
  const recent = data
    ? libraryItems(data)
        .filter((i) => !i.trashed)
        .slice(0, 6)
    : [];
  const go = (path: string) => {
    onOpenChange(false);
    navigate(path.replace(/^#/, "").replace(/^\/?/, "/"));
  };
  const visibleResults = results.data?.filter(
    (item) => !data || !isHidden(data, item.id),
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Find your next thought"
      description="Search notes, notebooks, PDFs, problems, and more."
      wide
    >
      <div className="search-input-wrap">
        <Search size={21} />
        <input
          aria-label="Search workspace"
          autoFocus
          placeholder="What are you looking for?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-results">
        <span className="eyebrow">
          {query ? "SEARCH RESULTS" : "PICK UP WHERE YOU LEFT OFF"}
        </span>
        {query ? (
          results.isFetching ? (
            <Loading />
          ) : results.error ? (
            <ErrorState error={results.error} />
          ) : visibleResults?.length ? (
            visibleResults.map((r) => (
              <button
                key={r.type + r.id}
                onClick={() => go(r.url)}
                className="search-result"
              >
                <span className="item-icon">
                  <FileText size={18} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.subtitle || r.type}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <p className="muted search-no-results">
              No matches yet. Try a title, topic, or problem number.
            </p>
          )
        ) : (
          recent.map((i) => (
            <button
              key={i.id}
              className="search-result"
              onClick={() => go(i.href)}
            >
              <span className={`item-icon kind-${i.kind}`}>
                <ItemIcon kind={i.kind} />
              </span>
              <span>
                <strong>{i.title}</strong>
                <small>{i.subject || i.kind}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
