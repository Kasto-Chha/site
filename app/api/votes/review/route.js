import { createVoteHandler } from "../../../../lib/voteRoute";

// Reddit-style up/down on one experience. Clicking the arrow you already used
// withdraws the vote; clicking the other one flips it.
export const POST = createVoteHandler({
  targetType: "review",
  table: "reviews",
  rpc: "apply_review_vote",
  columns: { up: "upvotes", down: "downvotes" },
  field: "direction",
  resultKey: "review",
  missingLabel: "Experience"
});
