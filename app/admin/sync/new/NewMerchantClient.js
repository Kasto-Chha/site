"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CATEGORIES } from "../../../../lib/categories";
import { DEFAULT_BUSINESS_KIND, categoryForKind } from "../../../../lib/sync/businessTypes";
import { chooseThread, NO_PREFILL, unlinkThread } from "../../../../lib/sync/formState";
import { threadSlugFor } from "../../../../lib/sync/slug";
import { ABOUT_MAX, suggestHubSlug } from "../../../../lib/sync/validate";
import { BusinessTypeSelect, CategoryControl } from "../CategoryControl";
import { LinkedThreadCard, NewThreadCard, ThreadList } from "./ThreadChoice";

async function fetchThreads({ query, category, includeTagged, offset, signal }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  if (includeTagged) params.set("tagged", "1");
  if (offset) params.set("offset", String(offset));
  const res = await fetch(`/api/admin/sync/threads?${params.toString()}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Search failed.");
  return data;
}

const NO_RESULTS = { threads: [], total: 0, hasMore: false, addressNotFound: false };

export default function NewMerchantClient() {
  const router = useRouter();

  // Step 1: the thread. mode is "" (nothing chosen: the search shows), "existing" (a
  // thread is linked) or "new" (a thread will be made from the name and area).
  const [mode, setMode] = useState("");
  const [picked, setPicked] = useState(null);
  const [prefill, setPrefill] = useState(NO_PREFILL);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeTagged, setIncludeTagged] = useState(false);
  const [results, setResults] = useState(NO_RESULTS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Step 2: the details. There is no category here: it follows the business type.
  const [businessName, setBusinessName] = useState("");
  const [area, setArea] = useState("");
  const [businessKind, setBusinessKind] = useState(DEFAULT_BUSINESS_KIND);
  // A category chosen by hand, only when the admin clicks "Change category". Empty means: use the type's.
  const [categoryOverride, setCategoryOverride] = useState("");
  const [pickingCategory, setPickingCategory] = useState(false);
  const [about, setAbout] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [hubSlug, setHubSlug] = useState("");
  const [hubTouched, setHubTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const derivedCategory = categoryForKind(businessKind);
  // A hand-chosen category that matches the new type's own is no exception at all.
  const activeOverride = categoryOverride && categoryOverride !== derivedCategory ? categoryOverride : "";
  const businessCategory = activeOverride || derivedCategory;
  const hubSuggestion = suggestHubSlug({ name: businessName, area });
  const shownHub = hubTouched ? hubSlug : hubSuggestion;
  const newAddress = mode === "new" ? threadSlugFor({ name: businessName, area }) : "";

  // Search while no thread is chosen: after a short pause when typing, at once for
  // filters and for the first look. Only the newest request may answer.
  useEffect(() => {
    if (mode) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchThreads({ query, category: categoryFilter, includeTagged, offset: 0, signal: controller.signal });
        setResults(data);
        setSearchError("");
      } catch (error) {
        if (error?.name !== "AbortError") setSearchError(error?.message || "Search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query, categoryFilter, includeTagged]);

  async function showMore() {
    setLoadingMore(true);
    try {
      const data = await fetchThreads({ query, category: categoryFilter, includeTagged, offset: results.threads.length });
      setResults((current) => {
        const have = new Set(current.threads.map((t) => t.slug));
        return { ...data, threads: [...current.threads, ...data.threads.filter((t) => !have.has(t.slug))] };
      });
    } catch (error) {
      setSearchError(error?.message || "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  function pick(thread) {
    if (thread.alreadyTaggedAs) return;
    const result = chooseThread({ businessName, area }, thread);
    setBusinessName(result.form.businessName);
    setArea(result.form.area);
    setPrefill(result.prefill);
    setPicked(thread);
    setMode("existing");
    setStatus("");
  }

  // Take back the choice, and what it filled in, then go back to searching.
  function unlink(clearSearch) {
    const result = unlinkThread({ businessName, area }, prefill);
    setBusinessName(result.form.businessName);
    setArea(result.form.area);
    setPrefill(result.prefill);
    setPicked(null);
    setMode("");
    if (clearSearch) setQuery("");
    setStatus("");
  }

  function startNew() {
    setMode("new");
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
          businessName, area, businessKind, categoryOverride: activeOverride, about, googlePlaceId, googleReviewUrl, googleMapsUrl,
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
        <h2>1. The thread</h2>

        {mode === "existing" && picked ? (
          <LinkedThreadCard
            thread={picked}
            businessCategory={businessCategory}
            onChange={() => unlink(false)}
            onRemove={() => unlink(true)}
          />
        ) : mode === "new" ? (
          <NewThreadCard address={newAddress} onSwitch={() => unlink(false)} />
        ) : (
          <div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="thread-search">Search threads, or paste a discussion address</label>
              <input
                id="thread-search"
                className="admin-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="For example: himal brew, or kastochhanepal.com/discussions/himal-brew-house"
                autoComplete="off"
              />
              <div className="admin-helper">With nothing typed, the most recently active threads are shown.</div>
            </div>
            <div className="admin-two">
              <div className="admin-field">
                <label className="admin-label" htmlFor="thread-category">Category</label>
                <select id="thread-category" className="admin-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} autoComplete="off">
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.label}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label className="admin-label" htmlFor="thread-tagged">Threads already tagged</label>
                <label className="admin-helper" htmlFor="thread-tagged">
                  <input id="thread-tagged" type="checkbox" checked={includeTagged} onChange={(e) => setIncludeTagged(e.target.checked)} autoComplete="off" />{" "}
                  Include threads that are already business threads
                </label>
              </div>
            </div>
            <ThreadList
              threads={results.threads}
              total={results.total}
              hasMore={results.hasMore}
              loading={loading}
              loadingMore={loadingMore}
              error={searchError}
              addressNotFound={results.addressNotFound}
              searching={Boolean(query || categoryFilter || includeTagged)}
              onSelect={pick}
              onMore={showMore}
            />
            <div className="admin-divider" />
            <div className="admin-actions">
              <span className="admin-helper">No thread for this business yet?</span>
              <button type="button" className="btn-outline" onClick={startNew}>Start a new thread from name and area</button>
            </div>
          </div>
        )}
      </div>

      <form className="admin-form admin-panel" onSubmit={save}>
        <h2>2. Business details</h2>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="business-name">Display name</label>
            <input id="business-name" className="admin-input" type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} required autoComplete="off" />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="area">Area</label>
            <input id="area" className="admin-input" type="text" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} required autoComplete="off" />
          </div>
        </div>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="kind">Type of business</label>
            <BusinessTypeSelect id="kind" value={businessKind} onChange={(e) => setBusinessKind(e.target.value)} />
          </div>
          <div className="admin-field">
            <CategoryControl
              effective={businessCategory}
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
        <div className="admin-field">
          <label className="admin-label" htmlFor="about">About (from the business)</label>
          <textarea id="about" className="admin-textarea" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} autoComplete="off" />
          <div className="admin-helper">
            {about.length} / {ABOUT_MAX} characters. Plain facts only: no hours, menu, prices, phone numbers, photos or ranking claims.
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="place-id">Google place ID</label>
          <input id="place-id" className="admin-input" type="text" value={googlePlaceId} onChange={(e) => setGooglePlaceId(e.target.value)} placeholder="Optional" autoComplete="off" />
        </div>
        <div className="admin-two">
          <div className="admin-field">
            <label className="admin-label" htmlFor="review-url">Google review link</label>
            <input id="review-url" className="admin-input" type="url" value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} placeholder="https://g.page/r/.../review" autoComplete="off" />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="maps-url">Google Maps link</label>
            <input id="maps-url" className="admin-input" type="url" value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." autoComplete="off" />
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
            autoComplete="off"
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
