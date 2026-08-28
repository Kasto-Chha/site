"use client";

import { useMemo, useState } from "react";

import SiteNav from "../components/SiteNav";
import TopicThread from "../components/TopicThread";
import useReviewVotes from "../components/useReviewVotes";
import useExperienceEdits from "../components/useExperienceEdits";
import useRequireSignIn from "../components/useRequireSignIn";
import TopicSuggest from "../components/TopicSuggest";
import { topicSlug } from "../../lib/slug";
import { buildTopics } from "../../lib/topics";
import {
  CATEGORY_LABELS,
  categoryLabel,
  categoryTone
} from "../../lib/categories";

const VERDICT_OPTIONS = ["Ramro chha", "Thikai chha", "Naramro chha"];

export default function ExperienceClient({
  reviews = [],
  myVotes = {},
  questions = [],
  hasMore: initialHasMore = false,
  nextOffset: initialOffset = 30,
  page = 1,
  pageSize = 30
}) {
  const { items, setItems, handleVote, voteOf, isPending, errorFor } = useReviewVotes(
    reviews,
    myVotes
  );
  const { editExperience, removeExperience, isEditBusy, editErrorFor } =
    useExperienceEdits(setItems);
  const [submitting, setSubmitting] = useState(false);
  // The share form's contents, so a refresh during sign-in doesn't discard
  // what someone typed.
  const requireSignIn = useRequireSignIn({
    draftKey: "discussions:share",
    onRestore: (draft) => {
      setTopic(draft.topic || "");
      setCategory(draft.category || "");
      setVerdict(draft.verdict || "");
      setSummary(draft.summary || "");
      setError("Signed in — your experience is ready to post.");
      requestAnimationFrame(() => {
        document
          .getElementById("share-review")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  });
  // Threads loaded beyond the first page. Held separately from `reviews` so a
  // server refresh — after posting, say — replaces the first page without
  // discarding what has already been loaded below it.
  const [extraRows, setExtraRows] = useState([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialOffset);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/discussions/page?offset=${nextOffset}`);
      if (!response.ok) throw new Error("Could not load more");
      const data = await response.json();
      setExtraRows((rows) => [...rows, ...(data.rows || [])]);
      setHasMore(Boolean(data.hasMore));
      setNextOffset(data.nextOffset || nextOffset + 30);
    } catch {
      // Leave what is on screen and let them try again — a failed "load more"
      // should never take the list away.
      setHasMore(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const [activeFilter, setActiveFilter] = useState("All");
  const [sortMode, setSortMode] = useState("discussed");
  const [expanded, setExpanded] = useState(() => new Set());
  const [error, setError] = useState("");

  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("");
  const [verdict, setVerdict] = useState("");
  const [summary, setSummary] = useState("");
  // The thread the typed topic will join, if one already exists. Reported by
  // TopicSuggest from the live /api/topics/search, not derived from this
  // page's own loaded rows — those exclude any thread that's still an
  // unanswered question (getThreadPage holds those back for the "Community is
  // Asking" section), so a topic like a bare "samsung" that exists only as an
  // open question was invisible to the old page-rows-only check even though
  // it was right there in the suggestions dropdown above it.
  const [matchedTopic, setMatchedTopic] = useState(null);

  // buildTopics groups by slug, so a thread arriving on a later page cannot
  // duplicate one already shown — the rows merge into the same thread.
  const topics = useMemo(
    () => buildTopics([...items, ...extraRows]),
    [items, extraRows]
  );

  // Filter by canonical label, not the raw stored string, so rows saved as
  // "Technology" and "Tech & Gadgets" collapse into one filter chip instead of
  // splitting the same niche across two.
  const categories = useMemo(
    () =>
      Array.from(
        new Set(topics.map((t) => categoryLabel(t.category)).filter(Boolean))
      ),
    [topics]
  );
  const filterOptions = ["All", ...categories];

  const visibleTopics = useMemo(() => {
    const filtered =
      activeFilter === "All"
        ? topics
        : topics.filter((t) => categoryLabel(t.category) === activeFilter);

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

  // Load a posted question into the share form, so answering one is a scroll
  // and a paragraph rather than retyping the topic by hand.
  const answerQuestion = (item) => {
    const label = categoryLabel(item.category);
    // The SUBJECT, not the question text. Setting the whole question here
    // created a second thread named after the sentence, sitting beside the one
    // named after the subject.
    setTopic(item.topic || item.question || "");
    // Only preselect a niche the dropdown actually offers; anything else (an
    // old free-text category, or none at all) leaves the picker untouched.
    setCategory(CATEGORY_LABELS.includes(label) ? label : "");
    setError("");
    const panel = document.getElementById("share-review");
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      document.querySelector('#share-review textarea[name="summary"]')?.focus();
    }, 350);
  };

  const toggleTopic = (slug) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // Inline Reddit-style reply: posts into the same reviews pool with the
  // thread's canonical topic + category so it lands in this thread.
  const submitInlineReply = async (topicItem, { summary, verdict }) => {
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: topicItem.title,
          category: topicItem.category,
          verdict: verdict || "",
          summary
        })
      });

      // Open Clerk over the page instead of navigating: the thread stays
      // open and the reply is posted for them once they're signed in.
      if (response.status === 401) {
        requireSignIn(() => submitInlineReply(topicItem, { summary, verdict }));
        return { ok: false };
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: false, error: data?.error || "Could not post your reply. Try again." };
      }

      const data = await response.json();
      if (data?.review) {
        setItems((prev) => [data.review, ...prev]);
        setExpanded((prev) => new Set(prev).add(topicItem.slug));
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not post your reply. Try again." };
    }
  };

  // `event` is optional: when this is re-run after sign-in there is no form
  // submit event to cancel.
  const submitReview = async (event) => {
    event?.preventDefault();
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

      // Same here: the form keeps everything they typed because the page is
      // never unmounted, and the experience posts itself after sign-in.
      if (response.status === 401) {
        requireSignIn(() => submitReview(), { topic, category, verdict, summary });
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
      <SiteNav shareHref="#share-review" />

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">NEPAL&apos;S CURIOUS COMMUNITY</div>
              <h1 className="page-title upright">KastoChha <em>Experience</em></h1>
              <p className="page-sub">
                From momo to mausam, gadgets to careers — real experiences from
                people across Nepal, grouped by topic. Vote, reply, and post
                yours; it joins everyone talking about the same thing.
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
                    { key: "discussed", label: "Hot" },
                    { key: "active", label: "New" },
                    { key: "top", label: "Top" }
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
                  visibleTopics.map((topicItem) => (
                    <TopicThread
                      key={topicItem.slug}
                      topic={topicItem}
                      isOpen={expanded.has(topicItem.slug)}
                      onToggle={toggleTopic}
                      onVote={handleVote}
                      voteOf={voteOf}
                      isPending={isPending}
                      errorFor={errorFor}
                      onReply={submitInlineReply}
                      onEdit={editExperience}
                      onDelete={removeExperience}
                      isEditBusy={isEditBusy}
                      editErrorFor={editErrorFor}
                    />
                  ))
                )}

                {/* Nothing on this site should become unreachable through age.
                    A question asked a year ago and never answered is exactly
                    the sort of thing someone should be able to find and answer,
                    so the list pages back through every thread rather than
                    stopping at the recent ones. */}
                {page > 1 ? (
                  // A crawler landing on ?page=5 needs a way back. Without
                  // this, deep pages are dead ends — links lead forward only,
                  // and neither a person nor a crawler can walk back up.
                  <div className="load-more-row">
                    <a
                      className="btn-outline load-more"
                      href={page === 2 ? "/discussions" : `/discussions?page=${page - 1}`}
                    >
                      &lt;- Newer discussions
                    </a>
                  </div>
                ) : null}

                {hasMore ? (
                  <div className="load-more-row">
                    {/* A real link, enhanced rather than replaced.
                        Googlebot renders JavaScript but does not click, so a
                        button alone left every thread past this page reachable
                        only through the sitemap — which on this domain went
                        unread for months at a time. The href is what a crawler
                        follows; onClick intercepts it for people and loads the
                        next batch in place. Neither depends on the other. */}
                    <a
                      className="btn-outline load-more"
                      href={`/discussions?page=${page + 1}`}
                      onClick={(event) => {
                        // Let modified clicks through — a middle-click or
                        // ctrl-click means "open in a new tab", and hijacking
                        // that is a small rudeness people notice.
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                          return;
                        }
                        event.preventDefault();
                        loadMore();
                      }}
                      aria-disabled={loadingMore ? "true" : undefined}
                    >
                      {loadingMore ? "Loading…" : "Load older discussions"}
                    </a>
                  </div>
                ) : null}
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
                    {/* Only the title. This form already detects an exact match and
                        replaces the category picker with a "Joining existing
                        topic" banner showing the thread's own category — which
                        is better than prefilling a field, because it explains
                        what is about to happen rather than just filling a box. */}
                    <TopicSuggest
                      value={topic}
                      onPick={setTopic}
                      onExactMatch={setMatchedTopic}
                    />
                  </div>

                  {matchedTopic ? (
                    <div className="topic-match-note">
                      <strong>Joining existing topic</strong>
                      <span>
                        {matchedTopic.title} · {matchedTopic.experiences} experience
                        {matchedTopic.experiences === 1 ? "" : "s"} · {matchedTopic.category}
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
                        {CATEGORY_LABELS.map((option) => (
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

              {questions.length > 0 ? (
                <div className="review-panel bento-card">
                  <h3>Community is asking</h3>
                  <p>
                    Questions posted through &ldquo;Ask a KastoChha&rdquo;, still
                    waiting on someone who has been there.
                  </p>
                  <ul className="open-q-list">
                    {questions.map((item) => (
                      <li key={item.id} className="open-q">
                        <p className="open-q-text">{item.question}</p>
                        <div className="open-q-actions">
                          {item.category ? (
                            <span
                              className="open-q-cat"
                              style={{ color: categoryTone(item.category) }}
                            >
                              {categoryLabel(item.category)}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="open-q-link"
                            onClick={() => answerQuestion(item)}
                          >
                            Answer this
                          </button>
                          <a
                            className="open-q-link"
                            href={`/chat?q=${encodeURIComponent(item.question)}`}
                          >
                            Ask Assist
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

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
