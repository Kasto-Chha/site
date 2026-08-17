// The assistant answers in light markdown — **bold**, "- " bullets, the odd
// `code` span. The chat bubble printed the raw stream, so readers saw the
// literal ** around words instead of bold text.
//
// These helpers turn an answer (possibly half-streamed) into blocks that the
// bubble renders as real React elements. No HTML string is ever assembled, so
// there is nothing to sanitize and no way for model output to inject markup.

const HEADING = /^#{1,6}\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;

// Links come first so [text](url) is not chewed up by another marker, and bold
// before italic so **x** is not read as an italic "*x*" pair. Newlines are
// excluded from every marker, so an unclosed one can never swallow the rest of
// the answer — it just stays literal until its partner streams in.
//
// The http/https prefix is part of the pattern rather than a check afterwards:
// a javascript: or data: URL simply does not match, so it falls through to
// plain text instead of ever reaching an href.
const INLINE =
  /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*/;

// One line of text -> [{ text, bold?, italic?, code?, href? }]
export function parseInline(text) {
  const spans = [];
  let rest = text;

  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      spans.push({ text: rest });
      break;
    }
    if (match.index > 0) spans.push({ text: rest.slice(0, match.index) });

    if (match[1] !== undefined) spans.push({ text: match[1], href: match[2] });
    else if (match[3] !== undefined) spans.push({ text: match[3], bold: true });
    else if (match[4] !== undefined) spans.push({ text: match[4], code: true });
    else spans.push({ text: match[5], italic: true });

    rest = rest.slice(match.index + match[0].length);
  }

  return spans.filter((span) => span.text);
}

// A whole answer -> [{ type: "p" | "heading", spans } | { type: "list", ordered, items }]
export function parseChatText(raw) {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    // Joined with newlines, not spaces: the bubble keeps single line breaks the
    // way it did before this existed (see .chat-md p { white-space: pre-line }).
    blocks.push({ type: "p", spans: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Headings would look oversized in a chat bubble, so they are kept as an
    // emphasised line rather than an <h2>.
    const heading = HEADING.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", spans: parseInline(heading[1]) });
      continue;
    }

    const ordered = ORDERED.exec(trimmed);
    const bullet = ordered ? null : BULLET.exec(trimmed);
    if (ordered || bullet) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      // A change of list style starts a new list rather than mixing markers.
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { type: "list", ordered: isOrdered, items: [] };
      }
      list.items.push(parseInline((ordered || bullet)[1]));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}
