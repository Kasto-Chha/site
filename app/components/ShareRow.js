"use client";

import { useState } from "react";

import { IconCheck, IconFacebook, IconLink, IconWhatsApp, IconXLogo } from "./icons";

// Canonical production origin. Using this (instead of window.location.origin)
// keeps shared links pointing at the real site even when the author is browsing
// a password-protected Vercel preview deployment — otherwise social crawlers hit
// the preview's auth wall and show "Dashboard — Vercel" instead of the post.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

// Reusable "SHARE · copy f X wa" row. `url` is the item's permalink (a path like
// "/trending/<id>" or an absolute URL); it's resolved to an absolute URL at
// click/copy time so the right page is shared, not whatever page hosts the card.
export default function ShareRow({ text = "", url, label = "Share" }) {
  const [copied, setCopied] = useState(false);

  const absoluteUrl = () => {
    if (url && /^https?:\/\//i.test(url)) return url; // already absolute
    const origin =
      SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    if (!url) {
      const path =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "";
      return origin + path;
    }
    return origin + (url.startsWith("/") ? url : `/${url}`);
  };

  const open = (href) => {
    if (typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer,width=600,height=540");
    }
  };

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const copy = async (event) => {
    stop(event);
    const link = absoluteUrl();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for non-secure contexts / older browsers.
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareFacebook = (event) => {
    stop(event);
    open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(absoluteUrl())}`);
  };

  const shareX = (event) => {
    stop(event);
    open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(absoluteUrl())}`);
  };

  const shareWhatsApp = (event) => {
    stop(event);
    const message = text ? `${text} ${absoluteUrl()}` : absoluteUrl();
    open(`https://wa.me/?text=${encodeURIComponent(message)}`);
  };

  return (
    <div className="share-row">
      <span className="share-label">{label}</span>
      <button
        type="button"
        className={`share-btn-ico share-copy ${copied ? "is-copied" : ""}`}
        aria-label={copied ? "Link copied" : "Copy link"}
        onClick={copy}
      >
        {copied ? <IconCheck className="icon" /> : <IconLink className="icon" />}
        <span className="share-copy-label">{copied ? "Copied" : "Copy link"}</span>
      </button>
      <button type="button" className="share-btn-ico" aria-label="Share on Facebook" onClick={shareFacebook}>
        <IconFacebook className="icon" />
      </button>
      <button type="button" className="share-btn-ico" aria-label="Share on X" onClick={shareX}>
        <IconXLogo className="icon" />
      </button>
      <button type="button" className="share-btn-ico" aria-label="Share on WhatsApp" onClick={shareWhatsApp}>
        <IconWhatsApp className="icon" />
      </button>
    </div>
  );
}
