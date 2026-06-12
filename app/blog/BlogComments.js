"use client";

import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/nextjs";
import { useState } from "react";

export default function BlogComments({ postId, initialComments = [] }) {
  const { user } = useUser();
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
      }
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bento-card" style={{ marginTop: 24 }}>
      <div className="tr-title" style={{ marginBottom: 16 }}>
        Discussion ({comments.length})
      </div>

      {comments.length === 0 ? (
        <p className="tr-desc" style={{ color: "var(--muted2)", marginBottom: 24 }}>
          No comments yet. Be the first to share your thoughts!
        </p>
      ) : (
        <div className="feed-list" style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          {comments.map((comment) => (
            <div className="tr-card" key={comment.id} style={{ display: "flex", gap: 12, padding: "16px", background: "var(--surface-light)", borderRadius: "8px" }}>
              <div className="av av1" style={{ width: 36, height: 36, flexShrink: 0 }}>
                {initialsFromName(comment.author_name)}
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span className="wc-name" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    {comment.author_name || "Anonymous"}
                  </span>
                  <span className="wc-time" style={{ fontSize: "0.75rem", color: "var(--muted2)" }}>
                    {formatTimeAgo(comment.created_at)}
                  </span>
                </div>
                <p className="tr-desc" style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <SignedIn>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="fg" style={{ margin: 0 }}>
              <div className="flbl" style={{ marginBottom: 8, fontSize: "0.9rem" }}>
                Add to the conversation
              </div>
              <textarea
                className="fta"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your perspective honestly..."
                rows={3}
                required
                style={{ width: "100%" }}
              />
            </div>
            {error && (
              <div style={{ color: "var(--accent-red)", fontSize: "0.85rem" }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn-red"
              disabled={submitting || !newComment.trim()}
              style={{ alignSelf: "flex-end", minWidth: 120 }}
            >
              {submitting ? "Posting..." : "Post Comment"}
            </button>
          </form>
        </SignedIn>

        <SignedOut>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p className="tr-desc" style={{ marginBottom: 12 }}>
              You need to sign in to share a comment.
            </p>
            <SignInButton mode="modal">
              <button type="button" className="btn-outline">
                Sign in to Comment
              </button>
            </SignInButton>
          </div>
        </SignedOut>
      </div>
    </section>
  );
}
