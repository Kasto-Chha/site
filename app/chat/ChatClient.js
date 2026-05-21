"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ChatClient() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get("q") || "";
  const query = rawQuery.trim() || "Ask anything";
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="chat-page">
      <div className="chat-shell">
        <aside className="chat-rail">
          <div className="chat-rail-head">
            <Link className="chat-back" href="/">Back to home</Link>
            <div className="chat-brand">KastoChha AI</div>
            <p className="chat-rail-sub">Quick answers and community signals.</p>
            <div className="chat-rail-actions">
              <button
                type="button"
                className="chat-history-toggle"
                onClick={() => setShowHistory((prev) => !prev)}
              >
                {showHistory ? "Hide history" : "Show history"}
              </button>
            </div>
          </div>
          {showHistory && (
            <div className="chat-rail-block">
              <div className="chat-rail-title">History</div>
              <ul className="chat-history-list">
                <li>Daraz Nepal delivery experience</li>
                <li>iPhone 17 camera reviews</li>
                <li>Pathao vs InDrive earnings</li>
                <li>Hostel life near TU</li>
              </ul>
            </div>
          )}
          <div className="chat-rail-block">
            <div className="chat-rail-title">Recent searches</div>
            <ul className="chat-rail-list">
              <li>iPhone 17 Nepal</li>
              <li>Pathao job reviews</li>
              <li>Kathmandu hostel</li>
              <li>eSewa vs Khalti</li>
            </ul>
          </div>
          <div className="chat-rail-block">
            <div className="chat-rail-title">Popular prompts</div>
            <div className="chat-chip-row">
              <button type="button" className="chat-chip">Price and value</button>
              <button type="button" className="chat-chip">Best alternatives</button>
              <button type="button" className="chat-chip">Local experience</button>
              <button type="button" className="chat-chip">Where to buy</button>
            </div>
          </div>
        </aside>

        <main className="chat-main">
          <div className="chat-header">
            <div>
              <div className="chat-title">AI summary</div>
              <div className="chat-subtitle">Search results for community and local signals</div>
            </div>
            <div className="chat-tag">KastoChha AI</div>
          </div>

          <div className="chat-thread">
            <div className="msg msg-user">
              <div className="msg-label">You</div>
              <div className="msg-bubble">{query}</div>
            </div>

            <div className="msg msg-assistant">
              <div className="msg-label">KastoChha AI</div>
              <div className="msg-bubble">
                <p className="msg-text">Here is a quick readout based on similar questions and recent activity.</p>
                <div className="msg-grid">
                  <div className="msg-card">
                    <div className="msg-card-title">Community sentiment</div>
                    <div className="msg-card-value">Mostly positive</div>
                    <div className="msg-card-sub">High engagement and steady replies.</div>
                  </div>
                  <div className="msg-card">
                    <div className="msg-card-title">Common concerns</div>
                    <div className="msg-card-value">Price and after sales</div>
                    <div className="msg-card-sub">People ask about value and support.</div>
                  </div>
                  <div className="msg-card">
                    <div className="msg-card-title">Quick advice</div>
                    <div className="msg-card-value">Compare before buying</div>
                    <div className="msg-card-sub">Check local stores and recent reviews.</div>
                  </div>
                </div>
                <div className="msg-foot">
                  Want deeper answers? Ask a follow up question below.
                </div>
              </div>
            </div>
          </div>

          <div className="chat-composer">
            <div className="composer-inner">
              <input type="text" placeholder="Ask a follow up..." />
              <button type="button">Send</button>
            </div>
            <div className="composer-note">Responses are mocked for now.</div>
          </div>
        </main>
      </div>
    </div>
  );
}
