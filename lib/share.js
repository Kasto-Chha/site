// Shared helpers for content permalinks and their social-preview (OG) images.
// Keeping this in one place means cards, permalink pages, and the OG endpoint
// all agree on URLs.

export const SHARE_PATHS = {
  // Slugs throughout. Discussions and Featured use them to rank; Trending and
  // Battle use them because these are the pages that get shared, and a readable
  // link is the difference between a tap and a shrug.
  trending: (slug) => `/trending/${slug}`,
  battles: (slug) => `/battle/${slug}`,
  battle: (slug) => `/battle/${slug}`,
  // Discussions are addressed by topic slug, not by an experience's id: one
  // topic is one page, so every experience in a thread shares this URL.
  discussions: (slug) => `/discussions/${slug}`,
  // Also a slug, for the same reason as discussions: the URL should read.
  featured: (slug) => `/featured/${slug}`
};

export function permalink(type, id) {
  const fn = SHARE_PATHS[type];
  return fn ? fn(id) : "/";
}

// Build the /api/og query string for a content item. Only short, display-safe
// fields are passed; the endpoint renders the branded card.
export function ogImagePath({ type, kicker, title, subtitle, stat, labels, battle, kind }) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (kicker) params.set("kicker", kicker);
  if (title) params.set("title", title);
  if (subtitle) params.set("subtitle", subtitle);
  if (stat) params.set("stat", stat);
  // Battle cards: both sides' names (a, b), picture addresses (ia, ib), colours (ca, cb)
  // and vote counts (va, vb).
  if (battle) {
    const sides = { a: battle.a, b: battle.b, ia: battle.ia, ib: battle.ib, ca: battle.ca, cb: battle.cb, va: battle.va, vb: battle.vb };
    for (const [key, value] of Object.entries(sides)) {
      const text = String(value ?? "").trim();
      if (text) params.set(key, text.slice(0, key.startsWith("i") ? 500 : 40));
    }
  }
  // A thread that opens with a question is drawn as a Question card, not a Discussion one.
  if (kind === "question") params.set("kind", "question");
  // Trending cards show the topic's own three vote labels as pills (l1..l3).
  if (Array.isArray(labels)) {
    labels.slice(0, 3).forEach((label, i) => {
      const text = String(label ?? "").trim();
      if (text) params.set(`l${i + 1}`, text.slice(0, 40));
    });
  }
  return `/api/og?${params.toString()}`;
}

// Standard metadata block for a permalink page. `path` and the og image are
// relative; Next resolves them against metadataBase (NEXT_PUBLIC_SITE_URL).
// `image`/`imageAlt` are an explicit override — pass a real photo URL to use
// it as the share preview instead of the generated branded card. Every
// existing caller omits these and keeps exactly its current behavior; only
// Featured articles with a hero image pass them.
export function shareMetadata({ type, path, title, description, kicker, stat, labels, battle, kind, image, imageAlt }) {
  const og = image || ogImagePath({ type, kicker, title, subtitle: description, stat, labels, battle, kind });
  const alt = imageAlt || title;
  const fullTitle = `${title} - KastoChha`;
  return {
    title: fullTitle,
    description: description || "Real opinions from real people across Nepal.",
    alternates: { canonical: path },
    openGraph: {
      title,
      description: description || "Real opinions from real people across Nepal.",
      url: path,
      siteName: "KastoChha",
      type: "article",
      images: [{ url: og, type: "image/png", width: 1200, height: 630, alt }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || "Real opinions from real people across Nepal.",
      images: [og]
    }
  };
}

// The Discussion card's pill: how many experiences the thread holds, e.g.
// "12 experiences shared", "1 experience shared", "1,240 experiences shared".
export function experiencesStat(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n.toLocaleString("en-US")} ${n === 1 ? "experience" : "experiences"} shared`;
}

// "1 vote", "12 votes", "1,248 votes": the votes badge on the Trending and Battle cards.
export function votesStat(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n.toLocaleString("en-US")} ${n === 1 ? "vote" : "votes"}`;
}

// "No answers yet", "1 answer", "3 answers": the pill on a Question card.
export function answersStat(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return "No answers yet";
  return `${n.toLocaleString("en-US")} ${n === 1 ? "answer" : "answers"}`;
}

// What a thread's share card and description say about it. Every post in a thread is
// a row, and the opening row of a "Community is asking" thread is a question, not an
// experience: counting it would say "1 experience shared" for a question nobody has
// answered. A thread that opens with a question counts answers instead.
export function threadShareInfo(thread, title) {
  const rows = Array.isArray(thread) ? thread : [];
  if (rows[0]?.kind === "question") {
    const answers = rows.length - 1;
    return {
      kind: "question",
      stat: answersStat(answers),
      description: `${title} \u2014 a question asked on KastoChha. ${
        answers === 0 ? "No answers yet, so yours could be the first." : `${answers} ${answers === 1 ? "answer" : "answers"} so far, with votes and replies.`
      }`
    };
  }
  return {
    kind: "experience",
    stat: experiencesStat(rows.length),
    description: `${rows.length} ${rows.length === 1 ? "experience" : "experiences"} shared on ${title} \u2014 real opinions from people in Nepal, with votes and replies.`
  };
}
