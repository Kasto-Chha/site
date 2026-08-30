// Where a featured story points, in one place — the homepage grid and the
// /featured front page both used to decide this for themselves, and only one of
// them had a fallback, so a story saved without a link_url was a dead card on
// the homepage and a working link on /featured.
//
// A story either links somewhere the editor chose (link_url, which may be an
// internal route or an external article) or falls back to its own permalink,
// which is always readable because the permalink renders the story's own body.
export function storyHref(story) {
  if (!story) return "/featured";
  // Falls back to the id for rows written before the slug column existed, so a
  // half-migrated database still links somewhere rather than nowhere.
  return story.link_url || `/featured/${story.slug || story.id}`;
}

// True when the story has an article body worth opening the permalink for,
// rather than just a card's worth of title and description.
export function hasStoryBody(story) {
  return Boolean((story?.body || "").trim());
}

// Escapes the raw textarea text before any of our own tags go in, so a
// literal "<" typed by an editor (or copy-pasted from somewhere) renders as
// text rather than becoming real markup. Everything below builds *only* the
// specific tags this file intends — strong, em, a, li — on top of this
// escaped base, never on the raw input directly.
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline formatting within a line: **bold**, *italic*, [text](url). Order
// matters — bold is matched before italic so "**x**" isn't first read as
// two separate "*...*" italics with an empty middle. Link URLs are required
// to start with http(s):// specifically, which is what keeps this from ever
// producing something like an href="javascript:..." — the pattern simply
// cannot match anything else.
function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

// Headings, longest prefix first so "### " isn't matched as "## " with a
// stray "#" left in the text. Capped at h4, and h1 is deliberately absent —
// the page's own title is already the one h1 a page should have; a second
// one from the body would be a real, avoidable SEO mistake, not a feature.
const HEADING_PREFIXES = [
  { prefix: "#### ", level: 4 },
  { prefix: "### ", level: 3 },
  { prefix: "## ", level: 2 }
];

// Split a stored body into blocks. Editors type into a plain textarea, so a
// blank line is the only paragraph break available to them. Within that
// constraint: a line starting with "##"/"###"/"####" is a heading, a block
// where every line starts with "- " or "* " is a bullet list, and everything
// else is a normal paragraph — the same lightweight conventions Markdown
// uses, without needing a rich-text editor or a new way to store the body.
export function storyParagraphs(story) {
  const blocks = (story?.body || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    for (const { prefix, level } of HEADING_PREFIXES) {
      if (block.startsWith(prefix)) {
        return { type: "heading", level, html: renderInline(block.slice(prefix.length).trim()) };
      }
    }

    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => /^[-*]\s/.test(line));
    if (isList) {
      return { type: "list", items: lines.map((line) => renderInline(line.slice(2).trim())) };
    }

    return { type: "paragraph", html: renderInline(block) };
  });
}
