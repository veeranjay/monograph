import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Highlighter,
  List,
  MessageSquare,
  Plus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api.js";
import type { PdfHighlight } from "../../types/index.js";
import { useAction } from "../data.js";
import { Button, Empty, ErrorState, IconButton, Loading } from "../ui.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const colors = [
  { value: "#fef08a", label: "Butter" },
  { value: "#bbf7d0", label: "Sage" },
  { value: "#ddd6fe", label: "Lavender" },
  { value: "#fecdd3", label: "Rose" },
  { value: "#bae6fd", label: "Sky" },
];
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export default function Reader() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["pdf", id],
    queryFn: () => api.getPdf(id!),
  });
  const action = useAction();
  const client = useQueryClient();
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [panel, setPanel] = useState(true);
  const [selection, setSelection] = useState<{
    text: string;
    rects: Rect[];
  } | null>(null);
  const [color, setColor] = useState(colors[0].value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDoc(null);
    setLoadError(null);
    setPage(1);
    const task = pdfjs.getDocument({ url: api.getPdfFileUrl(id!) });
    let cancelled = false;
    task.promise
      .then((pdf) => {
        if (!cancelled) setDoc(pdf);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [id]);
  useEffect(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [page, scale]);
  async function highlight() {
    if (!selection) return;
    setBusy(true);
    try {
      await action(
        () =>
          api.addPdfHighlight(id!, {
            page_number: page,
            color,
            text: selection.text,
            note: note.trim() || undefined,
            rects: selection.rects,
          }),
        "A little insight, kept",
      );
      setSelection(null);
      setNote("");
      window.getSelection()?.removeAllRanges();
    } catch {
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const pdf = query.data;
  return (
    <div className="reader-page">
      <div className="reader-header">
        <Link className="back-link" to="/library?kind=pdf">
          <ArrowLeft size={15} />
          Library
        </Link>
        <h1>{pdf.title}</h1>
        <div className="button-group">
          <a
            href={api.getPdfFileUrl(id!)}
            download={pdf.filename}
            className="icon-button"
            aria-label="Download original PDF"
          >
            <Download size={18} />
          </a>
          <IconButton
            label={panel ? "Hide highlights" : "Show highlights"}
            onClick={() => setPanel((v) => !v)}
          >
            <Highlighter size={18} />
          </IconButton>
        </div>
      </div>
      <div className="reader-controls">
        <div className="button-group">
          <IconButton
            label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <label className="page-number-field">
            <input
              type="number"
              aria-label="PDF page"
              min={1}
              max={doc?.numPages || 1}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= (doc?.numPages || 1))
                  setPage(n);
              }}
            />
            <span>/ {doc?.numPages || "…"}</span>
          </label>
          <IconButton
            label="Next page"
            disabled={!doc || page >= doc.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        <span className="reader-hint">
          Select a passage to keep a highlight.
        </span>
        <div className="button-group">
          <IconButton
            label="Zoom out"
            disabled={scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
          >
            <ZoomOut size={17} />
          </IconButton>
          <span className="zoom-label">{Math.round(scale * 100)}%</span>
          <IconButton
            label="Zoom in"
            disabled={scale >= 2.3}
            onClick={() => setScale((s) => Math.min(2.3, s + 0.15))}
          >
            <ZoomIn size={17} />
          </IconButton>
        </div>
      </div>
      {selection && (
        <div className="highlight-toolbar">
          <Highlighter size={17} />
          <span>
            {selection.text.length > 65
              ? selection.text.slice(0, 65) + "…"
              : selection.text}
          </span>
          <div className="highlight-colors">
            {colors.map((c) => (
              <button
                key={c.value}
                aria-label={`${c.label} highlight`}
                aria-pressed={color === c.value}
                style={{ background: c.value }}
                onClick={() => setColor(c.value)}
              />
            ))}
          </div>
          <input
            aria-label="Highlight note"
            placeholder="Add a thought (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button busy={busy} onClick={() => void highlight()}>
            Keep highlight
          </Button>
          <IconButton
            label="Cancel selection"
            onClick={() => setSelection(null)}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
      <div className={`reader-body ${panel ? "with-highlights" : ""}`}>
        <div className="pdf-stage">
          {loadError ? (
            <ErrorState error={loadError} />
          ) : doc ? (
            <PdfPage
              doc={doc}
              page={page}
              scale={scale}
              highlights={pdf.highlights.filter((h) => h.page_number === page)}
              onSelection={setSelection}
            />
          ) : (
            <Loading />
          )}
        </div>
        {panel && (
          <aside className="highlights-panel">
            <div className="section-heading">
              <h2>Kept for later</h2>
              <span>{pdf.highlights.length}</span>
            </div>
            <p className="muted">Little passages. Lasting ideas.</p>
            {pdf.highlights.length ? (
              pdf.highlights.map((h) => (
                <Highlight
                  key={h.id}
                  highlight={h}
                  onGo={() => setPage(h.page_number)}
                  onDelete={() =>
                    void action(
                      () => api.deletePdfHighlight(h.id),
                      "Highlight removed",
                    ).catch(() => {})
                  }
                  onSave={(text) =>
                    action(
                      () => api.updatePdfHighlight(h.id, { note: text }),
                      "Thought saved",
                    )
                  }
                />
              ))
            ) : (
              <Empty
                title="A thought worth keeping?"
                description="Select text on a page, choose a color, and keep it here."
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
function PdfPage({
  doc,
  page,
  scale,
  highlights,
  onSelection,
}: {
  doc: pdfjs.PDFDocumentProxy;
  page: number;
  scale: number;
  highlights: PdfHighlight[];
  onSelection: (selection: { text: string; rects: Rect[] }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<unknown>(null);
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | undefined;
    let textLayer: pdfjs.TextLayer | undefined;
    setRendering(true);
    setError(null);
    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled || !canvas.current || !layer.current) return;
      const viewport = pdfPage.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const node = canvas.current;
      node.width = Math.floor(viewport.width * ratio);
      node.height = Math.floor(viewport.height * ratio);
      node.style.width = `${viewport.width}px`;
      node.style.height = `${viewport.height}px`;
      setSize({ width: viewport.width, height: viewport.height });
      renderTask = pdfPage.render({
        canvas: node,
        canvasContext: node.getContext("2d")!,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (cancelled) return;
      const text = await pdfPage.getTextContent();
      if (cancelled || !layer.current) return;
      layer.current.replaceChildren();
      layer.current.style.setProperty("--scale-factor", String(viewport.scale));
      textLayer = new pdfjs.TextLayer({
        textContentSource: text,
        container: layer.current,
        viewport,
      });
      await textLayer.render();
      if (!cancelled) setRendering(false);
    })().catch((error) => {
      if (!cancelled && error.name !== "RenderingCancelledException") {
        setError(error);
        setRendering(false);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, scale]);
  function select() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.toString().trim() || !wrap.current)
      return;
    const range = selection.getRangeAt(0);
    if (!wrap.current.contains(range.commonAncestorContainer)) return;
    const box = wrap.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        left: Math.max(0, (r.left - box.left) / box.width),
        top: Math.max(0, (r.top - box.top) / box.height),
        width: Math.min(1, r.width / box.width),
        height: Math.min(1, r.height / box.height),
      }));
    onSelection({ text: selection.toString(), rects });
  }
  return (
    <>
      {error && <ErrorState error={error} />}
      <div
        className="pdf-page"
        ref={wrap}
        style={
          {
            width: size.width || 600,
            height: size.height || 780,
            "--scale-factor": scale,
          } as React.CSSProperties
        }
        onMouseUp={select}
        onTouchEnd={select}
      >
        <canvas ref={canvas} aria-label={`PDF page ${page}`} />
        <div className="textLayer" ref={layer} />
        {highlights.flatMap((h) => {
          let rects: Rect[] = [];
          try {
            rects =
              typeof h.rects === "string" ? JSON.parse(h.rects) : h.rects || [];
          } catch {}
          return rects.map((r, i) => (
            <div
              className="pdf-highlight-rect"
              key={`${h.id}-${i}`}
              title={h.note || h.text}
              style={{
                left: `${r.left * 100}%`,
                top: `${r.top * 100}%`,
                width: `${r.width * 100}%`,
                height: `${r.height * 100}%`,
                background: h.color,
              }}
            />
          ));
        })}
        {rendering && (
          <div className="pdf-rendering" role="status">
            Preparing page…
          </div>
        )}
      </div>
    </>
  );
}
function Highlight({
  highlight: h,
  onGo,
  onDelete,
  onSave,
}: {
  highlight: PdfHighlight;
  onGo: () => void;
  onDelete: () => void;
  onSave: (text: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(h.note || "");
  const [busy, setBusy] = useState(false);
  return (
    <article
      className="highlight-card"
      style={{ "--highlight-color": h.color } as React.CSSProperties}
    >
      <button className="highlight-quote" onClick={onGo}>
        <small>PAGE {h.page_number}</small>
        <p>{h.text}</p>
      </button>
      {h.note && !editing && <p className="highlight-note">{h.note}</p>}
      {editing && (
        <div className="form-stack">
          <textarea
            aria-label="Edit highlight note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(note);
                setEditing(false);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            Save thought
          </Button>
        </div>
      )}
      <div className="highlight-actions">
        <button className="text-link" onClick={() => setEditing((v) => !v)}>
          <MessageSquare size={13} />
          {h.note ? "Edit thought" : "Add a thought"}
        </button>
        <IconButton label="Delete highlight" onClick={onDelete}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </article>
  );
}
