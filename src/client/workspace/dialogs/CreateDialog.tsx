import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  FileText,
  ListChecks,
  Upload,
  ArrowRight,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { request, useWorkspace, useAction, isHidden } from "../data.js";
import { Button, Modal, Field } from "../ui.js";
import type { CreateKind } from "../Shell.js";

export default function CreateDialog({
  initial,
  subject,
  close,
}: {
  initial: CreateKind;
  subject?: string;
  close: () => void;
}) {
  const [kind, setKind] = useState(initial);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(subject || "");
  const [count, setCount] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [color, setColor] = useState("#9b88c7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data } = useWorkspace();
  const action = useAction();
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "capture") {
        await action(
          () => api.createInboxItem({ content: text.trim() }),
          "Thought captured",
        );
        close();
        return;
      }
      if (kind === "notebook") {
        const n = await action(
          () => api.createSubject({ name: title.trim(), color }),
          "Notebook created",
        );
        close();
        navigate(`/notebook/${n.id}`);
        return;
      }
      if (kind === "note") {
        const note = await action(() =>
          api.createNote({
            title: title.trim() || "Untitled note",
            subject_id: subjectId || null,
          }),
        );
        close();
        navigate(`/note/${note.id}`);
        return;
      }
      if (kind === "sheet") {
        const n = await action(() =>
          request<{ id: string }>("/workspace/sheets", {
            method: "POST",
            body: JSON.stringify({
              name: title.trim(),
              subject_id: subjectId || null,
              problem_count: Number(count) || 0,
            }),
          }),
        );
        close();
        navigate(`/source/${n.id}`);
        return;
      }
      if (!file) throw new Error("Choose a PDF to upload.");
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Please choose a PDF smaller than 25 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read that PDF."));
        reader.readAsDataURL(file);
      });
      const pdf = await action(
        () =>
          api.uploadPdf({
            title: title.trim() || file.name.replace(/\.pdf$/i, ""),
            filename: file.name,
            file_data_base64: base64,
            subject_id: subjectId || null,
          }),
        "PDF added to your library",
      );
      close();
      navigate(`/pdf/${pdf.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item.");
    } finally {
      setBusy(false);
    }
  }
  const options = [
    { kind: "note" as const, label: "Note", icon: FileText },
    { kind: "sheet" as const, label: "Sheet", icon: ListChecks },
    { kind: "notebook" as const, label: "Notebook", icon: BookOpen },
    { kind: "pdf" as const, label: "PDF", icon: Upload },
  ];
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      title={
        kind === "capture" ? "Catch a thought" : "Make room for something new"
      }
      description={
        kind === "capture"
          ? "A thought, a link, a question. Give it a home later."
          : "Start simple. You can always add more along the way."
      }
    >
      <form onSubmit={submit} className="form-stack">
        {kind !== "capture" && (
          <div className="create-choices">
            {options.map(({ kind: k, label, icon: Icon }) => (
              <button
                type="button"
                key={k}
                className={kind === k ? "selected" : ""}
                onClick={() => {
                  setKind(k);
                  setError("");
                }}
              >
                <Icon size={21} />
                {label}
              </button>
            ))}
          </div>
        )}
        {kind === "capture" ? (
          <Field label="Your thought">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Let it out…"
              rows={6}
              required
              maxLength={100000}
            />
          </Field>
        ) : (
          <Field label={kind === "notebook" ? "Notebook name" : "Title"}>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "notebook"
                  ? "e.g. Mathematics"
                  : kind === "sheet"
                    ? "e.g. Algebra practice"
                    : "A name for your next idea"
              }
              required={kind !== "note" && kind !== "pdf"}
              maxLength={250}
            />
          </Field>
        )}
        {["note", "sheet", "pdf"].includes(kind) && (
          <Field label="Notebook">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">No notebook yet</option>
              {data?.subjects
                .filter((s) => !isHidden(data, s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {kind === "notebook" && (
          <Field label="Notebook color">
            <div className="color-picker">
              {[
                "#9b88c7",
                "#7a9ac0",
                "#78a694",
                "#d2a579",
                "#d18fa1",
                "#82969f",
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Choose color ${c}`}
                  aria-pressed={color === c}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </Field>
        )}
        {kind === "sheet" && (
          <Field
            label="Number of problems (optional)"
            hint="Create numbered problems now, or add them as you go."
          >
            <input
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="e.g. 30"
            />
          </Field>
        )}
        {kind === "pdf" && (
          <Field
            label="PDF file"
            hint="Up to 25 MB. Your original file stays on your device."
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                if (!title && e.target.files?.[0])
                  setTitle(e.target.files[0].name.replace(/\.pdf$/i, ""));
              }}
            />
          </Field>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <Button variant="ghost" type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {kind === "capture"
              ? "Save to inbox"
              : kind === "pdf"
                ? "Add PDF"
                : "Create " + kind}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
