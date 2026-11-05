// The smoke test: a handful of quick checks that the public face of KastoChha Sync works and is closed where it must
// be, run against a real address (a preview deployment, the live site, or localhost) for one test business.
//
// It is READ-ONLY by default and safe to run against the live site: it identifies itself as a bot, so a scan is never
// counted; the only requests that could write are the ones that are refused or deliberately ignored (an empty
// private note, a spam-trap note). Two switches do more, and say so: countScan makes one real scan (counted, once);
// write sends one real private note, marked so the team can resolve it.
//
// A plain ES module with the network handed in, so it can be tested without one. Returns every check's result;
// the command-line wrapper (scripts/sync-smoke.mjs) prints them and sets the exit code.
export const SMOKE_UA = "KastoChha-smoke-test (bot)";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const NOINDEX = /<meta name="robots" content="noindex/;
const SECRETS = [/sk_(live|test)_[A-Za-z0-9]{10,}/, /service_role/i, /SYNC_HUB_SECRET/];

function cookiesOf(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const one = headers.get("set-cookie");
  return one ? [one] : [];
}

export async function runSmoke({ base, slug, code, countScan = false, write = false, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const root = String(base || "").replace(/\/+$/, "");
  const results = [];
  const add = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: ok ? "" : String(detail) });

  const call = async (path, { method = "GET", ua = SMOKE_UA, redirect = "follow", body } = {}) => {
    const response = await fetchImpl(root + path, {
      method,
      redirect,
      headers: { "user-agent": ua, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    return { status: response.status, headers: response.headers, url: response.url || "", text: await response.text() };
  };
  // A check returns true, or the reason it failed. One that throws (the site could not be reached) fails too.
  const check = async (name, fn) => {
    try {
      const out = await fn();
      add(name, out === true, out === true ? "" : out || "check failed");
    } catch (error) {
      add(name, false, `${error?.name === "TimeoutError" ? "timed out" : "could not be reached"}: ${error?.message || error}`);
    }
  };

  const pages = {};
  let businessPath = "";

  await check("robots.txt keeps search engines out of the hub and the QR links", async () => {
    const r = await call("/robots.txt");
    if (r.status !== 200) return `status ${r.status}`;
    return (/Disallow:\s*\/hub\//.test(r.text) && /Disallow:\s*\/q\//.test(r.text)) || "robots.txt does not disallow /hub/ and /q/";
  });

  await check("a scan link goes to the hub, is never cached, and gives a bot no cookie", async () => {
    const r = await call(`/q/${code}`, { redirect: "manual" });
    if (r.status !== 302) return `status ${r.status}, expected 302`;
    const location = r.headers.get("location") || "";
    if (!location.endsWith(`/hub/${slug}?c=${code}`)) return `went to ${location || "nowhere"}`;
    if (!/no-store/.test(r.headers.get("cache-control") || "")) return "the redirect can be cached";
    if (cookiesOf(r.headers).length > 0) return "a bot was given a cookie";
    return true;
  });

  await check("the hub opens, is kept out of search engines, and offers the options", async () => {
    const r = await call(`/hub/${slug}`);
    if (r.status !== 200) return `status ${r.status}`;
    pages.hub = r.text;
    if (!NOINDEX.test(r.text)) return "not marked noindex";
    const missing = ["Share your experience", "Ask a question", "Send a private note"].filter((t) => !r.text.includes(t));
    const link = r.text.match(/href="(\/discussions\/[^"#]+)#share"/);
    if (link) businessPath = link[1];
    return missing.length ? `missing: ${missing.join(", ")}` : true;
  });

  await check("the private note page opens and is kept out of search engines", async () => {
    const r = await call(`/hub/${slug}/note`);
    if (r.status !== 200) return `status ${r.status}`;
    pages.note = r.text;
    if (!NOINDEX.test(r.text)) return "not marked noindex";
    return r.text.includes("It is never posted.") || "the privacy line is missing";
  });

  await check("the business's own page opens, with its Ask box", async () => {
    if (!businessPath) return "no link to the business's page was found on the hub";
    const r = await call(businessPath);
    if (r.status !== 200) return `status ${r.status} for ${businessPath}`;
    pages.business = r.text;
    return r.text.includes("Ask a question") || "the Ask box is missing";
  });

  await check("no page carries a secret", async () => {
    for (const [name, html] of Object.entries(pages)) for (const pattern of SECRETS) if (pattern.test(html)) return `the ${name} page matches ${pattern}`;
    return Object.keys(pages).length > 0 || "no page was read";
  });

  await check("the website badge answers for this business, from any website", async () => {
    const r = await call(`/api/badge/check?business=${encodeURIComponent(slug)}`);
    if (r.status !== 200) return `status ${r.status}`;
    let body;
    try { body = JSON.parse(r.text); } catch { return "the answer is not JSON"; }
    if (body.allowed !== true) return `allowed is ${JSON.stringify(body.allowed)}, expected true (is the business active?)`;
    return r.headers.get("access-control-allow-origin") === "*" || "the answer is not open to other websites (CORS)";
  });

  await check("the badge script is served", async () => {
    const r = await call("/badge-widget.js");
    if (r.status !== 200) return `status ${r.status}`;
    return /javascript/.test(r.headers.get("content-type") || "") || `content type is ${r.headers.get("content-type")}`;
  });

  await check("posting still needs a signed-in account", async () => {
    const r = await call("/api/reviews", { method: "POST", body: { title: "smoke", summary: "smoke", category: "Food" } });
    return r.status === 401 || `status ${r.status}, expected 401`;
  });

  await check("replying as a business still needs a signed-in account", async () => {
    const r = await call("/api/sync/owner-replies", { method: "POST", body: {} });
    return r.status === 401 || `status ${r.status}, expected 401`;
  });

  await check("the team pages are closed to the public", async () => {
    const r = await call("/admin/sync");
    if (/sync-side|Feedback inbox|Digests to send/.test(r.text)) return "the team dashboard was served to a visitor";
    return r.status < 400 && (r.text.includes("Admin access required") || /sign-in/.test(r.url)) ? true : `status ${r.status}, and neither a sign-in nor an access message`;
  });

  await check("the exports are closed to the public", async () => {
    const r = await call("/api/admin/sync/export?kind=businesses", { redirect: "manual" });
    if (r.status === 200 || /^\uFEFF?Business,/.test(r.text)) return "an export was served to a visitor";
    return [301, 302, 307, 308, 401, 403].includes(r.status) || `status ${r.status}`;
  });

  await check("a private note route is alive and refuses an empty note", async () => {
    const r = await call("/api/sync/feedback", { method: "POST", body: { slug, note: "" } });
    return r.status === 400 || `status ${r.status}, expected 400`;
  });

  await check("a spam program's note is quietly ignored (nothing is stored)", async () => {
    const r = await call("/api/sync/feedback", { method: "POST", body: { slug, note: "smoke test", website: "http://spam.example" } });
    return (r.status === 201 && /"ok":\s*true/.test(r.text)) || `status ${r.status}, expected 201`;
  });

  if (countScan) {
    await check("a real scan is counted and the browser is given its cookies", async () => {
      const r = await call(`/q/${code}`, { redirect: "manual", ua: PHONE_UA });
      if (r.status !== 302) return `status ${r.status}, expected 302`;
      const cookies = cookiesOf(r.headers);
      if (!cookies.some((c) => c.startsWith("kc_q="))) return "no scan cookie was set";
      const visit = cookies.some((c) => c.startsWith("kc_v_"));
      // Information, not a check: it is shown, and never counted as a pass or a failure.
      results.push({ name: visit ? "info: Visited labels are ON (the visit cookie is set)" : "info: Visited labels are OFF (no visit cookie: is SYNC_HUB_SECRET set?)", ok: true, info: true, detail: "" });
      return true;
    });
  }

  if (write) {
    await check("a private note can be sent (resolve it in the inbox afterwards)", async () => {
      const r = await call("/api/sync/feedback", { method: "POST", body: { slug, note: "SMOKE TEST: please ignore and resolve this note." } });
      return (r.status === 201 && /"ok":\s*true/.test(r.text)) || `status ${r.status}, expected 201`;
    });
  }

  return { results, failed: results.filter((r) => !r.ok).length, checks: results.filter((r) => !r.info).length };
}
