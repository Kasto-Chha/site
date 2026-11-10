"use client";

import { useState } from "react";

// One QR code in the list: a small preview, what it is called, the address it opens, how many
// times it was scanned, and what can be done with it. No state of its own, so it can be rendered
// and checked without a browser.
export function QrCodeRow({ code, siteUrl, busy, onRename, onToggle }) {
  const base = `/api/admin/sync/qr/${code.id}/download`;
  const address = `${siteUrl || "(this site)"}/q/${code.code}`;
  return (
    <div className="admin-row">
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {/* A plain <img>, on purpose: the preview is generated for each code, and next/image would send it through the image optimizer, which has a quota. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${base}?format=png&inline=1`} alt={`QR code for ${code.label}`} width={84} height={84} loading="lazy" />
        <div>
          <div className="admin-row-title">{code.label}</div>
          <div className="admin-row-meta">{address}</div>
          <div className="admin-row-meta">
            {code.scans} {code.scans === 1 ? "scan" : "scans"} · {code.scans7} in the last 7 days
          </div>
        </div>
      </div>
      <div className="admin-row-actions">
        <span className={`admin-status ${code.active ? "published" : "draft"}`}>{code.active ? "On" : "Switched off"}</span>
        <a className="btn-outline" href={`${base}?format=png`}>PNG</a>
        <a className="btn-outline" href={`${base}?format=pdf`}>Print sheet (PDF)</a>
        <button type="button" className="btn-outline" onClick={onRename} disabled={busy}>Rename</button>
        <button type="button" className="btn-outline" onClick={onToggle} disabled={busy}>{busy ? "Working…" : code.active ? "Switch off" : "Switch on"}</button>
      </div>
    </div>
  );
}

export default function QrCodesPanel({ merchantId, canCreate, siteUrl, initialCodes, loadError }) {
  const [codes, setCodes] = useState(initialCodes);
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  async function call(url, method, body) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "That did not work.");
    return data;
  }

  async function add(event) {
    event.preventDefault();
    setAdding(true);
    setMessage("");
    try {
      const data = await call(`/api/admin/sync/merchants/${merchantId}/qr`, "POST", { label });
      setCodes((current) => [...current, data.qr]);
      setLabel("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAdding(false);
    }
  }

  async function change(code, body) {
    setBusyId(code.id);
    setMessage("");
    try {
      const data = await call(`/api/admin/sync/qr/${code.id}`, "PUT", body);
      setCodes((current) => current.map((c) => (c.id === code.id ? { ...c, ...data.qr } : c)));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  function rename(code) {
    const next = window.prompt("New label for this QR code", code.label);
    if (next && next.trim() && next.trim() !== code.label) change(code, { label: next });
  }

  function toggle(code) {
    if (code.active && !window.confirm("Switch this code off? A printed card will send people to the KastoChha home page until you switch it on again.")) return;
    change(code, { active: !code.active });
  }

  return (
    <div className="admin-panel">
      <h2>QR codes</h2>
      <p className="admin-helper">
        One code for each table, the counter or the window. A customer who scans one lands on this business&apos;s hub. The PDF is an A5 sheet ready to print. Opening a code to test it counts as a scan.
      </p>
      {!siteUrl ? (
        <div className="admin-banner">NEXT_PUBLIC_SITE_URL is not set, so codes will point at the address you are using right now. Check the address under each code before printing.</div>
      ) : null}
      {loadError ? <div className="admin-banner">{loadError}</div> : null}
      {message ? <div className="admin-banner" role="status">{message}</div> : null}

      {codes.length === 0 && !loadError ? <div className="admin-empty">No QR codes yet.</div> : null}
      <div className="admin-list">
        {codes.map((code) => (
          <QrCodeRow key={code.id} code={code} siteUrl={siteUrl} busy={busyId === code.id} onRename={() => rename(code)} onToggle={() => toggle(code)} />
        ))}
      </div>

      {canCreate ? (
        <form className="admin-form" onSubmit={add}>
          <div className="admin-field">
            <label className="admin-label" htmlFor="qr-label">Add a QR code</label>
            <input id="qr-label" className="admin-input" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Table 4, Counter, Window" maxLength={60} autoComplete="off" />
          </div>
          <div className="admin-actions">
            <button type="submit" className="btn-red" disabled={adding}>{adding ? "Adding..." : "Add QR code"}</button>
          </div>
        </form>
      ) : (
        <div className="admin-helper">This business&apos;s tag has been removed, so it cannot get new QR codes. Restore the tag first.</div>
      )}
    </div>
  );
}
