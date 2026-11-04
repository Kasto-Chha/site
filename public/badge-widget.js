/**
 * KastoChha website badge: a small floating button a business adds to its own site. Clicking it
 * opens a popup with two options:
 *   - Share Your KastoChha Experience (primary): the business's own page on KastoChha, with the
 *     box to write an experience. Every post lands in that one thread, in the right category.
 *   - Ask KastoChha Assist about us: the AI chat, with the business's name already asked about.
 *
 * Usage, on the business's own site, just before </body> (the admin shows this line, ready to copy):
 *   <script src="https://www.kastochhanepal.com/badge-widget.js"
 *           data-business="himal-brew-house" async></script>
 *
 * data-business is the business's KastoChha address (the part after /hub/ or in its QR page), not
 * its name, so there is nothing to mistype. The button shows only while that business is tagged
 * in KastoChha Sync (see app/api/badge/check/route.js): removing the tag removes the badge from
 * every site it was pasted on, within a minute, with nothing to change there.
 *
 * What it tells KastoChha: that the popup was opened, and which link was clicked, counted against
 * the business. No cookies are sent or set, and nothing is recorded about the visitor. Nothing is
 * sent when the page merely loads, apart from the question of whether to show the button.
 *
 * Vanilla JS, no dependencies, styles scoped under a "kc-" prefix: it has to work on any host
 * site, whatever it is built with, without colliding with that site's own CSS. Nothing from the
 * server is ever put into the page as HTML: names go in as text, addresses are checked first.
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  var business = ((scriptTag && scriptTag.getAttribute("data-business")) || "").trim().toLowerCase();
  if (!business) {
    console.error("KastoChha badge: missing required data-business attribute on the script tag. Copy the snippet from KastoChha exactly as given.");
    return;
  }
  // An address, not a name: lowercase letters, digits and single hyphens.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(business) || business.length > 80) {
    console.error('KastoChha badge: data-business must be the business\'s KastoChha address, for example "himal-brew-house", not its name. Copy the snippet from KastoChha exactly as given.');
    return;
  }

  var SITE_URL = "https://www.kastochhanepal.com";

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

  // Tells KastoChha what was clicked, counted against the business. Fire and forget: it uses a
  // request that survives the page being left, sends no cookies, and never shows an error or
  // slows a click down. A failure just means one click is not counted.
  function track(type) {
    try {
      if (typeof fetch !== "function") return;
      fetch(SITE_URL + "/api/sync/event", {
        method: "POST",
        mode: "no-cors",
        credentials: "omit",
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ slug: business, type: type })
      }).catch(function () {});
    } catch (e) {
      // Counting is never allowed to get in the way.
    }
  }

  function mount(name, thread) {
    // Included twice on one page? One button is enough.
    if (document.querySelector(".kc-badge-btn")) return;

    var shareUrl = SITE_URL + thread + "#share";
    var askUrl = SITE_URL + "/chat?q=" + encodeURIComponent(name);

    var badgeBtn = document.createElement("button");
    badgeBtn.className = "kc-badge-btn";
    badgeBtn.setAttribute("aria-label", "Ask or share on KastoChha about " + name);
    badgeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 4h16v12H7l-3 3V4z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
      "</svg>" +
      "<span>Ask KastoChha</span>";

    // Static markup only. The name and the addresses are put in afterwards, as text and as
    // checked properties, so nothing that came from the server is ever read as HTML.
    var overlay = document.createElement("div");
    overlay.className = "kc-badge-overlay";
    overlay.innerHTML =
      '<div class="kc-badge-card" role="dialog" aria-modal="true" aria-label="KastoChha">' +
      '<button class="kc-badge-close" aria-label="Close">\u2715</button>' +
      '<img class="kc-badge-logo" src="' + SITE_URL + '/kastochha-logo.svg" alt="KastoChha" />' +
      '<a class="kc-badge-option kc-badge-primary kc-share" target="_blank" rel="noopener noreferrer">' +
      '<p class="kc-badge-option-title">Share Your KastoChha Experience</p>' +
      '<p class="kc-badge-option-sub">Help others with an honest review of <span class="kc-name"></span></p>' +
      "</a>" +
      '<a class="kc-badge-option kc-badge-secondary kc-ask" target="_blank" rel="noopener noreferrer">' +
      '<p class="kc-badge-option-title">Ask KastoChha Assist about us</p>' +
      '<p class="kc-badge-option-sub">Get an honest answer from real community experience</p>' +
      "</a>" +
      "</div>";
    overlay.querySelector(".kc-name").textContent = name;
    var shareLink = overlay.querySelector(".kc-share");
    var askLink = overlay.querySelector(".kc-ask");
    shareLink.href = shareUrl;
    askLink.href = askUrl;

    var opened = false;
    function openOverlay() {
      overlay.classList.add("kc-open");
      // Once per page view, however often it is opened.
      if (!opened) {
        opened = true;
        track("badge_open");
      }
    }
    function closeOverlay() {
      overlay.classList.remove("kc-open");
    }

    badgeBtn.addEventListener("click", openOverlay);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeOverlay();
    });
    overlay.querySelector(".kc-badge-close").addEventListener("click", closeOverlay);
    shareLink.addEventListener("click", function () {
      track("badge_share");
    });
    askLink.addEventListener("click", function () {
      track("badge_ask");
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeOverlay();
    });

    document.body.appendChild(badgeBtn);
    document.body.appendChild(overlay);
  }

  // Asks KastoChha whether this business is on Sync right now, and shows nothing at all unless
  // the answer is a clear yes. A network error, a blocked request, a business that is not (or is
  // no longer) tagged, or an answer that does not look right all mean the same thing: no badge,
  // and no visible error on someone's site. The answer's address must be one of KastoChha's own
  // discussion pages, so a tampered answer cannot send a visitor anywhere else.
  function checkAndMount() {
    fetch(SITE_URL + "/api/badge/check?business=" + encodeURIComponent(business))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || data.allowed !== true) return;
        if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 200) return;
        if (typeof data.thread !== "string" || !/^\/discussions\/[a-z0-9]+(-[a-z0-9]+)*$/.test(data.thread)) return;
        mount(data.name.trim(), data.thread);
      })
      .catch(function () {
        // Network error, CORS issue, endpoint down: do not show an unverified badge.
      });
  }

  if (document.body) {
    checkAndMount();
  } else {
    document.addEventListener("DOMContentLoaded", checkAndMount);
  }
})();
