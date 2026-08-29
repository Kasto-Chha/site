"use client";

import { useEffect, useRef, useState } from "react";

import { topicSlug } from "../../lib/slug";

// ---------------------------------------------------------------------------
// Threads that already exist for whatever is being typed into the topic field.
//
// The point is to make joining easier than forking. Someone typing "Sandar
// Momo Jhamsikhel" sees that "Sandar Momo" already has four experiences on it
// and can add theirs there — or carry on typing if their question really is
// about the Jhamsikhel branch specifically.
//
// Deliberately a suggestion, not a correction. The person knows whether they
// are adding to a conversation or starting one; guessing on their behalf is how
// "byd ko battery" and "byd ko resale value" would end up merged, which would
// be wrong.
// ---------------------------------------------------------------------------

export default function TopicSuggest({
  value,
  onPick,
  minChars = 3,
  // Fires with the thread whose slug matches exactly what has been typed, or
  // null when there is no such thread. Lets a caller show "you are about to
  // join this" rather than a category picker whose value will be overwritten.
  //
  // Matched on slug rather than title, because that is what the server groups
  // on: "Sandar Momo" and "sandar momo" are the same thread.
  onExactMatch
}) {
  const [topics, setTopics] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  // Aborts the previous request when a new keystroke arrives, so a slow early
  // response can't overwrite the results for what is now on screen. Kept
  // alongside requestIdRef below: abort() asks the browser to cancel a
  // fetch, but does not guarantee an already-in-flight response won't still
  // resolve — the request-id check is what actually enforces "only the
  // latest answer wins" regardless of what abort managed to stop in time.
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);

  // The single follow-up attempt scheduled after an empty result — see the
  // comment where it's used below. Tracked so a new keystroke (or unmount)
  // can cancel a pending retry that no longer applies.
  const retryTimerRef = useRef(null);

  // Last slug reported upward, so onExactMatch fires on change rather than on
  // every render.
  const exactRef = useRef(null);

  // Typing again after dismissing means they're still looking — show again.
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setDismissed(false);
    }
  }, [value]);

  useEffect(() => {
    const query = (value || "").trim();

    if (query.length < minChars) {
      setTopics([]);
      return;
    }

    // Give every request its own identity. A slower earlier response can
    // still resolve after a faster later one even when abort() was called on
    // it, and without this check that stale response would overwrite the
    // topics for whatever is currently on screen — showing "already exists"
    // for a moment and then pulling it back, for reasons that have nothing
    // to do with whether a match actually exists.
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      runSearch(query, requestId);
    }, 250);

    // A single follow-up attempt for a thread that was just posted. Supabase
    // reads and writes don't always land on the same connection — a topic
    // that was created moments ago has, in practice, come back empty on the
    // first search and then been found correctly on a second attempt a
    // little later, with nothing about the query or the data any different
    // between the two. Confirmed against three separate threads before
    // adding this: each failed to match right after being posted and then
    // started matching correctly on its own within a couple of minutes, with
    // no code change or resubmission in between.
    //
    // This does not explain why that gap exists — that sits somewhere in
    // Supabase's connection handling — it only covers the specific,
    // reproducible window while the underlying delay is being looked into
    // separately. One retry, not a loop: a genuine no-match (the common
    // case, someone typing something that was never posted) should stay
    // fast rather than always waiting out a second round-trip on every
    // search.
    async function runSearch(query, requestId, isRetry = false) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `/api/topics/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const data = await response.json();

        // A newer request has started since this one went out — its answer
        // is already stale, ignore it even though it arrived.
        if (requestId !== requestIdRef.current) return;

        // ok:false means the lookup itself failed, not that nothing
        // matched — leave whatever was already on screen alone rather than
        // reading a transient failure as a confident "no match".
        if (data.ok === false) return;

        const found = Array.isArray(data.topics) ? data.topics : [];
        setTopics(found);

        if (found.length === 0 && !isRetry) {
          retryTimerRef.current = setTimeout(() => {
            if (requestId !== requestIdRef.current) return;
            runSearch(query, requestId, true);
          }, 1500);
        }
      } catch {
        // Aborted, offline, or the endpoint is unhappy. Suggestions are an aid,
        // never a gate — the form works exactly as before without them.
      }
    }

    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimerRef.current);
    };
  }, [value, minChars]);

  // Report the exact match on every render pass rather than inside an effect:
  // the parent only stores it, and an effect here would lag a keystroke behind
  // what is on screen.
  const typedSlug = topicSlug(value || "");
  const exact = typedSlug ? topics.find((t) => t.slug === typedSlug) || null : null;
  if (onExactMatch && exactRef.current !== (exact?.slug || null)) {
    exactRef.current = exact?.slug || null;
    onExactMatch(exact);
  }

  if (dismissed || !topics.length) return null;

  const visible = topics;
  if (!visible.length) return null;

  return (
    <div className="topic-suggest" role="listbox" aria-label="Existing discussions">
      <div className="topic-suggest-head">
        <span>Already being discussed</span>
        <button
          type="button"
          className="topic-suggest-close"
          onClick={() => setDismissed(true)}
          aria-label="Hide suggestions"
        >
          ×
        </button>
      </div>

      {visible.map((topic) => (
        <button
          key={topic.slug}
          type="button"
          role="option"
          aria-selected="false"
          className="topic-suggest-item"
          onClick={() => {
            // The whole thread, not just its title: callers want the category
            // too, since joining adopts it.
            onPick(topic.title, topic);
            setDismissed(true);
          }}
        >
          <span className="topic-suggest-title">{topic.title}</span>
          <span className="topic-suggest-meta">
            {topic.experiences === 0
              ? "asked, no answers yet"
              : `${topic.experiences} ${
                  topic.experiences === 1 ? "experience" : "experiences"
                }`}
          </span>
        </button>
      ))}

      <div className="topic-suggest-foot">
        Adding to one of these keeps everything about it on a single page.
      </div>
    </div>
  );
}
