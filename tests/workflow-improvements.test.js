import { afterEach, expect, it, vi } from "vitest";
import { academicRows, onboardingItems } from "../src/lib/assignments";
import { internMetrics } from "../src/lib/metrics";
import { captureRequest, timedFetch, withTimeout } from "../src/lib/requests";

afterEach(() => vi.useRealTimers());

it("counts only the assigned academic year's verified hours without moving legacy history", () => {
  const owner="00000000-0000-4000-8000-000000000004";
  const row=(year, date, verified=true) => ({ intern_id:owner,academic_year_id:year,log_date:date,
    time_in:"08:00:00",time_out:"16:00:00",clocked_in_at:`${date}T00:00:00Z`,clocked_out_at:`${date}T08:00:00Z`,hours:8,verified,
    verified_by:verified?"00000000-0000-4000-8000-000000000002":null });
  const attendance=[row("year-a","2026-10-01"),row("year-b","2026-10-02"),row(null,"2026-10-03"),row("year-a","2026-10-04",false)];
  const input={internId:owner,required:16,attendance,documents:[],now:new Date("2026-10-08T00:00:00Z")};
  expect(internMetrics({...input,academicYearId:"year-a"})).toMatchObject({logged:16,verified:8,progress:50,remaining:8});
  expect(internMetrics({...input,academicYearId:"year-b"})).toMatchObject({logged:8,verified:8,progress:50});
  expect(internMetrics({...input,academicYearId:null})).toMatchObject({logged:8,verified:8,progress:50});
  expect(attendance).toHaveLength(4);
  expect(academicRows(null,"year-a")).toBeNull();
});

it("reports missing onboarding fields and checks the standard checklist for the assigned year", () => {
  const intern={instructor_id:"teacher",company_id:"company",section_id:"section",academic_year_id:"year-a",required_hours:486};
  const docs=["moa","endorsement","consent","medical"].map(doc_type=>({doc_type,academic_year_id:"year-a"}));
  expect(onboardingItems(intern,academicRows(docs,"year-a")).every(item=>item.complete)).toBe(true);
  expect(onboardingItems({...intern,academic_year_id:"year-b"},academicRows(docs,"year-b")).find(item=>item.label==="Standard documents").complete).toBe(false);
  expect(onboardingItems(null,null).every(item=>!item.complete)).toBe(true);
});

it("bounds stalled SDK requests and clears timers when requests settle", async () => {
  vi.useFakeTimers();
  const result=captureRequest(new Promise(()=>{}));
  await vi.advanceTimersByTimeAsync(15000);
  expect((await result).error.message).toContain("timed out");
  expect(await withTimeout(Promise.resolve("loaded"))).toBe("loaded");
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts stalled HTTP requests and respects caller cancellation", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch",vi.fn((_input,{signal}) => new Promise((_,reject) => {
    signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
  })));
  const pending=timedFetch("https://synthetic.invalid").catch(error=>error);
  await vi.advanceTimersByTimeAsync(15000);
  expect((await pending).message).toContain("timed out");
  const controller=new AbortController();
  const cancelled=timedFetch("https://synthetic.invalid",{signal:controller.signal}).catch(error=>error);
  controller.abort(new Error("Cancelled by caller"));
  expect((await cancelled).message).toBe("Cancelled by caller");
  expect(vi.getTimerCount()).toBe(0);
});
