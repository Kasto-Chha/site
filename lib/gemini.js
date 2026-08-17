// Thin wrapper around the Google Gemini (Generative Language) REST API.
// Auth uses the x-goog-api-key header so it works for any API key format.
// Default model is gemini-2.5-flash (gemini-2.0-flash has no free-tier quota on
// some keys). Override with GEMINI_MODEL.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function model() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": process.env.GEMINI_API_KEY || ""
  };
}

// Map our {role: user|assistant, content} messages to Gemini's contents shape.
function toContents(messages = []) {
  return messages
    .filter((m) => m && m.content)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.toString() }]
    }));
}

function buildBody({
  system,
  messages,
  temperature = 0.7,
  maxOutputTokens = 1024,
  json = false,
  search = false
}) {
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: toContents(messages),
    // Grounding with Google Search. The model decides per turn whether a search
    // is worth running, so this can stay on: "iPhone 17 ko price kati?" goes to
    // the web, "momo kasto chha?" answers from the model. Not combinable with
    // responseMimeType JSON, which is why classifyReview never asks for it.
    // Note: "google_search" is the 2.0+ tool name. A 1.5-era GEMINI_MODEL wants
    // "google_search_retrieval" instead and will 400 on this one.
    ...(search && !json ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature,
      maxOutputTokens,
      // Disable "thinking" on 2.5 flash for fast, direct replies.
      thinkingConfig: { thinkingBudget: 0 },
      ...(json ? { responseMimeType: "application/json" } : {})
    }
  };
}

// Grounding chunks -> a deduped list of { title, uri }. The uri is Google's
// redirect URL, which is the form their grounding terms require you to link to.
function extractSources(metadata) {
  const chunks = metadata?.groundingChunks || [];
  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);

    // Titles land in markdown link text downstream, so drop the characters
    // that would break out of it.
    const title = (chunk.web.title || "")
      .toString()
      .replace(/[[\]()]/g, "")
      .trim()
      .slice(0, 80);

    sources.push({ title: title || "source", uri });
  }

  return sources;
}

// Streaming generator. Yields tagged events rather than bare strings, because a
// grounded answer carries citations alongside the prose:
//   { type: "text",    value: "…" }   prose, in order, as it arrives
//   { type: "sources", value: [{ title, uri }] }  whenever grounding reports any
export async function* geminiStream({
  system,
  messages,
  temperature,
  maxOutputTokens,
  search = false,
  signal
}) {
  const res = await fetch(`${BASE}/models/${model()}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildBody({ system, messages, temperature, maxOutputTokens, search })),
    signal
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const obj = JSON.parse(json);
        const candidate = obj?.candidates?.[0];

        const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
        if (text) yield { type: "text", value: text };

        const sources = extractSources(candidate?.groundingMetadata);
        if (sources.length) yield { type: "sources", value: sources };
      } catch {
        // Ignore partial/non-JSON keepalive lines.
      }
    }
  }
}

// Non-streaming single response.
export async function geminiGenerate({ system, messages, temperature = 0.4, maxOutputTokens = 512, json = false }) {
  const res = await fetch(`${BASE}/models/${model()}:generateContent`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildBody({ system, messages, temperature, maxOutputTokens, json }))
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

const CATEGORIES = [
  "Technology",
  "Career",
  "Education",
  "Housing",
  "Finance",
  "Food",
  "Lifestyle",
  "Auto",
  "Travel",
  "Health",
  "General"
];

// Auto-classify a submitted experience so the Experience page groups it under a
// clean topic and category. Best-effort: returns null on any failure so the
// caller falls back to the user-provided values.
export async function classifyReview({ title, summary, category }) {
  if (!geminiConfigured()) return null;

  const system = `You organise Nepali community experiences for KastoChha.
Return ONLY JSON: {"category": string, "topic": string}.
- "category" MUST be exactly one of: ${CATEGORIES.join(", ")}.
- "topic" is a short canonical subject in Title Case (2-4 words) that similar experiences should group under, e.g. "iPhone 15", "Kathmandu Rent", "eSewa", "Pathao Job". Keep brand/place names; drop filler words.`;

  const user = `Title: ${title}\nUser category hint: ${category || "(none)"}\nExperience: ${(summary || "").slice(0, 800)}`;

  try {
    const out = await geminiGenerate({
      system,
      messages: [{ role: "user", content: user }],
      json: true,
      temperature: 0.1,
      maxOutputTokens: 120
    });
    const parsed = JSON.parse(out);
    const cat = CATEGORIES.find((c) => c.toLowerCase() === (parsed.category || "").toLowerCase());
    const topic = (parsed.topic || "").toString().trim().slice(0, 80);
    if (!topic) return null;
    return { category: cat || category || "General", topic };
  } catch (error) {
    console.error("classifyReview failed:", error?.message || error);
    return null;
  }
}
