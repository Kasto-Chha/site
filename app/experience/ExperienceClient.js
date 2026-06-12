"use client";

import { useMemo, useState } from "react";

import NavAuth from "../components/NavAuth";
import { IconArrowDown, IconArrowUp, IconChat } from "../components/icons";
import { topicSlug } from "../../lib/slug";

const VERDICT_TONES = {
  "ramro chha": "pos",
  "thikai chha": "neu",
  "naramro chha": "neg"
};

const VERDICT_OPTIONS = ["Ramro chha", "Thikai chha", "Naramro chha"];
const CATEGORY_OPTIONS = [
  "Technology",
  "Career",
  "Education",
  "Housing",
  "Finance",
  "Lifestyle"
];

function verdictTone(value) {
  if (!value) return "neu";
  return VERDICT_TONES[value.trim().toLowerCase()] || "neu";
}

function formatTimeAgo(value) {
  if (!value) return "";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function scoreOf(item) {
  return (item.upvotes || 0) - (item.downvotes || 0);
}

// Collapse a flat list of reviews into topic threads keyed by their slug, so
// multiple experiences about the same subject live under one heading.
function buildTopics(items) {
  const map = new Map();

  for (const item of items) {
    const slug =
      item.topic_slug || topicSlug(item.topic || item.title) || "general";
    if (!map.has(slug)) {
      map.set(slug, { slug, experiences: [] });
    }
    map.get(slug).experiences.push(item);
  }

  const topics = [];
  for (const group of map.values()) {
    const experiences = group.experiences;
    // The oldest post sets the canonical title/category for the thread.
    const oldest = experiences.reduce((acc, item) =>
      new Date(item.created_at) < new Date(acc.created_at) ? item : acc
    );
    const lastActivity = experiences.reduce(
      (acc, item) =>
        new Date(item.created_at) > new Date(acc) ? item.created_at : acc,
      experiences[0].created_at
    );

    const verdicts = { pos: 0, neu: 0, neg: 0 };
    let score = 0;
    for (const item of experiences) {
      verdicts[verdictTone(item.verdict)] += 1;
      score += scoreOf(item);
    }

    const top = experiences.reduce((acc, item) =>
      scoreOf(item) > scoreOf(acc) ? item : acc
    );

    topics.push({
      slug: group.slug,
      title: oldest.topic || oldest.title,
      category: oldest.category || "General",
      experiences,
      top,
      count: experiences.length,
      score,
      verdicts,
      lastActivity
    });
  }

  return topics;
}

export default function ExperienceClient({ reviews = [] }) {
  const [items, setItems] = useState(reviews);
  const [submitting, setSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [sortMode, setSortMode] = useState("active");
  const [expanded, setExpanded] = useState(() => new Set());
  const [voted, setVoted] = useState(() => new Set());
  const [error, setError] = useState("");

  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("");
  const [verdict, setVerdict] = useState("");
  const [summary, setSummary] = useState("");

  const topics = useMemo(() => buildTopics(items), [items]);

  const categories = useMemo(
    () => Array.from(new Set(topics.map((t) => t.category).filter(Boolean))),
    [topics]
  );
  const filterOptions = ["All", ...categories];

  const visibleTopics = useMemo(() => {
    const filtered =
      activeFilter === "All"
        ? topics
        : topics.filter((t) => t.category === activeFilter);

    const sorted = [...filtered];
    if (sortMode === "top") {
      sorted.sort((a, b) => b.score - a.score || b.count - a.count);
    } else if (sortMode === "discussed") {
      sorted.sort(
        (a, b) =>
          b.count - a.count ||
          new Date(b.lastActivity) - new Date(a.lastActivity)
      );
    } else {
      sorted.sort(
        (a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)
      );
    }
    return sorted;
  }, [topics, activeFilter, sortMode]);

  const topTopics = useMemo(
    () =>
      [...topics].sort((a, b) => b.count - a.count || b.score - a.score).slice(0, 5),
    [topics]
  );

  // Live preview of which existing thread the in-progress post will join.
  const matchedTopic = useMemo(() => {
    const slug = topicSlug(topic);
    if (!slug) return null;
    return topics.find((t) => t.slug === slug) || null;
  }, [topics, topic]);

  const toggleTopic = (slug) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleVote = async (id, direction) => {
    if (voted.has(id)) return;
    setVoted((prev) => new Set(prev).add(id));

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item };
        if (direction === "up") next.upvotes = (next.upvotes || 0) + 1;
        else next.downvotes = (next.downvotes || 0) + 1;
        return next;
      })
    );

    try {
      const response = await fetch("/api/votes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, direction })
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) {
        setVoted((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return;
      }

      const payload = await response.json();
      if (payload?.review) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? payload.review : item))
        );
      }
    } catch {
      setVoted((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const resolvedTitle = topic.trim();
    const resolvedCategory = matchedTopic ? matchedTopic.category : category.trim();
    const resolvedSummary = summary.trim();

    if (!resolvedTitle || !resolvedCategory || !resolvedSummary) {
      setError("Add a topic, category, and your experience to post.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: resolvedTitle,
          category: resolvedCategory,
          verdict: verdict.trim(),
          summary: resolvedSummary
        })
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "Could not post your experience. Try again.");
        return;
      }

      const data = await response.json();
      if (data?.review) {
        const review = data.review;
        const slug =
          review.topic_slug || topicSlug(review.topic || review.title);
        setItems((prev) => [review, ...prev]);
        if (slug) setExpanded((prev) => new Set(prev).add(slug));
        setTopic("");
        setCategory("");
        setVerdict("");
        setSummary("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <nav id="mainnav">
        <a href="/" className="logo">
          Kasto<em>Chha</em>
        </a>
        <div className="nav-links">
          <a href="/trending" className="nav-link">Trending</a>
          <a href="/popular" className="nav-link">Popular</a>
          <a href="/featured" className="nav-link">Featured</a>
          <a href="/battle" className="nav-link">Battle</a>
          <a href="/experience" className="nav-link">Experience</a>
        </div>
        <div className="nav-actions">
          <a className="btn-outline" href="/chat">Ask community</a>
          <a className="btn-red" href="#share-review">Share a story</a>
          <NavAuth />
        </div>
      </nav>

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">COMMUNITY EXPERIENCES</div>
              <h1 className="page-title">KastoChha Experience</h1>
              <p className="page-sub">
                Real stories, grouped by topic. Post yours and it joins everyone
                else talking about the same thing.
              </p>
            </div>
            <div className="page-actions">
              <a className="btn-outline" href="/chat">Ask community</a>
              <a className="btn-red" href="#share-review">Share a story</a>
            </div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="review-layout">
            <div>
              <div className="review-toolbar">
                {filterOptions.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className={`review-filter ${label === activeFilter ? "active" : ""}`}
                    onClick={() => setActiveFilter(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="review-sortbar">
                <span className="review-sort-label">
                  {visibleTopics.length} topic{visibleTopics.length === 1 ? "" : "s"}
                </span>
                <div className="review-sort">
                  {[
                    { key: "active", label: "Active" },
                    { key: "top", label: "Top" },
                    { key: "discussed", label: "Most shared" }
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`review-sort-btn ${sortMode === option.key ? "active" : ""}`}
                      onClick={() => setSortMode(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="topic-feed">
                {visibleTopics.length === 0 ? (
                  <div className="review-card empty-card">
                    <div className="review-body">
                      <div className="review-title">No experiences yet</div>
                      <div className="review-text">
                        Be the first to share your experience.
                      </div>
                    </div>
                  </div>
                ) : (
                  visibleTopics.map((topicItem) => {
                    const isOpen = expanded.has(topicItem.slug);
                    const total =
                      topicItem.verdicts.pos +
                      topicItem.verdicts.neu +
                      topicItem.verdicts.neg;
                    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

                    return (
                      <article className="topic-thread" key={topicItem.slug}>
                        <header className="topic-head">
                          <div className="topic-meta-top">
                            <span className="topic-cat">{topicItem.category}</span>
                            <span className="topic-count-pill">
                              {topicItem.count} experience
                              {topicItem.count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <h2 className="topic-title">{topicItem.title}</h2>
                        </header>

                        {total > 0 ? (
                          <div className="verdict-block">
                            <div className="verdict-bar" aria-hidden="true">
                              {topicItem.verdicts.pos > 0 ? (
                                <span
                                  className="verdict-seg pos"
                                  style={{ width: `${pct(topicItem.verdicts.pos)}%` }}
                                />
                              ) : null}
                              {topicItem.verdicts.neu > 0 ? (
                                <span
                                  className="verdict-seg neu"
                                  style={{ width: `${pct(topicItem.verdicts.neu)}%` }}
                                />
                              ) : null}
                              {topicItem.verdicts.neg > 0 ? (
                                <span
                                  className="verdict-seg neg"
                                  style={{ width: `${pct(topicItem.verdicts.neg)}%` }}
                                />
                              ) : null}
                            </div>
                            <div className="verdict-legend">
                              <span className="verdict-chip pos">
                                Ramro {topicItem.verdicts.pos}
                              </span>
                              <span className="verdict-chip neu">
                                Thikai {topicItem.verdicts.neu}
                              </span>
                              <span className="verdict-chip neg">
                                Naramro {topicItem.verdicts.neg}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {!isOpen ? (
                          <p className="topic-preview">
                            <span className="topic-preview-by">
                              {topicItem.top.author_name || "Anonymous"}:
                            </span>{" "}
                            {topicItem.top.summary}
                          </p>
                        ) : null}

                        <div className="topic-foot">
                          <button
                            type="button"
                            className="topic-toggle"
                            onClick={() => toggleTopic(topicItem.slug)}
                            aria-expanded={isOpen}
                          >
                            <IconChat className="icon" />
                            {isOpen
                              ? "Hide experiences"
                              : `Read ${topicItem.count} experience${
                                  topicItem.count === 1 ? "" : "s"
                                }`}
                          </button>
                          <span className="topic-foot-meta">
                            net {topicItem.score >= 0 ? "+" : ""}
                            {topicItem.score} · updated{" "}
                            {formatTimeAgo(topicItem.lastActivity)}
                          </span>
                        </div>

                        {isOpen ? (
                          <div className="exp-list">
                            {topicItem.experiences.map((exp) => {
                              const tone = verdictTone(exp.verdict);
                              const timeLabel = formatTimeAgo(exp.created_at);
                              return (
                                <div className="exp-item" key={exp.id}>
                                  <div className="review-vote">
                                    <button
                                      type="button"
                                      className="vote-btn"
                                      aria-label="Upvote"
                                      onClick={() => handleVote(exp.id, "up")}
                                    >
                                      <IconArrowUp className="icon" />
                                    </button>
                                    <span className="vote-count">{scoreOf(exp)}</span>
                                    <button
                                      type="button"
                                      className="vote-btn"
                                      aria-label="Downvote"
                                      onClick={() => handleVote(exp.id, "down")}
                                    >
                                      <IconArrowDown className="icon" />
                                    </button>
                                  </div>
                                  <div className="exp-body">
                                    <div className="exp-meta">
                                      <span className="exp-author">
                                        {exp.author_name || "Anonymous"}
                                      </span>
                                      {timeLabel ? <span>{timeLabel}</span> : null}
                                      {exp.verdict ? (
                                        <span className={`exp-verdict ${tone}`}>
                                          {exp.verdict}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="exp-text">{exp.summary}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <aside className="review-side">
              <div className="review-panel bento-card" id="share-review">
                <h3>Share an experience</h3>
                <p>
                  Type a topic. If it already exists, your story joins that
                  thread automatically.
                </p>
                <form onSubmit={submitReview}>
                  <div className="fg" style={{ marginTop: "12px" }}>
                    <div className="flbl">Topic</div>
                    <input
                      className="finp"
                      name="topic"
                      type="text"
                      placeholder="e.g. Ncell vs NTC data"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                    />
                  </div>

                  {matchedTopic ? (
                    <div className="topic-match-note">
                      <strong>Joining existing topic</strong>
                      <span>
                        {matchedTopic.title} · {matchedTopic.count} experience
                        {matchedTopic.count === 1 ? "" : "s"} · {matchedTopic.category}
                      </span>
                    </div>
                  ) : (
                    <div className="fg">
                      <div className="flbl">Category</div>
                      <select
                        className="fsel"
                        name="category"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                      >
                        <option value="">Select category...</option>
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="fg">
                    <div className="flbl">Verdict</div>
                    <select
                      className="fsel"
                      name="verdict"
                      value={verdict}
                      onChange={(event) => setVerdict(event.target.value)}
                    >
                      <option value="">Choose verdict...</option>
                      {VERDICT_OPTIONS.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="fg">
                    <div className="flbl">Your experience</div>
                    <textarea
                      className="fta"
                      name="summary"
                      placeholder="Share what worked, what did not, and any costs or tips."
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                    ></textarea>
                  </div>

                  {error ? <div className="form-error">{error}</div> : null}

                  <button type="submit" className="fsub" disabled={submitting}>
                    {submitting
                      ? "Posting..."
                      : matchedTopic
                      ? "Add to topic ->"
                      : "Post experience ->"}
                  </button>
                </form>
              </div>

              <div className="review-panel bento-card">
                <h3>Top topics</h3>
                {topTopics.length === 0 ? (
                  <p className="review-text">No topics yet.</p>
                ) : (
                  <ul className="topic-rank">
                    {topTopics.map((topicItem) => (
                      <li key={topicItem.slug}>
                        <span className="topic-rank-name">{topicItem.title}</span>
                        <span className="topic-rank-count">
                          {topicItem.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="review-panel bento-card">
                <h3>Guidelines</h3>
                <ul className="review-list">
                  <li>Be specific about time, place, and cost.</li>
                  <li>Share what worked and what did not.</li>
                  <li>Avoid personal attacks and rumors.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
