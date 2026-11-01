import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { encodeMessage, extensionId } from '../native-chatgpt/host.mjs';

const directory = path.resolve(process.argv[2] || 'native-chatgpt');
async function rollouts(dir) {
  let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? rollouts(path.join(dir, e.name))
    : e.name.endsWith('.jsonl') ? [path.join(dir, e.name)] : []));
  return nested.flat();
}
const sessions = path.join(os.homedir(), '.codex', 'sessions');
const before = new Set(await rollouts(sessions));
const filesBefore = await fs.readdir(directory);
const started = Date.now();
const result = await new Promise((resolve, reject) => {
  const child = spawn(path.join(directory, 'wupage-chatgpt-host.exe'),
    [path.join(directory, 'org.wupage.codex_bridge.json'), extensionId],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const chunks = []; let stderr = '';
  const timer = setTimeout(() => { child.kill(); reject(new Error('Native smoke test timed out')); }, 180000);
  child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => {
    clearTimeout(timer);
    try {
      const buffer = Buffer.concat(chunks);
      assert.equal(code, 0, stderr); assert.ok(buffer.length >= 4, 'Native host returned no message');
      assert.equal(buffer.length, buffer.readUInt32LE() + 4);
      resolve(JSON.parse(buffer.subarray(4).toString('utf8')));
    } catch (error) { reject(error); }
  });
  child.stdin.write(encodeMessage({ type: 'translate', sourceLang: 'en', targetLang: 'zh-TW',
    texts: ['Translation starts only when you click the Translate button.', 'Close this page to discard the translated text.'] }));
});
assert.equal(result.ok, true, result.error);
assert.equal(result.translations.length, 2);
assert.ok(result.translations.every(text => /[\u4e00-\u9fff]/u.test(text)), 'Expected Chinese translations');
const added = (await rollouts(sessions)).filter(file => !before.has(file));
assert.deepEqual(await fs.readdir(directory), filesBefore, 'Host must not write translation output files');
const report = { passed: true, elapsedMs: Date.now() - started, translations: result.translations,
  newSessionRolloutCount: added.length, hostOutputFilesCreated: 0, transport: 'compiled native launcher -> Node -> ephemeral Codex' };
await fs.writeFile(path.join(directory, '..', 'native-smoke-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, translations: '[two sample translations verified]' }));
