import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import chromeIdentity from './chrome-extension.json' with { type:'json' };
import { applyExtensionUpdate, validateRelease, checksumFrom, manageExtensionUpdate } from './extension-update.mjs';
const manifest=version=>({manifest_version:3,key:chromeIdentity.key,version,background:{service_worker:'background.js',type:'module'},permissions:['nativeMessaging']});
const bytes=Buffer.from('verified fixture'), hash=createHash('sha256').update(bytes).digest('hex');
const release={version:'1.9.0',size:bytes.length};
async function fixture(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wupage-update-test-'));
  try {
    const target=path.join(root,'chrome');await fs.mkdir(target);await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest('1.8.1')));await fs.writeFile(path.join(target,'old.js'),'original');
    await run(root,target);
  }finally{assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert.ok(path.basename(root).startsWith('wupage-update-test-'));await fs.rm(root,{recursive:true,force:true});}
}
const extract=async(_zip,destination)=>{await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest('1.9.0')));await fs.writeFile(path.join(destination,'background.js'),'new version');};
test('native updater validates exact repository assets and a unique checksum',()=>{
  const version='1.9.0',name=`wupage-codex-${version}-chrome.zip`,prefix=`https://github.com/kiwimana/wupage-codex-translator/releases/download/v${version}/`;
  const data={draft:false,prerelease:false,tag_name:`v${version}`,assets:[{name,size:100,browser_download_url:prefix+name},{name:'SHA256SUMS.txt',browser_download_url:prefix+'SHA256SUMS.txt'}]};
  assert.equal(validateRelease(data).version,version);data.assets[0].browser_download_url='https://example.com/bad.zip';assert.throws(()=>validateRelease(data));
  assert.equal(checksumFrom(`${hash}  ${name}\n`,name),hash);assert.throws(()=>checksumFrom(`${hash}  ${name}\n${hash}  ${name}`,name));
});
test('SHA failure does not extract or change the installed extension',()=>fixture(async(root,target)=>{
  await assert.rejects(applyExtensionUpdate(target,release,bytes,'0'.repeat(64),()=>assert.fail('must not extract')),/SHA-256/);
  assert.equal(await fs.readFile(path.join(target,'old.js'),'utf8'),'original');assert.deepEqual(await fs.readdir(root),['chrome']);
}));
test('validated update atomically replaces files and removes temporary data',()=>fixture(async(root,target)=>{
  assert.equal(await applyExtensionUpdate(target,release,bytes,hash,extract),'1.9.0');
  assert.equal(JSON.parse(await fs.readFile(path.join(target,'manifest.json'),'utf8')).version,'1.9.0');await assert.rejects(fs.access(path.join(target,'old.js')));assert.deepEqual(await fs.readdir(root),['chrome']);
}));
test('wrong Chrome identity leaves the old extension intact',()=>fixture(async(root,target)=>{
  await assert.rejects(applyExtensionUpdate(target,release,bytes,hash,async(_zip,destination)=>{await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({...manifest('1.9.0'),key:'wrong'}));}),/識別碼/);
  assert.equal(await fs.readFile(path.join(target,'old.js'),'utf8'),'original');assert.deepEqual(await fs.readdir(root),['chrome']);
}));
test('rename failure rolls back to the original directory',()=>fixture(async(root,target)=>{
  let moves=0;
  await assert.rejects(applyExtensionUpdate(target,release,bytes,hash,extract,undefined,async(a,b)=>{if(++moves===2)throw new Error('locked');await fs.rename(a,b);}),/locked/);
  assert.equal(await fs.readFile(path.join(target,'old.js'),'utf8'),'original');assert.deepEqual(await fs.readdir(root),['chrome']);
}));
test('cancellation before swap preserves the original and cleans the stage',()=>fixture(async(root,target)=>{
  const controller=new AbortController();controller.abort(new Error('cancelled'));
  await assert.rejects(applyExtensionUpdate(target,release,bytes,hash,extract,controller.signal),/cancelled/);
  assert.equal(await fs.readFile(path.join(target,'old.js'),'utf8'),'original');assert.deepEqual(await fs.readdir(root),['chrome']);
}));
test('status reads only installer configuration and never starts an account tool or network request',()=>fixture(async(root,target)=>{
  await fs.writeFile(path.join(root,'bridge.config.json'),JSON.stringify({chromeExtensionPath:target}));
  const result=await manageExtensionUpdate({type:'extension-update-status'},undefined,()=>assert.fail('no process'),root,()=>assert.fail('no network'));
  assert.deepEqual(result,{ok:true,updateProtocol:1,configured:true});
}));
