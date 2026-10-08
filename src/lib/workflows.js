import { recordRpc } from "./authority";
import { requiredHours, rubricScore } from "./business";
import { readExportRows } from "./exports";
import { withTimeout } from "./requests";

export async function completeRows(client, table, ownerId) {
  return withTimeout(readCompleteRows(client, table, ownerId), "Loading data timed out. Refresh and retry.", 20000);
}
async function readCompleteRows(client, table, ownerId) {
  const active = async () => {
    const { data, error } = await client.rpc("my_profile");
    if (error || data?.status !== "Active") throw new Error(error?.message || "Account changed; refresh your session");
  };
  await active();
  const rows = await readExportRows(client, table, "*", ownerId);
  await active();
  return rows;
}
export function saveAssignment(client, internId, form) {
  const hours = requiredHours(form.required_hours);
  if (hours === null) return Promise.resolve({ ok: false, data: null, error: "Required hours must be >0, <=10000, with at most two decimal places" });
  return recordRpc(client, "admin_set_assignment", { p_id: internId, p_instructor_id: form.instructor_id || null,
    p_company_id: form.company_id || null, p_section_id: form.section_id || null, p_required_hours: hours,
    p_academic_year_id: form.academic_year_id || null });
}
export function saveEvaluation(client, internId, criteria, feedback, submissionId) {
  if (rubricScore(criteria) === null || feedback.length > 500 || !submissionId) return Promise.resolve({ ok: false, data: null, error: "Complete all four criteria; feedback maximum 500 characters" });
  return recordRpc(client, "submit_evaluation", { p_intern_id: internId, p_criteria: criteria, p_feedback: feedback, p_submission_id: submissionId });
}
export async function announcementFeed(client) {
  try { return { ok: true, data: await completeRows(client, "announcements"), error: null }; }
  catch (error) { return { ok: false, data: null, error: error.message || "Messages unavailable; retry" }; }
}
