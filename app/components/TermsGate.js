"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { LEGAL_LINKS, hasAcceptedTerms } from "../../lib/terms";

// Shown once, right after a user's first sign-up: a blocking dialog with a
// consent checkbox. It stays until the box is ticked and the acceptance is
// recorded server-side, so it also catches accounts created before this
// existed, and reappears if TERMS_VERSION is bumped.
//
// The only ways out are accepting or signing out — deliberately no close
// button and no Escape handler, since a dialog you can dismiss isn't a gate.
export default function TermsGate() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsConsent =
    isLoaded && isSignedIn && !hasAcceptedTerms(user?.publicMetadata);

  // Don't let the page behind scroll while the gate is up.
  useEffect(() => {
    if (!needsConsent) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [needsConsent]);

  if (!needsConsent) return null;

  const accept = async () => {
    if (!checked || saving) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/account/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accepted: true })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "Could not save your acceptance. Please try again.");
        return;
      }

      // Pull the updated publicMetadata so this component unmounts itself.
      await user.reload();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="consent-bg" role="presentation">
      <div
        className="consent-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <div className="consent-kicker">One last step</div>
        <h2 className="consent-title" id="consent-title">
          Welcome to KastoChha
        </h2>
        <p className="consent-body">
          Before you start asking and sharing, please confirm you agree to the
          rules that keep this community honest and useful.
        </p>

        <label className="consent-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            disabled={saving}
            autoFocus
          />
          <span>
            I have read and agree to the{" "}
            <a href={LEGAL_LINKS.terms} target="_blank" rel="noreferrer">
              Terms &amp; Conditions
            </a>
            ,{" "}
            <a href={LEGAL_LINKS.privacy} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            , and{" "}
            <a href={LEGAL_LINKS.guidelines} target="_blank" rel="noreferrer">
              Community Guidelines
            </a>
            .
          </span>
        </label>

        {error ? (
          <p className="consent-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="consent-actions">
          <button
            type="button"
            className="btn-red"
            onClick={accept}
            disabled={!checked || saving}
          >
            {saving ? "Saving..." : "Agree and continue"}
          </button>
          <button
            type="button"
            className="consent-decline"
            onClick={() => signOut({ redirectUrl: "/" })}
            disabled={saving}
          >
            Not now, sign me out
          </button>
        </div>
      </div>
    </div>
  );
}
