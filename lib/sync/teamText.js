// Plain words for the audit log's actions, for the Team page's "Recent actions". Pure.
const TEXT = {
  "sync.operator.add": "made an account an operator",
  "sync.operator.remove": "removed an operator",
  "sync.assignment.add": "gave an operator a business",
  "sync.assignment.remove": "took a business off an operator",
  "sync.merchant.remove": "removed a business's tag",
  "sync.merchant.restore": "restored a business's tag",
  "sync.merchant.update": "changed a business's details",
  "sync.merchant.create": "tagged a business",
  "sync.owner.link": "linked an owner",
  "sync.owner.unlink": "unlinked an owner",
  "role.change": "changed an account's role"
};

export function actionText(entry) {
  const action = String(entry?.action || "");
  return TEXT[action] || action.replace(/^sync\./, "").replace(/[._]/g, " ") || "made a change";
}
