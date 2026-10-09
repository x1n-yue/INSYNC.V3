export const auditTables = ["profiles", "interns", "companies", "course_sections", "academic_years", "attendance_logs", "attendance_exceptions", "documents", "evaluations", "announcements", "alerts"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function auditScope(filters = {}) {
  for (const date of [filters.start, filters.end]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw new Error("Choose valid audit dates.");
  if (filters.start && filters.end && filters.start > filters.end) throw new Error("Audit end date must follow the start date.");
  if (filters.actor && filters.actor !== "system" && !uuid.test(filters.actor)) throw new Error("Choose a valid audit actor.");
  if (filters.table && !auditTables.includes(filters.table)) throw new Error("Choose a valid audit table.");
  return query => {
    if (filters.actor) query = filters.actor === "system" ? query.is("actor_id", null) : query.eq("actor_id", filters.actor);
    if (filters.table) query = query.eq("event_data->>table", filters.table);
    if (filters.start) query = query.gte("created_at", `${filters.start}T00:00:00+08:00`);
    if (filters.end) {
      const following = new Date(Date.parse(`${filters.end}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
      query = query.lt("created_at", `${following}T00:00:00+08:00`);
    }
    return query;
  };
}
export function auditChanges(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return [];
  const keys = new Set([...(Array.isArray(event.changed_fields) ? event.changed_fields.filter(key => typeof key === "string") : []), ...Object.keys(event).filter(key => key.startsWith("previous_")).map(key => key.slice(9))]);
  return [...keys].sort().map(key => ({ field: key, before: Object.hasOwn(event, `previous_${key}`) ? JSON.stringify(event[`previous_${key}`]) : "Not recorded", after: Object.hasOwn(event, key) ? JSON.stringify(event[key]) : "Not recorded" }));
}
