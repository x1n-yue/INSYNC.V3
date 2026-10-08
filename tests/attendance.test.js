import { describe, expect, it } from "vitest";
import { elapsedSession, formatBusinessDate, formatClockTime, isOpenSession } from "../src/lib/attendance";
import { manilaDate } from "../src/lib/authority";

describe("INS-012: shared Manila date and instant display", () => {
  it("keeps early Manila mornings on the business date instead of UTC yesterday", () => {
    for (const hour of ["00:00", "00:30", "07:59", "08:00", "23:59"]) {
      expect(manilaDate(new Date(`2026-10-07T${hour}:00+08:00`))).toBe("2026-10-07");
    }
  });
  it("formats date-only fields independent of device timezone and rejects bad dates", () => {
    expect(formatBusinessDate("2026-10-07")).toBe("Oct 7");
    expect(formatBusinessDate("2026-02-30")).toBe("Unavailable");
    expect(formatBusinessDate(null)).toBe("Unavailable");
  });
  it("formats instants in Manila rather than the device timezone", () => {
    expect(formatClockTime("2026-10-06T15:30:00Z")).toBe("11:30 PM");
    expect(formatClockTime(null)).toBe("Unavailable");
    expect(formatClockTime("bad")).toBe("Unavailable");
  });
  const open = { time_in: "23:30:00", time_out: null, clocked_in_at: "2026-10-06T23:30:00+08:00", clocked_out_at: null };
  it("finds a trusted open session regardless of yesterday's log date", () => {
    expect(isOpenSession({ ...open, log_date: "2026-10-06" })).toBe(true);
    expect(elapsedSession(open, new Date("2026-10-07T01:30:00+08:00"))).toBe("02:00:00");
    expect(elapsedSession(open, new Date("2026-10-06T23:00:00+08:00"))).toBe("Check device clock");
  });
  it("does not fabricate a timestamp for legacy/open/closed contradictions", () => {
    for (const row of [null, { ...open, clocked_in_at: null }, { ...open, clocked_in_at: "bad" },
      { ...open, time_out: "01:30" }, { ...open, clocked_out_at: "2026-10-07T01:30:00+08:00" }]) {
      expect(isOpenSession(row)).toBe(false);
      expect(elapsedSession(row)).toBe("Unavailable");
    }
  });
});
