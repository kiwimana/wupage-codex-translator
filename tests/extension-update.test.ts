import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compareVersions, releaseUpdate, UPDATE_KEY } from "../src/shared/extension-update";
import { checkUpdates, configureUpdates, installUpdate, updateStatus } from "../src/background/extension-update";
vi.mock("../src/background/translation",()=>({getTranslationDebugSnapshot:()=>({activeCount:0})}));
const release=(version="1.9.0")=>({draft:false,prerelease:false,tag_name:`v${version}`,assets:[{name:`wupage-codex-${version}-chrome.zip`,size:100,browser_download_url:`https://github.com/kiwimana/wupage-codex-translator/releases/download/v${version}/wupage-codex-${version}-chrome.zip`}]});
let saved: Record<string,unknown>;
let native: ReturnType<typeof vi.fn>;
beforeEach(()=>{
  saved={};native=vi.fn(()=>{throw new Error('No bridge in test');});
  vi.stubGlobal('chrome',{runtime:{getManifest:()=>({version:'1.8.1'}),connectNative:native},storage:{local:{get:vi.fn(async()=>structuredClone(saved)),set:vi.fn(async(value)=>{Object.assign(saved,structuredClone(value));})}},alarms:{create:vi.fn(async()=>{}),clear:vi.fn(async()=>{})}});
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,text:async()=>JSON.stringify(release())})));
});
afterEach(()=>{vi.unstubAllGlobals();});
it('compares versions numerically including different component counts',()=>{
  expect(compareVersions('1.10.0','1.9.9')).toBe(1);expect(compareVersions('1.9','1.9.0')).toBe(0);expect(compareVersions('1.8.0.9','1.8.1')).toBe(-1);
  expect(()=>compareVersions('1.9.0-beta','1.8')).toThrow();
});
it('rejects prereleases, foreign URLs and oversized assets',()=>{
  expect(()=>releaseUpdate({...release(),prerelease:true},'chrome')).toThrow();
  const data=release();data.assets[0].browser_download_url='https://example.com/update.zip';expect(()=>releaseUpdate(data,'chrome')).toThrow();
  const large=release();large.assets[0].size=10_000_000;expect(()=>releaseUpdate(large,'chrome')).toThrow();
});
it('opens update status without contacting native accounts or GitHub',async()=>{
  expect(await updateStatus()).toMatchObject({autoCheck:true,autoInstall:false,available:false,currentVersion:'1.8.1'});
  expect(fetch).not.toHaveBeenCalled();expect(native).not.toHaveBeenCalled();
});
it('coalesces checks, persists an update notification, and never connects to AI',async()=>{
  const [a,b]=await Promise.all([checkUpdates(),checkUpdates()]);
  expect(a).toEqual(b);expect(a).toMatchObject({latestVersion:'1.9.0',available:true});expect(fetch).toHaveBeenCalledTimes(1);expect(native).not.toHaveBeenCalled();
});
it('reports network failure while preserving the previous known version',async()=>{
  await checkUpdates();vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  expect(await checkUpdates()).toMatchObject({error:'offline',latestVersion:'1.9.0'});
});
it('can disable checks without native access and refuses automatic installs without a bridge',async()=>{
  expect(await configureUpdates(false,false)).toMatchObject({autoCheck:false,autoInstall:false});
  expect(native).not.toHaveBeenCalled();await expect(configureUpdates(true,true)).rejects.toThrow();
  expect((saved[UPDATE_KEY] as {autoInstall:boolean}).autoInstall).toBe(false);
});
it('does not connect to the native host when there is no newer version',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify(release('1.8.1'))} as Response);
  expect(await installUpdate()).toMatchObject({available:false});expect(native).not.toHaveBeenCalled();
});
it('never offers native automatic installation to a temporary Firefox build',async()=>{
  chrome.runtime.getManifest=()=>({manifest_version:3,name:'Fixture',version:'1.8.1',browser_specific_settings:{}} as chrome.runtime.ManifestV3);
  await expect(configureUpdates(true,true)).rejects.toThrow('Firefox');await expect(installUpdate()).rejects.toThrow('Firefox');expect(native).not.toHaveBeenCalled();
});
