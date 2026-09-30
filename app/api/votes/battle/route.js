import { createVoteHandler } from "../../../../lib/voteRoute";

// Head-to-head battle: "a" is the left side, "b" the right. Voting the side you
// already picked withdraws it; voting the other one moves your vote across.
export const POST = createVoteHandler({
  targetType: "battle",
  choices: ["a", "b"],
  field: "side",
  resultKey: "battle",
  missingLabel: "Battle"
});
