// @vitest-environment jsdom
import { StrictMode, act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Modal from "../src/components/Modal";

function ClockOutDialog({ blocked = false }) {
  const [open, setOpen] = useState(false);
  const [accomplishment, setAccomplishment] = useState("");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>
    <button onClick={() => setOpen(true)}>Clock Out</button>
    <output>{elapsed}</output>
    {open && <Modal title="Log Today's Accomplishments" onClose={() => { if (!blocked) setOpen(false); }}>
      <textarea value={accomplishment} onChange={(event) => setAccomplishment(event.target.value)} />
      <button onClick={() => setOpen(false)}>Cancel</button>
      <button disabled={!accomplishment.trim()}>Clock Out &amp; Save Log</button>
    </Modal>}
  </>;
}

let root;
let container;
let opener;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await renderDialog();
  opener = container.querySelector("button");
  opener.focus();
  await act(async () => opener.click());
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function renderDialog(blocked = false) {
  await act(async () => root.render(<StrictMode><ClockOutDialog blocked={blocked} /></StrictMode>));
}

async function type(textarea, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(key, shiftKey = false) {
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })));
}

it("keeps focus and the caret in the accomplishment field across keystrokes", async () => {
  const textarea = container.querySelector("textarea");
  textarea.focus();
  for (const value of ["T", "Ta", "Tas", "Task completed"]) {
    await type(textarea, value);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe(value);
    expect(textarea.selectionStart).toBe(value.length);
  }
  expect(container.querySelector("button:last-child").disabled).toBe(false);
});

it("keeps focus, selection and draft text when the live clock updates", async () => {
  const textarea = container.querySelector("textarea");
  textarea.focus();
  await type(textarea, "Completed the daily report");
  textarea.setSelectionRange(4, 12);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(container.querySelector("output").textContent).toBe("3");
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(4);
  expect(textarea.selectionEnd).toBe(12);
  expect(textarea.value).toBe("Completed the daily report");
});

it("traps Tab within the dialog and restores focus to Clock Out on Escape", async () => {
  const close = container.querySelector('[aria-label="Close dialog"]');
  const cancel = [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
  expect(document.activeElement).toBe(close);
  // Save is disabled while the field is empty and must be skipped.
  await key("Tab", true);
  expect(document.activeElement).toBe(cancel);
  await key("Tab");
  expect(document.activeElement).toBe(close);
  await key("Escape");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("uses the latest close callback after the parent updates", async () => {
  await renderDialog(true);
  await key("Escape");
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  await renderDialog(false);
  await key("Escape");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});
