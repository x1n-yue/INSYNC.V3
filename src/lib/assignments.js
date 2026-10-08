import { checklistState, requiredHours } from "./business";

// Missing year is explicit legacy/unassigned membership, never the current year.
export function academicRows(rows, yearId) {
  return Array.isArray(rows) ? rows.filter((row) => (row.academic_year_id ?? null) === (yearId ?? null)) : null;
}

export function onboardingItems(intern, documents) {
  return [
    { label: "Instructor", complete: Boolean(intern?.instructor_id) },
    { label: "Company", complete: Boolean(intern?.company_id) },
    { label: "Section", complete: Boolean(intern?.section_id) },
    { label: "Academic year", complete: Boolean(intern?.academic_year_id) },
    { label: "Required hours", complete: requiredHours(intern?.required_hours) !== null },
    { label: "Standard documents", complete: checklistState(documents).complete },
  ];
}
