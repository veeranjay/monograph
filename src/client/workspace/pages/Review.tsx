import React from "react";
import { Link } from "react-router-dom";
import { Check, Flag, ArrowUpRight, RotateCcw } from "lucide-react";
import { useWorkspace, useAction, request, isHidden } from "../data.js";
import { Button, Empty, PageHeading } from "../ui.js";

export function Review() {
  const { data } = useWorkspace();
  const action = useAction();
  if (!data) return null;
  const problems = data.review.filter(
    (p) => !isHidden(data, p.source_id) && !isHidden(data, p.subject_id || ""),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="A SECOND LOOK, A DEEPER UNDERSTANDING"
        title="Come back wiser."
        description="The problems you’ve flagged, ready when you are."
      />
      <div className="review-banner">
        <span className="quick-icon lavender">
          <RotateCcw size={23} />
        </span>
        <div>
          <h2>
            {problems.length
              ? `${problems.length} opportunities to grow`
              : "A clear head, a clear queue."}
          </h2>
          <p>
            Review at your own pace. Mark a problem understood when it clicks.
          </p>
        </div>
      </div>
      {problems.length ? (
        <div className="review-list">
          {problems.map((p) => (
            <article key={p.id} className="review-item">
              <span className="problem-number">{p.number}</span>
              <Link to={`/problem/${p.id}`}>
                <h3>{p.title || `Problem ${p.number}`}</h3>
                <p>
                  {p.subject_name} <span> / </span>
                  {p.source_name}
                </p>
              </Link>
              <span
                className={`result-pill result-${p.latest_result || "new"}`}
              >
                {p.latest_result || "For review"}
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  void action(
                    () =>
                      request(`/problems/${p.id}/reviewed`, { method: "POST" }),
                    "Marked understood",
                  ).catch(() => {})
                }
              >
                <Check size={15} />
                Understood
              </Button>
              <Link
                to={`/problem/${p.id}`}
                aria-label={`Review problem ${p.number}`}
                className="icon-button"
              >
                <ArrowUpRight size={18} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="You’re all caught up."
          description="Flag a tricky problem while practicing and it will find its way here."
          action={
            <Link className="button button-primary" to="/practice">
              Back to practice
            </Link>
          }
        />
      )}
    </div>
  );
}
