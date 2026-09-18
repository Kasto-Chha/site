/**
 * KastoChha embeddable badge — a small floating button any business can add
 * to their own site. Clicking it opens a popup with two options, both
 * pre-filled with the exact same business name so everything lands on one
 * consolidated discussion thread rather than fragmenting across slightly
 * different spellings someone might type by hand:
 *   - Share Your KastoChha Experience (listed first, primary) — opens
 *     KastoChha's homepage with the share-experience modal already open,
 *     topic pre-filled. See the "share" query param handling in
 *     app/HomeClient.js for the other half of this.
 *   - Ask KastoChha Assist about us — opens the AI chat with the question
 *     already pre-filled, using the chat page's existing ?q= support.
 *
 * Usage, on any third-party site:
 *   <script src="https://www.kastochhanepal.com/badge-widget.js"
 *           data-business="XYZ Trekking Agency"></script>
 *
 * Only shows for a business name on the approved allowlist — see
 * app/api/badge/check/route.js and the badge_businesses table. Approving a
 * new business is a single row added in Supabase's own table editor; the
 * widget itself never needs to change or redeploy.
 *
 * Vanilla JS, no dependencies, self-contained styles scoped under a "kc-"
 * prefix — this has to work correctly on any host site regardless of what
 * it's built with, without colliding with that site's own CSS.
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  var business = (scriptTag && scriptTag.getAttribute("data-business")) || "";
  if (!business.trim()) {
    console.error("KastoChha badge: missing required data-business attribute on the script tag.");
    return;
  }

  var SITE_URL = "https://www.kastochhanepal.com";
  var shareUrl = SITE_URL + "/?share=" + encodeURIComponent(business);
  var askUrl = SITE_URL + "/chat?q=" + encodeURIComponent(business);

  var style = document.createElement("style");
  style.textContent = [
    // Pill shape, not just an icon circle: icon and label sit side by side
    // so the label gets its own room to be readable, rather than being
    // squeezed inside the icon's own small bounds.
    ".kc-badge-btn{position:fixed;bottom:20px;right:20px;z-index:2147483000;",
    "display:flex;align-items:center;gap:8px;border-radius:999px;border:none;cursor:pointer;",
    "padding:12px 20px 12px 16px;background:#C8102E;box-shadow:0 4px 16px rgba(0,0,0,.25);",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "transition:transform .18s ease;}",
    ".kc-badge-btn:hover{transform:scale(1.04)}",
    ".kc-badge-btn svg{flex-shrink:0;width:20px;height:20px;display:block}",
    ".kc-badge-btn span{color:#fff;font-size:14px;font-weight:700;white-space:nowrap;}",
    ".kc-badge-overlay{position:fixed;inset:0;background:rgba(20,16,14,.45);",
    "z-index:2147483001;display:none;align-items:flex-end;justify-content:flex-end;",
    "padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}",
    ".kc-badge-overlay.kc-open{display:flex}",
    ".kc-badge-card{background:#F5F0E8;border-radius:16px;max-width:300px;width:100%;",
    "padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.3);position:relative;",
    "animation:kc-slide-up .2s ease;}",
    "@keyframes kc-slide-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}",
    ".kc-badge-close{position:absolute;top:10px;right:10px;background:none;border:none;",
    "cursor:pointer;font-size:18px;color:#8a8378;line-height:1;padding:4px;}",
    ".kc-badge-close:hover{color:#14100e}",
    ".kc-badge-logo{display:block;height:20px;width:auto;margin-bottom:14px;}",
    ".kc-badge-option{display:block;text-decoration:none;border-radius:10px;",
    "padding:12px 14px;margin-bottom:10px;box-sizing:border-box;}",
    ".kc-badge-option:last-child{margin-bottom:0}",
    ".kc-badge-option-title{font-size:14px;font-weight:700;margin:0 0 3px;line-height:1.3;}",
    ".kc-badge-option-sub{font-size:12px;margin:0;line-height:1.4;}",
    ".kc-badge-primary{background:#C8102E;}",
    ".kc-badge-primary .kc-badge-option-title{color:#fff}",
    ".kc-badge-primary .kc-badge-option-sub{color:rgba(255,255,255,.85)}",
    ".kc-badge-secondary{background:#fff;border:1px solid #e3ddd0;}",
    ".kc-badge-secondary:hover{background:#efeae0}",
    ".kc-badge-secondary .kc-badge-option-title{color:#14100e}",
    ".kc-badge-secondary .kc-badge-option-sub{color:#5c564d}"
  ].join("");
  document.head.appendChild(style);

  var badgeBtn = document.createElement("button");
  badgeBtn.className = "kc-badge-btn";
  badgeBtn.setAttribute("aria-label", "Ask or share on KastoChha about " + business);
  badgeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 4h16v12H7l-3 3V4z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
    "</svg>" +
    "<span>Ask KastoChha</span>";

  var overlay = document.createElement("div");
  overlay.className = "kc-badge-overlay";
  overlay.innerHTML =
    '<div class="kc-badge-card" role="dialog" aria-modal="true">' +
    '<button class="kc-badge-close" aria-label="Close">\u2715</button>' +
    '<img class="kc-badge-logo" src="' + SITE_URL + '/kastochha-logo.svg" alt="KastoChha" />' +
    '<a class="kc-badge-option kc-badge-primary" href="' + shareUrl + '" target="_blank" rel="noopener noreferrer">' +
    '<p class="kc-badge-option-title">Share Your KastoChha Experience</p>' +
    '<p class="kc-badge-option-sub">Help others with an honest review of ' + escapeHtml(business) + "</p>" +
    "</a>" +
    '<a class="kc-badge-option kc-badge-secondary" href="' + askUrl + '" target="_blank" rel="noopener noreferrer">' +
    '<p class="kc-badge-option-title">Ask KastoChha Assist about us</p>' +
    '<p class="kc-badge-option-sub">Get an honest answer from real community experience</p>' +
    "</a>" +
    "</div>";

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function openOverlay() {
    overlay.classList.add("kc-open");
  }
  function closeOverlay() {
    overlay.classList.remove("kc-open");
  }

  badgeBtn.addEventListener("click", openOverlay);
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) closeOverlay();
  });
  overlay.querySelector(".kc-badge-close").addEventListener("click", closeOverlay);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeOverlay();
  });

  function mount() {
    document.body.appendChild(badgeBtn);
    document.body.appendChild(overlay);
  }

  // Confirms this business is on the approved list (see
  // app/api/badge/check/route.js and the badge_businesses table) before
  // showing anything at all. Without this, the widget would respond to any
  // data-business value on any page — including a plain test file — with no
  // way to know it's happening or which names it's actually meant to serve.
  // Fails silently either way: a network error or a "not approved" result
  // both just mean nothing renders, not a visible error on someone's site.
  function checkAndMount() {
    fetch(SITE_URL + "/api/badge/check?business=" + encodeURIComponent(business))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.allowed) mount();
      })
      .catch(function () {
        // Network error, CORS issue, endpoint down — do not show an
        // unverified badge just because the check itself failed.
      });
  }

  if (document.body) {
    checkAndMount();
  } else {
    document.addEventListener("DOMContentLoaded", checkAndMount);
  }
})();
