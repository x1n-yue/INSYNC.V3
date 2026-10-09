import { recordRpc } from "./authority";
import { requiredHours, rubricScore } from "./business";
import { readRows } from "./rows";
import { remainingTime, withTimeout } from "./requests";

export async function completeRows(client, table, ownerId, options) {
  return withTimeout(readCompleteRows(client, table, ownerId, { ...options, deadline: Date.now() + 20000 }), "Loading data timed out. Refresh and retry.", 20000);
}
async function readCompleteRows(client, table, ownerId, options) {
  const active = async () => {
    const budget = remainingTime(options.deadline);
    const { data, error } = await withTimeout(client.rpc("my_profile"), undefined, budget);
    if (error || data?.status !== "Active" || !data.id || !data.role) throw new Error(error?.message || "Account changed; refresh your session");
    return data;
  };
  const profile = await active();
  const rows = await readRows(client, table, "*", ownerId, options);
  const final = await active();
  if (profile.id !== final.id || profile.role !== final.role) throw new Error("Account changed during loading; refresh your session");
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
