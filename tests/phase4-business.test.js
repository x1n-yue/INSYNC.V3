import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checklistState, evaluationResult, requiredHours, rubricScore } from "../src/lib/business";
import { chartHours, filterAttendance, internMetrics, periodContains } from "../src/lib/metrics";
import EvaluationCriteria from "../src/components/EvaluationCriteria";

const uid="00000000-0000-4000-8000-000000000004", reviewer="00000000-0000-4000-8000-000000000002";
const now=new Date("2026-10-07T02:00:00Z");
function attendance(date,hours=8,verified=true) {
  return { intern_id:uid, log_date:date, time_in:"08:00:00", time_out:`${String(8+hours).padStart(2,"0")}:00:00`,
    clocked_in_at:`${date}T08:00:00+08:00`,clocked_out_at:`${date}T${String(8+hours).padStart(2,"0")}:00:00+08:00`,hours,verified,verified_by:verified?reviewer:null };
}
const docs=["moa","endorsement","consent","medical"].map(doc_type=>({intern_id:uid,doc_type,status:"Approved",upload_version:1,file_path:`${uid}/${doc_type}.pdf`,file_name:"Original.pdf",reviewed_by:reviewer,reviewed_at:"2026-10-06T12:00:00Z"}));
const metric=(patch={})=>internMetrics({internId:uid,required:16,attendance:[attendance("2026-10-05"),attendance("2026-10-06")],documents:docs,now,...patch});
describe("shared Phase 4 business rules",()=>{
  it.each([null,undefined,"", " ", "abc",0,"0",-1,"-1",Infinity,NaN,true,{},10000.01,"1.001","1e3"])("rejects invalid target %j instead of falling back",value=>expect(requiredHours(value)).toBeNull());
  it.each([["486",486],[1.5,1.5],["123.45",123.45],["123.4500",123.45],["0.01",0.01],[10000,10000]])("accepts target %j as %s",(input,expected)=>expect(requiredHours(input)).toBe(expected));
  it("computes exact rubric scores and renders criteria without null-to-zero conversion",()=>{
    const c={punctuality:4,performance:5,conduct:3,communication:2};
    expect(rubricScore(c)).toBe(75);
    expect(evaluationResult({competencies:c,overall_score:null})).toBeNull();
    expect(evaluationResult({competencies:c,overall_score:80})).toBeNull();
    expect(evaluationResult({competencies:c,overall_score:75})).toBe(75);
    expect(rubricScore({...c,conduct:"3"})).toBeNull();
    expect(rubricScore({...c,extra:1})).toBeNull();
    expect(renderToString(createElement(EvaluationCriteria,{criteria:c}))).toContain("4/5");
    const missing=renderToString(createElement(EvaluationCriteria,{criteria:null}));
    expect(missing).toContain("Unavailable"); expect(missing).not.toContain("0/5");
  });
  it("uses Monday-Sunday / month / year boundaries in Manila across UTC and year changes",()=>{
    expect(periodContains("2026-10-05","week",now)).toBe(true);
    expect(periodContains("2026-10-04","week",now)).toBe(false);
    expect(periodContains("2026-09-30","month",now)).toBe(false);
    expect(periodContains("2025-10-07","year",now)).toBe(false);
    expect(periodContains("2026-02-30","all",now)).toBe(false);
    const boundary=new Date("2026-12-31T16:30:00Z");
    expect(periodContains("2027-01-01","month",boundary)).toBe(true);
    expect(periodContains("2026-12-31","month",boundary)).toBe(false);
    expect(periodContains("2026-12-28","week",boundary)).toBe(true);
  });
  it("sums chart hours with year-aware grouping and true sparse period filters",()=>{
    const rows=[attendance("2025-10-07"),attendance("2026-10-05",4,false),attendance("2026-10-06")];
    expect(chartHours(rows,"all",now)).toEqual([{day:"2025-10",hours:8,verified:8},{day:"2026-10",hours:12,verified:8}]);
    expect(filterAttendance(rows,"week",now)).toHaveLength(2);
    expect(chartHours(rows,"month",now).reduce((sum,r)=>sum+r.hours,0)).toBe(12);
    expect(chartHours([{...rows[2],hours:null}],"month",now)[0].hours).toBeNull();
  });
  it("requires exact verified threshold, standard types AND all custom requirements",()=>{
    expect(metric()).toMatchObject({logged:16,verified:16,cleared:true,risk:"Completed",remaining:0,progress:100});
    expect(metric({attendance:[attendance("2026-10-05"),attendance("2026-10-06",8,false)]})).toMatchObject({logged:16,verified:8,cleared:false,progress:50});
    expect(metric({documents:docs.slice(1)}).cleared).toBe(false);
    expect(metric({documents:[...docs,{...docs[0],doc_type:"custom",status:"Pending"}]}).cleared).toBe(false);
    expect(metric({required:"16.01"}).cleared).toBe(false);
    expect(metric({required:"16.01"}).progress).toBe(99);
  });
  it.each([{required:null},{required:0},{attendance:null},{documents:null},
    {attendance:[{...attendance("2026-10-06"),clocked_in_at:null}]},
    {documents:[...docs,docs[0]]},{documents:docs.map(d=>({...d,upload_version:0}))}])("unknown prerequisites never grant clearance: %j",patch=>{
    expect(metric(patch).cleared).toBeNull();
    expect(metric(patch).risk).toBe("Unknown");
  });
  it("computes risk from inactivity and revision, with no fabricated pace or stale status",()=>{
    expect(metric({required:100,attendance:[attendance("2026-09-30")]}).risk).toBe("At Risk");
    expect(metric({required:100,attendance:[attendance("2026-10-01")]}).risk).toBe("On Track");
    expect(metric({required:100,documents:docs.map(d=>({...d,status:"Needs Revision"}))}).risk).toBe("At Risk");
    expect(metric({attendance:[],documents:[]}).risk).toBe("Unknown");
    expect(checklistState([...docs,{...docs[0],doc_type:"custom"}]).complete).toBe(true);
    expect(checklistState(docs.slice(1))).toMatchObject({complete:false,present:3});
  });
});
