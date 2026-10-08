import { describe, expect, it, vi } from "vitest";
import { recordRpc, reviewCorrections } from "../src/lib/authority";

describe("controlled RPC client outcomes", () => {
  it.each([null, [], [{ id: "one" }, { id: "two" }], {}])("rejects empty/non-single record %j", async (data) => {
    expect((await recordRpc({ rpc: async () => ({ data }) }, "clock_in")).ok).toBe(false);
  });
  it.each([{ id: "row" }, [{ id: "row" }]])("normalizes a committed composite %j", async (data) => {
    expect(await recordRpc({ rpc: async () => ({ data }) }, "clock_in")).toEqual({ ok: true, data: { id: "row" }, error: null });
  });
  it("propagates permission and thrown transport errors without success", async () => {
    expect((await recordRpc({ rpc: async () => ({ error: { message: "permission denied" } }) }, "clock_out")).error).toBe("permission denied");
    expect((await recordRpc({ rpc: async () => { throw new Error("offline"); } }, "clock_out")).error).toBe("offline");
  });
  it("rejects a response belonging to a different target", async () => {
    expect((await recordRpc({ rpc: async () => ({ data: { id: "foreign" } }) }, "review_document", { p_id: "own" })).ok).toBe(false);
  });
  it("bulk counts actual committed items, keeps item-specific failures and deduplicates ids", async () => {
    const rpc = vi.fn(async () => ({ data: [
      { id: "bad", ok: false, error: "conflict", data: null },
      { id: "ok", ok: true, error: null, data: { id: "ok", status: "Approved" } },
    ] }));
    const results = await reviewCorrections({ rpc }, ["ok", "bad", "ok"], "Approved");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results[1]).toMatchObject({ id: "bad", ok: false, error: "conflict" });
    expect(rpc.mock.calls[0]).toEqual(["review_exceptions", { p_ids: ["ok", "bad"], p_decision: "Approved", p_note: null }]);
  });
  it.each([null, [], [{ id: "foreign", ok: true, data: { id: "foreign", status: "Approved" } }],
    [{ id: "ok", ok: true, data: null }], [{ id: "ok", ok: true, data: { id: "ok", status: "Pending" } }],
    [{ id: "ok", ok: false }]])("rejects incomplete or dishonest bulk results %j", async (data) => {
    expect((await reviewCorrections({ rpc: async () => ({ data }) }, ["ok"], "Approved"))[0].ok).toBe(false);
  });
  it("reports transport ambiguity as failure and passes a rejection note unchanged", async () => {
    const rpc = vi.fn(async () => { throw new Error("offline"); });
    expect((await reviewCorrections({ rpc }, ["one", "two"], "Rejected", "Review evidence"))
      .every((row) => !row.ok && row.error === "offline")).toBe(true);
    expect(rpc.mock.calls[0][1].p_note).toBe("Review evidence");
  });
});
