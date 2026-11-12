// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/defaults";
import { initFloatingBall } from "../src/content/floating";
import { clearPageTranslation } from "../src/content/page-translation";
import { sendRuntimeRequest } from "../src/content/runtime";
vi.mock("../src/shared/chatgpt-build", () => ({ CHATGPT_BUILD:true }));
vi.mock("../src/content/runtime", () => ({ sendRuntimeRequest:vi.fn() }));
const positionKey="wupage.floating.position";
let emit: (changes: Record<string,{newValue:unknown}>,area:string)=>void;
let documentListeners: ReturnType<typeof vi.spyOn>;
let windowListeners: ReturnType<typeof vi.spyOn>;
const ball=()=>document.getElementById("wupage-floating-ball") as HTMLButtonElement;
const hitbox=()=>document.getElementById("wupage-floating-hitbox")!;
beforeEach(async()=>{
  document.documentElement.innerHTML='<head></head><body><p>This paragraph should be translated on click.</p></body>';
  const listeners=new Set<typeof emit>();emit=(changes,area)=>listeners.forEach(fn=>fn(changes,area));
  vi.stubGlobal("chrome",{runtime:{id:"test"},storage:{local:{get:async()=>({[positionKey]:{left:1190,top:400,edge:"right"}}),set:vi.fn(async()=>{})},onChanged:{addListener:(fn:typeof emit)=>listeners.add(fn),removeListener:(fn:typeof emit)=>listeners.delete(fn)}}});
  vi.mocked(sendRuntimeRequest).mockImplementation(async request=>{
    if(request.type==="GET_SETTINGS")return structuredClone(DEFAULT_SETTINGS);
    if(request.type==="GET_OCR_STATUS")return {state:"missing",total:0,downloaded:0};
    if(request.type==="TRANSLATE_BATCH")return {translations:request.texts.map(()=>"按下按鈕才翻譯這個段落。"),cached:0};
    return undefined;
  });
  Object.defineProperty(window,"innerWidth",{configurable:true,value:1200});
  Object.defineProperty(window,"innerHeight",{configurable:true,value:800});
  vi.spyOn(Element.prototype,"getBoundingClientRect").mockImplementation(function(this:Element){
    return this.id==="wupage-floating-ball"?new DOMRect(parseFloat(hitbox().style.left)+10,parseFloat(hitbox().style.top)+10,52,52):new DOMRect(10,100,600,24);
  });
  documentListeners=vi.spyOn(document,"addEventListener");windowListeners=vi.spyOn(window,"addEventListener");
  initFloatingBall();await vi.waitFor(()=>expect(hitbox().hidden).toBe(false));
  ball().setPointerCapture=vi.fn();
});
afterEach(()=>{
  clearPageTranslation();
  vi.clearAllTimers();vi.useRealTimers();
  for(const args of documentListeners.mock.calls)document.removeEventListener(...args as Parameters<Document["removeEventListener"]>);
  for(const args of windowListeners.mock.calls)window.removeEventListener(...args as Parameters<Window["removeEventListener"]>);
  vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(sendRuntimeRequest).mockReset();document.documentElement.replaceChildren();
});
function pointer(type:string,x:number,y:number){const event=new Event(type,{bubbles:true});Object.defineProperties(event,{clientX:{value:x},clientY:{value:y},pointerId:{value:1},pointerType:{value:"mouse"},button:{value:0}});return event;}
const requests=()=>vi.mocked(sendRuntimeRequest).mock.calls.filter(([r])=>r.type==="TRANSLATE_BATCH");
it("keeps old docked positions fully visible on both edges",()=>{
  expect(ball().getBoundingClientRect().right).toBe(1188);
  expect(hitbox().style.getPropertyValue("--wp-floating-size")).toBe("52px");
  emit({[positionKey]:{newValue:{left:-20,top:400,edge:"left"}}},"local");
  expect(ball().getBoundingClientRect().left).toBe(12);
});
it("clicking the outer target starts translation exactly once",async()=>{
  hitbox().click();await vi.waitFor(()=>expect(requests()).toHaveLength(1));
});
it("accepts an ordinary click with eight pixels of mouse movement",async()=>{
  ball().dispatchEvent(pointer("pointerdown",1150,420));
  ball().dispatchEvent(pointer("pointermove",1158,420));
  ball().dispatchEvent(pointer("pointerup",1158,420));ball().click();
  await vi.waitFor(()=>expect(requests()).toHaveLength(1));
});
it("dragging from the outer target moves the ball without translating",()=>{
  hitbox().dispatchEvent(pointer("pointerdown",1128,420));
  ball().dispatchEvent(pointer("pointermove",900,420));
  ball().dispatchEvent(pointer("pointerup",900,420));hitbox().click();
  expect(ball().getBoundingClientRect().left).toBeLessThan(1000);
  expect(requests()).toHaveLength(0);
});
const tools=()=>document.querySelector<HTMLElement>(".wupage-floating-tools")!;
const settingsButton=()=>document.getElementById("wupage-floating-settings") as HTMLButtonElement;
const menu=()=>document.getElementById("wupage-floating-menu")!;
it("reveals only one settings action on hover without opening a panel or translating",()=>{
  vi.useFakeTimers();
  expect(tools().hidden).toBe(true);
  hitbox().dispatchEvent(pointer("pointerenter",1150,420));
  vi.advanceTimersByTime(900);
  expect(tools().hidden).toBe(false);
  expect(tools().querySelectorAll("button")).toHaveLength(1);
  expect(menu().hidden).toBe(true);
  expect(requests()).toHaveLength(0);
  hitbox().dispatchEvent(pointer("pointerleave",1100,420));
  vi.advanceTimersByTime(300);
  expect(tools().hidden).toBe(true);
});
it("opens a persistent settings panel without triggering translation or drag",()=>{
  vi.useFakeTimers();
  hitbox().dispatchEvent(pointer("pointerenter",1150,420));
  settingsButton().dispatchEvent(pointer("pointerdown",1150,490));
  settingsButton().click();
  expect(menu().hidden).toBe(false);
  expect(settingsButton().getAttribute("aria-expanded")).toBe("true");
  hitbox().dispatchEvent(pointer("pointerleave",900,420));
  menu().dispatchEvent(pointer("pointerleave",900,420));
  vi.advanceTimersByTime(900);
  expect(menu().hidden).toBe(false);
  expect(requests()).toHaveLength(0);
  document.querySelector("p")!.click();
  expect(menu().hidden).toBe(true);
  expect(tools().hidden).toBe(true);
  expect(settingsButton().getAttribute("aria-expanded")).toBe("false");
});
it("can toggle settings closed and dismiss the tools with Escape",()=>{
  settingsButton().click();expect(menu().hidden).toBe(false);
  settingsButton().click();expect(menu().hidden).toBe(true);
  settingsButton().click();
  document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  expect(menu().hidden).toBe(true);expect(tools().hidden).toBe(true);
  expect(requests()).toHaveLength(0);
});
it("places settings above a low ball and below it again when moved up",()=>{
  emit({[positionKey]:{newValue:{left:1100,top:730,edge:"right"}}},"local");
  expect(hitbox().dataset.toolsPlacement).toBe("above");
  emit({[positionKey]:{newValue:{left:1100,top:100,edge:"right"}}},"local");
  expect(hitbox().dataset.toolsPlacement).toBe("below");
});
