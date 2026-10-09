// @vitest-environment jsdom
import { act, lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ErrorBoundary from "../src/components/ErrorBoundary";
import LoginPage from "../src/components/LoginPage";
import RecoverPassword from "../src/components/RecoverPassword";
import TimeInput, { joinTime, splitTime } from "../src/components/TimeInput";
import Shell from "../src/components/Shell";
import RefreshStatus from "../src/components/RefreshStatus";
import { ToastProvider, useToast } from "../src/components/Toast";
import { installMonitoring } from "../src/lib/monitoring";

const { auth } = vi.hoisted(() => ({auth:{resetPasswordForEmail:vi.fn(),resend:vi.fn(),updateUser:vi.fn()}}));
vi.mock("../src/lib/supabaseClient",()=>({supabase:{auth}}));
let root,container;
beforeEach(()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);
  auth.resetPasswordForEmail.mockResolvedValue({});auth.resend.mockResolvedValue({});auth.updateUser.mockResolvedValue({data:{user:{id:"owner"}}});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
async function render(element){await act(async()=>root.render(element));}
async function enter(input,value){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
async function click(text){const button=[...container.querySelectorAll("button")].find(button=>button.textContent.trim()===text);expect(button).toBeTruthy();await act(async()=>button.click());}
async function select(label,value){await act(async()=>{const input=container.querySelector(`[aria-label="${label}"]`);input.value=value;input.dispatchEvent(new Event("change",{bubbles:true}));});}

it.each(["render","lazy import"])("recovers a %s failure with an explicit accessible action",async(kind)=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  function Failed(){throw Error("Synthetic private failure");}
  const FailedImport=lazy(async()=>{throw Error("Synthetic chunk failure");});
  await render(<ErrorBoundary><Suspense fallback={<p>Loading</p>}>{kind==="render"?<Failed/>:<FailedImport/>}</Suspense></ErrorBoundary>);
  expect(container.querySelector('[role="alert"]').textContent).toContain("screen failed");
  expect(container.textContent).toContain("Reload INSync");expect(container.textContent).not.toContain("Synthetic private");
});
it("associates login labels, requests a generic reset and enforces cooldown",async()=>{
  await render(<LoginPage/>);
  const label=[...container.querySelectorAll("label")].find(label=>label.textContent.trim()==="Email Address");
  const input=container.querySelector(`[id="${label.htmlFor}"]`);expect(input).toBeTruthy();
  await enter(input,"person@example.invalid");await click("Forgot password?");
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);expect(container.querySelector('[role="status"]').textContent).toContain("If this address is eligible");
  await click("Resend confirmation");expect(auth.resend).not.toHaveBeenCalled();expect(container.textContent).toContain("Wait one minute");
  expect(container.querySelector('[aria-label="Show password"]')).toBeTruthy();
});
it("bounds a stalled recovery email request without a success message",async()=>{
  vi.useFakeTimers();auth.resetPasswordForEmail.mockImplementation(()=>new Promise(()=>{}));await render(<LoginPage/>);
  await enter(container.querySelector('input[type="email"]'),"person@example.invalid");
  await act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent==="Forgot password?").click());
  await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(container.textContent).toContain("timed out");expect(container.querySelector('[role="status"]')).toBeNull();
});
it("requires an authorized session to update a password and checks returned identity",async()=>{
  const done=vi.fn();await render(<RecoverPassword session={null} onDone={done}/>);
  expect(container.querySelector('[role="alert"]').textContent).toContain("invalid, expired");expect(container.querySelector("form")).toBeNull();
  await render(<RecoverPassword session={{user:{id:"owner"}}} onDone={done}/>);
  await enter(container.querySelectorAll("input")[0],"New-private-password");await enter(container.querySelectorAll("input")[1],"New-private-password");
  auth.updateUser.mockResolvedValueOnce({data:{user:{id:"other"}}});
  await act(async()=>container.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(container.textContent).toContain("could not be updated");
  await act(async()=>container.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(container.textContent).toContain("Your password has been updated");expect(container.querySelectorAll("input")).toHaveLength(0);
});
it.each([["12","00","AM","00:00"],["12","00","PM","12:00"],["1","05","PM","13:05"]])("converts %s:%s %s into %s",(hour,minute,period,canonical)=>{
  expect(joinTime({hour,minute,period})).toBe(canonical);expect(splitTime(canonical)).toEqual({hour,minute,period});
});
it("preserves incomplete AM/PM entry, rejects invalid parts and resets canonical fields",async()=>{
  function Harness(){const [value,setValue]=useState("");return <><TimeInput label="Clock In" value={value} onChange={setValue}/><output>{value}</output><button onClick={()=>setValue("")}>Reset</button></>;}
  await render(<Harness/>);await select("Clock In hour","12");expect(container.querySelector("output").textContent).toBe("");
  await select("Clock In minute","00");await select("Clock In AM or PM","PM");expect(container.querySelector("output").textContent).toBe("12:00");
  await select("Clock In hour","");expect(container.querySelector('[aria-label="Clock In minute"]').value).toBe("00");expect(container.querySelector('[aria-label="Clock In AM or PM"]').value).toBe("PM");
  await select("Clock In hour","1");expect(container.querySelector("output").textContent).toBe("13:00");
  await click("Reset");expect(container.querySelector('[aria-label="Clock In hour"]').value).toBe("");
  expect(joinTime({hour:"13",minute:"00",period:"AM"})).toBe("");expect(joinTime({hour:"1",minute:"60",period:"AM"})).toBe("");
});
it("traps mobile-sheet focus, dismisses with Escape and returns focus",async()=>{
  await render(<Shell userName="Synthetic Intern" userRole="Intern" userEmail="user@example.invalid" activeTab="a" onTabChange={()=>{}} onLogout={()=>{}} navItems={Array.from({length:6},(_,index)=>({id:String(index),label:`Screen ${index}`,icon:<span/>}))}><p>Content</p></Shell>);
  const trigger=[...container.querySelectorAll("button")].find(button=>button.textContent==="More");trigger.focus();await act(async()=>trigger.click());
  const dialog=container.querySelector('[role="dialog"]');expect(dialog).toBeTruthy();expect(dialog.contains(document.activeElement)).toBe(true);
  const buttons=dialog.querySelectorAll("button");buttons[buttons.length-1].focus();await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true})));
  expect(document.activeElement).toBe(buttons[0]);await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  expect(container.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(trigger);
  await act(async()=>container.querySelector('[aria-label="Open profile"]').click());expect(container.querySelector('[role="dialog"]')).toBeTruthy();
});
it("exposes active navigation, skips to the workspace and preserves profile focus",async()=>{
  function Harness() {
    const [tab, setTab] = useState('0');
    return <Shell userName="Synthetic Intern" userEmail="user@example.invalid" userRole="Intern" activeTab={tab} onTabChange={setTab} onLogout={()=>{}}
      navItems={Array.from({length:6},(_,index)=>({id:String(index),label:`Screen ${index}`,icon:<span/>}))}><h1>Workspace content</h1></Shell>;
  }
  await render(<Harness/>);
  const mobile = container.querySelector('nav[aria-label="Mobile navigation"]');
  expect(mobile.querySelector('[aria-label="Screen 0"]').getAttribute('aria-current')).toBe('page');
  await act(async()=>container.querySelector('a').click());
  expect(document.activeElement).toBe(container.querySelector('main'));
  const profile = container.querySelector('aside [aria-label="Open profile"]');
  profile.focus(); await act(async()=>profile.click());
  expect(profile.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('[role="dialog"]').textContent).toContain('Synthetic Intern');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.activeElement).toBe(profile);
  await click('More');
  await act(async()=>[...container.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent==='Screen 5').click());
  expect(mobile.querySelector('[aria-haspopup="dialog"]').getAttribute('aria-current')).toBe('true');
  expect(container.querySelector('nav[aria-label="Main navigation"] [aria-label="Screen 5"]').getAttribute('aria-current')).toBe('page');
});
it("announces toast outcomes with their existing expiry",async()=>{
  vi.useFakeTimers();
  function Actions() { const {toast}=useToast(); return <><button onClick={()=>toast('Saved successfully')}>Save</button><button onClick={()=>toast('Save failed','error')}>Fail</button></>; }
  await render(<ToastProvider><Actions/></ToastProvider>);
  await click('Save'); await click('Fail');
  const notifications=container.querySelector('[aria-label="Notifications"]');
  expect(notifications.querySelector('[role="status"]').textContent).toContain('Saved successfully');
  expect(notifications.querySelector('[role="alert"]').textContent).toContain('Save failed');
  await act(async()=>vi.advanceTimersByTime(3000));
  expect(notifications.children).toHaveLength(0);
});
it("associates registration mismatch feedback without clearing the password draft",async()=>{
  await render(<LoginPage/>); await click('Register');
  const field = text => {
    const label=[...container.querySelectorAll('label')].find(label=>label.textContent===text);
    return document.getElementById(label.htmlFor);
  };
  await enter(field('Password'),'Original-password');
  await enter(field('Confirm Password'),'Different-password');
  const confirm=field('Confirm Password');
  expect(confirm.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(confirm.getAttribute('aria-describedby')).textContent).toContain('Passwords do not match');
  expect(field('Student ID').getAttribute('aria-required')).toBe('true');
  const toggle=container.querySelector('[aria-label="Show password"]');
  await act(async()=>toggle.click());
  expect(field('Password').value).toBe('Original-password');
  expect(field('Password').getAttribute('autocomplete')).toBe('new-password');
  await enter(confirm,'Original-password');
  expect(confirm.hasAttribute('aria-invalid')).toBe(false);
  expect(confirm.hasAttribute('aria-describedby')).toBe(false);
});
it("suggests refresh on return without replacing an unsaved input",async()=>{
  vi.useFakeTimers();const onRefresh=vi.fn();await render(<><RefreshStatus loading={false} lastUpdated={new Date(Date.now()-120000)} onRefresh={onRefresh}/><input defaultValue="Unsaved accomplishment"/></>);
  const input=container.querySelector("input");input.focus();await act(async()=>window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Data may have changed");expect(document.activeElement).toBe(input);expect(onRefresh).not.toHaveBeenCalled();
});
it("emits redacted monitoring events and cleans up all observers",()=>{
  const records=[],receive=event=>records.push(event.detail);window.addEventListener("insync:health",receive);const cleanup=installMonitoring();
  window.dispatchEvent(new ErrorEvent("error",{message:"Private secret",filename:"https://host.invalid/?token=secret"}));
  expect(records).toHaveLength(1);expect(Object.keys(records[0]).sort()).toEqual(["at","kind"]);expect(JSON.stringify(records)).not.toContain("secret");
  cleanup();window.dispatchEvent(new Event("offline"));expect(records).toHaveLength(1);window.removeEventListener("insync:health",receive);
});
