import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BookOpen, Play, Plus } from "lucide-react";
import {
  useWorkspace,
  libraryItems,
  isHidden,
  duration,
  displayTitle,
} from "../data.js";
import { Button, Empty, ItemCard, PageHeading } from "../ui.js";
import { useCreate } from "../Shell.js";

export function Home() {
  const { data } = useWorkspace();
  const navigate = useNavigate();
  const create = useCreate();
  if (!data) return null;
  const items = libraryItems(data).filter(
    (i) => !i.trashed && !isHidden(data, i.subjectId || ""),
  );
  const pinned = items.filter((i) => i.pinned).slice(0, 3);
  const recent = items.filter((i) => !i.pinned).slice(0, 4);
  const active = data.logs.find(
    (l) =>
      l.status !== "completed" &&
      !isHidden(data, l.source_id) &&
      !isHidden(data, l.subject_id || ""),
  );
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = data.settings.name?.trim().split(" ")[0];
  return (
    <div className="page home-page">
      <PageHeading
        title={`${greeting}${name ? ", " + name : ""}.`}
        description="Your workspace, ready when you are."
      />
      <section className="resume-card" aria-label="Continue your work">
        <div className="resume-symbol" aria-hidden="true">
          <BookOpen size={28} strokeWidth={1.3} />
        </div>
        <div className="resume-copy">
          <span className="eyebrow">
            {active ? "CONTINUE YOUR SESSION" : "MAKE A LITTLE PROGRESS"}
          </span>
          <h2>
            {active
              ? displayTitle(active.source_name || "Practice")
              : "One problem at a time."}
          </h2>
          <p>
            {active ? (
              <>
                {active.subject_name || "Practice"}
                <span>·</span>
                {active.attempts_count || 0} attempts saved<span>·</span>
                {duration(active.time_seconds)}
              </>
            ) : (
              "Choose a sheet and give it your full attention."
            )}
          </p>
        </div>
        <Button
          onClick={() =>
            navigate(active ? `/practice/${active.id}` : "/practice")
          }
        >
          <Play size={16} />
          {active ? "Continue studying" : "Start practice"}
          <ArrowRight size={16} />
        </Button>
      </section>
      {pinned.length > 0 && (
        <section className="home-section">
          <div className="section-heading">
            <h2>Pinned</h2>
            <Link to="/library?pinned=true">
              View all
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="card-grid">
            {pinned.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      <section className="home-section">
        <div className="section-heading">
          <h2>Recent</h2>
          <Link to="/library">
            Open library
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {recent.length ? (
          <div className="item-list home-recents">
            {recent.map((item) => (
              <ItemCard key={item.id} item={item} list />
            ))}
          </div>
        ) : (
          <Empty
            title="A fresh page."
            description="Add your first note, PDF, or practice sheet."
            action={
              <Button onClick={() => create("note")}>
                <Plus size={16} />
                New note
              </Button>
            }
          />
        )}
      </section>
      <section className="home-section">
        <div className="section-heading">
          <h2>Notebooks</h2>
          <Link to="/notebooks">
            View all
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="home-notebook-list">
          {data.subjects
            .filter((s) => !isHidden(data, s.id))
            .slice(0, 4)
            .map((s) => (
              <Link key={s.id} to={`/notebook/${s.id}`}>
                <BookOpen size={20} />
                <strong>{s.name}</strong>
                <span>{s.sheet_count || s.sources_count || 0} sheets</span>
                <ArrowRight size={16} />
              </Link>
            ))}
          <button onClick={() => create("notebook")}>
            <Plus size={18} />
            New notebook
          </button>
        </div>
      </section>
    </div>
  );
}
