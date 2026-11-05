import { notFound, redirect } from "next/navigation";

import NoteForm from "./NoteForm";
import { getMerchantBySlug } from "../../../../lib/sync/merchants";
import { hubFacts } from "../../../../lib/sync/hub";
import "../hub.css";

export const dynamic = "force-dynamic";

// Where a customer writes a private note to a business. Public (no login) and kept out of search engines,
// like the hub it belongs to. A business whose tag was removed has no note page.
export async function generateMetadata({ params }) {
  const merchant = await getMerchantBySlug(params.slug);
  return {
    title: merchant ? `Private note to ${hubFacts(merchant).name} - KastoChha` : "KastoChha",
    robots: { index: false, follow: false }
  };
}

export default async function NotePage({ params }) {
  const wanted = decodeURIComponent(params.slug || "");
  const merchant = await getMerchantBySlug(wanted);
  if (!merchant) notFound();
  if (wanted !== merchant.slug) redirect(`/hub/${merchant.slug}/note`);
  const facts = hubFacts(merchant);

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
        <a className="hub-back" href={`/hub/${merchant.slug}`}>&larr; Back</a>
        <p className="hub-you">A private note to</p>
        <h1 className="hub-name">{facts.name}</h1>
        <p className="hub-sub">
          {facts.kindName} · {facts.area}
        </p>
        <NoteForm slug={merchant.slug} name={facts.name} />
      </section>
      <footer className="hub-foot">
        This page needs no login.
        <strong>Powered by KastoChha Sync</strong>
      </footer>
    </main>
  );
}
