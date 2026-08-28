"use client";

import { useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

import {
  IconArrowDown,
  IconArrowUp,
  IconChat,
  IconLink,
  IconPen,
  IconReply,
  IconTrash
} from "./icons";
import { formatTimeAgo, scoreOf, verdictTone } from "../../lib/topics";
import { categoryLabel, categoryTone } from "../../lib/categories";
import { isoTime } from "./sectionHelpers";

const VERDICT_OPTIONS = ["Ramro chha", "Thikai chha", "Naramro chha"];

// One Reddit-style topic thread: a collapsed header with the verdict breakdown
// and top comment, expanding to the full list of experiences with up/down votes,
// reply/share actions, and an inline composer (when onReply is provided).
// Shared by the homepage wall and the dedicated Experience page.
export default function TopicThread({
  topic,
  isOpen,
  onToggle,
  onVote,
  voteOf,
  isPending,
  errorFor,
  onReply,
  onEdit,
  onDelete,
  isEditBusy,
  editErrorFor,
  // A reply typed before signing in, handed back after the page reloaded, so
  // the composer opens with their own words rather than empty.
  restoredReply = null,
  // The thread's own page links to itself, so it opts out.
  showPermalink = true
}) {
  const total = topic.verdicts.pos + topic.verdicts.neu + topic.verdicts.neg;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const { user } = useUser();

  // The thread's slug is its address. Every experience inside it links here,
  // so the topic accumulates on one page instead of splitting across one URL
  // per reply.
  const permalink = topic.slug ? `/discussions/${topic.slug}` : "";

  const [replyText, setReplyText] = useState(restoredReply?.summary || "");
  const [replyVerdict, setReplyVerdict] = useState(restoredReply?.verdict || "");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const composerRef = useRef(null);

  // Inline editor state for whichever of my own experiences is open.
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editVerdict, setEditVerdict] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);

  // Only the author sees edit/delete. The API checks this again on every write.
  const isMine = (exp) => Boolean(user?.id) && exp.user_id === user.id;

  const startEdit = (exp) => {
    setEditingId(exp.id);
    setEditText(exp.summary || "");
    setEditVerdict(exp.verdict || "");
    setConfirmingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditVerdict("");
  };

  const saveEdit = async (exp) => {
    const result = await onEdit(exp.id, {
      summary: editText,
      verdict: editVerdict
    });
    if (result?.ok) cancelEdit();
  };

  // Reddit-style "best" ordering, frozen while the thread stays open: the id
  // order only recomputes when the thread is (re)opened or a comment is added,
  // so voting updates counts in place instead of making items jump around.
  const orderedIds = useMemo(
    () =>
      [...topic.experiences]
        .sort(
          (a, b) =>
            scoreOf(b) - scoreOf(a) ||
            new Date(b.created_at) - new Date(a.created_at)
        )
        .map((exp) => exp.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic.slug, isOpen, topic.experiences.length]
  );

  // Resolve fresh objects each render so vote counts stay live.
  const ordered = orderedIds
    .map((id) => topic.experiences.find((exp) => exp.id === id))
    .filter(Boolean);

  const isOp = (exp) => {
    if (topic.op?.user_id && exp.user_id) return exp.user_id === topic.op.user_id;
    return Boolean(topic.op?.author_name) && exp.author_name === topic.op.author_name;
  };

  const focusComposer = (mention) => {
    if (!isOpen) onToggle(topic.slug);
    if (mention) {
      setReplyText((prev) =>
        prev.startsWith(`@${mention}`) ? prev : `@${mention} ${prev}`
      );
    }
    // Wait a tick so the composer exists when the thread was collapsed.
    setTimeout(() => composerRef.current?.focus(), 60);
  };

  const copyLink = async (exp) => {
    // Deep-links to the specific experience via a fragment. A fragment is not
    // a separate URL to a search engine, so per-experience sharing still works
    // without minting a duplicate page for every reply.
    const url = `${window.location.origin}/discussions/${topic.slug}#exp-${exp.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(exp.id);
      setTimeout(() => setCopiedId((prev) => (prev === exp.id ? null : prev)), 1600);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const submitReply = async (event) => {
    event.preventDefault();
    if (sending) return;
    const summary = replyText.trim();
    if (!summary) {
      setReplyError("Write your experience first.");
      return;
    }
    setReplyError("");
    setSending(true);
    try {
      const result = await onReply(topic, { summary, verdict: replyVerdict });
      if (result?.ok) {
        setReplyText("");
        setReplyVerdict("");
      } else if (result?.error) {
        setReplyError(result.error);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <article className={`topic-thread ${isOpen ? "open" : ""}`}>
      {/* Clicking the header still toggles the thread, but it is no longer a
          role="button": the title is a real link to the thread's own page, and
          an interactive control can't be nested inside another one. Keyboard
          users get the same toggle from .topic-toggle in the footer below. */}
      <header className="topic-head" onClick={() => onToggle(topic.slug)}>
        <div className="topic-meta-top">
          <span className="topic-cat" style={{ color: categoryTone(topic.category) }}>
            {categoryLabel(topic.category)}
          </span>
          <span className="topic-count-pill">
            {topic.count} experience{topic.count === 1 ? "" : "s"}
          </span>
          <span className="topic-collapse" aria-hidden="true">
            {isOpen ? "collapse" : "expand"}
          </span>
        </div>
        <h2 className="topic-title">
          {showPermalink && permalink ? (
            <a
              className="topic-title-link"
              href={permalink}
              onClick={(event) => event.stopPropagation()}
            >
              {topic.title}
            </a>
          ) : (
            topic.title
          )}
        </h2>
      </header>

      {total > 0 ? (
        <div className="verdict-block">
          <div className="verdict-bar" aria-hidden="true">
            {topic.verdicts.pos > 0 ? (
              <span
                className="verdict-seg pos"
                style={{ width: `${pct(topic.verdicts.pos)}%` }}
              />
            ) : null}
            {topic.verdicts.neu > 0 ? (
              <span
                className="verdict-seg neu"
                style={{ width: `${pct(topic.verdicts.neu)}%` }}
              />
            ) : null}
            {topic.verdicts.neg > 0 ? (
              <span
                className="verdict-seg neg"
                style={{ width: `${pct(topic.verdicts.neg)}%` }}
              />
            ) : null}
          </div>
          <div className="verdict-legend">
            <span className="verdict-chip pos">Ramro {topic.verdicts.pos}</span>
            <span className="verdict-chip neu">Thikai {topic.verdicts.neu}</span>
            <span className="verdict-chip neg">Naramro {topic.verdicts.neg}</span>
          </div>
        </div>
      ) : null}

      {!isOpen ? (
        topic.top.kind === "question" ? (
          // The preview exists to show what someone SAID about the topic. On a
          // question with no answers the only row is the question itself, so it
          // would print the heading again — a stutter where a prompt belongs.
          //
          // Once an answer arrives, topic.top is the highest-scoring row, which
          // is that answer, and the preview goes back to being useful. So this
          // is the empty state, not a label questions carry forever.
          <p className="topic-preview topic-preview-empty">
            This question is yet to be answered, be the first one.
          </p>
        ) : (
          <p className="topic-preview">
            <span className="topic-preview-by">
              {topic.top.author_name || "Anonymous"}:
            </span>{" "}
            {topic.top.summary}
          </p>
        )
      ) : null}

      <div className="topic-foot">
        <button
          type="button"
          className="topic-toggle"
          onClick={() => onToggle(topic.slug)}
          aria-expanded={isOpen}
        >
          <IconChat className="icon" />
          {isOpen
            ? "Hide experiences"
            : `Read ${topic.count} experience${topic.count === 1 ? "" : "s"}`}
        </button>
        {onReply ? (
          <button
            type="button"
            className="topic-toggle topic-reply-cta"
            onClick={() => focusComposer()}
          >
            <IconReply className="icon" />
            Add yours
          </button>
        ) : null}
        {showPermalink && permalink ? (
          <a className="topic-toggle topic-open-cta" href={permalink}>
            <IconLink className="icon" />
            Open thread
          </a>
        ) : null}
        <span className="topic-foot-meta">
          net {topic.score >= 0 ? "+" : ""}
          {topic.score} · updated{" "}
          <time dateTime={isoTime(topic.lastActivity)}>
            {formatTimeAgo(topic.lastActivity)}
          </time>
        </span>
      </div>

      {isOpen ? (
        <div className="exp-list">
          {/* The question is already the thread's heading — rendering its row
              as a card too would print it twice. Answers only here. */}
          {ordered.filter((exp) => exp.kind !== "question").map((exp) => {
            const tone = verdictTone(exp.verdict);
            const timeLabel = formatTimeAgo(exp.created_at);
            const myVote = voteOf?.(exp.id) || null;
            const busy = Boolean(isPending?.(exp.id));
            const voteError = errorFor?.(exp.id) || "";
            const mine = isMine(exp);
            const editBusy = Boolean(isEditBusy?.(exp.id));
            const editError = editErrorFor?.(exp.id) || "";
            return (
              // Anchor target for the per-experience "Copy link" above. Lets a
              // contributor share their own reply without that reply needing a
              // URL of its own.
              <div className="exp-item" id={`exp-${exp.id}`} key={exp.id}>
                <div className="review-vote">
                  <button
                    type="button"
                    className={`vote-btn ${myVote === "up" ? "voted" : ""}`}
                    aria-label={myVote === "up" ? "Remove your upvote" : "Upvote"}
                    aria-pressed={myVote === "up"}
                    disabled={busy}
                    onClick={() => onVote(exp.id, "up")}
                  >
                    <IconArrowUp className="icon" />
                  </button>
                  <span className="vote-count">{scoreOf(exp)}</span>
                  <button
                    type="button"
                    className={`vote-btn ${myVote === "down" ? "voted" : ""}`}
                    aria-label={myVote === "down" ? "Remove your downvote" : "Downvote"}
                    aria-pressed={myVote === "down"}
                    disabled={busy}
                    onClick={() => onVote(exp.id, "down")}
                  >
                    <IconArrowDown className="icon" />
                  </button>
                </div>
                <div className="exp-body">
                  <div className="exp-meta">
                    <span className="exp-author">
                      {exp.author_name || "Anonymous"}
                    </span>
                    {isOp(exp) ? <span className="exp-op">OP</span> : null}
                    {timeLabel ? (
                      <time dateTime={isoTime(exp.created_at)}>{timeLabel}</time>
                    ) : null}
                    {exp.verdict ? (
                      <span className={`exp-verdict ${tone}`}>{exp.verdict}</span>
                    ) : null}
                  </div>
                  {editingId === exp.id ? (
                    <form
                      className="exp-editor"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveEdit(exp);
                      }}
                    >
                      <textarea
                        className="thread-composer-input"
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="thread-composer-row">
                        <div className="thread-verdicts">
                          {VERDICT_OPTIONS.map((option) => (
                            <button
                              type="button"
                              key={option}
                              className={`thread-verdict ${verdictTone(option)} ${
                                editVerdict === option ? "on" : ""
                              }`}
                              onClick={() =>
                                setEditVerdict((prev) => (prev === option ? "" : option))
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                        <div className="exp-editor-actions">
                          <button
                            type="submit"
                            className="thread-composer-send"
                            disabled={editBusy}
                          >
                            {editBusy ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="exp-action"
                            onClick={cancelEdit}
                            disabled={editBusy}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <p className="exp-text">{exp.summary}</p>
                  )}

                  {voteError ? (
                    <p className="vote-error" role="status">{voteError}</p>
                  ) : null}
                  {editError ? (
                    <p className="vote-error" role="status">{editError}</p>
                  ) : null}

                  {editingId === exp.id ? null : (
                    <div className="exp-actions">
                      {onReply ? (
                        <button
                          type="button"
                          className="exp-action"
                          onClick={() => focusComposer(exp.author_name || "Anonymous")}
                        >
                          <IconReply className="icon" />
                          Reply
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="exp-action"
                        onClick={() => copyLink(exp)}
                      >
                        <IconLink className="icon" />
                        {copiedId === exp.id ? "Copied!" : "Share"}
                      </button>

                      {mine && onEdit ? (
                        <button
                          type="button"
                          className="exp-action"
                          onClick={() => startEdit(exp)}
                          disabled={editBusy}
                        >
                          <IconPen className="icon" />
                          Edit
                        </button>
                      ) : null}

                      {mine && onDelete ? (
                        confirmingId === exp.id ? (
                          <>
                            <span className="exp-confirm">Delete this?</span>
                            <button
                              type="button"
                              className="exp-action is-danger"
                              onClick={() => onDelete(exp.id)}
                              disabled={editBusy}
                            >
                              {editBusy ? "Deleting..." : "Yes, delete"}
                            </button>
                            <button
                              type="button"
                              className="exp-action"
                              onClick={() => setConfirmingId(null)}
                              disabled={editBusy}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="exp-action is-danger"
                            onClick={() => setConfirmingId(exp.id)}
                            disabled={editBusy}
                          >
                            <IconTrash className="icon" />
                            Delete
                          </button>
                        )
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {onReply ? (
            <form className="thread-composer" onSubmit={submitReply}>
              <textarea
                ref={composerRef}
                className="thread-composer-input"
                placeholder={`Share your experience on "${topic.title}"...`}
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                rows={3}
              />
              <div className="thread-composer-row">
                <div className="thread-verdicts">
                  {VERDICT_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option}
                      className={`thread-verdict ${verdictTone(option)} ${
                        replyVerdict === option ? "on" : ""
                      }`}
                      onClick={() =>
                        setReplyVerdict((prev) => (prev === option ? "" : option))
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <button type="submit" className="thread-composer-send" disabled={sending}>
                  {sending ? "Posting..." : "Post reply ->"}
                </button>
              </div>
              {replyError ? <div className="form-error">{replyError}</div> : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
