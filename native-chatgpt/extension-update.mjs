import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import chromeIdentity from './chrome-extension.json' with { type: 'json' };

const api = 'https://api.github.com/repos/kiwimana/wupage-codex-translator/releases/latest';
const repository = 'https://github.com/kiwimana/wupage-codex-translator';
export function compareVersions(a, b) {
  if (![a,b].every(value => typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){1,3}$/.test(value))) throw new Error('更新版本格式無效。');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i=0;i<4;i++) { const delta = (left[i] ?? 0) - (right[i] ?? 0); if (delta) return Math.sign(delta); }
  return 0;
}
export function validateRelease(data) {
  if (!data || data.draft !== false || data.prerelease !== false || !/^v\d+(?:\.\d+){1,3}$/.test(data.tag_name ?? '')) throw new Error('找不到有效的穩定版本。');
  const version = data.tag_name.slice(1); compareVersions(version, version);
  const name = `wupage-codex-${version}-chrome.zip`;
  const prefix = `${repository}/releases/download/v${version}/`;
  const asset = data.assets?.find(item => item.name === name);
  const sums = data.assets?.find(item => item.name === 'SHA256SUMS.txt');
  if (!asset || asset.browser_download_url !== prefix + name || !Number.isInteger(asset.size) || asset.size < 1 || asset.size >= 10_000_000
    || !sums || sums.browser_download_url !== prefix + 'SHA256SUMS.txt') throw new Error('更新套件或校驗碼來源不符。');
  return { version, name, url: asset.browser_download_url, sumsUrl: sums.browser_download_url, size: asset.size };
}
export function validateManifest(manifest, version) {
  if (manifest.manifest_version !== 3 || manifest.key !== chromeIdentity.key || manifest.browser_specific_settings
    || manifest.background?.service_worker !== 'background.js' || manifest.background?.type !== 'module'
    || !manifest.permissions?.includes('nativeMessaging') || (version && manifest.version !== version)) throw new Error('Chrome 更新套件的識別碼或版本不符。');
  compareVersions(manifest.version, manifest.version); return manifest;
}
export function checksumFrom(text, name) {
  const matches = text.split(/\r?\n/).map(line => /^([a-fA-F0-9]{64})  (\S+)$/.exec(line)).filter(match => match?.[2] === name);
  if (matches.length !== 1) throw new Error('更新校驗碼不存在或重複。');
  return matches[0][1].toLowerCase();
}
async function download(url, limit, signal, fetcher) {
  // The first URL is fixed; only GitHub's own asset redirects are followed.
  let response;
  for (let hops=0;hops<6;hops++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || !['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname)) throw new Error('更新下載來源不允許。');
    response = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: parsed.hostname === 'api.github.com' ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'WuPage-Extension-Updater' } });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('更新重新導向無效。'); url = new URL(location, url).href; continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw new Error('無法下載 GitHub 更新，請稍後重試。');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) { await response.body.cancel().catch(() => {}); throw new Error('更新檔案超過大小限制。'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function configuredDirectory(directory) {
  const config = JSON.parse((await fs.readFile(path.join(directory, 'bridge.config.json'), 'utf8')).replace(/^\uFEFF/, ''));
  if (!config.chromeExtensionPath) return undefined;
  const target = config.chromeExtensionPath;
  if (!path.isAbsolute(target) || path.parse(target).root === target || target === directory || path.dirname(target) === target) throw new Error('Chrome 更新資料夾無效。');
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(target).toLowerCase() !== (await fs.realpath(target)).toLowerCase()) throw new Error('Chrome 更新資料夾不得使用符號連結。');
  for (const name of ['.git','bridge.config.json','install.ps1','node_modules']) {
    try { await fs.access(path.join(target, name)); } catch { continue; }
    throw new Error('請指定獨立的 Chrome 擴充資料夾。');
  }
  validateManifest(JSON.parse(await fs.readFile(path.join(target, 'manifest.json'), 'utf8')));
  return target;
}
/** Atomic directory swap; keep the original when validation or extraction fails. */
export async function applyExtensionUpdate(target, release, bytes, expectedHash, extract, signal, rename = fs.rename.bind(fs)) {
  if (bytes.length !== release.size || createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('更新套件 SHA-256 校驗失敗，未修改原擴充。');
  const stageRoot = await fs.mkdtemp(path.join(path.dirname(target), '.wupage-update-'));
  const stage = path.join(stageRoot, 'extension'), archive = path.join(stageRoot, 'package.zip'), backup = path.join(stageRoot, 'previous');
  let moved = false, installed = false, preserveBackup = false;
  try {
    await fs.writeFile(archive, bytes); await fs.mkdir(stage);
    await extract(archive, stage, signal);
    validateManifest(JSON.parse(await fs.readFile(path.join(stage, 'manifest.json'), 'utf8')), release.version);
    await fs.access(path.join(stage, 'background.js'));
    signal?.throwIfAborted();
    // Avoid downgrading or overwriting an extension changed since the download.
    const original = validateManifest(JSON.parse(await fs.readFile(path.join(target, 'manifest.json'), 'utf8')));
    if (compareVersions(release.version, original.version) <= 0) throw new Error('已有相同或較新的版本，不需覆蓋。');
    await rename(target, backup); moved = true;
    try { await rename(stage, target); installed = true; }
    catch (error) {
      try { await rename(backup, target); moved = false; }
      catch { preserveBackup = true; throw new Error('無法還原擴充資料夾；原檔保留在同層 .wupage-update-* 的 previous 資料夾。'); }
      throw error;
    }
    return release.version;
  } finally {
    // Never delete a backup that failed to be restored. Only our own child is removed.
    if (!preserveBackup && (!moved || installed)) {
      const actual = path.resolve(stageRoot), parent = path.resolve(path.dirname(target));
      if (path.dirname(actual) !== parent || !path.basename(actual).startsWith('.wupage-update-')) throw new Error('更新清理路徑驗證失敗。');
      await fs.rm(actual, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    }
  }
}
export async function manageExtensionUpdate(input, signal, run, directory, fetcher = fetch) {
  if (!['extension-update-status','extension-update'].includes(input?.type)) throw new Error('更新請求無效。');
  const target = await configuredDirectory(directory);
  if (input.type === 'extension-update-status') return { ok: true, updateProtocol: 1, configured: !!target };
  if (!target) throw new Error('請重新執行新版 install.ps1，以 -ChromeExtensionPath 指定目前載入的擴充資料夾。');
  compareVersions(input.expectedVersion, input.expectedVersion);
  const metadata = await download(api, 1_000_000, signal, fetcher);
  const release = validateRelease(JSON.parse(metadata.toString('utf8')));
  if (release.version !== input.expectedVersion) throw new Error('GitHub 最新版本已變更，請重新檢查更新。');
  const sums = await download(release.sumsUrl, 100_000, signal, fetcher);
  const hash = checksumFrom(sums.toString('utf8'), release.name);
  const bytes = await download(release.url, 10_000_000, signal, fetcher);
  const version = await applyExtensionUpdate(target, release, bytes, hash, async (archive, destination, abortSignal) => {
    const result = await run('powershell.exe', ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(directory,'extract-update.ps1'),'-Archive',archive,'-Destination',destination], { signal: abortSignal, cwd: directory });
    if (result.code !== 0) throw new Error('更新解壓或安全檢查失敗，原擴充未變更。');
  }, signal);
  return { ok: true, updateProtocol: 1, configured: true, version };
}
