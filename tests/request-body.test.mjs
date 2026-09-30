// lib/requestBody.js — the size ceiling in front of every JSON route.

import test from "node:test";
import assert from "node:assert/strict";

import { BODY_LIMITS, readJsonBody } from "../lib/requestBody.js";

const encoder = new TextEncoder();

function post(body, headers = {}) {
  return new Request("https://kastochha.com/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body
  });
}

// A request whose body is a stream we can watch: whether it was read at all,
// and whether reading was abandoned. `highWaterMark: 0` stops the stream
// pulling ahead on its own, so `pulled` means the reader actually asked.
function watchedRequest(chunks, headers = {}) {
  const seen = { pulled: 0, cancelled: false };
  let index = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        seen.pulled += 1;
        if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
        else controller.close();
      },
      cancel() {
        seen.cancelled = true;
      }
    },
    { highWaterMark: 0 }
  );
  return { request: { headers: new Headers(headers), body }, seen };
}

test("an ordinary body parses", async () => {
  const { data, response } = await readJsonBody(post(JSON.stringify({ id: "x", side: "yes" })), BODY_LIMITS.small);
  assert.equal(response, undefined);
  assert.deepEqual(data, { id: "x", side: "yes" });
});

test("a declared Content-Length over the limit is refused without reading a byte", async () => {
  const { request, seen } = watchedRequest(['{"a":1}'], {
    "content-length": String(BODY_LIMITS.small + 1)
  });

  const { response } = await readJsonBody(request, BODY_LIMITS.small);
  assert.equal(response.status, 413);
  assert.equal(seen.pulled, 0, "refused on the header alone");
});

test("a body with no Content-Length is counted as it streams, and abandoned once over", async () => {
  const chunk = "x".repeat(4096);
  const { request, seen } = watchedRequest(Array.from({ length: 100 }, () => chunk));

  const { response } = await readJsonBody(request, BODY_LIMITS.small);
  assert.equal(response.status, 413);
  assert.ok(seen.pulled <= 5, `stopped near the limit, not after all 100 chunks (read ${seen.pulled})`);
  assert.equal(seen.cancelled, true, "the rest of the upload is cancelled, not drained");
});

test("a Content-Length that understates the body does not get past the count", async () => {
  const { request } = watchedRequest(["x".repeat(BODY_LIMITS.small + 1)], { "content-length": "10" });
  const { response } = await readJsonBody(request, BODY_LIMITS.small);
  assert.equal(response.status, 413);
});

test("a body exactly at the limit is accepted", async () => {
  const json = JSON.stringify({ pad: "" });
  const exact = JSON.stringify({ pad: "x".repeat(BODY_LIMITS.small - json.length) });
  assert.equal(encoder.encode(exact).byteLength, BODY_LIMITS.small);

  const { data, response } = await readJsonBody(post(exact), BODY_LIMITS.small);
  assert.equal(response, undefined);
  assert.equal(data.pad.length, BODY_LIMITS.small - json.length);
});

test("the limit is bytes, not characters", async () => {
  // Devanagari is three bytes a character in UTF-8, so this is ~3x the limit
  // in bytes while well under it in string length.
  const body = JSON.stringify({ text: "क".repeat(Math.ceil(BODY_LIMITS.small / 2)) });
  assert.ok(body.length < BODY_LIMITS.small * 2);

  const { response } = await readJsonBody(post(body), BODY_LIMITS.small);
  assert.equal(response.status, 413);
});

test("malformed or non-object JSON becomes an empty object, as before", async () => {
  for (const raw of ["{not json", "null", "42", '"a string"', ""]) {
    const { data, response } = await readJsonBody(post(raw), BODY_LIMITS.small);
    assert.equal(response, undefined, JSON.stringify(raw));
    assert.deepEqual(data, {}, JSON.stringify(raw));
  }
});

test("a 413 is JSON and names the ceiling", async () => {
  const { response } = await readJsonBody(post("x".repeat(BODY_LIMITS.small + 1)), BODY_LIMITS.small);
  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.match((await response.json()).error, /max 16 KB/);
});
