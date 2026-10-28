"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatTimeAgo } from "../../../../lib/topics";

// What the homepage's "Trending searches" row is showing right now, and why,
// on the same screen as the rules that change it.
//
// Rules used to be written blind: to hide a search an editor had to notice it
// on the homepage, come here, and type it out — spelled the way the matcher
// wanted. Each search now has its own Hide button, which files the rule for
// them, and the panel says what a rule can't: how many people asked, what is
// next in line, and how many searches the asker threshold is holding back.
//
// `report` is getTrendingSearchReport() from lib/supabase/queries.js. It names
// only searches that already qualify for the homepage; the ones below the
// threshold arrive as a count, never as text.

const people = (count) => `${count} ${count === 1 ? "person" : "people"}`;

function SearchRow({ search, position, status, tone, canHide, busy, onHide }) {
  return (
    <li className="admin-row">
      <div>
        <div className="admin-row-title">
          {position ? <span className="trend-now-rank">{position}</span> : null}
          {search.label}
        </div>
        <div className="admin-row-meta">
          {search.fallback ? (
            <span>added by an editor · shown while real searches are short</span>
          ) : (
            <>
              <span>asked by {people(search.askers)}</span>
              {search.lastAsked ? (
                // Relative to "now" on each side of hydration, so the server's
                // "4m ago" and the browser's "5m ago" are both right.
                <span suppressHydrationWarning>last asked {formatTimeAgo(search.lastAsked)}</span>
              ) : null}
            </>
          )}
        </div>
      </div>
      <span className={`admin-status${tone ? ` ${tone}` : ""}`}>{status}</span>
      <div className="admin-row-actions">
        {search.fallback ? null : (
          <button
            type="button"
            className="btn-outline"
            disabled={!canHide || busy}
            onClick={() => onHide(search)}
          >
            {busy ? "Hiding…" : "Hide"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function TrendingNowPanel({ report }) {
  const router = useRouter();
  const [busyTerm, setBusyTerm] = useState("");
  const [error, setError] = useState("");

  const { shown = [], next = [], waiting = 0, minAskers, limit, sample, refreshMinutes } = report;
  const canHide = report.available && report.migrated && !busyTerm;

  const hide = async (search) => {
    // The rule is written from the search with its spelling differences
    // removed, so it takes down every way it was typed. Rules match on whole
    // words, which also catches longer searches containing it — said here in
    // so many words, because that is the part an editor could not guess.
    const ok = window.confirm(
      `Hide every search containing "${search.term}" from the homepage?\n\n` +
        "This adds a hide rule to the list below. Edit that rule to undo it."
    );
    if (!ok) return;

    setBusyTerm(search.term);
    setError("");
    try {
      const res = await fetch("/api/admin/content/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          term: search.term,
          action: "hide",
          rank: 1,
          note: `Hidden from the trending panel, where it showed as "${search.label}".`
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not hide it. Please try again.");
      // Re-renders this panel without the search and the list below with the
      // new rule. The save has already dropped the homepage's cached copy.
      router.refresh();
    } catch (err) {
      setError(err?.message || "Could not hide it. Please try again.");
    } finally {
      setBusyTerm("");
    }
  };

  return (
    <section className="admin-panel trend-now" aria-labelledby="trend-now-title">
      <div className="trend-now-head">
        <h2 id="trend-now-title">On the homepage now</h2>
        <p className="admin-helper">
          Worked out live from the last {sample.toLocaleString("en-US")} questions people typed into
          the assistant. Visitors see changes within {refreshMinutes} minutes, or at once when a
          rule is saved.
        </p>
      </div>

      {error ? <div className="admin-banner">{error}</div> : null}

      {!report.available ? (
        <div className="admin-banner">
          The ranking could not be worked out just now, so nothing is listed here. That is a failed
          lookup, not an empty row: the homepage keeps showing its last good list.
        </div>
      ) : null}

      {report.available && !report.migrated ? (
        <div className="admin-banner">
          Migration 0016 has not been applied to this database. Until it is, the row is ranked from
          chat titles alone — clicks on a trending link count as searches, a renamed chat counts
          under its new name — and rules cannot be saved, so Hide is switched off.
        </div>
      ) : null}

      {report.available && shown.length === 0 ? (
        <div className="admin-empty">
          <p>
            Nothing qualifies yet, so the row is hidden on the homepage. A search appears once{" "}
            {people(minAskers)} {minAskers === 1 ? "has" : "have"} typed it.
          </p>
          <a className="btn-red" href="/admin/content/searches/new">Add a fallback term</a>
        </div>
      ) : null}

      {shown.length > 0 ? (
        <ol className="admin-list" role="list">
          {shown.map((search, index) => (
            <SearchRow
              key={search.term || search.label}
              search={search}
              position={index + 1}
              status={search.fallback ? "Fallback" : "Showing"}
              tone={search.fallback ? "draft" : "published"}
              canHide={canHide}
              busy={busyTerm === search.term}
              onHide={hide}
            />
          ))}
        </ol>
      ) : null}

      {next.length > 0 ? (
        <>
          <h3>Next in line</h3>
          <ol className="admin-list" role="list">
            {next.map((search) => (
              <SearchRow
                key={search.term}
                search={search}
                status="Waiting"
                canHide={canHide}
                busy={busyTerm === search.term}
                onHide={hide}
              />
            ))}
          </ol>
        </>
      ) : null}

      {report.available ? (
        <p className="admin-helper trend-now-foot">
          {waiting === 0
            ? "No other searches are waiting on more askers."
            : `${waiting.toLocaleString("en-US")} other ${
                waiting === 1 ? "search has" : "searches have"
              } been typed by fewer than ${people(minAskers)} and ${
                waiting === 1 ? "is" : "are"
              } not shown — here or anywhere.`}{" "}
          The row holds {limit}.
        </p>
      ) : null}
    </section>
  );
}
