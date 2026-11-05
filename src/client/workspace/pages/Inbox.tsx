import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAction, request, ago, useWorkspace } from "../data.js";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeading,
} from "../ui.js";
import { useCreate } from "../Shell.js";

export function Inbox() {
  const query = useQuery({
    queryKey: ["inbox"],
    queryFn: () => api.getInbox(),
  });
  const { data } = useWorkspace();
  const action = useAction();
  const create = useCreate();
  const navigate = useNavigate();
  const [convert, setConvert] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  async function turnIntoNote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const n = await action(
        () =>
          request<{ id: string }>(`/workspace/inbox/${convert}/note`, {
            method: "POST",
            body: JSON.stringify({
              title: title.trim(),
              subject_id: subject || null,
            }),
          }),
        "Your thought has a home",
      );
      setConvert(null);
      navigate(`/note/${n.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="CATCH IT NOW. CONNECT IT LATER."
        title="An inbox for your mind."
        description="Loose thoughts, links, and ideas. No need to organize them just yet."
        action={
          <Button onClick={() => create("capture")}>
            <Plus size={16} />
            Capture a thought
          </Button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : query.data.length ? (
        <div className="inbox-grid">
          {query.data.map((item) => (
            <article className="inbox-card" key={item.id}>
              <span className="eyebrow">{ago(item.created_at)}</span>
              <p>{item.content}</p>
              <div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTitle(item.content.split("\n")[0].slice(0, 80));
                    setConvert(item.id);
                  }}
                >
                  <FileText size={15} />
                  Turn into a note
                  <ArrowRight size={14} />
                </Button>
                <button
                  className="icon-button"
                  aria-label="Discard captured thought"
                  onClick={() =>
                    void action(
                      () => api.deleteInboxItem(item.id),
                      "Thought discarded",
                    ).catch(() => {})
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="A little breathing room."
          description="When an idea arrives, use Quick capture. It’ll be waiting here."
          action={
            <Button onClick={() => create("capture")}>
              Catch your first thought
            </Button>
          }
        />
      )}
      <Modal
        open={!!convert}
        onOpenChange={(open) => {
          if (!open) setConvert(null);
        }}
        title="Give this thought a home"
      >
        <form onSubmit={turnIntoNote} className="form-stack">
          <Field label="Note title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={250}
            />
          </Field>
          <Field label="Notebook">
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">No notebook yet</option>
              {data?.subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Button busy={busy}>
            Create note
            <ArrowRight size={15} />
          </Button>
        </form>
      </Modal>
    </div>
  );
}
