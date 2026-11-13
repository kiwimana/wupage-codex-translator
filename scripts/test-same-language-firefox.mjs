// Local fixtures only: no real account login, native bridge or AI service.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/same-language-firefox');
const traditional='這是一段完整的繁體中文測試文章。我們希望已經符合目標語言的內容保留原文，不要重複翻譯，也不需要連接任何人工智慧服務。這項設定會逐段判斷，讓讀者安心閱讀原本的文字。';
const simplified='这是一段完整的简体中文测试文章。我们希望这些文字转换成繁体中文，因此不能把两种中文错误地当作完全一样的语言。这项功能必须保留必要的翻译。';
const english='This paragraph is written in English and still needs translation. The language of its neighbouring paragraphs must not cause it to be skipped. This independent local fixture verifies that mixed language pages retain all foreign prose and avoid duplicate target language text. A browser extension should make a separate decision for each paragraph.';
const calls=[];
const server=createServer(async(q,r)=>{
 if(q.method==='POST'){
  let body='';for await(const part of q)body+=part;
  const {texts}=JSON.parse(body);calls.push(texts);
  const translations=texts.map(t=>t.includes('⟪WUPAGESEGMENT')?t.replace(/(⟪WUPAGESEGMENT\d+⟫\n)/g,'$1測試譯文：'):'測試譯文：'+t);
  r.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'}).end(JSON.stringify({translations}));
 }else r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(`<!doctype html><meta charset="utf-8"><title>Language rule fixture</title><style>body{font:16px/1.5 system-ui;margin:30px}p{max-width:850px}</style><main><p id="traditional">${traditional}</p><p id="english">${english}</p><p id="simplified">${simplified}</p></main>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
let firefox;const report={passed:false,checks:[],realAiCalls:0,loginActions:0};
const check=name=>{report.checks.push(name);console.log('PASS:',name);};
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'));report.browser=firefox.session.capabilities.browserVersion;
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
 const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
 const api=async(script,input=null)=>{
  await firefox.command('WebDriver:SwitchToWindow',{handle:control});
  const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1],chrome=window.wrappedJSObject.chrome,input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),error=>done(JSON.stringify({error:String(error)})));`,[JSON.stringify(input)]);
  const response=JSON.parse(raw);if(response.error)throw new Error(response.error);return response.value;
 };
 const translate=request=>api(`const r=await chrome.runtime.sendMessage({type:'TRANSLATE_BATCH',providerId:'http-template',...input});if(!r.ok)throw new Error(r.error);return r.data;`,request);
 const equal=await translate({texts:['An English paragraph.'],sourceLang:'en-US',targetLang:'en'});
 assert.deepEqual(equal,{translations:['An English paragraph.'],cached:0,skippedIndexes:[0]});
 assert.equal((await api(`return (await chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'})).data.tasks;`)).length,0);
 check('matching source and target return original text before any native task');
 await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.activeProviderId='http-template';s.sourceLang='auto';s.targetLang='zh-TW';s.skipSameLanguage=true;Object.assign(s.providers.find(p=>p.id==='http-template'),{url:input,bodyTemplate:'{"texts":{{json texts}}}',responsePath:'translations'});const r=await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});if(!r.ok)throw new Error(r.error);`,url);
 const detection=await api(`return chrome.i18n.detectLanguage(input);`,traditional);report.traditionalDetection=detection;
 const mixed=await translate({texts:[traditional,english,simplified],sourceLang:'auto',targetLang:'zh-TW'});
 assert.deepEqual(mixed.skippedIndexes,[0]);assert.equal(mixed.translations[0],traditional);
 assert.deepEqual(calls[0],[english,simplified]);check('actual Firefox local detection skips Traditional, retains English and Simplified, and preserves ordering');
 const bare=await translate({texts:[traditional,simplified],sourceLang:'zh',targetLang:'zh-TW'});
 assert.deepEqual(bare.skippedIndexes,[0]);assert.deepEqual(calls[1],[simplified]);check('bare Chinese CC language tags use actual script evidence');
 await firefox.command('WebDriver:SwitchToWindow',{handle:control});
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
 for(let i=0;i<100;i++){if(await firefox.execute(`return document.getElementById('providerForm')?.dataset.providerId==='http-template';`))break;await delay(50);}
 await firefox.execute(`const b=document.getElementById('skipSameLanguage');if(!b.checked)throw new Error('Rule not enabled');b.checked=false;document.getElementById('save').click();`);
 for(let i=0;i<100;i++){if((await api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.skipSameLanguage;`))===false)break;await delay(50);}
 const forced=await translate({texts:[traditional],sourceLang:'zh-TW',targetLang:'zh-TW'});
 assert.equal(forced.skippedIndexes,undefined);assert.deepEqual(calls[2],[traditional]);
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});await delay(200);
 assert.equal(await firefox.execute(`return document.getElementById('skipSameLanguage').checked;`),false);
 check('the visible settings switch saves an opt-out across reload and forces translation');
 await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.skipSameLanguage=true;await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`);
 const opened=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(opened.value??opened).handle;
 await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.command('WebDriver:Navigate',{url});
 for(let i=0;i<100;i++){if(await firefox.execute(`return document.getElementById('wupage-floating-hitbox')?.hidden===false;`))break;await delay(50);}
 const result=await api(`const t=(await chrome.tabs.query({})).find(t=>t.url===input);return chrome.tabs.sendMessage(t.id,{type:'TRANSLATE_PAGE'});`,url);
 assert.equal(result.ok,true);assert.equal(result.data.skipped,1);assert.equal(result.data.translated,2);assert.equal(result.data.failed,0);
 await firefox.command('WebDriver:SwitchToWindow',{handle:page});
 assert.equal(await firefox.execute(`return document.querySelectorAll('#traditional .wupage-translation').length;`),0);
 assert.equal(await firefox.execute(`return document.querySelector('#traditional').textContent;`),traditional);
 check('the page keeps matching text untouched and reports skipped paragraphs separately');
 report.localHttpRequests=calls.length;report.passed=true;
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
