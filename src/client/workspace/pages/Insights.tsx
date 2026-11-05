import React from "react";
import { useWorkspace, ago } from "../data.js";
import { PageHeading, Empty } from "../ui.js";
import { Link } from "react-router-dom";

export function Insights() {
  const { data } = useWorkspace();
  if (!data) return null;
  const a = data.analytics;
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 13 + i);
    const attempts = data.activity.filter(
      (x) => new Date(x.created_at).toDateString() === date.toDateString(),
    );
    return {
      label: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      value: attempts.length,
      solved: attempts.filter((x) => x.result === "solved").length,
    };
  });
  const max = Math.max(5, ...days.map((d) => d.value));
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR EFFORT, IN PERSPECTIVE"
        title="See how far you’ve come."
        description="A gentler look at your progress. Every attempt counts."
      />
      <div className="metrics-grid">
        {[
          [a.totalAttempts, "Total attempts", "Every small step adds up."],
          [
            a.totalProblemsAttempted,
            "Problems explored",
            "A growing world of understanding.",
          ],
          [
            `${Math.round(a.solveRate)}%`,
            "Solve rate",
            "Across all recorded attempts.",
          ],
          [
            `${Math.round(a.averageTimeSeconds / 60)} min`,
            "Average attempt",
            "Your own pace is a good pace.",
          ],
        ].map(([value, label, copy]) => (
          <section className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>{copy}</p>
          </section>
        ))}
      </div>
      <div className="insights-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>
              A little more, every day
              <span>Your last 14 days of practice.</span>
            </h2>
            <span className="chart-legend">
              <i />
              Attempts
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`Practice over the last 14 days: ${days.map((d) => `${d.label}, ${d.value} attempts`).join("; ")}`}
          >
            {days.map((d, i) => (
              <div className="chart-column" key={i}>
                <div className="bar-space">
                  <div
                    className={`chart-bar ${i === 13 ? "current" : ""}`}
                    style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
                    title={`${d.label}: ${d.value} attempts`}
                  >
                    {d.value > 0 && <span>{d.value}</span>}
                  </div>
                </div>
                <small>{i % 3 === 0 || i === 13 ? d.label : ""}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel results-panel">
          <div className="section-heading">
            <h2>How it’s going</h2>
          </div>
          {Object.entries(a.resultBreakdown).map(([key, value]) => (
            <div className="breakdown-row" key={key}>
              <div>
                <span className={`result-dot result-${key}`} />
                <span>{key === "failed" ? "Needs work" : key}</span>
                <strong>{value}</strong>
              </div>
              <div className="progress-track">
                <span
                  className={`result-${key}`}
                  style={{
                    width: `${a.totalAttempts ? (value / a.totalAttempts) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="section-heading">
          <h2>
            Little steps, recorded<span>Your recent practice history.</span>
          </h2>
        </div>
        {data.activity.length ? (
          <div className="activity-list">
            {data.activity.slice(0, 15).map((x) => (
              <Link key={x.id} to={`/problem/${x.problem_id}`}>
                <span className={`result-dot result-${x.result}`} />
                <div>
                  <strong>{x.title || `Problem ${x.number}`}</strong>
                  <small>{x.source_name}</small>
                </div>
                <span className={`result-pill result-${x.result}`}>
                  {x.result === "failed" ? "Needs work" : x.result}
                </span>
                <small>{ago(x.created_at)}</small>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="Your story starts here."
            description="Complete a practice attempt to start seeing your progress."
          />
        )}
      </section>
    </div>
  );
}
