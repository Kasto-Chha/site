import SiteNav from "./SiteNav";
import { DRAFT, EFFECTIVE_DATE } from "../../lib/legal";

// Shared shell for /privacy and /terms. Same article surface as /about,
// /contact and /guidelines, so the legal pages don't read like a different
// site. Content comes from lib/legal.js.
//
// Sections are block lists rather than a flat array of strings: the document
// mixes running paragraphs, sub-headings ("Account Information", "Cookies")
// and bullet lists inside a single numbered section, and a legal text has to
// keep that structure to stay readable.
function Block({ block }) {
  if (block.type === "h3") return <h3>{block.text}</h3>;
  if (block.type === "ul") {
    return (
      <ul>
        {block.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p>{block.text}</p>;
}

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
              {EFFECTIVE_DATE ? (
                <p className="article-stamp">
                  Effective Date: {EFFECTIVE_DATE}
                </p>
              ) : null}
              <p className="article-lede">{doc.lede}</p>
            </header>

            {DRAFT ? (
              <div className="legal-draft" role="note">
                <strong>Draft.</strong> This page is an outline of what the
                final policy will cover, not the finished document.
              </div>
            ) : null}

            <div className="article-content">
              {(doc.intro || []).map((text, index) => (
                <p key={`intro-${index}`}>{text}</p>
              ))}

              {doc.sections.map((section) => (
                <section key={section.heading}>
                  <h2>{section.heading}</h2>
                  {section.blocks.map((block, index) => (
                    <Block key={index} block={block} />
                  ))}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
