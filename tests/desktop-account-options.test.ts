// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterEach,expect,it,vi} from "vitest";
import type {RuntimeRequest} from "../src/shared/types";
vi.mock("../src/shared/chatgpt-build",()=>({CHATGPT_BUILD:true}));
afterEach(()=>{window.dispatchEvent(new Event("pagehide"));vi.unstubAllGlobals();document.documentElement.replaceChildren();});

async function setup(id="claude-desktop") {
  vi.resetModules();document.open();document.write(readFileSync(resolve("options.html"),"utf8"));document.close();
  const {DEFAULT_SETTINGS}=await import("../src/shared/defaults");
  const {normalizeSettings}=await import("../src/shared/settings");
  let settings=structuredClone(DEFAULT_SETTINGS);settings.activeProviderId=id;
  const sendMessage=vi.fn(async(request:RuntimeRequest)=>{
    if(request.type==="GET_SETTINGS")return {ok:true,data:structuredClone(settings)};
    if(request.type==="SAVE_SETTINGS"){settings=normalizeSettings(request.settings);return {ok:true};}
    if(request.type==="DESKTOP_ACCOUNT_STATUS"||request.type==="CONNECT_DESKTOP_ACCOUNT")return {ok:true,data:{engine:request.engine,installed:true,login:"unchecked",bridgeVersion:2,launched:request.type==="CONNECT_DESKTOP_ACCOUNT"}};
    if(request.type==="GET_OCR_STATUS")return {ok:true,data:{state:"missing",downloaded:0,total:0}};
    return {ok:true};
  });
  vi.stubGlobal("chrome",{runtime:{id:"test",sendMessage}});
  await import("../src/options/index");
  await vi.waitFor(()=>expect(document.querySelector<HTMLElement>("#providerForm")!.dataset.providerId).toBe(id));
  return {sendMessage,settings:()=>settings};
}

it("never detects, logs in or translates when settings opens; detection and connection require separate clicks",async()=>{
  const state=await setup();
  const detect=document.querySelector<HTMLButtonElement>("[data-action='desktop-detect']")!;
  const connect=document.querySelector<HTMLButtonElement>("[data-action='desktop-connect']")!;
  const status=document.querySelector<HTMLElement>("[data-role='desktop-account-status']")!;
  expect(status.textContent).toContain("尚未偵測");expect(connect.disabled).toBe(true);
  expect(state.sendMessage.mock.calls.some(([r])=>["DESKTOP_ACCOUNT_STATUS","CONNECT_DESKTOP_ACCOUNT","TEST_PROVIDER"].includes(r.type))).toBe(false);
  detect.click();await vi.waitFor(()=>expect(connect.disabled).toBe(false));
  expect(status.textContent).toContain("帳號尚未驗證");
  expect(state.sendMessage).toHaveBeenCalledWith({type:"DESKTOP_ACCOUNT_STATUS",engine:"claude"});
  expect(state.sendMessage.mock.calls.some(([r])=>r.type==="CONNECT_DESKTOP_ACCOUNT")).toBe(false);
  connect.click();await vi.waitFor(()=>expect(status.textContent).toContain("已開啟登入視窗"));
  expect(status.textContent).toContain("尚未驗證");
  expect(state.sendMessage.mock.calls.some(([r])=>r.type==="TEST_PROVIDER")).toBe(false);
});

it.each([['chatgpt-desktop','gpt-6-luna'],['gemini-desktop','flash'],['claude-desktop','haiku']])("saves %s's model without invoking translation",async(id,model)=>{
  const state=await setup(id),select=document.querySelector<HTMLSelectElement>("#providerModel")!;
  expect(select.options[0].textContent).toContain("自動");select.value=model;select.dispatchEvent(new Event("change",{bubbles:true}));
  document.querySelector<HTMLButtonElement>("#save")!.click();
  await vi.waitFor(()=>expect(state.settings().providers.find(p=>p.id===id)).toMatchObject({model}));
  expect(state.sendMessage.mock.calls.some(([r])=>r.type==="TEST_PROVIDER"||r.type==="CONNECT_DESKTOP_ACCOUNT")).toBe(false);
});
