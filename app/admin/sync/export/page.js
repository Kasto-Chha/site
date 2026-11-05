import { NOINDEX_NOFOLLOW } from "../../../../lib/seo/indexable";
import { requireRole, ROLE } from "../../../../lib/auth/roles";

export const metadata = {
  title: "Sync export - KastoChha Admin",
  robots: NOINDEX_NOFOLLOW
};

export const dynamic = "force-dynamic";

const FILES = [
  {
    title: "Businesses",
    text: "Every business that was ever tagged: its type, status, hub and page addresses, how many QR cards it has, whether it has Google links and a linked owner, and when it was tagged.",
    links: [["Download", "/api/admin/sync/export?kind=businesses"]]
  },
  {
    title: "QR cards",
    text: "Every QR card with its address, whether it is switched on, how many times it has been scanned in all, and when it was last scanned.",
    links: [["Download", "/api/admin/sync/export?kind=qr-codes"]]
  },
  {
    title: "Activity report",
    text: "One row for each active business: QR scans, hub taps, website badge use, experiences, questions, posts marked Visited, the business's replies and private notes, for the range you choose. The same numbers as the Overview.",
    links: [
      ["Last 7 days", "/api/admin/sync/export?kind=activity&range=7d"],
      ["Last 30 days", "/api/admin/sync/export?kind=activity&range=30d"],
      ["All time", "/api/admin/sync/export?kind=activity&range=all"]
    ]
  }
];

// Tables the team can take away: to send a business its numbers, or to keep a record. Plain CSV files that open in
// Excel or Google Sheets, with Nepali names intact.
export default async function SyncExportPage() {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in?redirect_url=/admin/sync/export">Sign in</a>
      </div>
    );
  }

  return (
    <>
      <div className="ov-head">
        <div>
          <div className="page-kicker">SYNC</div>
          <h1>Export</h1>
          <p>Download the numbers as a spreadsheet. Dates and times are in Nepal time.</p>
        </div>
      </div>
      <section className="ov-section">
        {FILES.map((file) => (
          <div className="ov-card ov-pad" key={file.title}>
            <h3 style={{ margin: "0 0 4px" }}>{file.title}</h3>
            <p className="ov-note" style={{ margin: "0 0 12px" }}>{file.text}</p>
            <div className="fb-actions">
              {file.links.map(([label, href]) => (
                <a key={href} className="btn-outline" href={href}>{label}</a>
              ))}
            </div>
          </div>
        ))}
        <p className="ov-note">
          Private notes are not in any file: they are private, and they carry people&apos;s contact details. Read them in the Feedback inbox. A file is whole or it is not made: if something cannot be read, you are told, and nothing is downloaded.
        </p>
      </section>
    </>
  );
}
