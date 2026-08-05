"use client";

import { useEffect, useState } from "react";

// Types one example at a time into a placeholder, holds it, deletes it, then
// moves to the next — so the hero search bar shows what a real "kasto chha?"
// query looks like instead of a single static hint.
//
// Notes on the details that matter:
// - The first frame renders the full first example, so the server-rendered
//   markup and the first client render agree (no hydration mismatch) and the
//   bar still reads sensibly if JavaScript never runs.
// - `paused` stops the loop once the user is actually typing; the placeholder
//   is hidden then anyway, so animating it is wasted work.
// - Reduced-motion users get a still placeholder, never the typing effect.
// - Below 420px the suffix is dropped: the input is ~240px there, so the tail
//   of the long form would type itself off the edge.

const TYPE_MS = 70;
const DELETE_MS = 32;
const HOLD_MS = 1700;
const GAP_MS = 380;
const NARROW = "(max-width: 420px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

function compose(term, prefix, suffix) {
  return `${prefix}“${term}”${suffix}`;
}

export default function useTypedPlaceholder(
  examples,
  { prefix = "Type ", suffix = "", shortSuffix = "", paused = false } = {}
) {
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(() => examples[0]?.length || 0);
  const [deleting, setDeleting] = useState(false);
  // Animation is off until the effects below opt in, so SSR and the first
  // client render produce the same string.
  const [animate, setAnimate] = useState(false);
  const [tail, setTail] = useState(suffix);

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED);
    const narrow = window.matchMedia(NARROW);

    const sync = () => {
      setAnimate(!reduced.matches);
      setTail(narrow.matches ? shortSuffix : suffix);
    };

    sync();

    // addEventListener on a MediaQueryList is Safari 14+; older phones still
    // get the correct first pass, they just won't react to a live change.
    const lists = [reduced, narrow];
    if (!lists[0].addEventListener) return undefined;
    for (const list of lists) list.addEventListener("change", sync);
    return () => {
      for (const list of lists) list.removeEventListener("change", sync);
    };
  }, [suffix, shortSuffix]);

  useEffect(() => {
    if (!animate || paused || examples.length === 0) return undefined;

    const word = examples[index] || "";
    let delay = TYPE_MS;
    let step = () => setLength((n) => n + 1);

    if (!deleting && length >= word.length) {
      delay = HOLD_MS;
      step = () => setDeleting(true);
    } else if (deleting && length > 0) {
      delay = DELETE_MS;
      step = () => setLength((n) => n - 1);
    } else if (deleting) {
      delay = GAP_MS;
      step = () => {
        setDeleting(false);
        setIndex((i) => (i + 1) % examples.length);
      };
    }

    const timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [animate, paused, deleting, length, index, examples]);

  const word = examples[index] || "";
  return compose(animate ? word.slice(0, length) : word, prefix, tail);
}
