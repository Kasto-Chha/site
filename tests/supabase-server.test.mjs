// lib/supabase/server.js — the server client is service role or nothing.

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { createServerSupabase } from "../lib/supabase/server.js";

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const VARS = [
  URL_VAR,
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
];
const saved = Object.fromEntries(VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function configure(env) {
  for (const name of VARS) delete process.env[name];
  Object.assign(process.env, { [URL_VAR]: "https://project.supabase.co", ...env });
}

// A legacy Supabase key is a JWT whose payload names its role.
function jwt(role) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "supabase", role })}.signature`;
}

test("a service role key builds a client", () => {
  configure({ SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc123" });
  assert.ok(createServerSupabase());

  configure({ SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") });
  assert.ok(createServerSupabase());
});

test("no service key is an error — never a fallback to the public key", () => {
  // Exactly the configuration that used to "work": the publishable key is
  // there, the service key is not, and the old helper quietly used the former.
  configure({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xyz" });
  assert.throws(() => createServerSupabase(), /SUPABASE_SERVICE_ROLE_KEY/);

  configure({ SUPABASE_SERVICE_ROLE_KEY: "   " });
  assert.throws(() => createServerSupabase(), /SUPABASE_SERVICE_ROLE_KEY/, "whitespace is not a key");
});

test("a public key in the service slot is refused", () => {
  configure({ SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_xyz" });
  assert.throws(() => createServerSupabase(), /public/);

  configure({ SUPABASE_SERVICE_ROLE_KEY: jwt("anon") });
  assert.throws(() => createServerSupabase(), /public/, "a legacy anon JWT");

  // An opaque key that happens to be the one configured as publishable.
  configure({
    SUPABASE_SERVICE_ROLE_KEY: "same-key-in-both",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "same-key-in-both"
  });
  assert.throws(() => createServerSupabase(), /public/);
});

test("no URL is an error too", () => {
  configure({ SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc123" });
  delete process.env[URL_VAR];
  assert.throws(() => createServerSupabase(), /NEXT_PUBLIC_SUPABASE_URL/);
});
