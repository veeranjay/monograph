import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flag, Play, Plus, Search, Pencil } from "lucide-react";
import { api } from "../../lib/api.js";
import { useWorkspace, useAction, request } from "../data.js";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeading,
} from "../ui.js";

export function Sheet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const action = useAction();
  const query = useQuery({
    queryKey: ["source", id],
    queryFn: () => api.getSource(id!),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [add, setAdd] = useState(false);
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const source = query.data;
  const problems = source.problems.filter(
    (p) =>
      (filter === "all" ||
        (filter === "review"
          ? p.for_review
          : filter === "unattempted"
            ? !p.latest_result
            : p.latest_result === filter)) &&
      `${p.number} ${p.title || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function start() {
    setBusy(true);
    try {
      const log = await action(() =>
        request<{ id: string }>("/workspace/sessions/start", {
          method: "POST",
          body: JSON.stringify({ source_id: id }),
        }),
      );
      navigate(`/practice/${log.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function createProblem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(
        () =>
          api.createProblem({
            source_id: id!,
            number: number.trim(),
            title: title.trim(),
          }),
        "Problem added",
      );
      setAdd(false);
      setNumber("");
      setTitle("");
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(
        () =>
          api.updateSource(id!, {
            name: name.trim(),
            subject_id: subject || null,
          }),
        "Sheet updated",
      );
      setEdit(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <Link
        className="back-link"
        to={source.subject_id ? `/notebook/${source.subject_id}` : "/library"}
      >
        <ArrowLeft size={15} />
        {source.subject_name || "Library"}
      </Link>
      <PageHeading
        eyebrow="PROBLEM SHEET"
        title={source.name}
        description={`${source.problems.length} problems. One step at a time.`}
        action={
          <div className="button-group">
            <Button
              variant="secondary"
              onClick={() => {
                setName(source.name);
                setSubject(source.subject_id || "");
                setEdit(true);
              }}
            >
              <Pencil size={15} />
              Edit
            </Button>
            <Button onClick={() => void start()} busy={busy}>
              <Play size={15} />
              Start practice
            </Button>
          </div>
        }
      />
      <div className="sheet-progress">
        <div>
          <strong>
            {source.problems.filter((p) => p.latest_result === "solved").length}
          </strong>
          <span> solved</span>
          <span className="muted"> of {source.problems.length} problems</span>
        </div>
        <div className="progress-track">
          <span
            style={{
              width: `${source.problems.length ? (source.problems.filter((p) => p.latest_result === "solved").length / source.problems.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="filter-bar">
        <div className="inline-search">
          <Search size={16} />
          <input
            placeholder="Find a problem…"
            aria-label="Find a problem"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter problems"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All problems</option>
          <option value="solved">Solved</option>
          <option value="partial">Partial</option>
          <option value="failed">Needs work</option>
          <option value="unattempted">Not attempted</option>
          <option value="review">Flagged for review</option>
        </select>
        <Button variant="secondary" onClick={() => setAdd(true)}>
          <Plus size={15} />
          Add problem
        </Button>
      </div>
      {problems.length ? (
        <div className="problem-list">
          <div className="problem-list-heading">
            <span>PROBLEM</span>
            <span>ATTEMPTS</span>
            <span>STATUS</span>
          </div>
          {problems.map((p) => (
            <Link to={`/problem/${p.id}`} key={p.id} className="problem-row">
              <span>
                <span className="problem-number">{p.number}</span>
                <span>
                  {p.title || `Problem ${p.number}`}
                  {!!p.for_review && <Flag size={13} />}
                </span>
              </span>
              <small>{p.attempt_count || 0}</small>
              <span
                className={`result-pill result-${p.latest_result || "new"}`}
              >
                {p.latest_result === "failed"
                  ? "Needs work"
                  : p.latest_result || "Not started"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="A little space for a challenge."
          description={
            search
              ? "No problems match your search."
              : "Add problems to start a practice session."
          }
          action={<Button onClick={() => setAdd(true)}>Add a problem</Button>}
        />
      )}
      <Modal open={add} onOpenChange={setAdd} title="A new problem">
        <form onSubmit={createProblem} className="form-stack">
          <Field label="Problem number">
            <input
              autoFocus
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="e.g. 12 or 4b"
              required
              maxLength={80}
            />
          </Field>
          <Field label="Title (optional)">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you working on?"
              maxLength={250}
            />
          </Field>
          <Button busy={busy}>Add problem</Button>
        </form>
      </Modal>
      <Modal open={edit} onOpenChange={setEdit} title="Make this sheet yours">
        <form onSubmit={save} className="form-stack">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Notebook">
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">No notebook</option>
              {workspace?.subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Button busy={busy}>Save changes</Button>
        </form>
      </Modal>
    </div>
  );
}
