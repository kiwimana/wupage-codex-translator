import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatGPTDesktopProvider } from "../src/background/chatgpt-desktop";
import { DEFAULT_SETTINGS } from "../src/shared/defaults";
import { translateWithSettings } from "../src/background/translation";

function bridge() {
  const messages: Array<(message: unknown) => void> = [];
  const closed: Array<() => void> = [];
  const port = { onMessage: { addListener: (fn: (value: unknown) => void) => messages.push(fn) },
    onDisconnect: { addListener: (fn: () => void) => closed.push(fn) }, postMessage: vi.fn(), disconnect: vi.fn() };
  const connectNative = vi.fn(() => port);
  const storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) };
  vi.stubGlobal("chrome", { runtime: { connectNative }, storage: { local: storage } });
  return { port, connectNative, storage, reply: (message: unknown) => messages.forEach(fn => fn(message)),
    close: () => closed.forEach(fn => fn()) };
}
const config = { id: "chatgpt-desktop", type: "chatgpt-desktop" as const, label: "ChatGPT", model: "" };
const request = { texts: ["Hello world"], targetLang: "zh-TW", sourceLang: "en" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("on-demand ephemeral desktop translation", () => {
  it("does not start a native host when created or validated", () => {
    const fake = bridge(); const provider = new ChatGPTDesktopProvider(config);
    expect(provider.validateConfig()).toEqual({ ok: true });
    expect(fake.connectNative).not.toHaveBeenCalled();
  });
  it("returns translated text and releases the native connection", async () => {
    const fake = bridge(); const result = new ChatGPTDesktopProvider(config).translateBatch(request);
    expect(fake.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "translate", ...request }));
    fake.reply({ ok: true, translations: ["你好，世界"] });
    await expect(result).resolves.toEqual(["你好，世界"]);
    expect(fake.port.disconnect).toHaveBeenCalledOnce();
  });
  it.each(["codex", "gemini", "claude"] as const)("passes %s and its model through the local bridge without opening another service", async engine => {
    const fake = bridge();
    const result = new ChatGPTDesktopProvider({ ...config, engine, model: "selected-model" }).translateBatch(request);
    expect(fake.port.postMessage).toHaveBeenCalledWith({type:"detect",engine});
    fake.reply({ok:true,engine,installed:true,login:"unchecked",bridgeVersion:2});
    await vi.waitFor(()=>expect(fake.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:"translate"})));
    expect(fake.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ engine, model: "selected-model" }));
    fake.reply({ ok: true, translations: ["你好"] }); await expect(result).resolves.toEqual(["你好"]);
    expect(fake.connectNative).toHaveBeenCalledTimes(2);
  });
  it("rejects an old bridge before it can silently translate with the wrong engine or model",async()=>{
    const fake=bridge();
    const result=new ChatGPTDesktopProvider({...config,engine:"gemini",model:"flash"}).translateBatch(request);
    fake.reply({ok:false,error:"Invalid request"});
    await expect(result).rejects.toThrow("更新橋接");
    expect(fake.port.postMessage.mock.calls.some(([r])=>r.type==="translate")).toBe(false);
  });
  it("disconnects on stop and cannot publish a late response", async () => {
    const fake = bridge(); const controller = new AbortController();
    const result = new ChatGPTDesktopProvider(config).translateBatch(request, controller.signal);
    controller.abort(); fake.reply({ ok: true, translations: ["過期"] });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.port.disconnect).toHaveBeenCalledOnce();
  });
  it("never opens a host for a task already cancelled", async () => {
    const fake = bridge(); const controller = new AbortController(); controller.abort();
    await expect(new ChatGPTDesktopProvider(config).translateBatch(request, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.connectNative).not.toHaveBeenCalled();
  });
  it("rejects a malformed response instead of inserting mismatched paragraphs", async () => {
    const fake = bridge(); const result = new ChatGPTDesktopProvider(config).translateBatch(request);
    fake.reply({ ok: true, translations: [] });
    await expect(result).rejects.toThrow("段落數量");
  });
  it("does not read or write translation cache even when an old setting enables it", async () => {
    const fake = bridge();
    fake.port.postMessage.mockImplementation(() => queueMicrotask(() => fake.reply({ ok: true, translations: ["你好，世界"] })));
    const result = await translateWithSettings({ ...DEFAULT_SETTINGS, activeProviderId: config.id,
      cacheEnabled: true, providers: [config] }, request);
    expect(result).toEqual({ translations: ["你好，世界"], cached: 0 });
    expect(fake.storage.get).not.toHaveBeenCalled(); expect(fake.storage.set).not.toHaveBeenCalled();
  });
  it("ends a timed-out connection without retrying or choosing another service", async () => {
    vi.useFakeTimers(); const fake = bridge();
    const result = new ChatGPTDesktopProvider(config).translateBatch(request);
    const rejected = expect(result).rejects.toThrow("逾時");
    await vi.advanceTimersByTimeAsync(180000); await rejected;
    expect(fake.connectNative).toHaveBeenCalledOnce(); expect(fake.port.disconnect).toHaveBeenCalledOnce();
  });
});
