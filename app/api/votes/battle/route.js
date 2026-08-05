import { createVoteHandler } from "../../../../lib/voteRoute";

// Head-to-head battle: "a" is the left side, "b" the right. Voting the side you
// already picked withdraws it; voting the other one moves your vote across.
export const POST = createVoteHandler({
  targetType: "battle",
  table: "battles",
  rpc: "apply_battle_vote",
  columns: { a: "left_votes", b: "right_votes" },
  field: "side",
  resultKey: "battle",
  missingLabel: "Battle"
});
