// Convert a public share/watch URL into an inline player embed. No video is
// ever stored — we only keep the link and let the source platform serve it.
//
// Returns { src, portrait } when the URL is embeddable, or null when it isn't
// (e.g. a search page or channel profile) so callers can just open it in a tab.

export function toEmbedUrl(raw) {
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw.toString().trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // YouTube (watch, youtu.be, shorts, already-embed)
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { src: yt(id), portrait: false } : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname.startsWith("/embed/")) {
      const id = url.pathname.split("/")[2];
      return id ? { src: yt(id), portrait: false } : null;
    }
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      return id ? { src: yt(id), portrait: true } : null;
    }
    const v = url.searchParams.get("v");
    return v ? { src: yt(v), portrait: false } : null; // search/channel pages aren't embeddable
  }

  // Instagram reels / posts
  if (host.endsWith("instagram.com")) {
    const m = url.pathname.match(/\/(reel|reels|p|tv)\/([^/]+)/);
    if (!m) return null;
    const kind = m[1] === "reels" ? "reel" : m[1];
    return { src: `https://www.instagram.com/${kind}/${m[2]}/embed`, portrait: true };
  }

  // TikTok
  if (host.endsWith("tiktok.com")) {
    const m = url.pathname.match(/\/video\/(\d+)/);
    return m ? { src: `https://www.tiktok.com/embed/v2/${m[1]}`, portrait: true } : null;
  }

  // Vimeo
  if (host.endsWith("vimeo.com")) {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return /^\d+$/.test(id || "") ? { src: `https://player.vimeo.com/video/${id}`, portrait: false } : null;
  }

  // Facebook / fb.watch video plugin
  if (host.endsWith("facebook.com") || host === "fb.watch") {
    return {
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false`,
      portrait: false
    };
  }

  return null;
}

function yt(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

// Best-effort static thumbnail for a video link. YouTube exposes stable
// thumbnail URLs that load straight from the browser. Instagram, Facebook and
// TikTok all block cross-site image loads (bot checks, or a redirect to a login
// page), so their covers resolve through our server-side proxy instead — see
// app/api/embeds/thumb. Returns null for anything with no keyless thumbnail at
// all (Vimeo); callers keep their gradient fallback, which also covers the case
// where the returned URL fails to load.
export function toThumbUrl(raw) {
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw.toString().trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? ytThumb(id) : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      return id ? ytThumb(id) : null;
    }
    const v = url.searchParams.get("v");
    return v ? ytThumb(v) : null;
  }
  if (host.endsWith("instagram.com")) {
    const m = url.pathname.match(/\/(reel|reels|p|tv)\/([^/]+)/);
    return m ? proxiedThumb(raw) : null;
  }
  if (host.endsWith("facebook.com") || host === "fb.watch") {
    return proxiedThumb(raw);
  }
  // TikTok has a keyless oEmbed endpoint that hands back a cover image; the
  // proxy calls it and streams the result. Short vm./vt. share links are
  // resolved server-side too, so they don't need a /video/<id> path here.
  if (host.endsWith("tiktok.com")) {
    return proxiedThumb(raw);
  }

  return null;
}

function ytThumb(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function proxiedThumb(raw) {
  return `/api/embeds/thumb?url=${encodeURIComponent(raw.toString().trim())}`;
}
