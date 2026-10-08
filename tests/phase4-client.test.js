import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { documentLink, recoverUpload, uploadDocument, validateDocument } from "../src/lib/documents";
import { announcementFeed, saveAssignment, saveEvaluation } from "../src/lib/workflows";

const internId="00000000-0000-4000-8000-000000000004", docId="00000000-0000-4000-8000-000000000100", uploadId="00000000-0000-4000-8000-000000000101";
const doc={id:docId,intern_id:internId,upload_version:1,review_revision:2};
const file={name:"../../Original name.pdf",type:"application/pdf",size:20};
const path=`${internId}/${uploadId}.pdf`;
function client(options={}) {
  const storage={upload:vi.fn(async()=>({data:{path},error:options.uploadError?{message:"Synthetic upload failed"}:null})),
    remove:vi.fn(async()=>({data:options.zeroDelete?[]:[{name:path}],error:options.cleanupError?{message:"Synthetic cleanup failed"}:null})),
    createSignedUrl:vi.fn(async()=>options.signError?{error:{message:"Missing or forbidden synthetic file"}}:{data:{signedUrl:options.url||"https://synthetic.invalid/private/signed"}})};
  const rpc=vi.fn(async(name)=>{
    if(name==="stage_document_upload")return {data:{id:docId,upload:{id:uploadId,document_id:docId,file_path:path}}};
    if(name==="finalize_document_upload")return options.finalizeError?{error:{message:"Synthetic finalize response lost"}}:{data:{...doc,upload_version:2}};
    if(name==="cancel_document_upload")return options.recoveryError?{error:{message:"Synthetic recovery unavailable"}}:{data:{id:uploadId,committed:!!options.committed,document:options.committed?{...doc,upload_version:2}:null,path,object_exists:options.objectExists!==false}};
    if(name==="document_access")return options.accessError?{error:{message:"Evidence changed; refresh"}}:{data:{id:docId,file_path:path,file_name:file.name}};
    return {data:[]};
  });
  return {rpc,storage:{from:vi.fn(()=>storage)},methods:storage};
}
describe("Phase 4 persisted workflows and transport failures",()=>{
  it.each([{...file,size:0},{...file,size:10485761},{...file,type:"text/html"},{...file,name:"\nmalicious"}])("rejects invalid file before reserving or uploading: %j",async(value)=>{
    const c=client(); expect(validateDocument(value)).toBeTruthy();
    expect((await uploadDocument(c,doc,value)).ok).toBe(false); expect(c.rpc).not.toHaveBeenCalled();
  });
  it("uploads to the server-generated path and returns committed document",async()=>{
    const c=client(); const result=await uploadDocument(c,doc,file);
    expect(result).toMatchObject({ok:true,data:{id:docId,upload_version:2}});
    expect(c.methods.upload).toHaveBeenCalledWith(path,file,{upsert:false,contentType:"application/pdf"});
    expect(c.methods.remove).not.toHaveBeenCalled();
  });
  it("cleans up after failed metadata only when server confirms uncommitted",async()=>{
    const c=client({finalizeError:true}); const result=await uploadDocument(c,doc,file);
    expect(result).toMatchObject({ok:false,cleanupPending:false});
    expect(c.methods.remove).toHaveBeenCalledWith([path]);
    expect(c.rpc.mock.calls.map(c=>c[0])).toEqual(["stage_document_upload","finalize_document_upload","cancel_document_upload"]);
  });
  it("recovers a committed lost response without deleting evidence",async()=>{
    const c=client({finalizeError:true,committed:true}); const result=await uploadDocument(c,doc,file);
    expect(result).toMatchObject({ok:true,reconciled:true,data:{upload_version:2}});
    expect(c.methods.remove).not.toHaveBeenCalled();
  });
  it("preserves uncertain evidence if recovery or cleanup fails",async()=>{
    const c=client({finalizeError:true,recoveryError:true});
    expect(await uploadDocument(c,doc,file)).toMatchObject({ok:false,cleanupPending:true});
    expect(c.methods.remove).not.toHaveBeenCalled();
    expect(await uploadDocument(client({finalizeError:true,cleanupError:true}),doc,file)).toMatchObject({ok:false,cleanupPending:true});
    expect(await recoverUpload(client({zeroDelete:true}),uploadId)).toMatchObject({ok:false,cleanupPending:true});
    expect(await recoverUpload(client({zeroDelete:true,objectExists:false}),uploadId)).toMatchObject({ok:false,cleanupPending:false});
  });
  it("cleans up an uncertain upload failure through the same authoritative recovery",async()=>{
    const c=client({uploadError:true}); const r=await uploadDocument(c,doc,file);
    expect(r.ok).toBe(false); expect(c.methods.remove).toHaveBeenCalledOnce();
    expect(c.rpc).not.toHaveBeenCalledWith("finalize_document_upload",expect.anything());
  });
  it("uses expected version/revision and a short signed URL, with missing/forbidden/error handling",async()=>{
    const c=client(); const r=await documentLink(c,doc,true);
    expect(r.ok).toBe(true); expect(r.expiresAt-Date.now()).toBeLessThanOrEqual(60000);
    expect(c.rpc).toHaveBeenCalledWith("document_access",{p_id:docId,p_expected_version:1,p_expected_revision:2});
    expect(c.methods.createSignedUrl).toHaveBeenCalledWith(path,60,{download:file.name});
    const denied=client({accessError:true}); expect((await documentLink(denied,doc)).ok).toBe(false);
    expect(denied.methods.createSignedUrl).not.toHaveBeenCalled();
    expect((await documentLink(client({signError:true}),doc)).ok).toBe(false);
    expect((await documentLink(client({url:"javascript:alert(1)"}),doc)).ok).toBe(false);
  });
  it("validates targets before RPC, and zero-row/cardinality failures never report committed data",async()=>{
    const c={rpc:vi.fn(async()=>({data:[]}))};
    expect((await saveAssignment(c,internId,{required_hours:""})).ok).toBe(false); expect(c.rpc).not.toHaveBeenCalled();
    expect((await saveAssignment(c,internId,{required_hours:"123.45"})).ok).toBe(false);
    expect(c.rpc).toHaveBeenCalledWith("admin_set_assignment",expect.objectContaining({p_required_hours:123.45,p_instructor_id:null,p_section_id:null}));
    expect((await saveEvaluation(c,internId,{punctuality:4,performance:5,conduct:3,communication:2},"",uploadId)).ok).toBe(false);
  });
  it("actual Admin handler preserves draft/state and omits success/audit refresh on zero rows",async()=>{
    const source=readFileSync(new URL("../src/components/AdminDashboard.jsx",import.meta.url),"utf8");
    const a=source.indexOf("  const saveInternAssignment ="),b=source.indexOf("  const attachStandardDocs =",a);
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a);
    const applyIntern=vi.fn(),refreshAudit=vi.fn(),toast=vi.fn(),setBusy=vi.fn();
    const handler=new Function("savingInternId","internForms","setSavingInternId","saveAssignment","supabase","applyIntern","refreshAudit","toast",`${source.slice(a,b)};return saveInternAssignment;`)(null,{[internId]:{required_hours:"100"}},setBusy,saveAssignment,{rpc:async()=>({data:[]})},applyIntern,refreshAudit,toast);
    await handler(internId);
    expect(applyIntern).not.toHaveBeenCalled(); expect(refreshAudit).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("No single record"),"error"); expect(setBusy).toHaveBeenLastCalledWith(null);
  });
  it("announcement failure is explicit, never an empty success feed",async()=>{
    const c={rpc:async()=>({error:{message:"Synthetic messages offline"}})};
    expect(await announcementFeed(c)).toMatchObject({ok:false,data:null,error:"Synthetic messages offline"});
  });
});
