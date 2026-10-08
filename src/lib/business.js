export const REQUIRED_HOURS_MAX = 10000;
export const STANDARD_DOC_TYPES = ["moa", "endorsement", "consent", "medical"];
export const RUBRIC = [
  { id: "punctuality", label: "Punctuality & Attendance", weight: 25 },
  { id: "performance", label: "Task Performance & Quality", weight: 35 },
  { id: "conduct", label: "Professional Conduct", weight: 20 },
  { id: "communication", label: "Communication Skills", weight: 20 },
];
export function requiredHours(value) {
  // Accept a decimal input or Postgres numeric string; no boolean/null/coercion fallback.
  if (!(typeof value === "number" || typeof value === "string") || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2}0*)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 && number <= REQUIRED_HOURS_MAX ? number : null;
}
export function rubricScore(criteria) {
  if (!criteria || Array.isArray(criteria) || typeof criteria !== "object" || Object.keys(criteria).length !== 4
    || !RUBRIC.every(({ id }) => Object.hasOwn(criteria, id) && Number.isInteger(criteria[id]) && criteria[id] >= 1 && criteria[id] <= 5)) return null;
  return Math.round(RUBRIC.reduce((sum, c) => sum + criteria[c.id] * c.weight, 0) / 5);
}
export function evaluationScore(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 20 && n <= 100 ? n : null;
}
export function evaluationResult(evaluation) {
  const computed = rubricScore(evaluation?.competencies);
  const persisted = evaluationScore(evaluation?.overall_score);
  return computed !== null && persisted === computed ? persisted : null;
}
export function checklistState(documents) {
  if (!Array.isArray(documents)) return { complete: false, known: false, present: 0, total: 4 };
  const types = documents.map((d) => d.doc_type);
  const known = new Set(types).size === types.length;
  const present = STANDARD_DOC_TYPES.filter((type) => types.includes(type)).length;
  return { complete: known && present === 4, known, present, total: 4 };
}
