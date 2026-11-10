"use client";

import { useState } from "react";

import OwnerReplyBlock from "../../components/OwnerReply";
import { shortDate } from "../../../lib/sync/ownerReplies";

// The questions asked about a business, on its page. The thread card does not draw a question as a row (a
// question is a heading there, and a business's heading is its name), so without this a question asked here
// would be saved and never shown. Each question is shown with the business's reply under it, if there is one;
// the person who asked can delete their own. Anyone who knows can also answer by sharing an experience below.
export default function BusinessQuestions({ questions, businessName, ownerThread, onDelete, isBusy, errorFor }) {
  const [confirming, setConfirming] = useState("");
  if (!questions.length) return null;

  const ordered = [...questions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <section className="biz-questions" id="questions">
      <h2>
        Questions about {businessName} <span className="biz-questions-count">{ordered.length}</span>
      </h2>
      {ordered.map((q) => {
        const mine = q.mine === true;
        const error = errorFor ? errorFor(q.id) : "";
        return (
          <article className="biz-question" id={`q-${q.id}`} key={q.id}>
            <div className="biz-question-head">
              <span className="exp-author">{q.author_name || "Anonymous"}</span>{q.from_business ? (
                <span className="owner-reply-badge" title="Asked by the account the KastoChha team linked to this business.">
                  From the business
                </span>
              ) : null} asked · {shortDate(q.created_at)}{q.updated_at ? " · edited" : ""}
            </div>
            <p className="biz-question-text">{q.summary}</p>
            {ownerThread ? <OwnerReplyBlock exp={q} ownerThread={ownerThread} /> : null}
            {mine ? (
              <div className="owner-reply-actions">
                {confirming === q.id ? (
                  <>
                    <span>Delete your question?</span>
                    <button type="button" className="exp-action is-danger" disabled={isBusy?.(q.id)} onClick={async () => { await onDelete(q.id); setConfirming(""); }}>Yes</button>
                    <button type="button" className="exp-action" onClick={() => setConfirming("")}>No</button>
                  </>
                ) : (
                  <button type="button" className="exp-action is-danger" onClick={() => setConfirming(q.id)}>Delete</button>
                )}
              </div>
            ) : null}
            {error ? <div className="form-error">{error}</div> : null}
          </article>
        );
      })}
    </section>
  );
}
