"use client";

import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function AdminPostsClient() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadPosts = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/posts", { credentials: "include" });
        if (!response.ok) {
          throw new Error("Failed to load posts.");
        }
        const data = await response.json();
        if (isMounted) {
          setPosts(data?.posts || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || "Unable to load posts.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDelete = async (postId) => {
    const confirmed = window.confirm("Delete this post? This cannot be undone.");
    if (!confirmed) return;

    const response = await fetch(`/api/admin/posts/${postId}`, { method: "DELETE", credentials: "include" });
    if (!response.ok) {
      return;
    }

    setPosts((prev) => prev.filter((post) => post.id !== postId));
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">ADMIN</div>
          <h1>Blog posts</h1>
          <p className="admin-sub">Draft, edit, and publish stories.</p>
        </div>
        <a className="btn-red" href="/admin/posts/new">New post</a>
      </div>

      <div className="admin-panel">
        {loading ? (
          <div className="admin-empty">Loading posts...</div>
        ) : error ? (
          <div className="admin-empty">{error}</div>
        ) : posts.length === 0 ? (
          <div className="admin-empty">
            <p>No posts yet.</p>
            <a className="btn-outline" href="/admin/posts/new">Create the first one</a>
          </div>
        ) : (
          <div className="admin-list">
            {posts.map((post) => (
              <div className="admin-row" key={post.id}>
                <div>
                  <div className="admin-row-title">{post.title}</div>
                  <div className="admin-row-meta">
                    <span>{post.author_name || "KastoChha"}</span>
                    <span>{formatDate(post.published_at || post.created_at)}</span>
                    {post.reading_time ? <span>{post.reading_time} min read</span> : null}
                  </div>
                </div>
                <div className="admin-row-status">
                  <span className={`admin-status ${post.status || "draft"}`}>
                    {post.status || "draft"}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <a className="btn-outline" href={`/admin/posts/${post.id}`}>Edit</a>
                  {post.status === "published" ? (
                    <a className="btn-outline" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : null}
                  <button type="button" className="btn-outline" onClick={() => handleDelete(post.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
