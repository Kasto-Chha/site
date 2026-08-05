import { createVoteHandler } from "../../../../lib/voteRoute";

// Three-way trending poll. Voting the option you already picked withdraws it;
// voting a different one moves your vote across.
export const POST = createVoteHandler({
  targetType: "trending",
  table: "trending_topics",
  rpc: "apply_trending_vote",
  columns: { yes: "votes_yes", mid: "votes_mid", no: "votes_no" },
  field: "side",
  resultKey: "topic",
  missingLabel: "Topic"
});
