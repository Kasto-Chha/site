"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BUSINESS_GROUPS, DEFAULT_BUSINESS_KIND, KIND_LABEL_MAX, OTHER_KIND } from "../../../../../lib/sync/businessTypes";
import { AREA_MAX } from "../../../../../lib/sync/prospects";

// Step 1 of an audit: which business is it.
export default function NewProspectClient() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [area, setArea] = useState("");
  const [businessKind, setBusinessKind] = useState(DEFAULT_BUSINESS_KIND);
  const [kindLabel, setKindLabel] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState(null);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setExisting(null);
    try {
      const res = await fetch("/api/admin/sync/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, area, businessKind, kindLabel: businessKind === OTHER_KIND ? kindLabel : "", googleMapsUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.existing) setExisting(data.existing);
        throw new Error(data.error || "Could not start this audit.");
      }
      router.push(`/admin/sync/audit/${data.prospect.id}`);
      router.refresh();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC · AUDIT</div>
          <h1>New audit</h1>
          <p className="admin-sub">Step 1 of 5: which business is it? Open its public Google profile in another tab, you will read it in the next step.</p>
        </div>
        <div className="admin-actions"><a className="btn-outline" href="/admin/sync/audit">Back</a></div>
      </div>
      <form className="admin-panel" onSubmit={save}>
        {error ? (
          <div className="admin-banner" role="alert">
            {error}{" "}
            {existing ? <a href={existing.kind === "business" ? `/admin/sync/${existing.id}` : `/admin/sync/audit/${existing.id}`}>Open it</a> : null}
          </div>
        ) : null}
        <div className="admin-field">
          <label className="admin-label" htmlFor="p-name">Business name</label>
          <input id="p-name" className="admin-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} required autoComplete="off" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="p-area">Area</label>
          <input id="p-area" className="admin-input" value={area} onChange={(e) => setArea(e.target.value)} maxLength={AREA_MAX} required autoComplete="off" placeholder="For example Jhamsikhel" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="p-kind">Type of business</label>
          <select id="p-kind" className="admin-select" value={businessKind} onChange={(e) => setBusinessKind(e.target.value)} autoComplete="off">
            {BUSINESS_GROUPS.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.types.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {businessKind === OTHER_KIND ? (
          <div className="admin-field">
            <label className="admin-label" htmlFor="p-label">What is it?</label>
            <input id="p-label" className="admin-input" value={kindLabel} onChange={(e) => setKindLabel(e.target.value)} maxLength={KIND_LABEL_MAX} autoComplete="off" placeholder="For example Motorcycle workshop" />
          </div>
        ) : null}
        <div className="admin-field">
          <label className="admin-label" htmlFor="p-maps">Google Maps link (optional)</label>
          <input id="p-maps" className="admin-input" value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)} maxLength={500} autoComplete="off" placeholder="https://maps.app.goo.gl/…" />
        </div>
        <div className="admin-actions">
          <button type="submit" className="btn-red" disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
        </div>
      </form>
    </div>
  );
}
