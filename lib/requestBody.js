// Read a JSON request body with a hard size ceiling.
//
// request.json() buffers and parses whatever the caller sends, however large,
// before any of our field limits get a look at it. Those limits (lib/validate.js,
// normalizeMessages in the chat route) guard what we store; this guards what
// we are made to read. A declared Content-Length over the ceiling is refused
// before a byte is read, and since that header is optional (chunked uploads
// have none) the stream is counted as it arrives as well.
//
// Parse failures keep the old `request.json().catch(() => ({}))` behaviour — an
// empty object, so each route's own validation produces its usual 400 — and a
// JSON null or primitive becomes {} too, so `payload.field` never throws.

// Ceilings, generous next to the field limits they sit in front of.
export const BODY_LIMITS = {
  // ids, a choice, a title: votes, renames, deletes, role changes, consent.
  small: 16 * 1024,
  // A post or question: a summary of 5,000 characters is the largest field.
  form: 64 * 1024,
  // The last 20 chat turns at 4,000 characters each, with room for UTF-8.
  chat: 512 * 1024,
  // Admin-authored content, where a featured article's body is long-form.
  admin: 2 * 1024 * 1024
};

function tooLarge(maxBytes) {
  return new Response(
    JSON.stringify({ error: `Request body is too large (max ${Math.floor(maxBytes / 1024)} KB).` }),
    { status: 413, headers: { "Content-Type": "application/json" } }
  );
}

// Returns { data } or { response } — a 413 to return as-is.
export async function readJsonBody(request, maxBytes) {
  const declared = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { response: tooLarge(maxBytes) };
  }

  if (!request.body) return { data: {} };

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { response: tooLarge(maxBytes) };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return { data: data !== null && typeof data === "object" ? data : {} };
  } catch {
    return { data: {} };
  }
}
