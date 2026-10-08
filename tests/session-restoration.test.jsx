// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";

const { auth, rpc, listeners } = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
  listeners: new Set(),
}));
vi.mock("../src/lib/supabaseClient", () => ({ supabase: { auth, rpc }, setupError: null }));
vi.mock("../src/components/LoginPage", () => ({ default: () => <div>Sign in screen</div> }));
vi.mock("../src/components/InternDashboard", async () => {
  const { useState } = await import("react");
  return { default: function DraftDashboard() {
    const [draft, setDraft] = useState("");
    return <div>Intern dashboard<input aria-label="Draft accomplishment" value={draft} onChange={event => setDraft(event.target.value)} /></div>;
  } };
});

const session = { user: { id: "synthetic-intern" } };
let root;
let container;
let requests;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  requests = [];
  listeners.clear();
  auth.getSession.mockImplementation(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  auth.onAuthStateChange.mockImplementation((callback) => {
    listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
  });
  rpc.mockResolvedValue({ data: { id: session.user.id, role: "intern", status: "Active" }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function renderApp() {
  await act(async () => root.render(<StrictMode><App /></StrictMode>));
}

async function emit(event, value) {
  await act(async () => { for (const listener of listeners) listener(event, value); });
}

async function retry() {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Retry");
  expect(button).toBeTruthy();
  await act(async () => button.click());
}

it.each(["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"])("%s completes restoration before getSession resolves", async (event) => {
  await renderApp();
  expect(container.textContent).toContain("Restoring session");
  await emit(event, session);
  expect(container.textContent).toContain("Intern dashboard");
  expect(rpc).toHaveBeenCalledWith("my_profile");
  // The old session check must not replace the newer authenticated session.
  await act(async () => { for (const request of requests) request.resolve({ data: { session: null } }); });
  expect(container.textContent).toContain("Intern dashboard");
  await act(async () => vi.advanceTimersByTime(15000));
  expect(container.textContent).toContain("Intern dashboard");
});

it("an initial signed-out event opens sign in even if getSession stays pending", async () => {
  await renderApp();
  await emit("INITIAL_SESSION", null);
  expect(container.textContent).toBe("Sign in screen");
  expect(rpc).not.toHaveBeenCalled();
});

it("getSession can complete startup without an auth event", async () => {
  await renderApp();
  await act(async () => requests.at(-1).resolve({ data: { session } }));
  expect(container.textContent).toContain("Intern dashboard");
});

it("a failed restore can be retried with a new request and one active subscription", async () => {
  await renderApp();
  await act(async () => requests.at(-1).resolve({ error: { message: "Offline" } }));
  expect(container.textContent).toContain("Session restoration failed");
  expect(container.textContent).toContain("Offline");
  const previousRequests = requests.length;
  await retry();
  expect(requests).toHaveLength(previousRequests + 1);
  expect(listeners.size).toBe(1);
  expect(container.textContent).toContain("Restoring session");
  await act(async () => requests.at(-1).resolve({ data: { session: null } }));
  expect(container.textContent).toBe("Sign in screen");
});

it("a stalled restore times out, ignores its late response, and allows retry", async () => {
  await renderApp();
  await act(async () => vi.advanceTimersByTime(15000));
  expect(container.textContent).toContain("Session restoration failed");
  expect(container.textContent).toContain("timed out");
  await act(async () => { for (const request of requests) request.resolve({ data: { session } }); });
  expect(container.textContent).toContain("Session restoration failed");
  expect(rpc).not.toHaveBeenCalled();
  await retry();
  await act(async () => requests.at(-1).resolve({ data: { session } }));
  expect(container.textContent).toContain("Intern dashboard");
});

it("auth events can recover a timed-out restore", async () => {
  await renderApp();
  await act(async () => vi.advanceTimersByTime(15000));
  await emit("SIGNED_IN", session);
  expect(container.textContent).toContain("Intern dashboard");
});

it("a stalled profile read times out and the profile Retry action starts a new read",async()=>{
  rpc.mockImplementationOnce(()=>new Promise(()=>{}));
  await renderApp();
  await emit("SIGNED_IN",session);
  expect(container.textContent).toContain("Loading profile");
  await act(async()=>vi.advanceTimersByTimeAsync(15000));
  expect(container.textContent).toContain("Profile unavailable");
  expect(container.textContent).toContain("Profile loading timed out");
  await retry();
  expect(container.textContent).toContain("Intern dashboard");
});

it("preserves an unsaved dashboard draft while a token refresh rechecks the same account",async()=>{
  await renderApp(); await emit("SIGNED_IN",session);
  const input=container.querySelector('[aria-label="Draft accomplishment"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Writing today's report");
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  let resolve;
  rpc.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  await emit("TOKEN_REFRESHED",{...session,access_token:"synthetic-refreshed"});
  expect(container.querySelector('[aria-label="Draft accomplishment"]')?.value).toBe("Writing today's report");
  await act(async()=>resolve({data:{id:session.user.id,role:"intern",status:"Active"}}));
  expect(container.querySelector('[aria-label="Draft accomplishment"]').value).toBe("Writing today's report");
});

it("hides the previous account's dashboard while loading a different signed-in user",async()=>{
  await renderApp(); await emit("SIGNED_IN",session);
  rpc.mockImplementationOnce(()=>new Promise(()=>{}));
  await emit("SIGNED_IN",{user:{id:"another-synthetic-intern"}});
  expect(container.textContent).toContain("Loading profile");
  expect(container.querySelector('[aria-label="Draft accomplishment"]')).toBeNull();
});

it("rejects a profile for a different account instead of displaying it or loading forever",async()=>{
  rpc.mockResolvedValueOnce({data:{id:"another-synthetic-intern",role:"intern",status:"Active"}});
  await renderApp();await emit("SIGNED_IN",session);
  expect(container.textContent).toContain("Profile unavailable");
  expect(container.textContent).toContain("does not match your signed-in account");
  expect(container.querySelector('[aria-label="Draft accomplishment"]')).toBeNull();
});

it.each(["Pending","Inactive"])("shows sign-out failure for a %s account",async(status)=>{
  rpc.mockResolvedValue({data:{id:session.user.id,status}});
  auth.signOut.mockResolvedValue({error:{message:"Synthetic sign-out failure"}});
  await renderApp(); await emit("SIGNED_IN",session);
  const button=[...container.querySelectorAll("button")].find(button=>button.textContent==="Back to Sign In");
  await act(async()=>button.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Synthetic sign-out failure");
});

it("lets a pending account recheck activation without signing out",async()=>{
  rpc.mockResolvedValueOnce({data:{id:session.user.id,status:"Pending"}});
  await renderApp(); await emit("SIGNED_IN",session);
  const button=[...container.querySelectorAll("button")].find(button=>button.textContent==="Check activation");
  expect(button).toBeTruthy();
  await act(async()=>button.click());
  expect(container.textContent).toContain("Intern dashboard");
});
