"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-reveal for a card that RE-RENDERS — currently the trending polls and
// battles, which update their counts in place when you vote.
//
// The site-wide useScrollReveal marks elements by calling classList.add("show")
// on the DOM node. That is fine for static markup, but className belongs to
// React: the first re-render after a vote rewrites the attribute from the JSX,
// `show` is dropped, and the card falls back to the `.fi` opacity:0 state — it
// looks like the card vanished the moment you voted on it.
//
// So the revealed flag lives in React state here and `show` is rendered rather
// than poked in. Returns [ref, revealed]; attach the ref to the card element.
export default function useRevealOnce() {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setRevealed(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [revealed]);

  return [ref, revealed];
}
