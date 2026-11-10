"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Linking the one account that speaks for a business. Two steps, so the team is sure before anything changes:
// look the account up by email and see who it is, then link it. The account must have a verified email, so
// "Verified business" means the team knows who is behind it. An owner can reply to posts on the business's
// page, and cannot post experiences about their own business.
export default function OwnerPanel({ merchantId, owner, active }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [found, setFound] = useState(null);
  // Which action is running ("lookup", "link", "unlink"), or "" when none: every button is held while one runs, and the
  // one that was pressed says so.
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function call(url, method, body) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "That did not work.");
    return data;
  }

  async function run(action, name = "work") {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  const lookUp = (event) => {
    event.preventDefault();
    return run(async () => setFound((await call("/api/admin/sync/owner-lookup", "POST", { email })).user), "lookup");
  };
  const link = () =>
    run(async () => {
      await call(`/api/admin/sync/merchants/${merchantId}/owner`, "PUT", { userId: found.id });
      setFound(null);
      setEmail("");
      setConfirmReplace(false);
      router.refresh();
    }, "link");
  const unlink = () =>
    run(async () => {
      await call(`/api/admin/sync/merchants/${merchantId}/owner`, "DELETE");
      setConfirming(false);
      router.refresh();
    }, "unlink");

  // The account being offered is already the owner: nothing to replace.
  const sameAsOwner = Boolean(owner && !owner.unreadable && found && owner.email && found.email && owner.email.toLowerCase() === found.email.toLowerCase());
  const ownerLabel = owner?.unreadable ? "the linked account" : owner?.name || owner?.email || "the current owner";

  return (
    <div className="admin-panel">
      <h2>Verified owner</h2>
      <p className="admin-helper">
        The one account that can reply to posts on this business&apos;s page, shown as &quot;Verified business&quot;. Link it by hand, after the owner has proved who they are. They can reply and edit their own replies; they cannot change anyone else&apos;s post, and they cannot post experiences about their own business.
      </p>
      {!active ? <div className="admin-banner">This business&apos;s tag has been removed, so an owner cannot be linked.</div> : null}

      {owner ? (
        <div className="admin-row">
          <div>
            <div className="admin-row-title">{owner.unreadable ? "An account is linked" : owner.name}</div>
            <div className="admin-row-meta">{owner.unreadable ? "Its details could not be read just now." : owner.email}</div>
          </div>
          {confirming ? (
            <div className="admin-actions">
              <span>Unlink this owner?</span>
              <button type="button" className="btn-red" onClick={unlink} disabled={Boolean(busy)}>{busy === "unlink" ? "Working…" : "Yes, unlink"}</button>
              <button type="button" className="btn-outline" onClick={() => setConfirming(false)} disabled={Boolean(busy)}>No</button>
            </div>
          ) : (
            <button type="button" className="btn-outline" onClick={() => setConfirming(true)} disabled={Boolean(busy)}>Unlink</button>
          )}
        </div>
      ) : (
        <p className="admin-helper">No owner is linked yet.</p>
      )}

      {active ? (
        <form onSubmit={lookUp}>
          <div className="admin-field">
            <label className="admin-label" htmlFor="owner-email">{owner ? "Link a different account" : "Owner's email"}</label>
            <input id="owner-email" className="admin-input" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setConfirmReplace(false); setFound(null); }} placeholder="The email they signed up to KastoChha with" autoComplete="off" />
          </div>
          <div className="admin-actions">
            <button type="submit" className="btn-outline" disabled={Boolean(busy) || !email.trim()}>{busy === "lookup" ? "Working…" : "Look up"}</button>
          </div>
        </form>
      ) : null}

      {found ? (
        <div className="admin-row">
          <div>
            <div className="admin-row-title">{found.name}</div>
            <div className="admin-row-meta">{found.email}{found.verified ? "" : " · email not verified"}</div>
          </div>
          {sameAsOwner ? (
            <div className="admin-actions">
              <span>This account is already the verified owner.</span>
              <button type="button" className="btn-outline" onClick={() => setFound(null)} disabled={Boolean(busy)}>Close</button>
            </div>
          ) : owner && confirmReplace ? (
            <div className="admin-actions">
              <span>Replace {ownerLabel} with {found.name}?</span>
              <button type="button" className="btn-red" onClick={link} disabled={Boolean(busy)}>{busy === "link" ? "Working…" : "Yes, replace"}</button>
              <button type="button" className="btn-outline" onClick={() => setConfirmReplace(false)} disabled={Boolean(busy)}>No</button>
            </div>
          ) : (
            <div className="admin-actions">
              <button type="button" className="btn-red" onClick={owner ? () => setConfirmReplace(true) : link} disabled={Boolean(busy) || !found.verified}>
                {busy === "link" ? "Working…" : owner ? "Replace owner" : "Link this account"}
              </button>
              <button type="button" className="btn-outline" onClick={() => { setFound(null); setConfirmReplace(false); }} disabled={Boolean(busy)}>Cancel</button>
            </div>
          )}
        </div>
      ) : null}
      {found && owner && !sameAsOwner ? (
        <div className="admin-banner" role="note">
          This replaces {ownerLabel} as the verified owner. They can no longer reply, edit or delete on this business&apos;s page. Replies they already wrote stay
          on the page, and the new owner can edit or remove them. Questions they asked stop saying &quot;From the business&quot;.
        </div>
      ) : null}
      {found && !found.verified ? <p className="admin-helper">This account&apos;s email has not been verified, so it cannot be linked yet. Ask the owner to verify it.</p> : null}
      {error ? <div className="admin-banner" role="alert">{error}</div> : null}
    </div>
  );
}
