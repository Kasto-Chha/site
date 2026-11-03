import { countLabel } from "../../../../lib/sync/text";

// The three states of step 1 of the tag form, as plain pieces with no state of their
// own, so they can be rendered and checked without a browser.

function counts(thread) {
  return `${countLabel(thread.posts, "experience", "experiences")} · ${countLabel(thread.questions, "question", "questions")}`;
}

// A thread has been chosen. Change reopens the search; Remove clears the choice and
// the search too. Either way, what choosing filled into the form is taken back.
export function LinkedThreadCard({ thread, businessCategory, onChange, onRemove }) {
  const filedElsewhere = thread.category && businessCategory && thread.category !== businessCategory;
  return (
    <div>
      <div className="admin-list">
        <div className="admin-row">
          <div>
            <div className="admin-row-title">{thread.title}</div>
            <div className="admin-row-meta">
              {counts(thread)} · /discussions/{thread.slug}
            </div>
          </div>
          <div className="admin-row-actions">
            <span className="admin-status published">Linked thread</span>
            <button type="button" className="btn-outline" onClick={onChange}>Change</button>
            <button type="button" className="btn-outline" onClick={onRemove}>Remove</button>
          </div>
        </div>
      </div>
      {filedElsewhere ? (
        <div className="admin-helper">
          This thread is filed under {thread.category}. The business is listed under {businessCategory}. The thread&apos;s existing posts keep their category.
        </div>
      ) : null}
      <div className="admin-helper">The thread address is fixed once tagged, so renaming the business later never splits its thread.</div>
    </div>
  );
}

// A new thread will be made from the name and area.
export function NewThreadCard({ address, onSwitch }) {
  return (
    <div>
      <div className="admin-list">
        <div className="admin-row">
          <div>
            <div className="admin-row-title">A new thread will be created</div>
            <div className="admin-row-meta">
              {address ? `/discussions/${address}` : "Type the name and area below to see its address."}
            </div>
          </div>
          <div className="admin-row-actions">
            <button type="button" className="btn-outline" onClick={onSwitch}>Switch to an existing thread</button>
          </div>
        </div>
      </div>
      <div className="admin-helper">The thread address is fixed once tagged, so renaming the business later never splits its thread.</div>
    </div>
  );
}

// The search results: a page of threads, how many there are in all, and a way to see more.
export function ThreadList({ threads, total, hasMore, loading, loadingMore, error, addressNotFound, searching, onSelect, onMore }) {
  if (error) return <div className="admin-banner">{error}</div>;
  if (loading && threads.length === 0) return <div className="admin-helper">Searching...</div>;
  if (addressNotFound) return <div className="admin-empty">No thread has that address. Check it, or start a new thread below.</div>;
  if (threads.length === 0) {
    return <div className="admin-empty">{searching ? "No thread matches. You can start a new one below." : "There are no threads to show yet. You can start a new one below."}</div>;
  }
  return (
    <div>
      <div className="admin-list">
        {threads.map((t) => (
          <div className="admin-row" key={t.slug}>
            <div>
              <div className="admin-row-title">{t.title}</div>
              <div className="admin-row-meta">
                {t.category || "No category"} · {counts(t)} · /discussions/{t.slug}
              </div>
            </div>
            <div className="admin-row-actions">
              {t.alreadyTaggedAs ? (
                <span className="admin-status draft">Already {t.alreadyTaggedAs}</span>
              ) : (
                <button type="button" className="btn-outline" onClick={() => onSelect(t)}>Select</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="admin-actions">
        <span className="admin-helper">
          Showing {threads.length} of {total} {total === 1 ? "thread" : "threads"}
        </span>
        {hasMore ? (
          <button type="button" className="btn-outline" onClick={onMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Show more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
