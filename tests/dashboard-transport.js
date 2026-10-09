import { internMetrics } from "../src/lib/metrics";
import { chartHours } from "../src/lib/metrics";
import { isOpenSession } from "../src/lib/attendance";

// Synthetic transport only. SQL/RLS semantics are tested against native Postgres.
export function metricResponse(data, { after = null, limit = 100, instructor, actor = instructor ?? data.profiles?.[0]?.id } = {}) {
  const interns = (data.interns ?? []).filter(row => (!instructor || row.instructor_id === instructor)
    && (data.profiles ?? []).find(profile => profile.id === row.id)?.role === "intern").sort((a,b) => a.id.localeCompare(b.id));
  return { data: { actorId: actor, actorRole: data.profiles?.find(row => row.id === actor)?.role ?? "instructor", total: interns.length, rows: interns.filter(row => !after || row.id > after).slice(0,limit).map(row => ({
    id: row.id, academic_year_id: row.academic_year_id ?? null,
    documentCount: (data.documents ?? []).filter(doc => doc.intern_id === row.id && (doc.academic_year_id ?? null) === (row.academic_year_id ?? null)).length,
    pendingCorrections: (data.attendance_exceptions ?? []).filter(item => item.intern_id === row.id && item.status === "Pending").length,
    latestEvaluation: [...(data.evaluations ?? [])].filter(item => item.intern_id === row.id && (item.academic_year_id ?? null) === (row.academic_year_id ?? null)).sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ?? null,
    clockedIn: (data.attendance_logs ?? []).some(log => log.intern_id === row.id && isOpenSession(log)),
    metric: internMetrics({ internId: row.id, required: row.required_hours, academicYearId: row.academic_year_id ?? null,
      attendance: (data.attendance_logs ?? []).filter(log => log.intern_id === row.id), documents: (data.documents ?? []).filter(doc => doc.intern_id === row.id) }),
  })) } };
}
export function chartResponse(data, owner, period) {
  const intern = data.interns.find(row => row.id === owner);
  return { data: chartHours(data.attendance_logs.filter(row => row.intern_id === owner && (row.academic_year_id ?? null) === (intern.academic_year_id ?? null)), period) };
}
export function queryResponse(data, table, { cap = Infinity, stall = () => false } = {}) {
  let selected = "*", single = false, page, limit, head;
  const filters = [], orders = [];
  const field = (row, key) => key.startsWith("event_data->>") ? row.event_data?.[key.slice(13)] : row[key];
  const query = {
    select(columns, options = {}) { selected = columns; head = options.head; return query; },
    eq(key,value) { filters.push(row => field(row,key) === value); return query; },
    is(key,value) { filters.push(row => (field(row,key) ?? null) === value); return query; },
    in(key,values) { filters.push(row => values.includes(field(row,key))); return query; },
    lte(key,value) { filters.push(row => field(row,key) <= value); return query; },
    gte(key,value) { filters.push(row => field(row,key) >= value); return query; },
    lt(key,value) { filters.push(row => field(row,key) < value); return query; },
    gt(key,value) { filters.push(row => field(row,key) > value); return query; },
    order(key,options) { orders.push([key,options?.ascending !== false]); return query; },
    range(start,end) { page = [start,end]; return query; }, limit(value) { limit = value; return query; }, maybeSingle() { single = true; return query; },
    then(resolve,reject) {
      if (stall(table)) return new Promise(() => {}).then(resolve,reject);
      let rows = [...(data[table] ?? [])].filter(row => filters.every(filter => filter(row)));
      rows.sort((a,b) => { for (const [key,asc] of orders) { const comparison = String(field(a,key)).localeCompare(String(field(b,key))); if (comparison) return asc ? comparison : -comparison; } return 0; });
      const count = rows.length;
      if (page) rows = rows.slice(page[0],page[1]+1);
      rows = rows.slice(0,Math.min(limit ?? Infinity,cap));
      if (table === "interns") rows = rows.map(row => ({ ...row,
        ...(selected.includes("companies(") ? { companies: data.companies?.find(item => item.id === row.company_id) } : {}),
        ...(selected.includes("course_sections(") ? { course_sections: data.course_sections?.find(item => item.id === row.section_id) } : {}),
        ...(selected.includes("academic_years(") ? { academic_years: data.academic_years?.find(item => item.id === row.academic_year_id) } : {}),
      }));
      return Promise.resolve({ data: head ? null : single ? rows[0] ?? null : rows, count }).then(resolve,reject);
    },
  };
  return query;
}
