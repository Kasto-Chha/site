import SiteNav from "./SiteNav";
import { DRAFT, LAST_UPDATED } from "../../lib/legal";

// Shared shell for /privacy and /terms. Same article surface as /about,
// /contact and /guidelines, so the legal pages don't read like a different
// site. Content comes from lib/legal.js.
export default function LegalPage({ doc }) {
  return (
    <>
      <SiteNav />
      <main className="article-main">
        <div className="article-shell">
          <article className="article-body">
            <header className="article-head">
              <div className="article-kicker">{doc.kicker}</div>
              <h1 className="article-title">{doc.title}</h1>
              <p className="article-lede">{doc.lede}</p>
              {LAST_UPDATED ? (
                <p className="article-stamp">Last updated {LAST_UPDATED}</p>
              ) : null}
            </header>

            {/* Says so plainly while the copy is a skeleton, so nobody mistakes
                an outline for a policy that has been reviewed. Flip DRAFT in
                lib/legal.js once the real wording is in. */}
            {DRAFT ? (
              <div className="legal-draft" role="note">
                <strong>Draft.</strong> This page is an outline of what the
                final policy will cover, not the finished document.
              </div>
            ) : null}

            <div className="article-content">
              {doc.sections.map((section) => (
                <section key={section.heading}>
                  <h2>{section.heading}</h2>
                  {section.body.length > 1 ? (
                    <ul>
                      {section.body.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    section.body.map((line, index) => <p key={index}>{line}</p>)
                  )}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
