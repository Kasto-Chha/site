import { COLUMNS, LINK_STATUSES } from "./prospects";

// Reading a report by its private link, and counting a real open. Server only.

// The prospect whose link this is, or null when the link is unknown, stopped, or the report is not on show (edited again, or the
// business said no).
export async function getReportByToken(supabase, token) {
  const { data, error } = await supabase.from("sync_prospects").select(COLUMNS).eq("report_token", token).maybeSingle();
  if (error) throw Object.assign(new Error("The report could not be read."), { code: error.code });
  if (!data || !LINK_STATUSES.includes(data.status)) return null;
  return data;
}

// One more open. Written only if the count is still what was read, so two opens at once never undo each other; a lost race loses
// one count and nothing else. Never throws: a report must open even when counting fails.
export async function recordOpen(supabase, row, now = new Date()) {
  try {
    await supabase
      .from("sync_prospects")
      .update({ report_opens: (row.report_opens || 0) + 1, report_last_opened_at: now.toISOString() })
      .eq("id", row.id)
      .eq("report_opens", row.report_opens || 0);
  } catch {
    // Counting is a courtesy.
  }
}
