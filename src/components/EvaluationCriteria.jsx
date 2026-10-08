import { RUBRIC } from "../lib/business";
export default function EvaluationCriteria({ criteria }) {
  return <dl className="grid sm:grid-cols-2 gap-1 mt-2 text-xs">{RUBRIC.map((c) => <div key={c.id}>
    <dt className="inline">{c.label} ({c.weight}%)</dt>{" "}
    <dd className="inline font-semibold">{Number.isInteger(criteria?.[c.id]) && criteria[c.id] >= 1 && criteria[c.id] <= 5 ? `${criteria[c.id]}/5` : "Unavailable"}</dd>
  </div>)}</dl>;
}
