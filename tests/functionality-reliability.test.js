import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardMetrics, detailPage, attendancePeriod, weeklyChartDays } from "../src/lib/dashboard";
import { completeRows } from "../src/lib/workflows";
import { readRows } from "../src/lib/rows";
import { documentLink, recoverUpload, uploadDocument } from "../src/lib/documents";
import { auditScope, auditChanges } from "../src/lib/audit";
import { requestAccountEmail, authRedirect, recoveryMessage } from "../src/lib/accountRecovery";
import { clearUnsentAnnouncementDrafts, readAnnouncementDraft, writeAnnouncementDraft } from "../src/lib/announcementDraft";
import { queryResponse } from "./dashboard-transport";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const owner=id(4),teacher=id(2),doc={id:id(100),intern_id:owner,upload_version:1,review_revision:1};
const stalled = () => new Promise(() => {});
afterEach(() => { vi.useRealTimers(); });

it("labels the Manila week across year boundaries without inventing future or unknown hours", () => {
  const source = [{ day: '2026-12-28', hours: 8, verified: 4 }, { day: '2027-01-01', hours: null, verified: null }];
  const days = weeklyChartDays(source, new Date('2026-12-31T16:30:00Z'));
  expect(days.map(day => day.day)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  expect(days[0]).toMatchObject({ hours: 8, verified: 4, future: false });
  expect(days[1]).toMatchObject({ hours: 0, verified: 0, future: false });
  expect(days[4]).toMatchObject({ hours: null, verified: null, future: false });
  expect(days[5]).toMatchObject({ hours: null, verified: null, future: true });
  expect(source).toHaveLength(2);
  expect(weeklyChartDays([], new Date('2026-10-04T16:00:00Z'))[0].day).toBe('2026-10-05');
});
it.each([null, {}, [{ day: '2026-10-05', hours: '8', verified: 0 }],
  [{ day: '2026-10-05', hours: 8, verified: 0 }, { day: '2026-10-05', hours: 8, verified: 0 }]])(
  "rejects unavailable or malformed weekly chart responses: %j", response => {
    expect(() => weeklyChartDays(response)).toThrow(/unavailable/);
  });

it("fills stable visible pages under a smaller API cap with scoped rows",async()=>{
  const data={attendance_logs:Array.from({length:130},(_,index)=>({id:id(200+index),intern_id:index<120?owner:id(5),log_date:"2026-10-01"}))};
  const client={from:vi.fn(table=>queryResponse(data,table,{cap:7}))};
  const first=await detailPage(client,"attendance_logs",{filter:query=>query.eq("intern_id",owner),order:"log_date"});
  const second=await detailPage(client,"attendance_logs",{page:1,filter:query=>query.eq("intern_id",owner),order:"log_date"});
  expect(first.count).toBe(120);expect(first.data).toHaveLength(50);expect(second.data).toHaveLength(50);
  expect(new Set([...first.data,...second.data].map(row=>row.id)).size).toBe(100);
  expect([...first.data,...second.data].every(row=>row.intern_id===owner)).toBe(true);
});
it("completes scoped secondary reads across low-cap pages",async()=>{
  const data={alerts:Array.from({length:19},(_,index)=>({id:id(100+index),dismissed:index>=17}))};
  const client={rpc:async()=>({data:{status:"Active",id:owner,role:"intern"}}),from:table=>queryResponse(data,table,{cap:3})};
  expect(await completeRows(client,"alerts",undefined,{filter:query=>query.eq("dismissed",false)})).toHaveLength(17);
});
it("rejects truncated visible pages and never invents complete results",async()=>{
  const query={select(){return query;},order(){return query;},range(){return query;},then(resolve,reject){return Promise.resolve({data:[],count:9}).then(resolve,reject);}};
  await expect(detailPage({from:()=>query},"alerts")).rejects.toThrow(/truncated/);
});
it("traverses metric pages and rejects duplicate IDs and changing totals",async()=>{
  const metric={checklist:{known:true}};
  const rpc=vi.fn().mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:2,rows:[{id:id(1),metric}]}}).mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:2,rows:[{id:id(2),metric}]}});
  expect(await dashboardMetrics({rpc})).toHaveLength(2);
  expect(rpc.mock.calls[1][1].p_after).toBe(id(1));
  rpc.mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:2,rows:[{id:id(1),metric}]}}).mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:2,rows:[{id:id(1),metric}]}});
  await expect(dashboardMetrics({rpc})).rejects.toThrow(/Unexpected/);
  rpc.mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:2,rows:[{id:id(1),metric}]}}).mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:1,rows:[]}});
  await expect(dashboardMetrics({rpc})).rejects.toThrow(/counts changed/);
});
it("bounds auth-lock and page waits before core data loading completes",async()=>{
  vi.useFakeTimers();
  const pending=completeRows({rpc:stalled},"alerts").catch(error=>error);
  await vi.advanceTimersByTimeAsync(15000);expect((await pending).message).toContain("timed out");
  const read=readRows({from:()=>({select(){return this;},order(){return this;},limit(){return stalled();}})},"alerts","*").catch(error=>error);
  await vi.advanceTimersByTimeAsync(15000);expect((await read).message).toContain("timed out");
});
it.each(["link","cleanup"])("bounds a stalled Storage %s operation",async(kind)=>{
  vi.useFakeTimers();
  const client={rpc:async()=>({data:kind==="link"?{...doc,file_path:`${owner}/file.pdf`}:{id:id(101),committed:false,path:`${owner}/file.pdf`,object_exists:true}}),storage:{from:()=>({createSignedUrl:stalled,remove:stalled})}};
  const pending=kind==="link"?documentLink(client,doc):recoverUpload(client,id(101));
  await vi.advanceTimersByTimeAsync(15000);const result=await pending;expect(result.ok).toBe(false);expect(result.error).toContain("timed out");
  if(kind==="cleanup")expect(result.cleanupPending).toBe(true);
});
it("reconciles a timed-out upload without deleting a committed document",async()=>{
  vi.useFakeTimers();const remove=vi.fn();let finish;
  const client={rpc:async name=>({data:name==="stage_document_upload"?{id:doc.id,upload:{id:id(101),file_path:`${owner}/file.pdf`,document_id:doc.id}}:{id:id(101),committed:true,document:{...doc,upload_version:2}}}),storage:{from:()=>({upload:()=>new Promise(resolve=>{finish=resolve;}),remove})}};
  const pending=uploadDocument(client,doc,{name:"file.pdf",type:"application/pdf",size:20});
  await vi.advanceTimersByTimeAsync(60000);expect(await pending).toMatchObject({ok:true,reconciled:true});expect(remove).not.toHaveBeenCalled();
  finish({data:{}});await Promise.resolve();expect(remove).not.toHaveBeenCalled();
});
it("uses Manila boundaries for attendance and inclusive audit date filters",()=>{
  const query={lte:vi.fn().mockReturnThis(),gte:vi.fn().mockReturnThis(),lt:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis()};
  attendancePeriod(query,"week",new Date("2026-10-07T20:00:00Z"));expect(query.gte).toHaveBeenCalledWith("log_date","2026-10-05");
  auditScope({start:"2026-10-08",end:"2026-10-08",actor:teacher,table:"documents"})(query);
  expect(query.gte).toHaveBeenCalledWith("created_at","2026-10-08T00:00:00+08:00");expect(query.lt).toHaveBeenCalledWith("created_at","2026-10-09T00:00:00+08:00");
  expect(query.eq).toHaveBeenCalledWith("event_data->>table","documents");
  expect(()=>auditScope({start:"2026-02-30"})).toThrow(/valid/);expect(()=>auditScope({actor:"forged"})).toThrow(/valid/);
  expect(auditChanges({changed_fields:["status","secret"],previous_status:"Pending",status:"Active"})).toContainEqual({field:"secret",before:"Not recorded",after:"Not recorded"});
});
it("requests generic account emails with explicit callback URLs and handles rate limits",async()=>{
  vi.stubGlobal("window",{location:{origin:"https://synthetic.invalid",pathname:"/insync/"}});
  const resetPasswordForEmail=vi.fn(async()=>({})),resend=vi.fn(async()=>({})),client={auth:{resetPasswordForEmail,resend}};
  expect(authRedirect(true)).toBe("https://synthetic.invalid/insync/?flow=recovery");
  expect(await requestAccountEmail(client,"reset","user@example.invalid")).toBe(recoveryMessage);
  expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.invalid",{redirectTo:"https://synthetic.invalid/insync/?flow=recovery"});
  expect(await requestAccountEmail(client,"confirm","user@example.invalid")).toBe(recoveryMessage);
  resend.mockResolvedValueOnce({error:{status:429,message:"private provider detail"}});
  await expect(requestAccountEmail(client,"confirm","user@example.invalid")).rejects.toThrow(/Too many/);
  await expect(requestAccountEmail(client,"reset","invalid")).rejects.toThrow(/valid email/);
});
it("isolates reload-safe drafts and keeps uncertain identities beyond draft expiry",()=>{
  const storage={getItem:key=>storage[key]??null,setItem:(key,value)=>{storage[key]=value;},removeItem:key=>{delete storage[key];}};
  const form={title:"Reminder",body:"Submit reports",target:"All Interns"},attempt={id:id(101),fingerprint:"content",uncertain:true};
  expect(writeAnnouncementDraft(teacher,form,attempt,storage)).toBe(true);
  expect(readAnnouncementDraft(teacher,storage,Date.now()+48*3600000)?.attempt.id).toBe(attempt.id);
  expect(readAnnouncementDraft(id(3),storage)).toBeNull();
  writeAnnouncementDraft(id(3),form,null,storage);clearUnsentAnnouncementDrafts(storage);
  expect(readAnnouncementDraft(id(3),storage)).toBeNull();expect(readAnnouncementDraft(teacher,storage)).toBeTruthy();
  expect(writeAnnouncementDraft(teacher,form,attempt,{setItem(){throw Error("Disabled");}})).toBe(false);
});
it("rejects account changes while reading pages and server metrics",async()=>{
  const data={alerts:[{id:id(100)}]};let reads=0;
  const client={rpc:async()=>({data:{status:"Active",role:"intern",id:++reads===1?owner:id(5)}}),from:table=>queryResponse(data,table)};
  await expect(completeRows(client,"alerts")).rejects.toThrow(/Account changed/);
  await expect(dashboardMetrics({rpc:async()=>({data:{actorId:id(5),actorRole:"intern",total:0,rows:[]}})},owner)).rejects.toThrow(/account changed/);
  const metric={checklist:{known:true}};
  const rpc=vi.fn().mockResolvedValueOnce({data:{actorId:owner,actorRole:"intern",total:2,rows:[{id:id(1),metric}]}})
    .mockResolvedValueOnce({data:{actorId:owner,actorRole:"admin",total:2,rows:[{id:id(2),metric}]}});
  await expect(dashboardMetrics({rpc},owner)).rejects.toThrow(/account changed/);
});

it("completes the owner-scoped recovery RPC below its API cap",async()=>{
 const data={document_versions:Array.from({length:8},(_,n)=>({id:id(400+n),intern_id:owner}))};
 const rpc=vi.fn(async()=>({data:{id:owner,role:"intern",status:"Active"}}));
 const rows=await completeRows({rpc},"document_versions",undefined,{query:()=>queryResponse(data,"document_versions",{cap:2})});
 expect(rows).toHaveLength(8);expect(rpc).toHaveBeenCalledTimes(2);
});

it("preserves exact-count headers when paging the recovery RPC through the actual SDK",async()=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify([{id:id(400)}]),{status:200,headers:{"Content-Type":"application/json","Content-Range":"0-0/1"}}));
 const client=createClient("https://synthetic.invalid","synthetic-public-placeholder",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
 const rows=await readRows(client,"document_versions","*",undefined,{query:()=>client.rpc("unfinished_document_uploads",{},{count:"exact"})});
 expect(rows).toHaveLength(1);expect(transport).toHaveBeenCalledTimes(3);
 for(const [url,options] of transport.mock.calls){expect(url).toContain("/rpc/unfinished_document_uploads");expect(new Headers(options.headers).get("Prefer")).toContain("count=exact");}
});

it("measures six complete raw-history requests versus one metric RPC at 300 rows",async()=>{
 const data={attendance_logs:Array.from({length:300},(_,n)=>({id:id(500+n),intern_id:owner}))};
 const from=vi.fn(table=>queryResponse(data,table,{cap:250})),rpc=vi.fn(async()=>({data:{id:owner,role:"intern",status:"Active"}}));
 expect(await completeRows({from,rpc},"attendance_logs",owner)).toHaveLength(300);
 const rawRequests=from.mock.calls.length+rpc.mock.calls.length;expect(rawRequests).toBe(6);
 const aggregate=vi.fn(async()=>({data:{actorId:owner,actorRole:"intern",total:1,rows:[{id:owner,metric:{checklist:{known:true}}}]}}));
 await dashboardMetrics({rpc:aggregate},owner);expect(aggregate).toHaveBeenCalledTimes(1);
 console.info("Synthetic metric request counts",JSON.stringify({records:300,apiCap:250,rawRequests,aggregateRequests:aggregate.mock.calls.length}));
});

it("stops issuing metric pages after the complete traversal deadline",async()=>{
 vi.useFakeTimers();let page=0;
 const rpc=vi.fn(()=>new Promise(resolve=>{const row={id:id(++page),metric:{checklist:{known:true}}};setTimeout(()=>resolve({data:{actorId:owner,actorRole:"intern",total:10,rows:[row]}}),6000);}));
 const result=dashboardMetrics({rpc},owner).catch(error=>error);
 await vi.advanceTimersByTimeAsync(20000);expect((await result).message).toContain("timed out");expect(rpc).toHaveBeenCalledTimes(4);
 await vi.advanceTimersByTimeAsync(60000);expect(rpc).toHaveBeenCalledTimes(4);
});
