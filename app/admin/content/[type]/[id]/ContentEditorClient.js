"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { fieldMaxLength } from "../../../../../lib/admin/contentTypes";

function initialValues(config, row) {
  const values = {};
  for (const field of config.fields) {
    const existing = row ? row[field.name] : undefined;
    if (existing !== undefined && existing !== null) {
      values[field.name] = String(existing);
    } else if (field.default !== undefined) {
      values[field.name] = String(field.default);
    } else {
      values[field.name] = "";
    }
  }
  return values;
}

function Field({ field, value, onChange }) {
  const common = { id: `f-${field.name}`, value, onChange: (e) => onChange(field.name, e.target.value) };
  // The same ceilings the API enforces (lib/admin/contentTypes.js), so the
  // form stops an over-long value before a save round-trip does.
  const maxLength = fieldMaxLength(field);

  if (field.type === "textarea") {
    return <textarea className="admin-textarea" placeholder={field.placeholder || ""} maxLength={maxLength} {...common} />;
  }
  if (field.type === "number") {
    return (
      <input
        className="admin-input"
        type="number"
        step={1}
        min={field.min}
        max={field.max}
        placeholder={field.placeholder || ""}
        {...common}
      />
    );
  }
  if (field.type === "url") {
    return <input className="admin-input" type="text" inputMode="url" placeholder={field.placeholder || ""} maxLength={maxLength} {...common} />;
  }
  if (field.type === "select") {
    return (
      <select className="admin-select" {...common}>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }
  if (field.type === "color") {
    const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#cccccc";
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(field.name, e.target.value)}
          style={{ width: 44, height: 40, padding: 2, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--paper)", cursor: "pointer" }}
          aria-label={`${field.label} colour picker`}
        />
        <input className="admin-input" placeholder="#c8102e" maxLength={maxLength} {...common} />
      </div>
    );
  }
  return <input className="admin-input" type="text" placeholder={field.placeholder || ""} maxLength={maxLength} {...common} />;
}

export default function ContentEditorClient({ type, id, config, row, loadError = "" }) {
  const router = useRouter();
  const isNew = id === "new";
  const [values, setValues] = useState(() => initialValues(config, row));
  const [status, setStatus] = useState(loadError);
  const [saving, setSaving] = useState(false);

  const onChange = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const url = isNew ? `/api/admin/content/${type}` : `/api/admin/content/${type}/${id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Save failed.");
      router.push(`/admin/content/${type}`);
      router.refresh();
    } catch (err) {
      setStatus(err?.message || "Save failed.");
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">ADMIN</div>
          <h1>{isNew ? `New ${config.singular}` : `Edit ${config.singular}`}</h1>
          <p className="admin-sub">{config.blurb}</p>
        </div>
        <a className="btn-outline" href={`/admin/content/${type}`}>Back to list</a>
      </div>

      <div className="admin-panel">
        {status ? <div className="admin-banner">{status}</div> : null}

        <form className="admin-form" onSubmit={handleSubmit}>
          {config.fields.map((field) => (
            <div className="admin-field" key={field.name}>
              <label className="admin-label" htmlFor={`f-${field.name}`}>
                {field.label}{field.required ? " *" : ""}
              </label>
              <Field field={field} value={values[field.name] ?? ""} onChange={onChange} />
              {field.help ? <p className="admin-helper">{field.help}</p> : null}
            </div>
          ))}

          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={saving}>
              {saving ? "Saving…" : isNew ? `Create ${config.singular}` : "Save changes"}
            </button>
            <a className="btn-outline" href={`/admin/content/${type}`}>Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
