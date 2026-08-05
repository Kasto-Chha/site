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
  editErrorFor
}) {
  const total = topic.verdicts.pos + topic.verdicts.neu + topic.verdicts.neg;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const { user } = useUser();

  const [replyText, setReplyText] = useState("");
  const [replyVerdict, setReplyVerdict] = useState("");
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
    const url = `${window.location.origin}/discussions/${exp.id}`;
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
      <header
        className="topic-head"
        onClick={() => onToggle(topic.slug)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle(topic.slug);
          }
        }}
      >
        <div className="topic-meta-top">
          <span className="topic-cat">{topic.category}</span>
          <span className="topic-count-pill">
            {topic.count} experience{topic.count === 1 ? "" : "s"}
          </span>
          <span className="topic-collapse" aria-hidden="true">
            {isOpen ? "collapse" : "expand"}
          </span>
        </div>
        <h2 className="topic-title">{topic.title}</h2>
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
        <p className="topic-preview">
          <span className="topic-preview-by">
            {topic.top.author_name || "Anonymous"}:
          </span>{" "}
          {topic.top.summary}
        </p>
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
        <span className="topic-foot-meta">
          net {topic.score >= 0 ? "+" : ""}
          {topic.score} · updated {formatTimeAgo(topic.lastActivity)}
        </span>
      </div>

      {isOpen ? (
        <div className="exp-list">
          {ordered.map((exp) => {
            const tone = verdictTone(exp.verdict);
            const timeLabel = formatTimeAgo(exp.created_at);
            const myVote = voteOf?.(exp.id) || null;
            const busy = Boolean(isPending?.(exp.id));
            const voteError = errorFor?.(exp.id) || "";
            const mine = isMine(exp);
            const editBusy = Boolean(isEditBusy?.(exp.id));
            const editError = editErrorFor?.(exp.id) || "";
            return (
              <div className="exp-item" key={exp.id}>
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
                    {timeLabel ? <span>{timeLabel}</span> : null}
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
