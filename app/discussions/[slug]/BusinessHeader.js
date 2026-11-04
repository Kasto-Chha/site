// What a business thread shows about the business, above its posts. Plain facts the team
// entered, a way to add an experience, and Google's own links when there are any. It shows
// no hours, menu, prices, phone number or photos: Google keeps those. `facts` comes from
// businessPageFacts (lib/sync/threadPage.js), which has already checked that each link is
// Google's.

export default function BusinessHeader({ facts }) {
  return (
    <section className="biz-head" aria-label="About this business">
      <div className="biz-top">
        <span className="biz-chip">Business</span>
        <span className="biz-meta">
          {facts.kindName} · {facts.area}
        </span>
      </div>

      {facts.about ? (
        <>
          <span className="biz-about-label">About (from the business)</span>
          <p className="biz-about">{facts.about}</p>
        </>
      ) : null}

      <div className="biz-actions">
        <a className="biz-btn primary" href="#share">Share your experience</a>
        {facts.reviewUrl ? (
          <a className="biz-btn" href={facts.reviewUrl} target="_blank" rel="noopener noreferrer">Review on Google</a>
        ) : null}
        {facts.mapsUrl ? (
          <a className="biz-btn" href={facts.mapsUrl} target="_blank" rel="noopener noreferrer">See on Google Maps</a>
        ) : null}
      </div>

      <p className="biz-note">
        KastoChha doesn&apos;t sell, hide or rank reviews. What follows is what customers wrote, in their own words.
      </p>
    </section>
  );
}
