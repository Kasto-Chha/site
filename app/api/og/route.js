import { ImageResponse } from "next/og";
import { renderCard } from "../../../lib/ogResponse";
import { finalizeImage, defaultCardResponse } from "../../../lib/ogFinalize";

export const runtime = "edge";

const ACCENTS = {
  trending: "#C8102E",
  battles: "#C8102E",
  battle: "#C8102E",
  discussions: "#C8102E",
  featured: "#E05C20"
};

const PAPER = "#F5F0E8";
const INK = "#0C0B09";
const MUTED = "#6f685c";

function clamp(value, max) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Renders a 1200x630 "post" card for social previews. All content comes from
// query params so the endpoint stays fast and cacheable by crawlers.
export async function GET(request) {
  try {
    return await finalizeImage(await render(request));
  } catch (error) {
    console.error("Share card failed, serving the default card:", error?.message || error);
    return defaultCardResponse(new URL(request.url).origin);
  }
}

async function render(request) {
  // Trending and Discussion cards are drawn by lib/ogResponse.js; everything
  // else (homepage, battle, featured) continues below, unchanged.
  const special = await renderCard(request);
  if (special) return special;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") || "trending").toLowerCase();
  const accent = ACCENTS[type] || "#C8102E";
  const kicker = clamp(searchParams.get("kicker") || "KastoChha", 36);
  const title = clamp(searchParams.get("title") || "Kasto chha?", 110);
  const subtitle = clamp(searchParams.get("subtitle") || "", 160);
  const stat = clamp(searchParams.get("stat") || "", 60);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "72px",
          fontFamily: "sans-serif",
          position: "relative"
        }}
      >
        {/* accent edge */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "14px", height: "630px", background: accent }} />

        {/* top row: wordmark + type chip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: "34px", fontWeight: 800, letterSpacing: "-1px" }}>
            <span style={{ color: INK }}>Kasto</span>
            <span style={{ color: accent }}>Chha</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(200,16,46,0.08)",
              border: "1px solid rgba(200,16,46,0.25)",
              borderRadius: "999px",
              padding: "8px 18px",
              color: accent,
              fontSize: "20px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              fontWeight: 600
            }}
          >
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: accent }} />
            {type === "battle" || type === "battles" ? "Battle" : type === "featured" ? "Featured" : type === "discussions" ? "Discussion" : "Trending"}
          </div>
        </div>

        {/* main */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: accent, fontSize: "24px", letterSpacing: "4px", textTransform: "uppercase", fontWeight: 700, marginBottom: "20px" }}>
            {kicker}
          </div>
          <div
            style={{
              display: "flex",
              color: INK,
              fontSize: title.length > 60 ? "62px" : "76px",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-2px"
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", color: MUTED, fontSize: "30px", lineHeight: 1.4, marginTop: "24px" }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* bottom: stat + tagline */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {stat ? (
            <div
              style={{
                display: "flex",
                background: INK,
                color: PAPER,
                borderRadius: "999px",
                padding: "12px 24px",
                fontSize: "24px",
                fontWeight: 700
              }}
            >
              {stat}
            </div>
          ) : (
            <div />
          )}
          <div style={{ display: "flex", color: MUTED, fontSize: "22px", letterSpacing: "1px" }}>
            kastochha.com · Nepal ko real talk
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
