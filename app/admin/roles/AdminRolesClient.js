"use client";

import { useState } from "react";

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super admin" }
];

export default function AdminRolesClient() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    if (!userId.trim() && !email.trim()) {
      setStatus("Provide a Clerk user ID or email.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: userId.trim() || undefined,
          email: email.trim() || undefined,
          role
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to update role.");
      }

      setStatus(`Updated ${data.userId} to ${data.role}.`);
      setUserId("");
      setEmail("");
    } catch (err) {
      setStatus(err?.message || "Unable to update role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">ADMIN</div>
          <h1>User roles</h1>
          <p className="admin-sub">Promote trusted contributors to admin roles.</p>
        </div>
        <a className="btn-outline" href="/admin">Back to admin</a>
      </div>

      <div className="admin-panel">
        {status ? <div className="admin-banner">{status}</div> : null}

        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-two">
            <div className="admin-field">
              <label className="admin-label">Clerk user ID</label>
              <input
                className="admin-input"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="user_123"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Email (optional)</label>
              <input
                className="admin-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-label">Role</label>
            <select className="admin-select" value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="admin-helper">Only super admins can assign the super admin role.</p>
          </div>

          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={saving}>
              {saving ? "Updating..." : "Update role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
