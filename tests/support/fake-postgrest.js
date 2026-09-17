// A minimal in-memory PostgREST, enough for the queries lib/chatQuota.js and
// app/api/chat/route.js actually make.
//
// Why a real HTTP server instead of a stubbed supabase client: the quota is
// only correct if the *filters* it builds are correct — user_id, role, and the
// created_at window. A hand-written client stub would accept whatever the code
// asked for. Making supabase-js serialize a real request and having this parse
// it back means a wrong filter shows up as a wrong count, which is the bug
// worth catching.
//
// Supported: select (incl. head + count=exact), eq/gte/lt filters, order,
// limit, single/maybeSingle via the pgrst.object accept header, and insert
// with return=representation.

import http from "node:http";

export class FakePostgrest {
  constructor() {
    this.tables = {
      chat_messages: [],
      chat_topics: [],
      chat_usage: [],
      reviews: [],
      trending_topics: []
    };
    this.requests = [];
    // Set to a table name to make every write to it fail, so the tests can
    // check what the route does when storage is broken.
    this.failWritesTo = null;
    // Set to make consume_chat_quota fail the way an unreachable database
    // would, which is what sends lib/chatQuota.js down its fail-open path.
    this.failQuotaRpc = false;
    this.nextId = 1;
  }

  reset() {
    for (const name of Object.keys(this.tables)) this.tables[name] = [];
    this.requests = [];
    this.failWritesTo = null;
    this.failQuotaRpc = false;
    this.nextId = 1;
  }

  seedUsage(identity, count, { spreadMs = 1000, endingAt = Date.now() } = {}) {
    for (let i = 0; i < count; i += 1) {
      this.tables.chat_usage.push({
        id: `usage-${this.nextId++}`,
        identity,
        created_at: new Date(endingAt - (count - 1 - i) * spreadMs).toISOString()
      });
    }
  }

  countUsage(identity) {
    return this.tables.chat_usage.filter((row) => row.identity === identity).length;
  }

  // The Postgres side of consume_chat_quota, kept deliberately close to
  // supabase/migrations/0014_chat_usage_ledger.sql. The advisory lock has no
  // analogue here — node runs this handler to completion without interleaving,
  // which is exactly the serialization the lock buys in Postgres.
  #consumeChatQuota(args) {
    const identity = args.p_identity;
    const dayLimit = args.p_day_limit;
    const burstLimit = args.p_burst_limit;
    const now = Date.now();

    this.tables.chat_usage = this.tables.chat_usage.filter(
      (row) => row.identity !== identity || Date.parse(row.created_at) >= now - 24 * 3600_000
    );

    const mine = this.tables.chat_usage.filter((row) => row.identity === identity);
    const oldest = (rows) => Math.min(...rows.map((r) => Date.parse(r.created_at)));

    if (mine.length >= dayLimit) {
      const retry = Math.ceil((oldest(mine) + 24 * 3600_000 - now) / 1000);
      return [{ allowed: false, remaining: 0, scope: "day", retry_after: Math.max(1, retry) }];
    }

    if (args.p_check_burst) {
      const recent = mine.filter((row) => Date.parse(row.created_at) >= now - 60_000);
      if (recent.length >= burstLimit) {
        const retry = Math.ceil((oldest(recent) + 60_000 - now) / 1000);
        return [
          {
            allowed: false,
            remaining: dayLimit - mine.length,
            scope: "burst",
            retry_after: Math.max(1, retry)
          }
        ];
      }
    }

    this.tables.chat_usage.push({
      id: `usage-${this.nextId++}`,
      identity,
      created_at: new Date(now).toISOString()
    });
    return [
      { allowed: true, remaining: dayLimit - mine.length - 1, scope: null, retry_after: 0 }
    ];
  }

  // Drop rows the way DELETE /api/chat/history does: topics for this user, and
  // their messages via the on-delete-cascade foreign key.
  deleteUserHistory(userId) {
    const topicIds = new Set(
      this.tables.chat_topics.filter((t) => t.user_id === userId).map((t) => t.id)
    );
    this.tables.chat_topics = this.tables.chat_topics.filter((t) => t.user_id !== userId);
    this.tables.chat_messages = this.tables.chat_messages.filter((m) => !topicIds.has(m.topic_id));
  }

  seedMessages(userId, count, { role = "user", spreadMs = 1000, endingAt = Date.now() } = {}) {
    const topicId = `seed-topic-${userId}`;
    if (!this.tables.chat_topics.some((t) => t.id === topicId)) {
      this.tables.chat_topics.push({ id: topicId, user_id: userId, title: "seed" });
    }
    for (let i = 0; i < count; i += 1) {
      this.tables.chat_messages.push({
        id: `seed-${this.nextId++}`,
        topic_id: topicId,
        user_id: userId,
        role,
        content: `seeded ${i}`,
        created_at: new Date(endingAt - (count - 1 - i) * spreadMs).toISOString()
      });
    }
  }

  countMessages(userId, role = "user") {
    return this.tables.chat_messages.filter((m) => m.user_id === userId && m.role === role).length;
  }

  async listen() {
    this.server = http.createServer((req, res) => this.#handle(req, res));
    await new Promise((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.port = this.server.address().port;
    this.url = `http://127.0.0.1:${this.port}`;
    return this.url;
  }

  async close() {
    if (this.server) await new Promise((resolve) => this.server.close(resolve));
  }

  async #handle(req, res) {
    const url = new URL(req.url, this.url);
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const body = await readBody(req);
    this.requests.push({ method: req.method, table, query: url.search, body });

    if (table === "rpc/consume_chat_quota") {
      if (this.failQuotaRpc) {
        return send(res, 500, { code: "XX000", message: "simulated database outage" });
      }
      return send(res, 200, this.#consumeChatQuota(body || {}));
    }

    const rows = this.tables[table];
    if (!rows) return send(res, 404, { message: `no such table ${table}` });

    if (req.method === "POST") return this.#insert(res, req, table, body);
    if (req.method === "GET" || req.method === "HEAD") {
      return this.#select(res, req, url, rows);
    }
    return send(res, 405, { message: "not supported by the fake" });
  }

  #insert(res, req, table, body) {
    if (this.failWritesTo === table) {
      return send(res, 500, { code: "XX000", message: "simulated write failure" });
    }
    const incoming = Array.isArray(body) ? body : [body];
    const inserted = incoming.map((row) => {
      const full = {
        id: `${table}-${this.nextId++}`,
        created_at: new Date().toISOString(),
        ...row
      };
      this.tables[table].push(full);
      return full;
    });

    const prefer = req.headers.prefer || "";
    if (!prefer.includes("return=representation")) return send(res, 201, null);
    return sendRows(res, req, inserted, 201);
  }

  #select(res, req, url, rows) {
    let out = rows.filter((row) => matches(row, url.searchParams));

    const order = url.searchParams.get("order");
    if (order) {
      const [field, direction] = order.split(".");
      out = [...out].sort((a, b) => {
        const cmp = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
        return direction === "desc" ? -cmp : cmp;
      });
    }

    const total = out.length;
    const limit = Number.parseInt(url.searchParams.get("limit") || "", 10);
    if (Number.isInteger(limit)) out = out.slice(0, limit);

    // head:true + count:exact — the shape lib/chatQuota.js counts with.
    if (req.method === "HEAD") {
      res.setHeader("Content-Range", `0-${Math.max(0, total - 1)}/${total}`);
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      return res.end();
    }

    const select = url.searchParams.get("select");
    if (select && select !== "*") {
      const fields = select.split(",").map((f) => f.trim());
      out = out.map((row) => Object.fromEntries(fields.map((f) => [f, row[f]])));
    }

    res.setHeader("Content-Range", `0-${Math.max(0, out.length - 1)}/${total}`);
    return sendRows(res, req, out, 200);
  }
}

// single()/maybeSingle() ask for one object rather than an array. Older
// supabase-js does that with an accept header and reads PGRST116 as "no rows";
// newer versions take the array and slice it. Answering in whichever shape was
// asked for keeps this working against both.
function sendRows(res, req, rows, status) {
  const wantsObject = (req.headers.accept || "").includes("pgrst.object");
  if (!wantsObject) return send(res, status, rows);
  if (rows.length === 1) return send(res, status, rows[0]);
  return send(res, 406, {
    code: "PGRST116",
    message: `JSON object requested, multiple (or no) rows returned`,
    details: `Results contain ${rows.length} rows`
  });
}

function matches(row, params) {
  for (const [key, raw] of params.entries()) {
    if (["select", "order", "limit", "offset", "or"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[key];
    if (op === "eq" && String(cell) !== value) return false;
    if (op === "gte" && !(cell >= value)) return false;
    if (op === "lte" && !(cell <= value)) return false;
    if (op === "gt" && !(cell > value)) return false;
    if (op === "lt" && !(cell < value)) return false;
    if (op === "is" && !isMatch(cell, value)) return false;
    if (op === "ilike" && !ilikeMatch(cell, value)) return false;
    if (op === "in" && !inMatch(cell, value)) return false;
  }
  return true;
}

function isMatch(cell, value) {
  if (value === "null") return cell === null || cell === undefined;
  if (value === "true") return cell === true;
  if (value === "false") return cell === false;
  return String(cell) === value;
}

// PostgREST's ilike. % is any run of characters and _ is any single one, and
// PostgREST additionally rewrites * to % before the query reaches Postgres —
// so * is a third wildcard that a caller-supplied term has to account for.
// Modelling that here is the point: a substring check would quietly pass a
// term that matches everything in production.
function ilikeMatch(cell, pattern) {
  if (cell === null || cell === undefined) return false;
  const escaped = pattern
    .replace(/\*/g, "%")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, "[\\s\\S]*")
    .replace(/_/g, "[\\s\\S]");
  return new RegExp(`^${escaped}$`, "i").test(String(cell));
}

// in.(a,b,c) — PostgREST quotes values that need it.
function inMatch(cell, value) {
  const inner = value.replace(/^\(/, "").replace(/\)$/, "");
  const items = inner
    .split(",")
    .map((item) => item.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
  return items.includes(String(cell));
}

function send(res, status, payload) {
  const text = payload === null ? "" : JSON.stringify(payload);
  res.setHeader("Content-Type", "application/json");
  res.writeHead(status);
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(text);
      }
    });
  });
}
