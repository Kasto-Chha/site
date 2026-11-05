#!/usr/bin/env node
// Quick checks that KastoChha Sync works, for one TEST business. Run it before and after every deploy.
//
//   node scripts/sync-smoke.mjs --base https://www.kastochhanepal.com --slug himal-brew-house --code abc3k9xq
//
//   --base         the site's address (a preview deployment, the live site, or http://localhost:3000)
//   --slug         the test business's address name, from its hub address (/hub/<slug>)
//   --code         one of its QR codes, from its scan address (/q/<code>)
//   --count-scan   also make one real scan (counted once) and check the cookies
//   --write        also send one real private note (resolve it in the inbox afterwards)
//
// Needs Node 18 or newer. Exits 0 if every check passed, 1 if any failed, 2 if it was started wrongly.
import { runSmoke } from "../lib/sync/smoke.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const base = value("base");
const slug = value("slug");
const code = value("code");
if (!base || !slug || !code || !/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/sync-smoke.mjs --base <https://site> --slug <business-slug> --code <qr-code> [--count-scan] [--write]");
  process.exit(2);
}

const { results, failed, checks } = await runSmoke({ base, slug, code, countScan: flag("count-scan"), write: flag("write") });
for (const r of results) console.log(r.info ? `INFO  ${r.name.replace(/^info: /, "")}` : `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n      -> ${r.detail}`}`);
console.log(`\n${checks - failed} passed, ${failed} failed${failed ? ". Do not go live until these are fixed." : ". Looks healthy."}`);
process.exit(failed ? 1 : 0);
