import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flag, Play, Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import { MathView } from "../../lib/katex.js";
import type { PracticeLog } from "../../types/index.js";
import { useAction, request, ago, duration } from "../data.js";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeading,
} from "../ui.js";

export default function Problem() {
  const { id } = useParams();
  const action = useAction();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["problem", id],
    queryFn: () => api.getProblem(id!),
  });
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [content, setContent] = useState("");
  const [type, setType] = useState("insight");
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const problem = query.data;
  const flagged =
    !!problem.for_review || !!problem.attempts?.some((a) => a.for_review);
  async function start() {
    setBusy(true);
    try {
      const log = await action(() =>
        request<PracticeLog>("/workspace/sessions/start", {
          method: "POST",
          body: JSON.stringify({
            source_id: problem.source_id,
            problem_id: problem.id,
          }),
        }),
      );
      if (log.current_problem_id !== problem.id)
        navigate(`/practice/${log.id}?problem=${problem.id}`);
      else navigate(`/practice/${log.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function observation(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(
        () =>
          api.createObservation({
            problem_id: id!,
            type,
            content: content.trim(),
          }),
        "Reflection added",
      );
      setContent("");
      setAdd(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page problem-page">
      <Link to={`/source/${problem.source_id}`} className="back-link">
        <ArrowLeft size={15} />
        {problem.source_name}
      </Link>
      <PageHeading
        eyebrow={`${problem.subject_name || "PRACTICE"} / PROBLEM ${problem.number}`}
        title={problem.title || `Problem ${problem.number}`}
        description="Every attempt has something to teach you."
        action={
          <div className="button-group">
            <Button
              variant="secondary"
              onClick={() =>
                void action(
                  () =>
                    flagged
                      ? request(`/problems/${id}/reviewed`, { method: "POST" })
                      : api.updateProblem(id!, { for_review: true }),
                  flagged ? "Removed problem flag" : "Flagged for review",
                ).catch(() => {})
              }
            >
              <Flag size={15} />
              {flagged ? "Flagged" : "Review later"}
            </Button>
            <Button busy={busy} onClick={() => void start()}>
              <Play size={15} />
              Practice again
            </Button>
          </div>
        }
      />
      {!!problem.tags?.length && (
        <div className="problem-tags">
          {problem.tags.map((t) => (
            <span className="tag kind-note" key={t.id}>
              {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="section-heading">
        <h2>
          The path so far
          <span>{problem.attempts?.length || 0} recorded attempts.</span>
        </h2>
      </div>
      {problem.attempts?.length ? (
        <div className="attempt-history">
          {problem.attempts.map((attempt, i) => (
            <details className="history-item" key={attempt.id} open={i === 0}>
              <summary>
                <span className={`result-dot result-${attempt.result}`} />
                <strong>Attempt {problem.attempts!.length - i}</strong>
                <span className={`result-pill result-${attempt.result}`}>
                  {attempt.result === "failed" ? "Needs work" : attempt.result}
                </span>
                <span className="history-time">
                  {attempt.time_seconds ? duration(attempt.time_seconds) : ""}
                </span>
                <small>{ago(attempt.created_at)}</small>
              </summary>
              <div className="history-content">
                <MathView content={attempt.notes} />
                <div className="history-meta">
                  {attempt.recognition && (
                    <span>{attempt.recognition.replaceAll("_", " ")}</span>
                  )}
                  {attempt.help && (
                    <span>Help: {attempt.help.replaceAll("_", " ")}</span>
                  )}
                  {attempt.confidence && (
                    <span>Confidence: {attempt.confidence}/5</span>
                  )}
                  {!!attempt.for_review && (
                    <span>
                      <Flag size={12} />
                      For review
                    </span>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Empty
          title="A new challenge."
          description="Start a practice session to record your first attempt."
        />
      )}
      <section className="observations-section">
        <div className="section-heading">
          <h2>
            Things worth remembering
            <span>Insights, questions, and small discoveries.</span>
          </h2>
          <Button variant="ghost" onClick={() => setAdd(true)}>
            <Plus size={15} />
            Add reflection
          </Button>
        </div>
        {problem.observations?.length ? (
          <div className="inbox-grid">
            {problem.observations.map((o) => (
              <article className="inbox-card" key={o.id}>
                <span className="tag kind-note">{o.type}</span>
                <MathView content={o.content} />
                <small className="muted">{ago(o.created_at)}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="quiet-empty">
            The next insight could be a note away.
          </div>
        )}
      </section>
      <Modal open={add} onOpenChange={setAdd} title="Something to remember">
        <form onSubmit={observation} className="form-stack">
          <Field label="Kind of reflection">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                "insight",
                "mistake",
                "technique",
                "pattern",
                "question",
                "note",
              ].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Your reflection">
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              required
            />
          </Field>
          <Button busy={busy}>Keep this thought</Button>
        </form>
      </Modal>
    </div>
  );
}
