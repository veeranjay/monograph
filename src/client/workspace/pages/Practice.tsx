import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Flag,
  Pause,
  Play,
  Plus,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api.js";
import type {
  PracticeLog,
  Problem,
  ResultType,
  TagCategory,
} from "../../types/index.js";
import {
  useWorkspace,
  useAction,
  request,
  isHidden,
  duration,
  ago,
} from "../data.js";
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
import { useDraft } from "../useDraft.js";
import { MathView } from "../../lib/katex.js";
import { MathInput } from "../MathInput.js";

export default function Practice({
  legacySource = false,
}: {
  legacySource?: boolean;
}) {
  const { id, sourceId } = useParams();
  return id && !legacySource ? (
    <SessionLoader key={id} id={id} />
  ) : (
    <PracticeHub sourceId={sourceId} />
  );
}
function PracticeHub({ sourceId }: { sourceId?: string }) {
  const { data } = useWorkspace();
  const create = useCreate();
  const action = useAction();
  const navigate = useNavigate();
  const [source, setSource] = useState(sourceId || "");
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const sources = data.sources.filter(
    (s) => !isHidden(data, s.id) && !isHidden(data, s.subject_id || ""),
  );
  const active = data.logs.filter(
    (l) => l.status !== "completed" && !isHidden(data, l.source_id),
  );
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const log = await action(() =>
        request<PracticeLog>("/workspace/sessions/start", {
          method: "POST",
          body: JSON.stringify({ source_id: source || sources[0]?.id }),
        }),
      );
      navigate(`/practice/${log.id}`);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="ONE PROBLEM AT A TIME"
        title="Find your flow."
        description="A quiet place to practice, reflect, and get a little better."
      />
      <section className="start-session-panel">
        <span className="quick-icon lavender">
          <Timer size={25} />
        </span>
        <div>
          <h2>A little focused time.</h2>
          <p>Choose a sheet. We’ll keep the timer and your place.</p>
        </div>
        {sources.length ? (
          <form onSubmit={start}>
            <select
              aria-label="Choose a practice sheet"
              value={source || sources[0]?.id}
              onChange={(e) => setSource(e.target.value)}
            >
              {sources.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                  {s.subject_name ? ` · ${s.subject_name}` : ""}
                </option>
              ))}
            </select>
            <Button busy={busy}>
              <Play size={15} />
              Start session
            </Button>
          </form>
        ) : (
          <Button onClick={() => create("sheet")}>
            <Plus size={16} />
            Create a sheet
          </Button>
        )}
      </section>
      <div className="section-heading">
        <h2>
          Right where you left off<span>Your sessions in progress.</span>
        </h2>
      </div>
      {active.length ? (
        <div className="sessions-grid">
          {active.map((log) => (
            <Link
              key={log.id}
              className="session-card"
              to={`/practice/${log.id}`}
            >
              <div>
                <span className="session-status">
                  <span />
                  {log.status === "paused" ? "Paused" : "In progress"}
                </span>
                <span>{ago(log.updated_at)}</span>
              </div>
              <h3>{log.source_name}</h3>
              <p>{log.subject_name || "Practice session"}</p>
              <div className="session-card-stats">
                <span>
                  <Timer size={14} />
                  {duration(log.time_seconds)}
                </span>
                <span>{log.attempts_count || 0} attempts</span>
              </div>
              <div className="session-resume">
                Continue session
                <ArrowRight size={16} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="A fresh start awaits."
          description="Pick a sheet above and give yourself a little focused time."
        />
      )}
      {!!data.logs.filter((l) => l.status === "completed").length && (
        <section className="completed-sessions">
          <div className="section-heading">
            <h2>
              Time well spent<span>Your completed sessions.</span>
            </h2>
          </div>
          {data.logs
            .filter((l) => l.status === "completed")
            .map((log) => (
              <Link
                to={`/practice/${log.id}`}
                key={log.id}
                className="completed-session"
              >
                <CheckCircle2 size={20} />
                <span>
                  <strong>{log.source_name}</strong>
                  <small>
                    {new Date(
                      log.completed_at || log.updated_at,
                    ).toLocaleDateString()}
                  </small>
                </span>
                <span>{log.attempts_count || 0} attempts</span>
                <span>{duration(log.time_seconds)}</span>
                <ArrowRight size={16} />
              </Link>
            ))}
        </section>
      )}
    </div>
  );
}
function SessionLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["session", id],
    queryFn: () => api.getLog(id),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  if (query.data.status === "completed")
    return <CompletedSession log={query.data} />;
  return <SourceLoader log={query.data} />;
}
function CompletedSession({ log }: { log: PracticeLog }) {
  let notes = log.notes_draft || "";
  try {
    const parsed = JSON.parse(notes);
    if (parsed?.version === 2) notes = parsed.draft.notes || "";
  } catch {}
  return (
    <div className="page">
      <Link className="back-link" to="/practice">
        <ArrowLeft size={15} />
        All sessions
      </Link>
      <PageHeading
        eyebrow="A LITTLE PROGRESS, WELL EARNED"
        title="Time well spent."
        description={`${log.source_name} · ${duration(log.time_seconds)} of focused time`}
        action={
          <Link
            className="button button-secondary"
            to={`/source/${log.source_id}`}
          >
            View sheet
            <ArrowRight size={15} />
          </Link>
        }
      />
      <div className="attempt-history">
        {log.attempts?.map((attempt, i) => (
          <details className="history-item" key={attempt.id}>
            <summary>
              <span className={`result-dot result-${attempt.result}`} />
              <strong>Problem {attempt.problem_number}</strong>
              <span className={`result-pill result-${attempt.result}`}>
                {attempt.result}
              </span>
              <span className="history-time">
                {duration(attempt.time_seconds || 0)}
              </span>
              <small>{ago(attempt.created_at)}</small>
            </summary>
            <div className="history-content">
              <MathView content={attempt.notes} />
              <Link className="text-link" to={`/problem/${attempt.problem_id}`}>
                View all attempts
                <ArrowRight size={14} />
              </Link>
            </div>
          </details>
        ))}
      </div>
      {notes && (
        <section className="panel">
          <div className="section-heading">
            <h2>
              A thought you left unfinished
              <span>
                Preserved with this session. It hasn’t been counted as an
                attempt.
              </span>
            </h2>
          </div>
          <MathView content={notes} />
        </section>
      )}
      {!log.attempts?.length && !notes && (
        <Empty
          title="A little room to start again."
          description="This session has no recorded attempts. Your sheet is ready for another visit."
        />
      )}
    </div>
  );
}
function SourceLoader({ log }: { log: PracticeLog }) {
  const query = useQuery({
    queryKey: ["source", log.source_id],
    queryFn: () => api.getSource(log.source_id),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return <Session key={log.id} log={log} problems={query.data.problems} />;
}
interface SessionDraft {
  problemId: string;
  notes: string;
  result: ResultType | "";
  review: boolean;
  recognition: string;
  help: string;
  confidence: string;
  tags: Record<string, string>;
  baseline: number;
}
function initialDraft(log: PracticeLog, problems: Problem[]): SessionDraft {
  let recovered: any;
  try {
    const parsed = JSON.parse(log.notes_draft || "null");
    if (parsed?.version === 2) recovered = parsed.draft;
  } catch {}
  return (
    recovered || {
      problemId: log.current_problem_id || problems[0]?.id || "",
      notes: log.notes_draft || "",
      result: "",
      review: false,
      recognition: "",
      help: "",
      confidence: "",
      tags: {},
      baseline: log.time_seconds,
    }
  );
}
function Session({ log, problems }: { log: PracticeLog; problems: Problem[] }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const action = useAction();
  const [running, setRunning] = useState(log.status === "in_progress");
  const runningRef = useRef(running);
  runningRef.current = running;
  const elapsedRef = useRef(log.time_seconds);
  const clockStart = useRef(Date.now());
  const [elapsed, setElapsed] = useState(log.time_seconds);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [finish, setFinish] = useState(false);
  const attemptId = useRef(crypto.randomUUID());
  const [showPreview, setShowPreview] = useState(false);
  const [searchParams] = useSearchParams();
  const categories = useQuery({
    queryKey: ["tag-categories"],
    queryFn: () => api.getTagCategories(),
  });
  const draft = useDraft(
    `monograph:session:${log.id}`,
    initialDraft(log, problems),
    (next) =>
      api.updateLog(log.id, {
        notes_draft: JSON.stringify({ version: 2, draft: next }),
        current_problem_id: next.problemId,
      }),
  );
  const value = draft.value;
  useEffect(() => {
    const requested = searchParams.get("problem");
    if (
      !requested ||
      requested === value.problemId ||
      !problems.some((p) => p.id === requested)
    )
      return;
    if (value.notes.trim() || value.result) {
      toast.info(
        "Resumed your unfinished problem. Save this attempt before switching.",
      );
      return;
    }
    draft.update({
      ...value,
      problemId: requested,
      baseline: log.time_seconds,
    });
  }, []);
  const problem = problems.find((p) => p.id === value.problemId);
  const index = problems.findIndex((p) => p.id === value.problemId);
  const getElapsed = () =>
    elapsedRef.current +
    (runningRef.current
      ? Math.floor((Date.now() - clockStart.current) / 1000)
      : 0);
  const getElapsedRef = useRef(getElapsed);
  getElapsedRef.current = getElapsed;
  useEffect(() => {
    const interval = setInterval(
      () => setElapsed(getElapsedRef.current()),
      500,
    );
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const persist = () => {
      if (!busyRef.current)
        void api
          .updateLog(log.id, {
            time_seconds: getElapsedRef.current(),
            status: runningRef.current ? "in_progress" : "paused",
          })
          .catch(() => {});
    };
    const interval = setInterval(persist, 10000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHidden);
      persist();
    };
  }, [log.id]);
  async function toggle() {
    if (busy) return;
    const total = getElapsed();
    elapsedRef.current = total;
    clockStart.current = Date.now();
    runningRef.current = !running;
    setRunning(!running);
    setElapsed(total);
    try {
      await api.updateLog(log.id, {
        time_seconds: total,
        status: runningRef.current ? "in_progress" : "paused",
      });
    } catch {
      toast.error(
        "Could not sync the timer. Your draft is kept on this device.",
      );
    }
  }
  function update(patch: Partial<SessionDraft>) {
    draft.update({ ...value, ...patch });
  }
  async function saveAttempt() {
    if (!problem || !value.result || busy) return;
    setBusy(true);
    busyRef.current = true;
    try {
      await draft.flush();
      const total = getElapsed();
      const next = problems[index + 1] || null;
      await request(`/workspace/sessions/${log.id}/attempt`, {
        method: "POST",
        body: JSON.stringify({
          id: attemptId.current,
          problem_id: problem.id,
          result: value.result,
          notes: value.notes,
          for_review: value.review,
          time_seconds: Math.max(0, total - value.baseline),
          session_time_seconds: total,
          next_problem_id: next?.id,
          recognition: value.recognition || undefined,
          help: value.help || undefined,
          confidence: value.confidence ? Number(value.confidence) : undefined,
          categorized_tags: Object.entries(value.tags).flatMap(
            ([category_id, tags]) =>
              tags
                .split(",")
                .map((tag) => ({ tag: tag.trim(), category_id }))
                .filter((t) => t.tag),
          ),
        }),
      });
      attemptId.current = crypto.randomUUID();
      draft.update({
        ...initialDraft(
          {
            ...log,
            notes_draft: null,
            time_seconds: total,
            current_problem_id: next?.id || problem.id,
          },
          problems,
        ),
        baseline: total,
      });
      await draft.flush();
      await client.invalidateQueries({ queryKey: ["workspace"] });
      await client.invalidateQueries({ queryKey: ["session", log.id] });
      toast.success(
        next
          ? "Attempt saved. On to the next."
          : "Attempt saved. You reached the end of this sheet.",
      );
      if (!next) setFinish(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save your attempt. Your draft is safe.",
      );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function complete() {
    setBusy(true);
    busyRef.current = true;
    try {
      await draft.flush();
      await action(
        () => api.completeLog(log.id, getElapsed()),
        "Session complete. A little progress, well earned.",
      );
      navigate("/practice");
    } catch {
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  if (!problems.length)
    return (
      <div className="page">
        <Empty
          title="Your sheet needs its first problem."
          description="Add a problem, then come back to get in the flow."
          action={
            <Link
              className="button button-primary"
              to={`/source/${log.source_id}`}
            >
              Add problems
            </Link>
          }
        />
      </div>
    );
  return (
    <div className="page session-page">
      <div className="session-topline">
        <Link className="back-link" to="/practice">
          <ArrowLeft size={15} />
          All sessions
        </Link>
        <div className="session-timer">
          <Timer size={16} />
          <span>{duration(elapsed)}</span>
          <button
            onClick={() => void toggle()}
            aria-label={running ? "Pause timer" : "Resume timer"}
          >
            {running ? <Pause size={15} /> : <Play size={15} />}
          </button>
        </div>
        <Button
          variant="secondary"
          onClick={() => setFinish(true)}
          disabled={busy}
        >
          Finish session
          <Check size={15} />
        </Button>
      </div>
      <PageHeading
        eyebrow={`${log.subject_name || "PRACTICE"} / ${log.source_name}`}
        title="Just you and the next step."
        description="Take your time. Understanding is worth it."
      />
      <div className="session-layout">
        <aside className="session-problems">
          <div className="section-heading">
            <h2>Problems</h2>
            <span>
              {index + 1} / {problems.length}
            </span>
          </div>
          <div className="session-problem-grid">
            {problems.map((p) => (
              <button
                key={p.id}
                className={`${p.id === problem?.id ? "selected" : ""} ${p.latest_result === "solved" ? "solved" : ""}`}
                disabled={busy}
                aria-label={`Problem ${p.number}`}
                aria-current={p.id === problem?.id ? "step" : undefined}
                onClick={() => {
                  if (p.id === problem?.id) return;
                  if (value.notes.trim() || value.result) {
                    toast.info(
                      "Save this attempt before changing problems. Your current draft is kept.",
                    );
                    return;
                  }
                  update({ problemId: p.id, baseline: getElapsed() });
                }}
              >
                {p.number}
              </button>
            ))}
          </div>
          <p className="muted session-draft-status">
            {draft.status === "error"
              ? "Draft kept on this device. Reconnect to sync."
              : draft.status === "saved"
                ? "Your place and draft are saved."
                : "Saving your place…"}
          </p>
        </aside>
        <section className="attempt-workspace">
          <div className="attempt-heading">
            <span className="problem-number large">
              {problem?.number || "?"}
            </span>
            <div>
              <span className="eyebrow">YOUR CURRENT CHALLENGE</span>
              <h2>{problem?.title || `Problem ${problem?.number}`}</h2>
            </div>
            <button
              className={`flag-button ${value.review ? "selected" : ""}`}
              aria-pressed={value.review}
              onClick={() => update({ review: !value.review })}
            >
              <Flag size={16} />
              {value.review ? "Flagged" : "Review later"}
            </button>
          </div>
          <div className="attempt-notes-heading">
            <label htmlFor="attempt-notes">Your working & reflections</label>
            <button
              className="text-link"
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? "Keep writing" : "Preview math"}
            </button>
          </div>
          {showPreview ? (
            <div className="attempt-preview">
              <MathView content={value.notes} />
            </div>
          ) : (
            <MathInput
              toolbar
              id="attempt-notes"
              className="attempt-notes"
              rows={9}
              value={value.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="What did you notice? Where did it click?\n\nMarkdown and LaTeX are welcome here."
            />
          )}
          <div className="attempt-result">
            <span>How did it go?</span>
            <div className="result-options">
              {(
                [
                  { key: "solved", label: "Got it", symbol: "✓" },
                  { key: "partial", label: "Partway there", symbol: "◐" },
                  { key: "failed", label: "Needs work", symbol: "↻" },
                  { key: "skipped", label: "Skipped", symbol: "→" },
                ] as const
              ).map((r) => (
                <button
                  key={r.key}
                  className={`result-option result-${r.key} ${value.result === r.key ? "selected" : ""}`}
                  onClick={() => update({ result: r.key })}
                  aria-pressed={value.result === r.key}
                >
                  <span aria-hidden="true">{r.symbol}</span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <details className="reflection-details">
            <summary>
              A little more reflection <ChevronDown size={16} />
            </summary>
            <div className="reflection-fields">
              <Field label="Did you recognize the approach?">
                <select
                  value={value.recognition}
                  onChange={(e) => update({ recognition: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  <option value="recognized_immediately">Straight away</option>
                  <option value="recognized_after_thinking">
                    After some thought
                  </option>
                  <option value="didnt_recognize">Not yet</option>
                  <option value="not_sure">Not sure</option>
                </select>
              </Field>
              <Field label="Any help along the way?">
                <select
                  value={value.help}
                  onChange={(e) => update({ help: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  <option value="none">Worked independently</option>
                  <option value="hint">Used a hint</option>
                  <option value="solution">Looked at the solution</option>
                  <option value="someone_helped">Someone helped</option>
                </select>
              </Field>
              <Field label="Confidence">
                <select
                  value={value.confidence}
                  onChange={(e) => update({ confidence: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </Field>
              {categories.data?.map((category) => (
                <Field
                  key={category.id}
                  label={`${category.name} tags`}
                  hint="Separate tags with commas."
                >
                  <input
                    value={value.tags[category.id] || ""}
                    onChange={(e) =>
                      update({
                        tags: { ...value.tags, [category.id]: e.target.value },
                      })
                    }
                    placeholder={category.description || "Add a tag"}
                  />
                </Field>
              ))}
            </div>
          </details>
          <div className="attempt-footer">
            <span>
              {draft.status === "error"
                ? "Your recovery copy is kept locally."
                : "Your notes save as you write."}
            </span>
            <Button
              busy={busy}
              disabled={!value.result || !problem}
              onClick={() => void saveAttempt()}
            >
              Save {index < problems.length - 1 ? "& next" : "attempt"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      </div>
      <Modal
        open={finish}
        onOpenChange={setFinish}
        title="A little progress, well earned."
        description="Finish when you’re ready. Your session and any unfinished draft will stay in your history."
      >
        <div className="finish-summary">
          <Timer size={25} />
          <strong>{duration(elapsed)}</strong>
          <span>Time spent finding your way.</span>
        </div>
        {(value.notes.trim() || value.result) && (
          <p className="recovery-notice">
            Your current draft is saved, but it won’t count as an attempt until
            you choose a result and save it.
          </p>
        )}
        <div className="dialog-footer">
          <Button variant="ghost" onClick={() => setFinish(false)}>
            Keep going
          </Button>
          <Button onClick={() => void complete()} busy={busy}>
            Finish session
            <Check size={16} />
          </Button>
        </div>
      </Modal>
    </div>
  );
}
