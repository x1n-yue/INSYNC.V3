import { useEffect, useId, useState } from "react";

export function splitTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value || "")) return { hour: "", minute: "", period: "AM" };
  const [hour, minute] = value.split(":");
  return { hour: String(Number(hour) % 12 || 12), minute, period: Number(hour) >= 12 ? "PM" : "AM" };
}
export function joinTime({ hour, minute, period }) {
  if (!/^(?:[1-9]|1[0-2])$/.test(hour) || !/^[0-5]\d$/.test(minute) || !["AM", "PM"].includes(period)) return "";
  return `${String(Number(hour) % 12 + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`;
}
export default function TimeInput({ label, value, onChange, disabled = false }) {
  const id = useId();
  const [parts, setParts] = useState(() => splitTime(value));
  useEffect(() => {
    // Parent updates from this control must not erase other parts of an
    // incomplete edit. A different canonical value still resets all parts.
    setParts(current => joinTime(current) === value ? current : splitTime(value));
  }, [value]);
  const change = (field, value) => {
    const next = { ...parts, [field]: value }; setParts(next); onChange(joinTime(next));
  };
  return <fieldset disabled={disabled} className="space-y-1">
    <legend id={id} className="text-xs font-medium">{label}</legend>
    <div className="time-parts">
      <select aria-label={`${label} hour`} value={parts.hour} onChange={event => change("hour",event.target.value)} className="border rounded p-2"><option value="">Hour</option>{Array.from({ length: 12 }, (_, index) => String(index + 1)).map(hour => <option key={hour}>{hour}</option>)}</select>
      <select aria-label={`${label} minute`} value={parts.minute} onChange={event => change("minute",event.target.value)} className="border rounded p-2"><option value="">Minute</option>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map(minute => <option key={minute}>{minute}</option>)}</select>
      <select aria-label={`${label} AM or PM`} value={parts.period} onChange={event => change("period",event.target.value)} className="border rounded p-2"><option>AM</option><option>PM</option></select>
    </div>
  </fieldset>;
}
