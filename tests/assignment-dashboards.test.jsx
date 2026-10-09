// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { metricResponse, chartResponse, queryResponse } from "./dashboard-transport";
import AdminDashboard from "../src/components/AdminDashboard";
import InternDashboard from "../src/components/InternDashboard";

const { completeRows, from, rpc, toast }=vi.hoisted(()=>({completeRows:vi.fn(),from:vi.fn(),rpc:vi.fn(),toast:vi.fn()}));
vi.mock("../src/lib/supabaseClient",()=>({supabase:{from,rpc}}));
vi.mock("../src/lib/workflows",async(importOriginal)=>({...await importOriginal(),completeRows}));
vi.mock("../src/components/Toast",()=>({useToast:()=>({toast})}));
vi.mock("recharts",()=>({ResponsiveContainer:({children})=><div>{children}</div>,AreaChart:({children})=><svg>{children}</svg>,BarChart:({children})=><svg>{children}</svg>,Bar:()=>null,Legend:()=>null,Area:()=>null,XAxis:()=>null,YAxis:()=>null,CartesianGrid:()=>null,Tooltip:()=>null}));

const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const owner=id(4), instructor=id(2), year=id(10), oldYear=id(11), section=id(20), company=id(30);
const profile={id:owner,full_name:"Intern One",email:"intern@synthetic.invalid",role:"intern",status:"Active"};
let data, root, container, stall;

beforeEach(()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  stall=false;
  data={
    profiles:[profile,{id:instructor,full_name:"Instructor One",role:"instructor",status:"Active"}],
    interns:[{id:owner,instructor_id:instructor,company_id:company,section_id:section,academic_year_id:year,required_hours:16}],
    companies:[{id:company,name:"Example Company"}],course_sections:[{id:section,name:"BSIT 4A"},{id:id(21),name:"BSIT 4B"}],
    academic_years:[{id:year,label:"2026-2027",is_current:true},{id:oldYear,label:"2025-2026"}],
    attendance_logs:[year,oldYear,null].map((academic_year_id,index)=>({id:id(100+index),intern_id:owner,academic_year_id,log_date:`2026-10-0${index+1}`,
      time_in:"08:00:00",time_out:"16:00:00",clocked_in_at:`2026-10-0${index+1}T00:00:00Z`,clocked_out_at:`2026-10-0${index+1}T08:00:00Z`,hours:8,verified:true,verified_by:instructor})),
    documents:[],evaluations:[],attendance_exceptions:[],announcements:[],audit_logs:[],
  };
  completeRows.mockImplementation(async(_client,table)=>data[table]??[]);
  from.mockImplementation(table => queryResponse(data,table,{ stall: table => table === "interns" && stall }));
  rpc.mockImplementation(async(name,args)=>{
    if(name==="dashboard_metrics")return metricResponse(data,{after:args.p_after,limit:args.p_limit});
    if(name==="dashboard_chart")return chartResponse(data,owner,args.p_period);
    if(name==="my_profile")return {data:profile};
    if(name==="related_profile_names")return {data:[{id:instructor,full_name:"Instructor One"}]};
    if(name==="unfinished_document_uploads")return {data:[]};
    if(name==="admin_set_assignment"){
      data.interns[0]={...data.interns[0],instructor_id:args.p_instructor_id,company_id:args.p_company_id,section_id:args.p_section_id,
        required_hours:args.p_required_hours,academic_year_id:args.p_academic_year_id};
      return {data:data.interns[0]};
    }
    if(name==="attach_standard_docs"){
      data.documents=["moa","endorsement","consent","medical"].map((doc_type,index)=>({id:id(200+index),intern_id:owner,doc_type,name:doc_type,status:"Pending",academic_year_id:data.interns[0].academic_year_id}));
      return {data:{id:owner,documents:data.documents}};
    }
    return {data:[]};
  });
  container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
async function render(Component=InternDashboard){await act(async()=>root.render(<Component profile={profile} onLogout={()=>{}}/>));}
async function click(label){
  const button=[...container.querySelectorAll("button")].find(button=>button.textContent.trim()===label);
  expect(button).toBeTruthy();await act(async()=>button.click());
}
async function select(label,value){await act(async()=>{const input=container.querySelector(`[aria-label="${label}"]`);input.value=value;input.dispatchEvent(new Event("change",{bubbles:true}));});}

it("shows the intern's fetched company, instructor, section, year and year-scoped progress",async()=>{
  await render();
  expect(container.textContent).toContain("My Internship Assignment");
  expect(container.querySelector('details').open).toBe(false);
  for(const label of ["Example Company","Instructor One","BSIT 4A","2026-2027"])expect(container.textContent).toContain(label);
  expect(container.textContent).toContain("50%");
  expect(container.textContent).toContain("Verified: 8.00 / 16 required");
  expect(container.textContent).toContain("Last updated:");
  await click("My Attendance");
  expect(container.querySelector('details').open).toBe(true);
  const historyRegion = container.querySelector('[role="region"][aria-label="Attendance records"]');
  historyRegion.focus();
  expect(document.activeElement).toBe(historyRegion);
  expect(container.querySelector('[aria-label="Attendance period"] [aria-pressed="true"]').textContent).toBe('All');
  const table=container.querySelector('table[aria-label="Daily Time Record"]');
  expect(table.textContent).toContain("2025-2026");expect(table.textContent).toContain("Unassigned academic year");
  expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
  await click("My Documents");
  expect(container.textContent).toContain("ask your administrator to attach the standard checklist");
});

it("saves the selected section/year, restores them on reload, and completes the Admin onboarding checklist",async()=>{
  data.interns[0].academic_year_id=null;
  await render(AdminDashboard);await click("Interns");
  expect(container.textContent).toContain("Onboarding: Incomplete");
  await select("Section",id(21));await select("Academic Year",year);await click("Save");
  expect(rpc).toHaveBeenCalledWith("admin_set_assignment",expect.objectContaining({p_section_id:id(21),p_academic_year_id:year,p_required_hours:16}));
  await click("Attach missing standard requirements (0/4 present)");
  expect(container.textContent).toContain("Onboarding: Ready (6/6)");
  await act(async()=>root.unmount());root=createRoot(container);await render(AdminDashboard);await click("Interns");
  expect(container.querySelector('[aria-label="Section"]').value).toBe(id(21));
  expect(container.querySelector('[aria-label="Academic Year"]').value).toBe(year);
  expect(container.textContent).toContain("Onboarding: Ready (6/6)");
});

it("turns a stalled assignment read into a recoverable error instead of waiting indefinitely",async()=>{
  vi.useFakeTimers();stall=true;await render();
  expect(container.textContent).toContain("Loading");
  await act(async()=>vi.advanceTimersByTimeAsync(15000));
  expect(container.textContent).toContain("Assignment information unavailable");
  expect(container.textContent).toContain("No complete refresh yet");
  stall=false;await click("Refresh data");
  expect(container.textContent).toContain("Example Company");
  expect(container.textContent).toContain("Last updated:");
});

it("keeps audit records aligned with the page label after Previous and Refresh data",async()=>{
  data.audit_logs=Array.from({length:55},(_,index)=>({id:id(500-index),created_at:"2026-10-08T00:00:00Z",actor_name:"Synthetic Admin",action:`Audit event ${index+1}`,detail:"Synthetic audit record"}));
  await render(AdminDashboard); await click("Audit Logs");
  const hasEvent=(number)=>[...container.querySelectorAll("div")].some(item=>item.textContent===`Legacy (provenance unverified) | Audit event ${number}`);
  expect(hasEvent(1)).toBe(true);
  await click("Next");
  expect(container.textContent).toContain("Page 2");expect(hasEvent(51)).toBe(true);expect(hasEvent(1)).toBe(false);
  await click("Previous");
  expect(container.textContent).toContain("Page 1");expect(hasEvent(1)).toBe(true);expect(hasEvent(51)).toBe(false);
  await click("Next");await click("Refresh data");
  expect(container.textContent).toContain("Page 2");expect(hasEvent(51)).toBe(true);expect(hasEvent(1)).toBe(false);
});

it("loads Admin metrics without raw attendance/documents and preserves an assignment draft on refresh",async()=>{
  await render(AdminDashboard);await click("Interns");
  expect(completeRows.mock.calls.some(([,table])=>["attendance_logs","documents"].includes(table))).toBe(false);
  expect(container.textContent).toContain("Verified: 8.00 hrs");
  await select("Section",id(21));await click("Refresh data");
  expect(container.querySelector('[aria-label="Section"]').value).toBe(id(21));
  expect(rpc.mock.calls.some(([name])=>name==="admin_set_assignment")).toBe(false);
});

it("applies audit filters, safely displays structured changes and retains the applied filter on refresh",async()=>{
  data.audit_logs=[{id:id(501),actor_id:instructor,actor_name:"Instructor One",source:"database-trigger-v2",created_at:"2026-10-08T00:00:00Z",action:"Document review",event_data:{table:"documents",changed_fields:["status"],previous_status:"Pending",status:"<img src=x onerror=alert(1)>"}},
    {id:id(502),actor_id:owner,actor_name:"Other",created_at:"2026-10-08T00:00:00Z",action:"Other event",event_data:{table:"profiles"}}];
  await render(AdminDashboard);await click("Audit Logs");await select("Audit actor",instructor);await select("Audit table","documents");
  await click("Apply audit filters");expect(container.textContent).toContain("1 records");expect(container.textContent).not.toContain("Other event");
  expect(container.textContent).toContain("<img src=x onerror=alert(1)>");expect(container.querySelector("img")).toBeNull();expect(container.textContent).toContain("Oct 8, 2026");
  await click("Refresh data");expect(container.textContent).toContain("1 records");expect(container.textContent).not.toContain("Other event");
});


it.each([['Intern', InternDashboard], ['Admin', AdminDashboard]])("keeps %s desktop and mobile navigation free of removed scope controls", async (_role, Component) => {
  await render(Component);
  const labels = [...container.querySelectorAll('aside nav button')].map(button => button.getAttribute('aria-label'));
  expect(labels.length).toBeGreaterThan(0);
  const removed = /reports?|\bcsv\b|\bexcel\b|\bxlsx\b|export|bulk import|backup|certificate of completion|document zip/i;
  for (const label of labels) {
    await click(label);
    for (const control of container.querySelectorAll('button, a')) expect(control.getAttribute('aria-label') || control.textContent).not.toMatch(removed);
  }
  const mobile = container.querySelector('nav.md\\:hidden');
  expect(mobile).toBeTruthy();
  expect(mobile.textContent).not.toMatch(removed);
});

it("clocks in and out from the focused dashboard through the original RPC and accomplishment workflow", async () => {
  const original = rpc.getMockImplementation();
  const started = new Date(Date.now() - 3600000);
  const localTime = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(started);
  const log = { id: id(999), intern_id: owner, academic_year_id: year, log_date: date, time_in: localTime(started), time_out: null, clocked_in_at: started.toISOString(), clocked_out_at: null, hours: null, verified: false, verified_by: null };
  rpc.mockImplementation(async (name, args) => {
    if (name === 'clock_in') { data.attendance_logs.push(log); return { data: log }; }
    if (name === 'clock_out') {
      const ended = new Date(started.getTime() + 3600000);
      const closed = { ...log, time_out: localTime(ended), clocked_out_at: ended.toISOString(), hours: 1, accomplishment: args.p_accomplishment };
      data.attendance_logs = data.attendance_logs.map(row => row.id === log.id ? closed : row);
      return { data: closed };
    }
    return original(name, args);
  });
  await render();
  expect(container.querySelector('[aria-label^="Today"]')).toBeTruthy();
  await click('Clock In');
  expect(rpc).toHaveBeenCalledWith('clock_in', {});
  expect(container.textContent).toContain('Session in progress');
  await click('Clock Out');
  await act(async () => {
    const input = container.querySelector('#daily-accomplishment');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Completed assigned tasks');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Clock Out & Save Log');
  expect(rpc).toHaveBeenCalledWith('clock_out', { p_id: log.id, p_accomplishment: 'Completed assigned tasks' });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await click('My Attendance');
  expect(container.querySelector('table[aria-label="Daily Time Record"]').textContent).toContain('Completed assigned tasks');
  expect(container.querySelector('table[aria-label="Daily Time Record"]').textContent).toContain('Pending');
});

it("prioritizes Admin intern oversight while preserving master data and audit access", async () => {
  await render(AdminDashboard);
  expect(container.querySelector('[aria-label="Intern monitoring overview"]').textContent).toContain('Verified: 8.00 hrs');
  expect(container.textContent).toContain('Unassigned Interns');
  await click('Review assignments and document checklists');
  expect(container.textContent).toContain('Intern Assignments');
  await click('Audit Logs');
  expect(container.textContent).toContain('Apply audit filters');
  await click('Master Data');
  expect(container.textContent).toContain('Course Sections');
});


it("keeps a compact weekly chart on the dashboard and detailed chart controls in Attendance", async () => {
  await render();
  expect(container.textContent).toContain("Today's Attendance");
  expect(container.textContent).toContain('Logged Hours');
  expect(container.textContent).toContain('Completion');
  expect(container.textContent).toContain('Latest Score');
  expect(container.textContent).not.toContain('Logged Hours (sum)');
  expect(container.textContent).not.toContain('Recent Evaluations');
  expect(container.textContent).not.toContain('Clearance:');
  expect([...container.querySelectorAll('details')].find(details => details.querySelector('summary').textContent === 'Announcements').open).toBe(false);
  expect(container.textContent).toContain("This Week's Hours");
  expect(rpc).toHaveBeenCalledWith('dashboard_chart', { p_period: 'week' });
  await click('My Attendance');
  expect(container.textContent).toContain('Weekly Hours');
  const picker = [...container.querySelectorAll('button')].find(button => button.textContent.startsWith('Weekly'));
  await act(async () => picker.click());
  await click('Monthly');
  expect(rpc).toHaveBeenCalledWith('dashboard_chart', { p_period: 'month' });
  await click('My Dashboard');
  expect(rpc.mock.calls.filter(([name]) => name === 'dashboard_chart').at(-1)[1]).toEqual({ p_period: 'week' });
  expect(container.textContent).not.toContain('Monthly');
  await click('My Documents');
  expect(container.textContent).toContain('Clearance:');
});

it("shows daily logged and verified hours only for the signed-in intern's assigned year", async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
  const log = (number, day, hours, verified, extra = {}) => ({ id: id(number), intern_id: owner, academic_year_id: year,
    log_date: day, time_in: '08:00:00', time_out: `${8 + hours}:00:00`, clocked_in_at: `${day}T00:00:00Z`,
    clocked_out_at: `${day}T0${hours}:00:00Z`, hours, verified, verified_by: verified ? instructor : null, ...extra });
  data.attendance_logs = [log(100, '2026-10-05', 8, true), log(101, '2026-10-06', 6, false),
    log(102, '2026-10-05', 8, true, { academic_year_id: oldYear }),
    log(103, '2026-10-05', 8, true, { intern_id: id(5) })];
  await render();
  const rows = [...container.querySelectorAll('[aria-label="This week\'s hours"] tbody tr')].map(row => [...row.children].map(cell => cell.textContent));
  expect(rows).toHaveLength(7);
  expect(rows[0]).toEqual([expect.stringContaining('Oct 5'), '8.00', '8.00']);
  expect(rows[1]).toEqual([expect.stringContaining('Oct 6'), '6.00', '0.00']);
  expect(rows[2].slice(1)).toEqual(['0.00', '0.00']);
  expect(rows[4].slice(1)).toEqual(['Upcoming', 'Upcoming']);
  expect(container.textContent).toContain('Verified hours are included in logged hours');
  await click('My Attendance');
  const attendanceRows = [...container.querySelectorAll('[aria-label="Attendance hours"] tbody tr')].map(row => [...row.children].map(cell => cell.textContent));
  expect(attendanceRows).toEqual(rows);
});

it("preserves logged and verified totals across Attendance chart periods and formats monthly buckets", async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
  data.attendance_logs.push({ ...data.attendance_logs[0], id: id(110), log_date: '2026-10-05',
    clocked_in_at: '2026-10-05T00:00:00Z', clocked_out_at: '2026-10-05T06:00:00Z', time_out: '14:00:00', hours: 6, verified: false, verified_by: null });
  await render();
  await click('My Attendance');
  for (const [label, period] of [['Monthly', 'month'], ['Yearly', 'year'], ['All Time', 'all']]) {
    await act(async () => container.querySelector('[aria-label="Chart period"]').click());
    await click(label);
    expect(rpc).toHaveBeenCalledWith('dashboard_chart', { p_period: period });
    const chart = container.querySelector('[aria-label="Attendance hours"]');
    const rows = [...chart.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => cell.textContent));
    expect(rows.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(14);
    expect(rows.reduce((sum, row) => sum + Number(row[2]), 0)).toBe(8);
    if (period !== 'month') expect(rows).toEqual([['Oct 2026', '14.00', '8.00']]);
    expect(chart.textContent).not.toContain('Unavailable');
  }
});

it("hides failed Attendance chart totals and restores them on retry", async () => {
  const original = rpc.getMockImplementation();
  let failed = false;
  rpc.mockImplementation((name, args) => name === 'dashboard_chart' && failed
    ? { error: { message: 'Network unavailable' } } : original(name, args));
  await render();
  failed = true;
  await click('My Attendance');
  const chart = () => container.querySelector('[aria-label="Attendance hours"]');
  expect(chart().textContent).toContain('Weekly hours are unavailable.');
  expect(chart().querySelector('table')).toBeNull();
  failed = false;
  await click('Retry weekly hours');
  expect(chart().querySelector('table')).toBeTruthy();
});

it("preserves unknown weekly evidence and retries chart failures without showing false zeroes", async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
  const original = rpc.getMockImplementation();
  let failed = true;
  rpc.mockImplementation((name, args) => name === 'dashboard_chart'
    ? failed ? { error: { message: 'Network unavailable' } } : { data: [{ day: '2026-10-05', hours: null, verified: null }] }
    : original(name, args));
  await render();
  const chart = () => container.querySelector('[aria-label="This week\'s hours"]');
  expect(chart().textContent).toContain('Weekly hours are unavailable.');
  expect(chart().querySelector('table')).toBeNull();
  expect(chart().textContent).not.toContain('No completed hours');
  failed = false;
  await click('Retry weekly hours');
  expect(chart().textContent).toContain('Some hours are unavailable.');
  expect([...chart().querySelector('tbody tr').children].slice(1).map(cell => cell.textContent)).toEqual(['Unavailable', 'Unavailable']);
  expect(chart().textContent).not.toContain('No completed hours');
});
