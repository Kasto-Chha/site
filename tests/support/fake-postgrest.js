// A minimal in-memory PostgREST, enough for the queries lib/chatQuota.js,
// app/api/chat/route.js and the vote routes actually make.
//
// Why a real HTTP server instead of a stubbed supabase client: the quota is
// only correct if the *filters* it builds are correct — user_id, role, and the
// created_at window. A hand-written client stub would accept whatever the code
// asked for. Making supabase-js serialize a real request and having this parse
// it back means a wrong filter shows up as a wrong count, which is the bug
// worth catching.
//
// Supported: select (incl. head + count=exact), eq/gte/lt filters, order,
// limit, single/maybeSingle via the pgrst.object accept header, insert with
// return=representation, and delete by filter.

import http from "node:http";

// What cast_vote (migration 0014) accepts per target type, and the counter
// column each choice moves.
const VOTE_TARGETS = {
  trending: { table: "trending_topics", columns: { yes: "votes_yes", mid: "votes_mid", no: "votes_no" } },
  battle: { table: "battles", columns: { a: "left_votes", b: "right_votes" } },
  review: { table: "reviews", columns: { up: "upvotes", down: "downvotes" } }
};

// public.sync_thread_summary (migration 0019), worked out from the tables it is built
// from: one row per thread, named and filed by its first post, counted by kind, with the
// business it belongs to if any. A test seeds reviews and sync_merchants and reads this.
export function deriveThreadSummary(tables) {
  const byThread = new Map();
  for (const row of tables.reviews) {
    if (!row.topic_slug) continue;
    if (!byThread.has(row.topic_slug)) byThread.set(row.topic_slug, []);
    byThread.get(row.topic_slug).push(row);
  }
  const summary = [];
  for (const [slug, rows] of byThread) {
    const ordered = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : String(a.id) < String(b.id) ? -1 : 1));
    const first = ordered[0];
    const merchant = tables.sync_merchants.find((m) => m.topic_slug === slug);
    summary.push({
      topic_slug: slug,
      title: (first.topic && String(first.topic).trim()) || first.title,
      category: first.category,
      posts: rows.filter((r) => (r.kind ?? "experience") !== "question").length,
      questions: rows.filter((r) => r.kind === "question").length,
      latest: ordered[ordered.length - 1].created_at,
      first_at: first.created_at,
      tagged_as: merchant ? merchant.business_name : null
    });
  }
  return summary;
}

export function deriveThreadList(tables) {
  const latest = new Map();
  for (const row of tables.reviews) {
    if (!row.topic_slug) continue;
    const seen = latest.get(row.topic_slug);
    if (!seen || row.created_at > seen) latest.set(row.topic_slug, row.created_at);
  }
  return [...latest].map(([topic_slug, last_activity]) => ({ topic_slug, last_activity }));
}

// The unique indexes the migrations create, by table: sync_merchants_slug_key and so on.
const UNIQUE_KEYS = {
  sync_merchants: ["slug", "topic_slug"],
  sync_qr_codes: ["code"]
};

export class FakePostgrest {
  constructor() {
    this.tables = {
      admin_audit_log: [],
      battles: [],
      chat_messages: [],
      chat_topics: [],
      chat_usage: [],
      reviews: [],
      sync_events: [],
      sync_feedback: [],
      sync_merchants: [],
      sync_qr_codes: [],
      trending_search_rules: [],
      trending_topics: [],
      user_votes: []
    };
    this.requests = [];
    // Set to a table name to make every write to it fail, so the tests can
    // check what the route does when storage is broken.
    this.failWritesTo = null;
    // Set to a table name to make every read of it fail the way an unreachable
    // database would — a real error, not "this table does not exist".
    this.failReadsFrom = null;
    // Set to make consume_chat_quota fail the way an unreachable database
    // would, which is what sends lib/chatQuota.js down its fail-open path.
    this.failQuotaRpc = false;
    // Set to answer cast_vote the way PostgREST does before migration 0014 has
    // been applied: the function does not exist.
    this.missingVoteRpc = false;
    // Set to answer the way a database does before migration 0016 has been
    // applied: chat_topics has no opening_query / source / guest_key, and
    // trending_search_rules does not exist.
    this.beforeTrendingMigration = false;
    this.withDiscussionThreads = false;
    this.nextId = 1;
  }

  reset() {
    for (const name of Object.keys(this.tables)) this.tables[name] = [];
    this.requests = [];
    this.failWritesTo = null;
    this.failReadsFrom = null;
    this.failQuotaRpc = false;
    this.missingVoteRpc = false;
    this.beforeTrendingMigration = false;
    this.nextId = 1;
  }

  // The Postgres side of cast_vote, kept close to
  // supabase/migrations/0014_atomic_votes.sql. Argument names are checked
  // exactly: PostgREST resolves a function by them, so a renamed parameter is
  // "function not found" in production and should be here too. The row lock
  // has no analogue — node runs this handler to completion without
  // interleaving, which is the serialization the lock buys in Postgres.
  #castVote(args) {
    const notFound = {
      status: 404,
      body: { code: "PGRST202", message: "Could not find the function public.cast_vote" }
    };
    const names = Object.keys(args || {}).sort().join(",");
    if (this.missingVoteRpc || names !== "p_target_id,p_target_type,p_user_id,p_value") {
      return notFound;
    }

    const target = VOTE_TARGETS[args.p_target_type];
    if (!args.p_user_id || !target || !target.columns[args.p_value]) {
      return { status: 400, body: { code: "22023", message: "cast_vote: invalid vote" } };
    }

    const row = this.tables[target.table].find((r) => r.id === args.p_target_id);
    if (!row) return { status: 200, body: { found: false, vote: null, row: null } };

    const ledger = this.tables.user_votes;
    const index = ledger.findIndex(
      (v) =>
        v.user_id === args.p_user_id &&
        v.target_type === args.p_target_type &&
        v.target_id === args.p_target_id
    );
    const previous = index >= 0 ? ledger[index].value : "";
    const next = args.p_value === previous ? "" : args.p_value;

    if (!next) {
      if (index >= 0) ledger.splice(index, 1);
    } else if (index >= 0) {
      ledger[index].value = next;
    } else {
      ledger.push({
        id: `vote-${this.nextId++}`,
        user_id: args.p_user_id,
        target_type: args.p_target_type,
        target_id: args.p_target_id,
        value: next
      });
    }

    if (previous) {
      const column = target.columns[previous];
      row[column] = Math.max(0, (row[column] || 0) - 1);
    }
    if (next) {
      const column = target.columns[next];
      row[column] = (row[column] || 0) + 1;
    }

    return { status: 200, body: { found: true, vote: next || null, row: { ...row } } };
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
    if (table === "rpc/cast_vote") {
      const { status, body: payload } = this.#castVote(body);
      return send(res, status, payload);
    }

    if (this.beforeTrendingMigration) {
      const refusal = beforeTrendingMigration(req.method, table, url, body);
      if (refusal) return send(res, refusal.status, refusal.body);
    }

    // discussion_threads is the production view the list reads. The tests' stand-in is the
    // simplest thing with its shape (one row per thread, newest activity first), and exists
    // only when a test turns it on, so no other test sees a table it has never had.
    const isThreadList = table === "discussion_threads" && this.withDiscussionThreads;
    const isView = table === "sync_thread_summary" || isThreadList;
    const rows = table === "sync_thread_summary" ? deriveThreadSummary(this.tables)
      : isThreadList ? deriveThreadList(this.tables)
      : this.tables[table];
    if (!rows) return send(res, 404, { message: `no such table ${table}` });
    if (isView && req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, { code: "42809", message: "cannot change a view" });
    }

    if (req.method === "POST") return this.#insert(res, req, table, body);
    if (req.method === "GET" || req.method === "HEAD") {
      if (this.failReadsFrom === table) {
        return send(res, 500, { code: "XX000", message: "simulated read failure" });
      }
      return this.#select(res, req, url, rows);
    }
    if (req.method === "DELETE") return this.#delete(res, table, url);
    if (req.method === "PATCH") return this.#update(res, req, table, url, body);
    return send(res, 405, { message: "not supported by the fake" });
  }

  // Delete by filter. chat_messages go with their topic, the way the
  // on-delete-cascade foreign key takes them in Postgres.
  #delete(res, table, url) {
    if (this.failWritesTo === table) {
      return send(res, 500, { code: "XX000", message: "simulated write failure" });
    }
    const doomed = this.tables[table].filter((row) => matches(row, url.searchParams));
    this.tables[table] = this.tables[table].filter((row) => !doomed.includes(row));
    if (table === "chat_topics") {
      const ids = new Set(doomed.map((row) => row.id));
      this.tables.chat_messages = this.tables.chat_messages.filter((m) => !ids.has(m.topic_id));
    }
    return send(res, 204, null);
  }

  // Update by filter, the way PATCH /table?col=eq.x does. Answers with the changed rows
  // only when asked to (Prefer: return=representation), like PostgREST.
  #update(res, req, table, url, body) {
    if (this.failWritesTo === table) {
      return send(res, 500, { code: "XX000", message: "simulated write failure" });
    }
    const targets = this.tables[table].filter((row) => matches(row, url.searchParams));
    const conflict = this.#uniqueConflict(table, targets, body || {});
    if (conflict) return send(res, 409, conflict);
    for (const row of targets) Object.assign(row, body);
    const prefer = req.headers.prefer || "";
    if (!prefer.includes("return=representation")) return send(res, 204, null);
    return sendRows(res, req, targets, 200);
  }

  // The unique indexes the migrations create, for the tables the tests write to. A
  // violation answers 409 with Postgres's code 23505, which is what PostgREST sends.
  #uniqueConflict(table, rows, changes) {
    const keys = UNIQUE_KEYS[table];
    if (!keys) return null;
    const changing = Array.isArray(rows) ? rows : [rows];
    for (const key of keys) {
      if (!(key in changes)) continue;
      const value = changes[key];
      const clash = this.tables[table].some((other) => !changing.includes(other) && other[key] === value);
      if (clash || changing.length > 1) {
        return { code: "23505", message: `duplicate key value violates unique constraint "${table}_${key}_key"` };
      }
    }
    return null;
  }

  #insert(res, req, table, body) {
    if (this.failWritesTo === table) {
      return send(res, 500, { code: "XX000", message: "simulated write failure" });
    }
    const incoming = Array.isArray(body) ? body : [body];
    for (const row of incoming) {
      const conflict = this.#uniqueConflict(table, [], row);
      if (conflict) return send(res, 409, conflict);
    }
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
      const keys = order.split(",").map((part) => {
        const [field, direction] = part.split(".");
        return { field, desc: direction === "desc" };
      });
      out = [...out].sort((a, b) => {
        for (const { field, desc } of keys) {
          const cmp = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          if (cmp) return desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    const total = out.length;
    const offset = Number.parseInt(url.searchParams.get("offset") || "", 10);
    const from = Number.isInteger(offset) && offset > 0 ? offset : 0;
    if (from) out = out.slice(from);
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

    res.setHeader("Content-Range", `${from}-${Math.max(from, from + out.length - 1)}/${total}`);
    return sendRows(res, req, out, 200);
  }
}

// What PostgREST says about the 0016 columns and table on a database that
// does not have them yet. The codes are the point: the app tells "not migrated"
// from "broken" by them, so a made-up error here would test nothing.
const TRENDING_COLUMNS = ["opening_query", "source", "guest_key"];

function beforeTrendingMigration(method, table, url, body) {
  if (table === "trending_search_rules") {
    return {
      status: 404,
      body: {
        code: "PGRST205",
        message: "Could not find the table 'public.trending_search_rules' in the schema cache"
      }
    };
  }
  if (table !== "chat_topics") return null;

  if (method === "POST") {
    const rows = Array.isArray(body) ? body : [body || {}];
    const column = TRENDING_COLUMNS.find((name) => rows.some((row) => name in row));
    if (!column) return null;
    return {
      status: 400,
      body: {
        code: "PGRST204",
        message: `Could not find the '${column}' column of 'chat_topics' in the schema cache`
      }
    };
  }

  const selected = (url.searchParams.get("select") || "").split(",").map((name) => name.trim());
  const column = TRENDING_COLUMNS.find(
    (name) => selected.includes(name) || url.searchParams.has(name)
  );
  if (!column) return null;
  return {
    status: 400,
    body: { code: "42703", message: `column chat_topics.${column} does not exist` }
  };
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
    if (op === "neq" && String(cell) === value) return false;
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
