// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminDashboard from "../src/components/AdminDashboard";
import InternDashboard from "../src/components/InternDashboard";

const { completeRows, from, rpc, toast }=vi.hoisted(()=>({completeRows:vi.fn(),from:vi.fn(),rpc:vi.fn(),toast:vi.fn()}));
vi.mock("../src/lib/supabaseClient",()=>({supabase:{from,rpc}}));
vi.mock("../src/lib/workflows",async(importOriginal)=>({...await importOriginal(),completeRows}));
vi.mock("../src/components/Toast",()=>({useToast:()=>({toast})}));
vi.mock("recharts",()=>({ResponsiveContainer:({children})=><div>{children}</div>,AreaChart:({children})=><div>{children}</div>,Area:()=>null,XAxis:()=>null,YAxis:()=>null,CartesianGrid:()=>null,Tooltip:()=>null}));

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
  from.mockImplementation(table=>{
    let selected="*", single=false;
    const filters=[];
    const query={
      select(columns){selected=columns;return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},
      is(key,value){filters.push(row=>(row[key]??null)===value);return query;},
      order(){return query;},range(){return query;},maybeSingle(){single=true;return query;},
      then(resolve,reject){
        if(table==="interns"&&stall)return new Promise(()=>{}).then(resolve,reject);
        let rows=(data[table]??[]).filter(row=>filters.every(filter=>filter(row)));
        if(table==="interns")rows=rows.map(row=>({...row,
          ...(selected.includes("companies(")?{companies:data.companies.find(company=>company.id===row.company_id)}:{}),
          ...(selected.includes("course_sections(")?{course_sections:data.course_sections.find(section=>section.id===row.section_id)}:{}),
          ...(selected.includes("academic_years(")?{academic_years:data.academic_years.find(year=>year.id===row.academic_year_id)}:{}),
        }));
        return Promise.resolve({data:single?rows[0]??null:rows,count:rows.length}).then(resolve,reject);
      },
    };
    return query;
  });
  rpc.mockImplementation(async(name,args)=>{
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
  for(const label of ["Example Company","Instructor One","BSIT 4A","2026-2027"])expect(container.textContent).toContain(label);
  expect(container.textContent).toContain("50%");
  expect(container.textContent).toContain("Verified: 8.00 / 16 required");
  expect(container.textContent).toContain("Last updated:");
  await click("My Attendance");
  const table=container.querySelector("table");
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
