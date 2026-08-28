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
  // response can't overwrite the results for what is now on screen.
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);

  // Last slug reported upward, so onExactMatch fires on change rather than on
  // every render.
  const exactRef = useRef(null);

  // The exact title `onPick` just wrote into the field. Typing again after
  // dismissing should reopen the panel — but the value change caused by a
  // pick itself is not "typing again", and reopening right after a click
  // just relitigates the choice the person made a moment ago.
  const pickedRef = useRef(null);

  const lastValueRef = useRef(value);
  useEffect(() => {
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;

    if (pickedRef.current !== null && value === pickedRef.current) {
      pickedRef.current = null;
      return;
    }
    pickedRef.current = null;
    setDismissed(false);
  }, [value]);

  useEffect(() => {
    const query = (value || "").trim();

    if (query.length < minChars) {
      setTopics([]);
      return;
    }

    // Give every request its own query identity. An older request may still
    // resolve after a newer request, even when abort() is called. Never let
    // that stale response overwrite the results for the text currently typed.
    const timer = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestedQuery = query;

      try {
        const response = await fetch(
          `/api/topics/search?q=${encodeURIComponent(requestedQuery)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;

        const data = await response.json();

        // Ignore any response that is no longer the latest request.
        if (requestId !== requestIdRef.current) return;

        // ok:false means the lookup itself failed, not that nothing matched —
        // leave whatever was already on screen alone rather than reading a
        // transient failure as a confident "no match".
        if (data.ok === false) return;

        setTopics(Array.isArray(data.topics) ? data.topics : []);
      } catch {
        // Aborted, offline, or the endpoint is unhappy. Suggestions are an aid,
        // never a gate — the form works exactly as before without them.
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value, minChars]);

  // The thread whose slug matches exactly what has been typed, recomputed
  // whenever the typed value or the fetched results change.
  const typedSlug = topicSlug(value || "");
  const exact = typedSlug ? topics.find((t) => t.slug === typedSlug) || null : null;

  // Reported from an effect, not during render: the caller's onExactMatch
  // updates its own state, and updating an ancestor's state while this
  // component is rendering is invalid — React does not guarantee when, or
  // whether cleanly, that update lands.
  useEffect(() => {
    if (!onExactMatch) return;
    const slug = exact?.slug || null;
    if (exactRef.current === slug) return;
    exactRef.current = slug;
    onExactMatch(exact);
  }, [exact, onExactMatch]);

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
            // too, since joining adopts it. Recorded here so the effect above
            // can tell "value changed because of this pick" apart from
            // "typed again after dismissing" and skip reopening the panel.
            pickedRef.current = topic.title;
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
