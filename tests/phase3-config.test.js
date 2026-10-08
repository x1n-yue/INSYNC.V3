import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserClient, validateBrowserConfig } from "../src/lib/config";

// Dashboard rendering is unrelated to startup validation. Isolate those large
// optional screens; actual App, login and guarded SDK module still import.
vi.mock("../src/components/AdminDashboard.jsx", () => ({ default: () => null }));
vi.mock("../src/components/InstructorDashboard.jsx", () => ({ default: () => null }));
vi.mock("../src/components/InternDashboard.jsx", () => ({ default: () => null }));

const key = "sb_publishable_" + "synthetic".repeat(4);
const env = { VITE_SUPABASE_URL: "https://synthetic.invalid", VITE_SUPABASE_ANON_KEY: key };
const jwt = (role) => `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.c3ludGhldGlj`;
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("Phase 3 public startup configuration", () => {
  it.each([{}, { ...env, VITE_SUPABASE_URL: "" }, { ...env, VITE_SUPABASE_ANON_KEY: "" },
    { ...env, VITE_SUPABASE_URL: "http://remote.invalid" }, { ...env, VITE_SUPABASE_URL: "https://user:secret@synthetic.invalid" },
    { ...env, VITE_SUPABASE_URL: "https://your-project-ref.supabase.co" }, { ...env, VITE_SUPABASE_URL: "https://synthetic.invalid?secret=1" },
    { ...env, VITE_SUPABASE_ANON_KEY: "sb_secret_" + "synthetic".repeat(4) },
    { ...env, VITE_SUPABASE_ANON_KEY: jwt("service_role") }, { ...env, VITE_SUPABASE_ANON_KEY: jwt("authenticated") },
    { ...env, VITE_SUPABASE_ANON_KEY: "e30.invalid.c3ludGhldGlj" },
  ])("rejects missing/malformed/private configuration without constructing SDK: %j", (values) => {
    const factory = vi.fn();
    const result = createBrowserClient(values, factory);
    expect(result.client).toBeNull();
    expect(result.error).toBeTruthy();
    expect(factory).not.toHaveBeenCalled();
    if (values.VITE_SUPABASE_ANON_KEY) expect(result.error).not.toContain(values.VITE_SUPABASE_ANON_KEY);
  });
  it.each([env, { ...env, VITE_SUPABASE_ANON_KEY: jwt("anon") }, { ...env, VITE_SUPABASE_URL: "http://127.0.0.1:54321" },
    { ...env, VITE_SUPABASE_URL: "http://localhost:54321" }, { ...env, VITE_SUPABASE_URL: "http://[::1]:54321" }])("accepts public formats and local loopback: %j", (values) => {
    expect(validateBrowserConfig(values).ok).toBe(true);
    const client = {};
    expect(createBrowserClient(values, () => client)).toEqual({ client, error: null });
  });
  it("redacts initialization exceptions", () => {
    const result = createBrowserClient(env, () => { throw new Error("secret synthetic key material"); });
    expect(result.error).not.toContain("material");
    expect(result.client).toBeNull();
  });
  it("imports and renders actual App with missing environment, no client or transport", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", ""); vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const { default: App } = await import("../src/App.jsx");
    const { supabase } = await import("../src/lib/supabaseClient.js");
    expect(supabase).toBeNull();
    expect(renderToString(createElement(App))).toContain("Setup required");
  }, 30000);
});
