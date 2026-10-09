// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { metricResponse, queryResponse } from "./dashboard-transport";
import InstructorDashboard from "../src/components/InstructorDashboard";

const { completeRows, from, rpc, toast } = vi.hoisted(() => ({ completeRows: vi.fn(), from: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));
vi.mock("../src/lib/supabaseClient", () => ({ supabase: { from, rpc } }));
vi.mock("../src/lib/workflows", async (importOriginal) => ({ ...await importOriginal(), completeRows }));
vi.mock("../src/components/Toast", () => ({ useToast: () => ({ toast }) }));

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const instructor = { id: id(1), full_name: "Instructor One", email: "instructor@synthetic.invalid" };
const sectionA = { id: id(10), name: "BSIT 4A" };
const sectionB = { id: id(11), name: "BSIT 4B" };
const sectionC = { id: id(12), name: "BSIT 4C" };
let data;
let sectionError;
let root;
let container;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sectionError = false;
  window.sessionStorage.clear();
  data = {
    course_sections: [sectionA, sectionB, sectionC],
    academic_years: [{id:id(30),label:"2026-2027"}],
    profiles: ["Alice", "Bea", "Carlo", "Other Instructor's Intern"].map((full_name, index) => ({
      id: id(100 + index), full_name, role: "intern", status: "Active",
    })),
    interns: [sectionA.id, sectionB.id, null, sectionC.id].map((section_id, index) => ({
      id: id(100 + index), instructor_id: index === 3 ? id(2) : instructor.id, section_id, required_hours: 486,
    })),
    companies: [], attendance_logs: [], documents: [], evaluations: [],
  };
  completeRows.mockImplementation(async (_client, table) => {
    if (table === "course_sections" && sectionError) throw new Error("Section lookup offline");
    return data[table] ?? [];
  });
  // Remaining dashboard reads are empty synthetic query responses.
  from.mockImplementation(table => queryResponse(data,table));
  rpc.mockImplementation(async(name,args) => {
    if (name === "dashboard_metrics") return metricResponse(data,{after:args.p_after,limit:args.p_limit,instructor:instructor.id});
    if (name === "verify_attendance") {
      const row = data.attendance_logs.find(row => row.id === args.p_id);
      Object.assign(row,{verified:true,verified_by:instructor.id});
      return {data:row};
    }
    return {error:{message:"Synthetic operation failed"}};
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<InstructorDashboard profile={instructor} onLogout={() => {}} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function click(text) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent.trim() === text);
  expect(button).toBeTruthy();
  await act(async () => button.click());
}

async function filter(value) {
  await act(async () => {
    const select = container.querySelector("#instructor-section-filter");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it("shows section membership and filters both roster and progress within the assigned roster", async () => {
  expect(completeRows.mock.calls.map(call=>call[1])).toEqual(["interns","profiles","companies","course_sections","academic_years","alerts"]);
  expect(rpc.mock.calls.map(call=>call[0])).toEqual(["dashboard_metrics"]);
  expect(from).not.toHaveBeenCalled();
  console.info("Synthetic Instructor overview paths",JSON.stringify({completeLists:completeRows.mock.calls.length,metricRPCs:rpc.mock.calls.length,rawDetailQueries:from.mock.calls.length}));
  await click("My Interns");
  const table = container.querySelector('[aria-label="Assigned intern progress"]');
  expect(table.textContent).toContain("Section");
  expect(table.textContent).toContain("BSIT 4A");
  expect(table.textContent).toContain("BSIT 4B");
  expect(table.textContent).toContain("Unassigned");
  expect(container.textContent).not.toContain("Other Instructor's Intern");
  expect(container.querySelector("#instructor-section-filter").textContent).not.toContain("BSIT 4C");
  await filter(sectionA.id);
  expect(table.querySelectorAll(":scope > div")).toHaveLength(1);
  expect(table.textContent).toContain("Alice");
  expect(table.textContent).not.toContain("Bea");
  expect(container.textContent).toContain("Showing 1 of 3 assigned interns");
  await click("My Interns");
  expect(container.textContent).toContain("Alice");
  expect(container.textContent).toContain("Section: BSIT 4A");
  expect(container.textContent).not.toContain("Bea");
  await filter("");
  expect(container.textContent).toContain("Bea");
  expect(container.textContent).toContain("Carlo");
  expect(container.textContent).not.toContain("Other Instructor's Intern");
});

it("filters unassigned interns and refreshes Admin section changes without mislabeling an empty filter", async () => {
  await click("My Interns");
  await filter("unassigned");
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("Carlo");
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).not.toContain("Alice");
  await filter(sectionA.id);
  data.interns[0].section_id = sectionB.id;
  await click("Refresh roster");
  const select = container.querySelector("#instructor-section-filter");
  expect(select.value).toBe(sectionA.id);
  expect(select.selectedOptions[0].textContent).toBe("BSIT 4A");
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("No assigned interns in this section.");
  await filter(sectionB.id);
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("Alice");
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("Bea");
});

it("keeps the roster visible when section lookup fails and recovers on refresh", async () => {
  // Remount so no previously fetched section names can hide the failure.
  await act(async () => root.unmount());
  sectionError = true;
  root = createRoot(container);
  await act(async () => root.render(<InstructorDashboard profile={instructor} onLogout={() => {}} />));
  await click("My Interns");
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("Alice");
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("Section unavailable");
  expect(container.querySelector("#instructor-section-filter").disabled).toBe(true);
  expect(container.querySelector('[role="alert"]').textContent).toContain("Some instructor data is unavailable");
  sectionError = false;
  await click("Refresh roster");
  expect(container.querySelector("#instructor-section-filter").disabled).toBe(false);
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain("BSIT 4A");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("verifies a regular completed shift and immediately updates the intern's progress",async () => {
  data.interns[0].required_hours=16;
  data.interns[0].academic_year_id=id(30);
  const row={id:id(200),intern_id:id(100),academic_year_id:id(30),log_date:"2026-10-01",time_in:"08:00:00",time_out:"16:00:00",
    clocked_in_at:"2026-10-01T00:00:00Z",clocked_out_at:"2026-10-01T08:00:00Z",hours:8,verified:false,verified_by:null,accomplishment:"Completed daily report"};
  data.attendance_logs=[row];
  await click("Refresh data");
  await click("Attendance");
  const table=container.querySelector('[aria-label="Attendance verification"]');
  expect(table.textContent).toContain("Completed daily report");
  expect(table.textContent).toContain("Pending verification");

  await click("Verify attendance");
  expect(rpc).toHaveBeenCalledWith("verify_attendance",{p_id:row.id,p_expected_in:row.clocked_in_at,p_expected_out:row.clocked_out_at,p_expected_hours:8});
  expect(table.textContent).toContain("Verified");
  expect(table.querySelector("button")).toBeNull();
  await filter(sectionA.id);
  await click("My Interns");
  expect(container.textContent).toContain("50%");
  expect(container.textContent).toContain("Remaining: 8.00 verified hrs");
});

it("verifies historical attendance without claiming it increases assigned-year progress",async()=>{
  data.interns[0].required_hours=16;data.interns[0].academic_year_id=id(30);
  const row={id:id(201),intern_id:id(100),academic_year_id:null,log_date:"2026-10-01",time_in:"08:00:00",time_out:"16:00:00",
    clocked_in_at:"2026-10-01T00:00:00Z",clocked_out_at:"2026-10-01T08:00:00Z",hours:8,verified:false,verified_by:null};
  data.attendance_logs=[row];await click("Refresh data");await click("Attendance");
  rpc.mockResolvedValue({data:{...row,verified:true,verified_by:instructor.id}});
  await click("Verify attendance");
  expect(toast).toHaveBeenCalledWith("Attendance verified. This record belongs to another academic year; current assigned-year progress is unchanged.","success");
  await filter(sectionA.id);await click("My Interns");
  expect(container.textContent).toContain("Remaining: 16.00 verified hrs");
});

async function enter(selector,value) {
  await act(async () => {
    const input=container.querySelector(selector);
    const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,"value").set.call(input,value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
}

it("blocks repeated announcement clicks and preserves a retry key after a lost response",async () => {
  await click("Announcements");
  await enter('[aria-label="Announcement subject"]',"Section reminder");
  await enter('[aria-label="Announcement message"]',"Please submit your reports.");
  await act(async () => {
    const recipients=container.querySelector('[aria-label="Announcement recipients"]');
    recipients.value=`section:${sectionA.id}`;
    recipients.dispatchEvent(new Event("change",{bubbles:true}));
  });
  let resolve;
  rpc.mockClear();
  rpc.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const send=[...container.querySelectorAll("button")].find(button=>button.textContent.trim()==="Send Announcement");
  await act(async () => { send.click(); send.click(); });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(send.disabled).toBe(true);
  const first=rpc.mock.calls[0][1];
  expect(first).toMatchObject({p_section_id:sectionA.id,p_target_intern_id:null,p_title:"Section reminder"});
  await act(async () => resolve({error:{message:"Response lost; retry"}}));
  expect(container.querySelector('[aria-label="Announcement subject"]').value).toBe("Section reminder");
  rpc.mockResolvedValueOnce({data:{id:id(300),submission_id:first.p_submission_id,instructor_id:instructor.id,title:first.p_title,body:first.p_body,target:"Section",target_section_id:sectionA.id,section_name:sectionA.name,created_at:"2026-10-01T00:00:00Z"}});
  await act(async () => send.click());
  expect(rpc.mock.calls[1][1].p_submission_id).toBe(first.p_submission_id);
  expect(container.textContent).toContain("Section: BSIT 4A");
  expect(container.querySelector('[aria-label="Announcement subject"]').value).toBe("");
});

it("applies section filtering to evaluations, documents, and attendance review",async () => {
  await filter(sectionA.id);
  await click("Evaluations");
  const internSelect=[...container.querySelectorAll("select")].find(select=>select.textContent.includes("Choose intern"));
  expect(internSelect.textContent).toContain("Alice");
  expect(internSelect.textContent).not.toContain("Bea");
  await click("Intern Documents");
  expect(container.textContent).toContain("Alice");
  expect(container.textContent).not.toContain("Bea");
  await click("Attendance");
  expect(container.querySelector('[aria-label="Attendance verification"]')).toBeTruthy();
  expect(container.querySelector("#instructor-section-filter").value).toBe(sectionA.id);
});

it("reconciles a committed announcement after a lost response and full component reload",async()=>{
  await click("Announcements");await enter('[aria-label="Announcement subject"]',"Reload reminder");await enter('[aria-label="Announcement message"]',"Submit the report.");
  rpc.mockImplementationOnce(async(name,args)=>{
    expect(name).toBe("send_announcement");
    data.announcements=[{id:id(333),instructor_id:instructor.id,submission_id:args.p_submission_id,title:args.p_title,body:args.p_body,target:"All Interns",recipient_ids:[id(100)],created_at:"2026-10-08T00:00:00Z"}];
    return {error:{message:"Response lost"}};
  });
  await click("Send Announcement");const sendsBefore=rpc.mock.calls.filter(([name])=>name==="send_announcement").length;
  await act(async()=>root.unmount());root=createRoot(container);
  await act(async()=>root.render(<InstructorDashboard profile={instructor} onLogout={()=>{}}/>));
  await click("Announcements");
  expect(container.querySelector('[aria-label="Announcement subject"]').value).toBe("");
  expect(container.textContent).toContain("Reload reminder");
  expect(rpc.mock.calls.filter(([name])=>name==="send_announcement")).toHaveLength(sendsBefore);
});

it("retains an uncertain announcement's retry identity across reload when the feed cannot confirm it",async()=>{
  await click("Announcements");await enter('[aria-label="Announcement subject"]',"Retry reminder");await enter('[aria-label="Announcement message"]',"Original content");
  rpc.mockResolvedValueOnce({error:{message:"Connection lost"}});await click("Send Announcement");
  const original=rpc.mock.calls.filter(([name])=>name==="send_announcement").at(-1)[1];
  await act(async()=>root.unmount());root=createRoot(container);
  await act(async()=>root.render(<InstructorDashboard profile={instructor} onLogout={()=>{}}/>));await click("Announcements");
  expect(container.querySelector('[aria-label="Announcement subject"]').value).toBe("Retry reminder");
  expect(container.querySelector('[aria-label="Announcement subject"]').disabled).toBe(true);
  rpc.mockResolvedValueOnce({data:{id:id(334),instructor_id:instructor.id,submission_id:original.p_submission_id,title:original.p_title,body:original.p_body,target:"All Interns",created_at:"2026-10-08T00:00:00Z"}});
  await click("Send Announcement");
  expect(rpc.mock.calls.filter(([name])=>name==="send_announcement").at(-1)[1].p_submission_id).toBe(original.p_submission_id);
  expect(container.querySelector('[aria-label="Announcement subject"]').value).toBe("");
});

it("loads documents for the selected section's visible intern",async()=>{
 await click("Intern Documents");
 expect(completeRows).toHaveBeenCalledWith(expect.anything(),"documents",id(100));
 completeRows.mockClear();await filter(sectionB.id);
 expect(completeRows).toHaveBeenCalledWith(expect.anything(),"documents",id(101));
 expect(completeRows.mock.calls.filter(call=>call[1]==="documents").every(call=>call[2]===id(101))).toBe(true);
});

it("keeps announcement typing and focus uninterrupted during a manual refresh",async()=>{
 await click("Announcements");await enter('[aria-label="Announcement subject"]',"Unsaved subject");
 const input=container.querySelector('[aria-label="Announcement message"]');input.focus();let finish;
 completeRows.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await click("Refresh data");expect(container.querySelector('[aria-label="Announcement message"]')).toBe(input);expect(document.activeElement).toBe(input);
 await enter('[aria-label="Announcement message"]',"Typing during refresh");
 await act(async()=>finish(data.interns));
 expect(container.querySelector('[aria-label="Announcement message"]')).toBe(input);expect(input.value).toBe("Typing during refresh");expect(document.activeElement).toBe(input);
});


it("keeps instructor desktop/mobile overflow navigation focused on supervision", async () => {
  const removed = /reports?|\bcsv\b|\bexcel\b|export|bulk import|backup|certificate of completion|document zip/i;
  expect(container.querySelector('aside nav').textContent).not.toMatch(removed);
  for (const label of ['My Interns', 'Attendance', 'Evaluations', 'Intern Documents', 'Announcements', 'Dashboard']) {
    await click(label);
    for (const control of container.querySelectorAll('button, a')) expect(control.getAttribute('aria-label') || control.textContent).not.toMatch(removed);
  }
  await click('More');
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain('Intern Documents');
  expect(dialog.textContent).not.toMatch(removed);
  await act(async () => dialog.querySelector('button').click());
});

it("scopes supervision actions to assigned interns and opens the selected evaluation", async () => {
  data.attendance_exceptions = [{ id: id(600), intern_id: id(100), status: 'Pending' }, { id: id(601), intern_id: id(101), status: 'Pending' }];
  data.documents = [{ id: id(700), intern_id: id(100), doc_type: 'moa', status: 'Pending', upload_version: 1, file_path: id(100) + '/moa.pdf', file_name: 'moa.pdf' }];
  await click('Refresh roster');
  await click('My Interns');
  let actions = container.querySelector('[aria-label="Supervision actions"]');
  expect(actions.textContent).toContain('Requirements awaiting approval: 1');
  expect(actions.textContent).toContain('Without an evaluation for the assigned year: 3');
  expect(actions.textContent).not.toContain("Other Instructor's Intern");
  await filter(sectionA.id);
  actions = container.querySelector('[aria-label="Supervision actions"]');
  expect(actions.textContent).toContain('Without an evaluation for the assigned year: 1');
  expect(actions.textContent).not.toContain('Bea');
  await click('My Interns');
  await click('Evaluate Alice');
  expect(container.querySelector('#evaluation-intern').value).toBe(id(100));
  expect(container.querySelector('#evaluation-intern').textContent).not.toContain('Bea');
});

it("preserves scoring, retry identity and historical evaluations through the supervision action", async () => {
  data.evaluations = [{ id: id(800), intern_id: id(100), academic_year_id: id(39), created_at: '2025-10-01T00:00:00Z', overall_score: 80, competencies: { punctuality: 4, performance: 4, conduct: 4, communication: 4 }, feedback: 'Historical feedback' }];
  await click('My Interns');
  await click('Evaluate Alice');
  expect(container.textContent).toContain('Historical feedback');
  const criteria = ['Punctuality & Attendance', 'Task Performance & Quality', 'Professional Conduct', 'Communication Skills'];
  for (const label of criteria) await act(async () => container.querySelector('[aria-label="' + label + ': 4 of 5"]').click());
  expect(container.textContent).toContain('Computed Score');
  const original = rpc.getMockImplementation();
  let attempts = 0;
  rpc.mockImplementation(async (name, args) => {
    if (name !== 'submit_evaluation') return original(name, args);
    if (++attempts === 1) return { error: { message: 'Synthetic lost response' } };
    return { data: { id: id(801), intern_id: id(100), academic_year_id: null, created_at: '2026-10-09T00:00:00Z', overall_score: 80, competencies: args.p_criteria, submission_id: args.p_submission_id } };
  });
  await click('Submit Evaluation');
  expect(container.querySelector('#evaluation-intern').value).toBe(id(100));
  await click('Submit Evaluation');
  const attemptsMade = rpc.mock.calls.filter(([name]) => name === 'submit_evaluation');
  expect(attemptsMade).toHaveLength(2);
  expect(attemptsMade[0][1].p_submission_id).toBe(attemptsMade[1][1].p_submission_id);
  expect(container.textContent).toContain('Evaluation Records (2)');
  expect(container.textContent).toContain('Historical feedback');
  expect(container.querySelector('#evaluation-intern').value).toBe('');
});


it("starts another intern's supervision evaluation without carrying over scores or feedback", async () => {
  await click('My Interns');
  await click('Evaluate Bea');
  await act(async () => container.querySelector('[aria-label="Punctuality & Attendance: 4 of 5"]').click());
  await enter('#evaluation-feedback', 'Feedback for Bea');
  await click('Dashboard');
  await click('My Interns');
  await click('Evaluate Alice');
  expect(container.querySelector('#evaluation-intern').value).toBe(id(100));
  expect(container.querySelector('#evaluation-feedback').value).toBe('');
  expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
});


it("limits the instructor dashboard to totals and pending counts while retaining details in My Interns", async () => {
  expect(container.textContent).toContain('Assigned Interns');
  expect(container.textContent).toContain('Active Now');
  expect(container.textContent).toContain('Pending Actions');
  expect(container.querySelector('table')).toBeNull();
  expect(container.querySelector('[aria-label="Supervision actions"]')).toBeNull();
  expect(container.querySelector('[aria-label="Assigned intern progress"]')).toBeNull();
  expect(container.textContent).not.toContain('Evaluate Alice');
  await click('View my interns');
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain('Alice');
  expect(container.querySelector('[aria-label="Assigned intern progress"]').textContent).toContain('Attendance: Not clocked in');
  expect(container.querySelector('[aria-label="Supervision actions"]')).toBeTruthy();
});
