"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

function normalizePost(initialPost) {
  if (!initialPost) return null;
  return {
    id: initialPost.id,
    title: initialPost.title || "",
    slug: initialPost.slug || "",
    excerpt: initialPost.excerpt || "",
    content: initialPost.content || "",
    status: initialPost.status || "draft",
    coverImageUrl: initialPost.cover_image_url || initialPost.coverImageUrl || "",
    seoTitle: initialPost.seo_title || initialPost.seoTitle || "",
    seoDescription: initialPost.seo_description || initialPost.seoDescription || "",
    seoImageUrl: initialPost.seo_image_url || initialPost.seoImageUrl || "",
    readingTime: initialPost.reading_time || initialPost.readingTime || "",
    tags: initialPost.tags || [],
    categories: initialPost.categories || []
  };
}

function estimateReadingTime(html) {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  if (!text) return "";
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

export default function AdminPostEditor({ mode, initialPost }) {
  const router = useRouter();
  const normalized = normalizePost(initialPost);
  const [form, setForm] = useState(
    normalized || {
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      status: "draft",
      coverImageUrl: "",
      seoTitle: "",
      seoDescription: "",
      seoImageUrl: "",
      readingTime: "",
      tags: [],
      categories: []
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [tagsText, setTagsText] = useState(form.tags.join(", "));
  const [categoriesText, setCategoriesText] = useState(form.categories.join(", "));

  const quillModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "blockquote"],
        ["clean"]
      ]
    }),
    []
  );

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpload = async (event, targetField) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Upload failed.");
      }
      updateField(targetField, data.url || "");
    } catch (err) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const readingTimeValue = form.readingTime || estimateReadingTime(form.content);
    const payload = {
      title: form.title,
      slug: form.slug || undefined,
      excerpt: form.excerpt,
      content: form.content,
      status: form.status,
      coverImageUrl: form.coverImageUrl,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      seoImageUrl: form.seoImageUrl,
      readingTime: readingTimeValue,
      tags: form.tags,
      categories: form.categories
    };

    try {
      const endpoint = mode === "edit" ? `/api/admin/posts/${form.id}` : "/api/admin/posts";
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Save failed.");
      }

      if (mode === "create" && data?.post?.id) {
        router.push(`/admin/posts/${data.post.id}`);
      } else {
        updateField("readingTime", readingTimeValue || "");
      }
    } catch (err) {
      setError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form.id) return;
    const confirmed = window.confirm("Delete this post? This cannot be undone.");
    if (!confirmed) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/posts/${form.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Delete failed.");
      }
      router.push("/admin/posts");
    } catch (err) {
      setError(err?.message || "Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">ADMIN</div>
          <h1>{mode === "edit" ? "Edit post" : "New post"}</h1>
          <p className="admin-sub">Keep it sharp, publish when ready.</p>
        </div>
        <a className="btn-outline" href="/admin/posts">Back to posts</a>
      </div>

      <div className="admin-panel">
        {error ? <div className="admin-banner">{error}</div> : null}

        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-field">
            <label className="admin-label">Title</label>
            <input
              className="admin-input"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Story headline"
              required
            />
          </div>

          <div className="admin-two">
            <div className="admin-field">
              <label className="admin-label">Slug</label>
              <input
                className="admin-input"
                value={form.slug}
                onChange={(event) => updateField("slug", event.target.value)}
                placeholder="custom-slug"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Status</label>
              <select
                className="admin-select"
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-label">Excerpt</label>
            <textarea
              className="admin-textarea"
              value={form.excerpt}
              onChange={(event) => updateField("excerpt", event.target.value)}
              placeholder="Short summary for cards and SEO."
            />
          </div>

          <div className="admin-field admin-editor">
            <label className="admin-label">Content</label>
            <ReactQuill
              theme="snow"
              value={form.content}
              onChange={(value) => updateField("content", value)}
              modules={quillModules}
            />
          </div>

          <div className="admin-two">
            <div className="admin-field">
              <label className="admin-label">Cover image</label>
              <div className="admin-upload">
                <input
                  className="admin-input"
                  value={form.coverImageUrl}
                  onChange={(event) => updateField("coverImageUrl", event.target.value)}
                  placeholder="https://"
                />
                <label className="btn-outline admin-upload-btn">
                  {uploading ? "Uploading..." : "Upload"}
                  <input type="file" accept="image/*" onChange={(event) => handleUpload(event, "coverImageUrl")} hidden />
                </label>
              </div>
              {form.coverImageUrl ? (
                <div className="admin-preview">
                  <img src={form.coverImageUrl} alt="Cover preview" />
                </div>
              ) : null}
            </div>
            <div className="admin-field">
              <label className="admin-label">Reading time (min)</label>
              <input
                className="admin-input"
                type="number"
                min="1"
                value={form.readingTime}
                onChange={(event) => updateField("readingTime", event.target.value)}
                placeholder="Auto"
              />
            </div>
          </div>

          <div className="admin-two">
            <div className="admin-field">
              <label className="admin-label">Tags</label>
              <input
                className="admin-input"
                value={tagsText}
                onChange={(event) => {
                  const val = event.target.value;
                  setTagsText(val);
                  updateField(
                    "tags",
                    val
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                  );
                }}
                placeholder="culture, tech, lifestyle"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Categories</label>
              <input
                className="admin-input"
                value={categoriesText}
                onChange={(event) => {
                  const val = event.target.value;
                  setCategoriesText(val);
                  updateField(
                    "categories",
                    val
                      .split(",")
                      .map((cat) => cat.trim())
                      .filter(Boolean)
                  );
                }}
                placeholder="guides, features"
              />
            </div>
          </div>

          <div className="admin-divider"></div>

          <div className="admin-two">
            <div className="admin-field">
              <label className="admin-label">SEO title</label>
              <input
                className="admin-input"
                value={form.seoTitle}
                onChange={(event) => updateField("seoTitle", event.target.value)}
                placeholder="Optional override"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">SEO image</label>
              <div className="admin-upload">
                <input
                  className="admin-input"
                  value={form.seoImageUrl}
                  onChange={(event) => updateField("seoImageUrl", event.target.value)}
                  placeholder="https://"
                />
                <label className="btn-outline admin-upload-btn">
                  {uploading ? "Uploading..." : "Upload"}
                  <input type="file" accept="image/*" onChange={(event) => handleUpload(event, "seoImageUrl")} hidden />
                </label>
              </div>
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-label">SEO description</label>
            <textarea
              className="admin-textarea"
              value={form.seoDescription}
              onChange={(event) => updateField("seoDescription", event.target.value)}
              placeholder="Short summary for search."
            />
          </div>

          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={saving}>
              {saving ? "Saving..." : "Save post"}
            </button>
            {mode === "edit" ? (
              <button type="button" className="btn-outline" onClick={handleDelete} disabled={saving}>
                Delete
              </button>
            ) : null}
            <a className="btn-outline" href="/admin/posts">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
