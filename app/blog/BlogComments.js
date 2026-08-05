"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { useState } from "react";

// Comment thread under a blog post. Authors can edit or delete their own
// comments (admins can delete any); `canEdit` / `canDelete` are decided on the
// server and the API re-checks ownership on every write, so these flags only
// control what the UI offers.
export default function BlogComments({ postId, initialComments = [] }) {
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Which comment is open in the inline editor, and its draft text.
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [rowBusy, setRowBusy] = useState(null);
  const [rowError, setRowError] = useState({});
  const [confirmingId, setConfirmingId] = useState(null);

  const formatTimeAgo = (value) => {
    if (!value) return "";
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const initialsFromName = (name) => {
    if (!name) return "AN";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "AN";
  };

  const setErrorFor = (id, message) =>
    setRowError((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = newComment.trim();
    if (!body || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/blog/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ postId, body })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to post comment.");
      }

      const data = await response.json();
      if (data?.comment) {
        // Just posted it, so it's ours to edit or remove.
        setComments((prev) => [
          ...prev,
          { ...data.comment, canEdit: true, canDelete: true }
        ]);
        setNewComment("");
      }
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (comment) => {
    setEditingId(comment.id);
    setEditDraft(comment.body || "");
    setConfirmingId(null);
    setErrorFor(comment.id, "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (comment) => {
    const body = editDraft.trim();
    if (!body) {
      setErrorFor(comment.id, "Comment cannot be empty.");
      return;
    }
    if (body === (comment.body || "")) {
      cancelEdit();
      return;
    }

    setRowBusy(comment.id);
    setErrorFor(comment.id, "");
    try {
      const response = await fetch(`/api/blog/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorFor(comment.id, data?.error || "Could not save your edit.");
        return;
      }

      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id ? { ...item, ...(data.comment || { body }) } : item
        )
      );
      cancelEdit();
    } catch {
      setErrorFor(comment.id, "Network problem — your edit was not saved.");
    } finally {
      setRowBusy(null);
    }
  };

  const deleteComment = async (comment) => {
    setRowBusy(comment.id);
    setErrorFor(comment.id, "");
    try {
      const response = await fetch(`/api/blog/comments/${comment.id}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorFor(comment.id, data?.error || "Could not delete the comment.");
        setConfirmingId(null);
        return;
      }

      setComments((prev) => prev.filter((item) => item.id !== comment.id));
      setConfirmingId(null);
      if (editingId === comment.id) cancelEdit();
    } catch {
      setErrorFor(comment.id, "Network problem — the comment was not deleted.");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <section className="post-comments">
      <h2 className="post-comments-title">
        Discussion <span className="post-comments-count">({comments.length})</span>
      </h2>

      {comments.length === 0 ? (
        <p className="comment-empty">
          No comments yet. Be the first to share your thoughts.
        </p>
      ) : (
        <div className="comment-list">
          {comments.map((comment) => {
            const busy = rowBusy === comment.id;
            const isEditing = editingId === comment.id;
            const message = rowError[comment.id] || "";

            return (
              <article className="comment" key={comment.id}>
                <div className="comment-av" aria-hidden>
                  {initialsFromName(comment.author_name)}
                </div>
                <div className="comment-main">
                  <div className="comment-top">
                    <span className="comment-name">
                      {comment.author_name || "Anonymous"}
                    </span>
                    <span className="comment-time">
                      {formatTimeAgo(comment.created_at)}
                      {comment.updated_at ? " · edited" : ""}
                    </span>
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        className="comment-input"
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="comment-actions">
                        <button
                          type="button"
                          className="comment-action primary"
                          onClick={() => saveEdit(comment)}
                          disabled={busy}
                        >
                          {busy ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="comment-action"
                          onClick={cancelEdit}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="comment-text">{comment.body}</p>
                  )}

                  {!isEditing && (comment.canEdit || comment.canDelete) ? (
                    <div className="comment-actions">
                      {comment.canEdit ? (
                        <button
                          type="button"
                          className="comment-action"
                          onClick={() => startEdit(comment)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                      ) : null}
                      {comment.canDelete ? (
                        confirmingId === comment.id ? (
                          <>
                            <span className="comment-confirm">Delete this comment?</span>
                            <button
                              type="button"
                              className="comment-action danger"
                              onClick={() => deleteComment(comment)}
                              disabled={busy}
                            >
                              {busy ? "Deleting..." : "Yes, delete"}
                            </button>
                            <button
                              type="button"
                              className="comment-action"
                              onClick={() => setConfirmingId(null)}
                              disabled={busy}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="comment-action danger"
                            onClick={() => setConfirmingId(comment.id)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        )
                      ) : null}
                    </div>
                  ) : null}

                  {message ? (
                    <p className="vote-error" role="status">{message}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="comment-form">
        <SignedIn>
          <form onSubmit={handleSubmit}>
            <div className="comment-label">Add to the conversation</div>
            <textarea
              className="comment-input"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Share your perspective honestly..."
              rows={3}
              required
            />
            <div className="comment-form-foot">
              <span className="comment-form-error">{error}</span>
              <button
                type="submit"
                className="btn-red"
                disabled={submitting || !newComment.trim()}
              >
                {submitting ? "Posting..." : "Post comment"}
              </button>
            </div>
          </form>
        </SignedIn>

        <SignedOut>
          <div className="comment-signedout">
            <p>Sign in to join the discussion.</p>
            <SignInButton mode="modal">
              <button type="button" className="btn-outline">
                Sign in to comment
              </button>
            </SignInButton>
          </div>
        </SignedOut>
      </div>
    </section>
  );
}
