"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CATEGORIES } from "../../../../lib/categories";
import { threadSlugFor } from "../../../../lib/sync/slug";
import { ABOUT_MAX, BUSINESS_KINDS, suggestHubSlug } from "../../../../lib/sync/validate";

const KIND_LABELS = { cafe: "Cafe", restaurant: "Restaurant", bakery: "Bakery", bar: "Bar" };

// "Himal Brew House, Jhamsikhel" -> the name and the area, as a starting point.
function splitTitle(title) {
  const text = (title || "").toString();
  const cut = text.lastIndexOf(",");
  if (cut < 0) return { name: text.trim(), area: "" };
  return { name: text.slice(0, cut).trim(), area: text.slice(cut + 1).trim() };
}

export default function NewMerchantClient() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [mode, setMode] = useState(""); // "", "existing" or "new"
  const [picked, setPicked] = useState(null);

  const [businessName, setBusinessName] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("Food");
  const [businessKind, setBusinessKind] = useState("cafe");
  const [about, setAbout] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [hubSlug, setHubSlug] = useState("");
  const [hubTouched, setHubTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Search as the admin types, after a short pause.
  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/sync/threads?q=${encodeURIComponent(query)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Search failed.");
        setThreads(data.threads || []);
        setSearchError("");
      } catch (error) {
        if (!cancelled) setSearchError(error?.message || "Search failed.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const hubSuggestion = suggestHubSlug({ name: businessName, area });
  const shownHub = hubTouched ? hubSlug : hubSuggestion;
  const threadAddress = mode === "existing" && picked ? picked.slug : mode === "new" ? threadSlugFor({ name: businessName, area }) : "";

  function pick(thread) {
    if (thread.alreadyTaggedAs) return;
    const { name, area: place } = splitTitle(thread.title);
    setMode("existing");
    setPicked(thread);
    if (!businessName) setBusinessName(name);
    if (!area) setArea(place);
    if (thread.category) setCategory(thread.category);
    setStatus("");
  }

  function startNew() {
    setMode("new");
    setPicked(null);
    setStatus("");
  }

  async function save(event) {
    event.preventDefault();
    if (!mode) {
      setStatus("First choose a thread to link, or start a new one.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/sync/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName, area, category, businessKind, about, googlePlaceId, googleReviewUrl, googleMapsUrl,
          threadMode: mode,
          threadSlug: picked ? picked.slug : undefined,
          hubSlug: shownHub
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not tag this business.");
      router.push(`/admin/sync/${data.merchant.id}`);
      router.refresh();
    } catch (error) {
      setStatus(error?.message || "Could not tag this business.");
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Tag a business thread</h1>
          <p className="admin-sub">
            Pick the KastoChha thread that belongs to this business, or start one. Then add the few details its header shows.
            Nothing is copied from Google.
          </p>
        </div>
        <a className="btn-outline" href="/admin/sync">Cancel</a>
      </div>

      {status ? <div className="admin-banner">{status}</div> : null}

      <div className="admin-panel">
        <h2>1. Find the thread</h2>
        <div className="admin-field">
          <label className="admin-label" htmlFor="thread-search">Search existing threads</label>
          <input
            id="thread-search"
            className="admin-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For example: himal brew"
            autoComplete="off"
          />
        </div>

        {searchError ? <div className="admin-banner">{searchError}</div> : null}
        {!searchError && !searching && threads.length === 0 ? (
          <div className="admin-empty">No thread matches. You can start a new one below.</div>
        ) : null}

        <div className="admin-list">
          {threads.map((t) => (
            <div className="admin-row" key={t.slug}>
              <div>
                <div className="admin-row-title">{t.title}</div>
                <div className="admin-row-meta">
                  {t.category || "No category"} · {t.posts} experiences · {t.questions} questions · /discussions/{t.slug}
                </div>
              </div>
              <div className="admin-row-actions">
                {t.alreadyTaggedAs ? (
                  <span className="admin-status draft">Already {t.alreadyTaggedAs}</span>
                ) : picked && picked.slug === t.slug ? (
                  <span className="admin-status published">Selected</span>
                ) : (
                  <button type="button" className="btn-outline" onClick={() => pick(t)}>Select</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="admin-divider" />
        <div className="admin-actions">
          <span className="admin-helper">No thread for this business yet?</span>
          <button type="button" className="btn-outline" onClick={startNew}>
            {mode === "new" ? "Starting a new thread" : "Start a new thread from name and area"}
          </button>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="thread-address">Thread address (permanent)</label>
          <input id="thread-address" className="admin-input" type="text" value={threadAddress ? `/discussions/${threadAddress}` : ""} readOnly placeholder="Choose or start a thread first" />
          <div className="admin-helper">Fixed once tagged, so renaming the business later never splits its thread.</div>
        </div>
      </div>

      <form className="admin-form admin-panel" onSubmit={save}>
        <h2>2. Business details</h2>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="business-name">Display name</label>
            <input id="business-name" className="admin-input" type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} required />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="area">Area</label>
            <input id="area" className="admin-input" type="text" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} required />
          </div>
        </div>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="category">Category</label>
            <select id="category" className="admin-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="kind">Type of business</label>
            <select id="kind" className="admin-select" value={businessKind} onChange={(e) => setBusinessKind(e.target.value)}>
              {BUSINESS_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k] || k}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="about">About (from the business)</label>
          <textarea id="about" className="admin-textarea" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
          <div className="admin-helper">
            {about.length} / {ABOUT_MAX} characters. Plain facts only: no hours, menu, prices, phone numbers, photos or ranking claims.
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="place-id">Google place ID</label>
          <input id="place-id" className="admin-input" type="text" value={googlePlaceId} onChange={(e) => setGooglePlaceId(e.target.value)} placeholder="Optional" />
        </div>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="review-url">Google review link</label>
            <input id="review-url" className="admin-input" type="url" value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} placeholder="https://g.page/r/.../review" />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="maps-url">Google Maps link</label>
            <input id="maps-url" className="admin-input" type="url" value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
          </div>
        </div>
        <div className="admin-helper">Only Google links are accepted: search.google.com, g.page, maps.app.goo.gl and Google Maps.</div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="hub-slug">Hub address (permanent)</label>
          <input
            id="hub-slug"
            className="admin-input"
            type="text"
            value={shownHub}
            onChange={(e) => {
              setHubTouched(true);
              setHubSlug(e.target.value.toLowerCase());
            }}
            maxLength={80}
          />
          <div className="admin-helper">The QR hub will live at /hub/{shownHub || "..."}. Lowercase letters, numbers and single hyphens.</div>
        </div>
        <div className="admin-actions">
          <button type="submit" className="btn-red" disabled={saving || !mode}>
            {saving ? "Saving..." : "Tag as business"}
          </button>
        </div>
      </form>
    </div>
  );
}
