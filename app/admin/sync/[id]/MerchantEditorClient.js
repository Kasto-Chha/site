"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { OTHER_KIND, categoryForKind } from "../../../../lib/sync/businessTypes";
import { BusinessTypeSelect, CategoryControl, KindLabelField } from "../CategoryControl";
import { countLabel } from "../../../../lib/sync/text";
import { ABOUT_MAX } from "../../../../lib/sync/validate";

// `operatorView` is an operator's version of the page: the details form, without the section that removes or restores the tag.
export default function MerchantEditorClient({ merchant, operatorView = false }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(merchant.business_name);
  const [area, setArea] = useState(merchant.area);
  const [businessKind, setBusinessKind] = useState(merchant.business_kind);
  const [kindLabel, setKindLabel] = useState(merchant.kind_label || "");
  // A category different from the type's own was chosen by hand: keep it until the admin says otherwise.
  const [categoryOverride, setCategoryOverride] = useState(
    merchant.category && merchant.category !== categoryForKind(merchant.business_kind) ? merchant.category : ""
  );
  const [pickingCategory, setPickingCategory] = useState(false);
  const [about, setAbout] = useState(merchant.about);
  const [googlePlaceId, setGooglePlaceId] = useState(merchant.google_place_id);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(merchant.google_review_url);
  const [googleMapsUrl, setGoogleMapsUrl] = useState(merchant.google_maps_url);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [ok, setOk] = useState(false);

  const active = merchant.status === "active";
  const derivedCategory = categoryForKind(businessKind);
  const activeOverride = categoryOverride && categoryOverride !== derivedCategory ? categoryOverride : "";
  const category = activeOverride || derivedCategory;

  async function send(body, success) {
    setSaving(true);
    setStatus("");
    setOk(false);
    try {
      const res = await fetch(`/api/admin/sync/merchants/${merchant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setStatus(success);
      setOk(true);
      router.refresh();
    } catch (error) {
      setStatus(error?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function save(event) {
    event.preventDefault();
    send({ businessName, area, businessKind, kindLabel: businessKind === OTHER_KIND ? kindLabel : "", categoryOverride: activeOverride, about, googlePlaceId, googleReviewUrl, googleMapsUrl }, "Saved.");
  }

  function toggle() {
    if (active) {
      const sure = window.confirm("Remove the business tag? The thread and every post stay. Only the business header and extras go. You can restore it later.");
      if (!sure) return;
      send({ status: "cancelled" }, "The business tag was removed.");
    } else {
      send({ status: "active" }, "The business tag was restored.");
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>{merchant.business_name}, {merchant.area}</h1>
          <p className="admin-sub">
            <span className={`admin-status ${active ? "published" : "draft"}`}>{active ? "Active" : "Tag removed"}</span>{" "}
            {countLabel(merchant.posts, "experience", "experiences")} · {countLabel(merchant.questions, "question", "questions")}{merchant.hasOwner ? " · owner linked" : ""}
          </p>
        </div>
        <div className="admin-actions">
          <a className="btn-outline" href="/admin/sync/businesses">Back</a>
          <a className="btn-outline" href={`/discussions/${merchant.topic_slug}`}>View thread</a>
        </div>
      </div>

      {status ? <div className="admin-banner" role="status">{status}</div> : null}

      <div className="admin-panel">
        <h2>Addresses</h2>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="thread-address">Thread address (permanent)</label>
            <input autoComplete="off" id="thread-address" className="admin-input" type="text" value={`/discussions/${merchant.topic_slug}`} readOnly />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="hub-address">Hub address (permanent)</label>
            <input autoComplete="off" id="hub-address" className="admin-input" type="text" value={`/hub/${merchant.slug}`} readOnly />
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="thread-title">Thread title (permanent)</label>
          <input id="thread-title" autoComplete="off" className="admin-input" type="text" value={merchant.thread_title} readOnly />
        </div>
        <div className="admin-helper">None of these can change after tagging. Posts are sent under the thread title, so renaming the business never splits its thread.</div>
      </div>

      <form className="admin-form admin-panel" onSubmit={save}>
        <h2>Details</h2>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="business-name">Display name</label>
            <input autoComplete="off" id="business-name" className="admin-input" type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} required />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="area">Area</label>
            <input autoComplete="off" id="area" className="admin-input" type="text" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} required />
          </div>
        </div>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="kind">Type of business</label>
            <BusinessTypeSelect
              id="kind"
              value={businessKind}
              onChange={(e) => {
                setBusinessKind(e.target.value);
                if (e.target.value !== OTHER_KIND) setKindLabel("");
              }}
            />
          </div>
          <div className="admin-field">
            <CategoryControl
              effective={category}
              derived={derivedCategory}
              overridden={Boolean(activeOverride)}
              picking={pickingCategory}
              onStartPicking={() => setPickingCategory(true)}
              onChoose={(label) => {
                setCategoryOverride(label === derivedCategory ? "" : label);
                setPickingCategory(false);
              }}
              onReset={() => {
                setCategoryOverride("");
                setPickingCategory(false);
              }}
            />
          </div>
        </div>
        {businessKind === OTHER_KIND ? (
          <KindLabelField id="kind-label" value={kindLabel} onChange={(e) => setKindLabel(e.target.value)} />
        ) : null}
        <div className="admin-field">
          <label className="admin-label" htmlFor="about">About (from the business)</label>
          <textarea autoComplete="off" id="about" className="admin-textarea" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
          <div className="admin-helper">{about.length} / {ABOUT_MAX} characters. Plain facts only: no hours, menu, prices, phone numbers, photos or ranking claims.</div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="place-id">Google place ID</label>
          <input autoComplete="off" id="place-id" className="admin-input" type="text" value={googlePlaceId} onChange={(e) => setGooglePlaceId(e.target.value)} />
        </div>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="review-url">Google review link</label>
            <input autoComplete="off" id="review-url" className="admin-input" type="url" value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="maps-url">Google Maps link</label>
            <input autoComplete="off" id="maps-url" className="admin-input" type="url" value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)} />
          </div>
        </div>
        <div className="admin-actions">
          <button type="submit" className="btn-red" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </form>

      {operatorView ? null : (
      <div className="admin-panel">
        <h2>{active ? "Remove the business tag" : "Restore the business tag"}</h2>
        <p className="admin-helper">
          {active
            ? "The thread and every post stay on KastoChha. Only the business header and extras go, and you can restore them later."
            : "The business header and extras come back on the thread."}
        </p>
        <div className="admin-actions">
          <button type="button" className="btn-outline" onClick={toggle} disabled={saving}>
            {saving ? "Working…" : active ? "Remove tag" : "Restore tag"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
