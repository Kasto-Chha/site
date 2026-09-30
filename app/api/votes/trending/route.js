import { createVoteHandler } from "../../../../lib/voteRoute";

// Three-way trending poll. Voting the option you already picked withdraws it;
// voting a different one moves your vote across.
export const POST = createVoteHandler({
  targetType: "trending",
  choices: ["yes", "mid", "no"],
  field: "side",
  resultKey: "topic",
  missingLabel: "Topic"
});
