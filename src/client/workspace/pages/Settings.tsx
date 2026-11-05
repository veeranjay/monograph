import React, { useState } from "react";
import { Check, Download, Monitor, Moon, Sun } from "lucide-react";
import { useWorkspace, useAction, request } from "../data.js";
import { Button, Field, PageHeading } from "../ui.js";

export function Settings() {
  const { data } = useWorkspace();
  const action = useAction();
  const [name, setName] = useState(data?.settings.name || "");
  const [goal, setGoal] = useState(String(data?.settings.weeklyGoal || 20));
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(
        () =>
          request("/workspace/settings", {
            method: "PUT",
            body: JSON.stringify({
              name: name.trim(),
              weeklyGoal: Number(goal),
            }),
          }),
        "Your space, updated",
      );
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your space, your way."
        description="A few small things to help this place feel like you."
      />
      <section className="settings-section">
        <div>
          <h2>The personal touches</h2>
          <p>How you like to be greeted, and a goal that works for you.</p>
        </div>
        <form onSubmit={save} className="form-stack">
          <Field
            label="Your name"
            hint="Used in your greeting and workspace name."
          >
            <input
              value={name}
              placeholder="What should we call you?"
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field
            label="Weekly practice goal"
            hint="A gentle target, never a deadline."
          >
            <input
              type="number"
              min={1}
              max={1000}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              required
            />
          </Field>
          <Button busy={busy} type="submit">
            Save preferences
          </Button>
        </form>
      </section>
      <section className="settings-section">
        <div>
          <h2>A different light</h2>
          <p>Set the mood for your next thought.</p>
        </div>
        <div className="appearance-options">
          {(
            [
              { key: "light", label: "Daylight", icon: Sun },
              { key: "dark", label: "After hours", icon: Moon },
              { key: "system", label: "With your device", icon: Monitor },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`${data.settings.appearance === key || (!data.settings.appearance && key === "light") ? "selected" : ""}`}
              onClick={() =>
                void action(() =>
                  request("/workspace/settings", {
                    method: "PUT",
                    body: JSON.stringify({ appearance: key }),
                  }),
                ).catch(() => {})
              }
            >
              <Icon size={23} />
              <span>{label}</span>
              {data.settings.appearance === key && <Check size={13} />}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>A little more room</h2>
          <p>Choose how your workspace feels.</p>
        </div>
        <label className="switch-row">
          <span>
            Compact spacing<small>Keep a little more in view.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!!data.settings.compact}
            onChange={(e) =>
              void action(() =>
                request("/workspace/settings", {
                  method: "PUT",
                  body: JSON.stringify({ compact: e.target.checked }),
                }),
              ).catch(() => {})
            }
          />
        </label>
      </section>
      <section className="settings-section">
        <div>
          <h2>Your work belongs to you</h2>
          <p>Local storage, open formats, and a clear way out.</p>
        </div>
        <div className="export-settings">
          <p>
            Export every database table, including notes, practice history,
            relationships, and annotations, as JSON. PDF files stay in your
            uploads folder; use <code>npm run backup</code> for a complete
            snapshot with the original PDFs.
          </p>
          <a
            className="button button-secondary"
            href="/api/workspace/export"
            download
          >
            <Download size={16} />
            Export workspace data
          </a>
          <div className="data-summary">
            <span>{data.notes.length} notes</span>
            <span>{data.sources.length} sheets</span>
            <span>{data.pdfs.length} PDFs</span>
            <span>{data.analytics.totalAttempts} attempts</span>
          </div>
        </div>
      </section>
      <div className="settings-version">
        <span className="brand-mark">
          m<span>•</span>
        </span>
        <span>
          Monograph 2.0
          <br />
          <small>A little clarity, every day.</small>
        </span>
      </div>
    </div>
  );
}
