"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// `children` is rendered between the header and the list, for a type that has
// something to show above its rows (the trending-search rules do).
export default function ContentListClient({
  type,
  config,
  rows = [],
  loadError = "",
  canDelete,
  children
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState(loadError);

  // router.refresh() hands this component fresh rows, but state initialised
  // from a prop keeps its first value — so a row created elsewhere on the page
  // would not appear until a full reload. Follow the server's list.
  useEffect(() => {
    setItems(rows);
  }, [rows]);

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete this ${config.singular}? This cannot be undone.`)) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/content/${type}/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed.");
      setItems((prev) => prev.filter((row) => row.id !== id));
      router.refresh();
    } catch (err) {
      setError(err?.message || "Delete failed.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">ADMIN</div>
          <h1>{config.label}</h1>
          <p className="admin-sub">{config.blurb}</p>
        </div>
        <div className="admin-row-actions">
          <a className="btn-outline" href="/admin">Back to admin</a>
          <a className="btn-red" href={`/admin/content/${type}/new`}>New {config.singular}</a>
        </div>
      </div>

      {children}

      <div className="admin-panel">
        {error ? <div className="admin-banner">{error}</div> : null}

        {items.length === 0 ? (
          <div className="admin-empty">
            <p>No {config.label.toLowerCase()} yet.</p>
            <a className="btn-red" href={`/admin/content/${type}/new`}>Create the first one</a>
          </div>
        ) : (
          <div className="admin-list">
            {items.map((row) => (
              <div className="admin-row" key={row.id}>
                <div>
                  <div className="admin-row-title">{row[config.titleField] || "(untitled)"}</div>
                  <div className="admin-row-meta">
                    <span>{config.subtitleField}: {String(row[config.subtitleField] ?? "—")}</span>
                    <span>id: {String(row.id).slice(0, 8)}…</span>
                  </div>
                </div>
                <span className="admin-status">{config.singular}</span>
                <div className="admin-row-actions">
                  <a className="btn-outline" href={`/admin/content/${type}/${row.id}`}>Edit</a>
                  {canDelete ? (
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={busyId === row.id}
                      onClick={() => handleDelete(row.id)}
                    >
                      {busyId === row.id ? "Deleting…" : "Delete"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
