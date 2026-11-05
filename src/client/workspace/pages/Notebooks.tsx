import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useWorkspace,
  isHidden,
  libraryItems,
  request,
  useAction,
} from "../data.js";
import {
  Button,
  Empty,
  ItemCard,
  PageHeading,
  Menu,
  Modal,
  Field,
} from "../ui.js";
import { useCreate } from "../Shell.js";
import { api } from "../../lib/api.js";

export function Notebooks() {
  const { data } = useWorkspace();
  const create = useCreate();
  if (!data) return null;
  const subjects = data.subjects.filter((s) => !isHidden(data, s.id));
  return (
    <div className="page">
      <PageHeading
        eyebrow="A LITTLE STRUCTURE, A LOT OF FREEDOM"
        title="Room to explore."
        description="One notebook for every subject, project, or curiosity."
        action={
          <Button onClick={() => create("notebook")}>
            <Plus size={16} />
            New notebook
          </Button>
        }
      />
      <div className="notebook-grid">
        {subjects.map((s) => (
          <Link
            to={`/notebook/${s.id}`}
            key={s.id}
            className="notebook-card"
            style={
              {
                "--notebook-color": s.color || "#9b88c7",
              } as React.CSSProperties
            }
          >
            <div className="notebook-cover">
              <span className="notebook-spine" />
              <BookOpen size={37} strokeWidth={1.2} />
              <span className="notebook-cover-title">{s.name}</span>
              <span className="notebook-cover-label">MONOGRAPH · NOTEBOOK</span>
            </div>
            <div className="notebook-card-bottom">
              <div>
                <h2>{s.name}</h2>
                <p>
                  {s.sheet_count || s.sources_count || 0} sheets ·{" "}
                  {s.note_count || 0} notes
                </p>
              </div>
              <ArrowUpRight size={19} />
            </div>
          </Link>
        ))}
        <button
          className="new-notebook-card"
          onClick={() => create("notebook")}
        >
          <Plus size={27} strokeWidth={1.4} />
          <strong>A new chapter</strong>
          <span>Create a notebook</span>
        </button>
      </div>
    </div>
  );
}

export function Notebook() {
  const { id } = useParams();
  const { data } = useWorkspace();
  const create = useCreate();
  const action = useAction();
  const navigate = useNavigate();
  const [kind, setKind] = useState("all");
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#9b88c7");
  const [busy, setBusy] = useState(false);
  const notebook = data?.subjects.find((s) => s.id === id);
  if (!data) return null;
  if (!notebook)
    return (
      <Empty
        title="Notebook not found"
        description="It may have been moved. Your other notebooks are waiting in the sidebar."
      />
    );
  const items = libraryItems(data).filter(
    (i) => i.subjectId === id && !i.trashed,
  );
  const visibleItems = items.filter(
    (item) => kind === "all" || item.kind === kind,
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(
        () => api.updateSubject(id!, { name: name.trim(), description, color }),
        "Notebook updated",
      );
      setEdit(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function trash() {
    try {
      await action(
        () =>
          request(`/workspace/items/${id}`, {
            method: "PUT",
            body: JSON.stringify({ trashed: true }),
          }),
        "Notebook moved to trash. Its contents are preserved.",
      );
      if (
        window.location.hash.includes(`/notebook/${id}`) ||
        window.location.hash.includes(`/subject/${id}`)
      )
        navigate("/notebooks");
    } catch {}
  }
  return (
    <div className="page notebook-page">
      <Link className="back-link" to="/notebooks">
        <ArrowLeft size={15} />
        All notebooks
      </Link>
      <PageHeading
        eyebrow="YOUR NOTEBOOK"
        title={notebook.name}
        description={notebook.description || undefined}
        action={
          <div className="button-group">
            <Button onClick={() => create("note", id)}>
              <Plus size={16} />
              Add a note
            </Button>
            <Menu
              items={[
                {
                  label: "Add problem sheet",
                  icon: <Plus size={15} />,
                  onSelect: () => create("sheet", id),
                },
                {
                  label: "Upload PDF",
                  icon: <Plus size={15} />,
                  onSelect: () => create("pdf", id),
                },
                {
                  label: "Edit notebook",
                  icon: <Pencil size={15} />,
                  onSelect: () => {
                    setName(notebook.name);
                    setDescription(notebook.description || "");
                    setColor(notebook.color || "#9b88c7");
                    setEdit(true);
                  },
                },
                {
                  label: "Move to trash",
                  icon: <Trash2 size={15} />,
                  danger: true,
                  onSelect: () => void trash(),
                },
              ]}
            />
          </div>
        }
      />
      <div className="section-heading">
        <h2>Resources</h2>
      </div>
      <div
        className="notebook-filters"
        role="group"
        aria-label="Notebook resource type"
      >
        {[
          ["all", "All"],
          ["sheet", "Sheets"],
          ["note", "Notes"],
          ["pdf", "PDFs"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={kind === value ? "selected" : ""}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {label}
            <span>
              {value === "all"
                ? items.length
                : items.filter((item) => item.kind === value).length}
            </span>
          </button>
        ))}
      </div>
      {visibleItems.length ? (
        <div className="item-list notebook-resources">
          {visibleItems.map((i) => (
            <ItemCard key={i.id} item={i} list />
          ))}
        </div>
      ) : (
        <Empty
          title="A fresh chapter."
          description="Fill this space with notes, practice sheets, and reading material."
          action={
            <Button onClick={() => create("note", id)}>
              Write the first note
            </Button>
          }
        />
      )}
      <Modal
        open={edit}
        onOpenChange={setEdit}
        title="A notebook that fits you"
      >
        <form onSubmit={save} className="form-stack">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={250}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
          <Button type="submit" busy={busy}>
            Save changes
          </Button>
        </form>
      </Modal>
    </div>
  );
}
