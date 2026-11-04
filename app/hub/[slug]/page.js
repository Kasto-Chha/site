import { notFound, redirect } from "next/navigation";

import HubAction from "./HubAction";
import { getMerchantBySlug } from "../../../lib/sync/merchants";
import { hubActions, hubFacts } from "../../../lib/sync/hub";
import { isValidCode, normalizeCode } from "../../../lib/sync/qr";
import "./hub.css";

export const dynamic = "force-dynamic";

// A business's hub: a few equal choices for a customer who has scanned its QR code. It needs no
// login to open, and it is kept out of search engines: it is for the people at the table.
export async function generateMetadata({ params }) {
  const merchant = await getMerchantBySlug(params.slug);
  return {
    title: merchant ? `${hubFacts(merchant).title} - KastoChha` : "KastoChha",
    robots: { index: false, follow: false }
  };
}

export default async function HubPage({ params, searchParams }) {
  const wanted = decodeURIComponent(params.slug || "");
  const merchant = await getMerchantBySlug(wanted);
  // A business whose tag was removed has no hub: it is the business header's neighbour, and goes with it.
  if (!merchant) notFound();
  // One address for a hub, whatever the case a visitor typed.
  if (wanted !== merchant.slug) redirect(`/hub/${merchant.slug}${searchParams?.c ? `?c=${encodeURIComponent(searchParams.c)}` : ""}`);

  const facts = hubFacts(merchant);
  const actions = hubActions(merchant);
  // The QR code that was scanned, so a tap can be counted against the right table.
  const code = isValidCode(searchParams?.c) ? normalizeCode(searchParams.c) : "";

  return (
    <main className="hub">
      <header className="hub-bar">
        <a className="hub-logo" href="/" aria-label="KastoChha">
          <span className="r">Kasto</span>
          <span className="b">Chha</span>
          <span className="r">?</span>
        </a>
      </header>

      <section>
        <p className="hub-you">You&apos;re at</p>
        <h1 className="hub-name">{facts.name}</h1>
        <p className="hub-sub">
          {facts.kindName} · {facts.area}
        </p>
        <p className="hub-ask">How was your visit? Pick what you&apos;d like to do.</p>
        <div className="hub-actions">
          {actions.map((action) => (
            <HubAction key={action.key} action={action} slug={merchant.slug} code={code} />
          ))}
        </div>
      </section>

      <footer className="hub-foot">
        This page needs no login. Posting asks you to sign in with Google.
        <strong>Powered by KastoChha Sync</strong>
      </footer>
    </main>
  );
}
