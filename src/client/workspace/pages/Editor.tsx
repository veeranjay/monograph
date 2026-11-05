import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  Eye,
  Focus,
  GripVertical,
  Heading2,
  List,
  Plus,
  Save,
  Sigma,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api.js";
import { MathView } from "../../lib/katex.js";
import type { NoteBlock, NoteBlockType } from "../../types/index.js";
import { parseBlocks, useWorkspace } from "../data.js";
import { useDraft } from "../useDraft.js";
import { MathInput } from "../MathInput.js";
import { Button, ErrorState, IconButton, Loading, Menu, Modal } from "../ui.js";

export default function Editor({
  document: asDocument = false,
}: {
  document?: boolean;
}) {
  const { id } = useParams();
  const query = useQuery({
    queryKey: [asDocument ? "document" : "note", id],
    queryFn: async () => (asDocument ? api.getDocument(id!) : api.getNote(id!)),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const note = query.data;
  const blocks = parseBlocks(
    "blocks" in note ? JSON.stringify(note.blocks) : note.content,
  );
  return (
    <WritingDesk
      key={`${asDocument}-${id}`}
      id={id!}
      asDocument={asDocument}
      initial={{
        title: note.title,
        blocks,
        subject_id: "subject_id" in note ? note.subject_id || "" : "",
      }}
    />
  );
}
interface Draft {
  title: string;
  blocks: NoteBlock[];
  subject_id: string;
}
function WritingDesk({
  id,
  asDocument,
  initial,
}: {
  id: string;
  asDocument: boolean;
  initial: Draft;
}) {
  const client = useQueryClient();
  const { data } = useWorkspace();
  const [focus, setFocus] = useState(false);
  const [preview, setPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [slash, setSlash] = useState<string | null>(null);
  const draft = useDraft(
    `monograph:draft:${asDocument ? "document" : "note"}:${id}`,
    initial,
    async (next) => {
      if (asDocument)
        await api.updateDocument(id, {
          title: next.title,
          blocks: next.blocks,
        });
      else
        await api.updateNote(id, {
          title: next.title,
          content: JSON.stringify(next.blocks),
          subject_id: next.subject_id || null,
        });
      await client.invalidateQueries({ queryKey: ["workspace"] });
    },
  );
  const { title, blocks, subject_id } = draft.value;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocus(false);
        setSlash(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void draft
          .flush()
          .catch(() =>
            toast.error(
              "Could not save. Your recovery copy is on this device.",
            ),
          );
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [draft.flush]);
  const update = (patch: Partial<Draft>) =>
    draft.update({ ...draft.value, ...patch });
  const updateBlock = (id: string, patch: Partial<NoteBlock>) =>
    update({
      blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  const add = (type: NoteBlockType = "paragraph", after?: string) => {
    const next = [...blocks];
    const b = { id: crypto.randomUUID(), type, content: "" };
    next.splice(
      after ? next.findIndex((x) => x.id === after) + 1 : next.length,
      0,
      b,
    );
    update({ blocks: next });
    setSlash(null);
    setTimeout(() => document.getElementById(`block-${b.id}`)?.focus(), 40);
  };
  function move(id: string, offset: number) {
    const next = [...blocks];
    const i = next.findIndex((b) => b.id === id);
    if (i + offset < 0 || i + offset >= next.length) return;
    [next[i], next[i + offset]] = [next[i + offset], next[i]];
    update({ blocks: next });
  }
  async function exportFile(format: "md" | "tex") {
    let text = blocks
      .map((b) =>
        b.type === "math"
          ? `$$\n${b.content}\n$$`
          : b.type === "h1"
            ? `# ${b.content}`
            : b.type === "h2"
              ? `## ${b.content}`
              : b.type === "h3"
                ? `### ${b.content}`
                : b.type === "bullet"
                  ? `- ${b.content}`
                  : b.type === "numbered"
                    ? `1. ${b.content}`
                    : b.type === "code"
                      ? `\`\`\`\n${b.content}\n\`\`\``
                      : b.type === "divider"
                        ? "---"
                        : b.content,
      )
      .join("\n\n");
    if (format === "tex") {
      const { blocksToLatex } = await import("../../lib/latex.js");
      text = blocksToLatex(title, blocks);
    } else text = `# ${title}\n\n${text}`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[<>:"/\\|?*]/g, "_") || "Untitled"}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importLatex() {
    try {
      const { parseLatexToBlocks } = await import("../../lib/latex.js");
      const imported = parseLatexToBlocks(importText);
      update({ blocks: [...blocks, ...imported] });
      setImporting(false);
      setImportText("");
      toast.success("LaTeX added to your note");
    } catch {
      toast.error("Could not import that text.");
    }
  }
  const choices: {
    type: NoteBlockType;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { type: "paragraph", label: "Text", icon: <Type size={17} /> },
    { type: "h2", label: "Heading", icon: <Heading2 size={17} /> },
    { type: "bullet", label: "Bullet list", icon: <List size={17} /> },
    { type: "math", label: "Equation", icon: <Sigma size={17} /> },
    { type: "code", label: "Code", icon: <Type size={17} /> },
    { type: "divider", label: "Divider", icon: <Plus size={17} /> },
  ];
  return (
    <div className={`writing-page ${focus ? "focus-mode" : ""}`}>
      <div className="writing-toolbar">
        <Link to="/library" className="back-link">
          <ArrowLeft size={15} />
          Library
        </Link>
        <span className={`save-status ${draft.status}`} role="status">
          {draft.status === "saved" ? <Check size={13} /> : null}
          {draft.status === "saved"
            ? "All changes saved"
            : draft.status === "error"
              ? "Couldn’t sync · saved on this device"
              : draft.status === "saving"
                ? "Saving…"
                : "Unsaved changes"}
        </span>
        <div className="button-group">
          <IconButton
            label={preview ? "Edit note" : "Preview note"}
            aria-pressed={preview}
            onClick={() => setPreview((v) => !v)}
          >
            <Eye size={18} />
          </IconButton>
          <IconButton
            label={focus ? "Exit focus mode" : "Focus mode"}
            onClick={() => setFocus((v) => !v)}
          >
            {focus ? <X size={18} /> : <Focus size={18} />}
          </IconButton>
          <Menu
            items={[
              {
                label: "Export Markdown",
                icon: <Download size={15} />,
                onSelect: () => void exportFile("md"),
              },
              {
                label: "Export LaTeX",
                icon: <Download size={15} />,
                onSelect: () => void exportFile("tex"),
              },
              {
                label: "Import LaTeX",
                icon: <Upload size={15} />,
                onSelect: () => setImporting(true),
              },
              {
                label: "Save now",
                icon: <Save size={15} />,
                onSelect: () =>
                  void draft
                    .flush()
                    .catch(() =>
                      toast.error("Could not save. Please try again."),
                    ),
              },
            ]}
          />
        </div>
      </div>
      <article className="writing-desk">
        {draft.recovered && (
          <p className="recovery-notice">
            A draft from this device has been recovered.
          </p>
        )}
        <div className="document-meta">
          <span className="eyebrow">
            {asDocument ? "WORKSPACE DOCUMENT" : "A SPACE FOR YOUR THOUGHTS"}
          </span>
          {!asDocument && (
            <select
              aria-label="Move note to notebook"
              value={subject_id}
              onChange={(e) => update({ subject_id: e.target.value })}
            >
              <option value="">Unfiled note</option>
              {data?.subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <textarea
          className="document-title"
          aria-label="Note title"
          placeholder="Untitled note"
          rows={1}
          value={title}
          onChange={(e) => {
            update({ title: e.target.value });
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
        />
        <div className="document-subtitle">
          {
            blocks
              .map((b) => b.content)
              .join(" ")
              .trim()
              .split(/\s+/)
              .filter(Boolean).length
          }{" "}
          words <span>·</span>{" "}
          {Math.max(
            1,
            Math.ceil(
              blocks
                .map((b) => b.content)
                .join(" ")
                .split(/\s+/).length / 200,
            ),
          )}{" "}
          min read
        </div>
        <div className={`blocks-editor ${preview ? "blocks-preview" : ""}`}>
          {blocks.map((block, i) => (
            <div className={`editor-block block-${block.type}`} key={block.id}>
              {!preview && (
                <div className="block-controls">
                  <Menu
                    items={[
                      {
                        label: "Move up",
                        icon: <ArrowUp size={14} />,
                        onSelect: () => move(block.id, -1),
                      },
                      {
                        label: "Move down",
                        icon: <ArrowDown size={14} />,
                        onSelect: () => move(block.id, 1),
                      },
                      ...choices.map((c) => ({
                        label: `Turn into ${c.label.toLowerCase()}`,
                        icon: c.icon,
                        onSelect: () => updateBlock(block.id, { type: c.type }),
                      })),
                      {
                        label: "Delete block",
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onSelect: () =>
                          update({
                            blocks: blocks.filter((b) => b.id !== block.id),
                          }),
                      },
                    ]}
                  />
                </div>
              )}
              {block.type === "divider" ? (
                <hr />
              ) : preview ? (
                <BlockPreview block={block} index={i} />
              ) : (
                <>
                  <div className="block-input-wrap">
                    {block.type === "bullet" && (
                      <span className="block-marker">•</span>
                    )}
                    {block.type === "numbered" && (
                      <span className="block-marker">{i + 1}.</span>
                    )}
                    {block.type === "math" && (
                      <span className="block-marker">
                        <Sigma size={16} />
                      </span>
                    )}
                    <MathInput
                      autoSize
                      id={`block-${block.id}`}
                      aria-label={`${block.type} block ${i + 1}`}
                      value={block.content}
                      placeholder={
                        block.type === "math"
                          ? "Write LaTeX, e.g. x^2 + y^2 = r^2"
                          : block.type === "h1" ||
                              block.type === "h2" ||
                              block.type === "h3"
                            ? "Heading"
                            : "Let your thoughts find their way…"
                      }
                      onChange={(e) => {
                        updateBlock(block.id, { content: e.target.value });
                        if (e.target.value === "/") setSlash(block.id);
                        else if (slash === block.id) setSlash(null);
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !["math", "code"].includes(block.type)
                        ) {
                          e.preventDefault();
                          add(
                            block.type === "bullet" || block.type === "numbered"
                              ? block.type
                              : "paragraph",
                            block.id,
                          );
                        }
                        if (e.key === "Escape") setSlash(null);
                      }}
                    />
                  </div>
                  {block.type === "math" && block.content && (
                    <div className="equation-preview">
                      <MathView content={`$$${block.content}$$`} />
                    </div>
                  )}
                  {slash === block.id && (
                    <div className="slash-menu">
                      {choices.map((c) => (
                        <button
                          key={c.type}
                          onClick={() => {
                            updateBlock(block.id, {
                              type: c.type,
                              content: "",
                            });
                            setSlash(null);
                            document
                              .getElementById(`block-${block.id}`)
                              ?.focus();
                          }}
                        >
                          {c.icon}
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {!preview && (
          <div className="editor-add">
            <button className="add-block-button" onClick={() => add()}>
              <Plus size={17} />
              Keep writing
            </button>
            <div>
              {choices.slice(1, 4).map((c) => (
                <IconButton
                  key={c.type}
                  label={`Add ${c.label.toLowerCase()}`}
                  onClick={() => add(c.type)}
                >
                  {c.icon}
                </IconButton>
              ))}
            </div>
          </div>
        )}
        {!blocks.length && preview && (
          <p className="muted">Every thought starts with a blank page.</p>
        )}
        <div className="editor-hint">
          {preview
            ? "A little perspective on your words."
            : "Type / for blocks · Enter for a new paragraph · Shift + Enter for a line break"}
        </div>
      </article>
      <Modal
        open={importing}
        onOpenChange={setImporting}
        title="Bring your LaTeX along"
        description="Imported blocks are added to the end. Your existing work stays intact."
      >
        <textarea
          aria-label="LaTeX source"
          className="latex-import"
          rows={12}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste your LaTeX document…"
        />
        <div className="dialog-footer">
          <Button
            onClick={() => void importLatex()}
            disabled={!importText.trim()}
          >
            Add to document
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function BlockPreview({ block, index }: { block: NoteBlock; index: number }) {
  if (block.type === "math")
    return <MathView content={`$$${block.content}$$`} />;
  if (block.type === "code")
    return (
      <pre>
        <code>{block.content}</code>
      </pre>
    );
  if (["h1", "h2", "h3"].includes(block.type))
    return React.createElement(block.type, {}, block.content);
  if (block.type === "bullet")
    return (
      <div className="preview-list-item">
        • <MathView content={block.content} />
      </div>
    );
  if (block.type === "numbered")
    return (
      <div className="preview-list-item">
        {index + 1}. <MathView content={block.content} />
      </div>
    );
  return <MathView content={block.content} />;
}
