"use client";

import useRevealOnce from "./useRevealOnce";
import { delayClass, formatTimeAgo, isoTime } from "./sectionHelpers";
import { categoryLabel, categoryTone } from "../../lib/categories";
import { IconChat, IconQuestion, IconReply } from "./icons";

// The open-questions wall: what people have asked through "Ask a KastoChha"
// that nobody has answered yet.
//
// Framed as an invitation rather than a list. Every card leads with the
// question itself in the display serif — it's the only thing on the card that
// matters — and closes with a single obvious way to answer it.
//
// `answers` counts experiences filed under the same topic slug as the question.
// That match is exact, so it never over-claims, but it does under-claim: the
// reviews API runs its own AI classifier that can rewrite a post's topic before
// slugging it, so a genuine answer can end up filed under a different slug and
// not counted here. The empty case is therefore worded as a prompt ("Needs an
// answer") rather than as a factual claim that nobody has replied anywhere.

function QuestionCard({ item, index, onAnswer }) {
  const [revealRef, revealed] = useRevealOnce();

  const tone = categoryTone(item.category);
  const label = categoryLabel(item.category);
  const time = formatTimeAgo(item.created_at);
  const answers = item.answers || 0;
  const answered = answers > 0;

  return (
    <article
      ref={revealRef}
      className={`qcard ${delayClass(index)} ${revealed ? "show" : ""} ${
        answered ? "is-answered" : ""
      }`}
      style={{ "--q-tone": tone }}
    >
      <span className="qcard-quote" aria-hidden="true">&ldquo;</span>

      <div className="qcard-top">
        <span className="qcard-cat">
          <span className="qcard-dot" aria-hidden="true" />
          {label}
        </span>
        <span className={`qcard-status ${answered ? "answered" : "open"}`}>
          {answered
            ? `${answers} answer${answers === 1 ? "" : "s"}`
            : "This question is yet to be answered, be the first one."}
        </span>
      </div>

      <h3 className="qcard-q">{item.question}</h3>

      <div className="qcard-foot">
        {/* Both prompts once there are answers, not one or the other.
            A thread only appears here while it is still thin, so someone
            reading it is exactly the person who might add the reply that
            finishes it — offering only "Read the answers" at that point
            removes the ask at the moment it is most likely to land. */}
        {answered ? (
          <a className="qcard-cta" href={`/discussions/${item.threadSlug}`}>
            <IconChat className="icon" />
            Read the {answers === 1 ? "answer" : "answers"}
          </a>
        ) : null}
        <button type="button" className="qcard-cta" onClick={() => onAnswer(item)}>
          <IconReply className="icon" />
          {answered ? "Add yours" : "Answer this"}
        </button>
        <a
          className="qcard-alt"
          href={`/chat?q=${encodeURIComponent(item.question)}`}
        >
          Ask Assist
        </a>
        {time ? (
          <time className="qcard-time" dateTime={isoTime(item.created_at)}>
            {time}
          </time>
        ) : null}
      </div>
    </article>
  );
}

export default function QuestionsWall({ questions = [], onAnswer, onAsk }) {
  if (questions.length === 0) {
    // Nothing has been asked yet — so the section becomes the ask, rather than
    // rendering an empty shelf or vanishing without explanation.
    return (
      <div className="qwall-empty">
        <span className="qwall-empty-ico" aria-hidden="true">
          <IconQuestion className="icon" />
        </span>
        <h3 className="qwall-empty-title">No open questions right now</h3>
        <p className="qwall-empty-sub">
          Be the first to ask something — kunai pani kura, jun tapailai thaha
          chhaina. Someone here has probably been through it.
        </p>
        <button type="button" className="btn-red" onClick={onAsk}>
          Ask a KastoChha
        </button>
      </div>
    );
  }

  return (
    <div className="qwall">
      {questions.map((item, index) => (
        <QuestionCard
          key={item.id}
          item={item}
          index={index}
          onAnswer={onAnswer}
        />
      ))}
    </div>
  );
}
