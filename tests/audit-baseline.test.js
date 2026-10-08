import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { manilaDate } from "../src/lib/authority";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// Remaining characterization cases assert audited defects. The owner date check
// now asserts corrected behavior; server interval tests live in the SQL suite.
// Replace other probes with desired-behavior tests when their findings are fixed.
// No extracted handler may access a real client, credentials, or records.
describe("audit baseline characterization (known defects, not remediation)", () => {
  it("INS-012: owner clock display uses the Manila date at early morning boundaries", () => {
    const clock = new Date("2026-10-07T00:30:00+08:00");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(clock);
      expect(manilaDate()).toBe("2026-10-07");
      expect(manilaDate(new Date("2026-10-07T00:00:00+08:00"))).toBe("2026-10-07");
      expect(manilaDate(new Date("2026-10-07T07:59:00+08:00"))).toBe("2026-10-07");
      expect(manilaDate(new Date("2026-10-07T08:00:00+08:00"))).toBe("2026-10-07");
    } finally {
      vi.useRealTimers();
    }
  });

  // INS-016's extracted computeHours probe is replaced by actual Postgres
  // correction_instants/review tests in m01-authority.test.js. No client clamp.

  it("INS-011: maybeSingle detects duplicate response after sending the PATCH", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify([{ id: "one" }, { id: "two" }]), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    const client = createClient("https://audit.invalid", "synthetic-public-placeholder", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: transport },
    });
    const result = await client.from("attendance_logs").update({ time_out: "17:00" })
      .eq("intern_id", "00000000-0000-4000-8000-000000000001").eq("log_date", "2026-10-07").select().maybeSingle();
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][1].method).toBe("PATCH");
    expect(result.error?.code).toBe("PGRST116");
    expect(result.data).toBeNull();
  });

  it("INS-034: success/warning status tokens meet small-text contrast", () => {
    const css = source("src/index.css");
    const token = (name) => css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`, "i"))?.[1];
    const luminance = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255)
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    expect(ratio(token("success"), token("success-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("warning"), token("warning-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("success"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
