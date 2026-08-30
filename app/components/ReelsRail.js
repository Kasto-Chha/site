"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { IconPlay } from "./icons";
import { toEmbedUrl, toThumbUrl } from "../../lib/embeds";

// Horizontal reel rail across the niche KastoChha channels. Reels are just
// stored links — when the link is embeddable (YouTube/Instagram/TikTok/Vimeo)
// it plays inline in a player modal; otherwise it opens in a new tab. No video
// is ever hosted, so there is no storage cost.
export default function ReelsRail({ reels = [] }) {
  const [active, setActive] = useState(null); // { src, portrait, title }

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active]);

  if (reels.length === 0) return null;

  return (
    <>
      <div className="reel-rail">
        {reels.map((reel, index) => {
          const accent = reel.accent || "#3a2a2a";
          const link = reel.video_url || reel.channel_url || "";
          const embed = toEmbedUrl(reel.video_url) || toEmbedUrl(reel.channel_url);
          // Video thumbnail layered over the accent gradient; if the thumb URL
          // 404s the gradient below still shows.
          const thumb = toThumbUrl(reel.video_url) || toThumbUrl(reel.channel_url);
          const gradient = `linear-gradient(165deg, ${accent} 0%, #17120f 105%)`;

          const onClick = (event) => {
            if (embed) {
              event.preventDefault();
              setActive({ ...embed, title: reel.title });
            }
            // No embed -> let the <a> open the link in a new tab.
          };

          return (
            <a
              className="reel-card"
              key={reel.id}
              href={link || "#"}
              target={!embed && link.startsWith("http") ? "_blank" : undefined}
              rel={!embed && link.startsWith("http") ? "noopener noreferrer" : undefined}
              onClick={onClick}
              // The gradient is the permanent base layer either way: it is
              // what shows through if `thumb` is unset, and it is also what
              // shows for the instant before the Image below finishes
              // loading, and forever if that image 404s (a proxied
              // TikTok/Instagram/Facebook cover can fail upstream — see
              // app/api/embeds/thumb — with nothing else here to fall back on).
              style={{ backgroundImage: gradient }}
            >
              {thumb ? (
                <Image
                  src={thumb}
                  alt=""
                  fill
                  sizes="224px"
                  style={{ objectFit: "cover" }}
                  priority={index === 0}
                />
              ) : null}
              <span className="reel-tag">{reel.tag}</span>
              <span className="reel-play" aria-hidden>
                <IconPlay className="icon" />
              </span>
              <div className="reel-body">
                <h3 className="reel-title">{reel.title}</h3>
                {reel.handle ? <span className="reel-handle">{reel.handle}</span> : null}
              </div>
            </a>
          );
        })}
      </div>

      {active ? (
        <div
          className="reel-modal-bg"
          role="dialog"
          aria-modal="true"
          aria-label={active.title || "Reel player"}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActive(null);
          }}
        >
          <div className={`reel-modal ${active.portrait ? "portrait" : "landscape"}`}>
            <button type="button" className="reel-modal-x" aria-label="Close" onClick={() => setActive(null)}>
              ×
            </button>
            <iframe
              src={active.src}
              title={active.title || "Reel"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
