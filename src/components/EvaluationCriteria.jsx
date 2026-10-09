import { RUBRIC } from "../lib/business";
export default function EvaluationCriteria({ criteria }) {
  return <dl className="grid sm:grid-cols-2 gap-x-4 mt-2 text-xs">{RUBRIC.map((c) => <div key={c.id} className="flex items-start justify-between gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
    <dt>{c.label} ({c.weight}%)</dt>
    <dd className="font-semibold shrink-0">{Number.isInteger(criteria?.[c.id]) && criteria[c.id] >= 1 && criteria[c.id] <= 5 ? `${criteria[c.id]}/5` : "Unavailable"}</dd>
  </div>)}</dl>;
}
