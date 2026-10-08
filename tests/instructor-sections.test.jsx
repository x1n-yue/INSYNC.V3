// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
    return data[table];
  });
  // Remaining dashboard reads are empty synthetic query responses.
  from.mockImplementation(() => {
    const query = { then: (resolve, reject) => Promise.resolve({ data: [] }).then(resolve, reject) };
    for (const method of ["select", "in", "is", "eq", "order"]) query[method] = () => query;
    return query;
  });
  rpc.mockResolvedValue({error:{message:"Synthetic operation failed"}});
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
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
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
  const table = container.querySelector("table");
  expect(table.textContent).toContain("Section");
  expect(table.textContent).toContain("BSIT 4A");
  expect(table.textContent).toContain("BSIT 4B");
  expect(table.textContent).toContain("Unassigned");
  expect(container.textContent).not.toContain("Other Instructor's Intern");
  expect(container.querySelector("#instructor-section-filter").textContent).not.toContain("BSIT 4C");
  await filter(sectionA.id);
  expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(table.textContent).toContain("Alice");
  expect(table.textContent).not.toContain("Bea");
  expect(container.textContent).toContain("Showing 1 of 3 assigned interns");
  await click("Progress Tracker");
  expect(container.textContent).toContain("Alice");
  expect(container.textContent).toContain("Section: BSIT 4A");
  expect(container.textContent).not.toContain("Bea");
  await filter("");
  expect(container.textContent).toContain("Bea");
  expect(container.textContent).toContain("Carlo");
  expect(container.textContent).not.toContain("Other Instructor's Intern");
});

it("filters unassigned interns and refreshes Admin section changes without mislabeling an empty filter", async () => {
  await filter("unassigned");
  expect(container.querySelector("table").textContent).toContain("Carlo");
  expect(container.querySelector("table").textContent).not.toContain("Alice");
  await filter(sectionA.id);
  data.interns[0].section_id = sectionB.id;
  await click("Refresh roster");
  const select = container.querySelector("#instructor-section-filter");
  expect(select.value).toBe(sectionA.id);
  expect(select.selectedOptions[0].textContent).toBe("BSIT 4A");
  expect(container.querySelector("table").textContent).toContain("No assigned interns in this section.");
  await filter(sectionB.id);
  expect(container.querySelector("table").textContent).toContain("Alice");
  expect(container.querySelector("table").textContent).toContain("Bea");
});

it("keeps the roster visible when section lookup fails and recovers on refresh", async () => {
  // Remount so no previously fetched section names can hide the failure.
  await act(async () => root.unmount());
  sectionError = true;
  root = createRoot(container);
  await act(async () => root.render(<InstructorDashboard profile={instructor} onLogout={() => {}} />));
  expect(container.querySelector("table").textContent).toContain("Alice");
  expect(container.querySelector("table").textContent).toContain("Section unavailable");
  expect(container.querySelector("#instructor-section-filter").disabled).toBe(true);
  expect(container.querySelector('[role="alert"]').textContent).toContain("Some instructor data is unavailable");
  sectionError = false;
  await click("Refresh roster");
  expect(container.querySelector("#instructor-section-filter").disabled).toBe(false);
  expect(container.querySelector("table").textContent).toContain("BSIT 4A");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("verifies a regular completed shift and immediately updates the intern's progress",async () => {
  data.interns[0].required_hours=16;
  data.interns[0].academic_year_id=id(30);
  const row={id:id(200),intern_id:id(100),academic_year_id:id(30),log_date:"2026-10-01",time_in:"08:00:00",time_out:"16:00:00",
    clocked_in_at:"2026-10-01T00:00:00Z",clocked_out_at:"2026-10-01T08:00:00Z",hours:8,verified:false,verified_by:null,accomplishment:"Completed daily report"};
  data.attendance_logs=[row];
  await click("Refresh data");
  await click("DTR Review");
  const table=container.querySelector('[aria-label="Attendance verification"]');
  expect(table.textContent).toContain("Completed daily report");
  expect(table.textContent).toContain("Pending verification");
  rpc.mockResolvedValue({data:{...row,verified:true,verified_by:instructor.id}});
  await click("Verify attendance");
  expect(rpc).toHaveBeenCalledWith("verify_attendance",{p_id:row.id,p_expected_in:row.clocked_in_at,p_expected_out:row.clocked_out_at,p_expected_hours:8});
  expect(table.textContent).toContain("Verified");
  expect(table.querySelector("button")).toBeNull();
  await filter(sectionA.id);
  await click("Progress Tracker");
  expect(container.textContent).toContain("50%");
  expect(container.textContent).toContain("Remaining: 8.00 verified hrs");
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
  rpc.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const send=[...container.querySelectorAll("button")].find(button=>button.textContent.trim()==="Send Announcement");
  await act(async () => { send.click(); send.click(); });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(send.disabled).toBe(true);
  const first=rpc.mock.calls[0][1];
  expect(first).toMatchObject({p_section_id:sectionA.id,p_target_intern_id:null,p_title:"Section reminder"});
  await act(async () => resolve({error:{message:"Response lost; retry"}}));
  expect(container.querySelector('[aria-label="Announcement subject"]').value).toBe("Section reminder");
  rpc.mockResolvedValueOnce({data:{id:id(300),title:first.p_title,body:first.p_body,target:"Section",target_section_id:sectionA.id,section_name:sectionA.name,created_at:"2026-10-01T00:00:00Z"}});
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
  await click("DTR Review");
  expect(container.querySelector('[aria-label="Attendance verification"]')).toBeTruthy();
  expect(container.querySelector("#instructor-section-filter").value).toBe(sectionA.id);
});
