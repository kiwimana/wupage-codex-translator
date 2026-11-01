"""Exercise Windows ZIP guards and a real staged update with local fixture responses only."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

if os.name != 'nt':
    raise SystemExit('This check requires Windows.')
source = Path(__file__).resolve().parent.parent / 'native-chatgpt'
node = shutil.which('node.exe')
identity = json.loads((source / 'chrome-extension.json').read_text(encoding='utf-8'))
manifest = {'manifest_version': 3, 'key': identity['key'], 'version': '1.9.0',
            'background': {'service_worker': 'background.js', 'type': 'module'}, 'permissions': ['nativeMessaging']}
with tempfile.TemporaryDirectory(prefix='wupage-update-windows-') as temporary:
    root = Path(temporary)
    assert root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
    bridge = root / 'bridge'
    shutil.copytree(source, bridge)
    for case in ['valid', 'traversal', 'case-duplicate', 'executable', 'symlink']:
        archive = root / (case + '.zip')
        destination = root / case
        destination.mkdir()
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
            package.writestr('manifest.json', json.dumps(manifest))
            package.writestr('background.js', '// fixture')
            if case == 'traversal': package.writestr('../outside.txt', 'must not be written')
            if case == 'case-duplicate': package.writestr('MANIFEST.JSON', '{}')
            if case == 'executable': package.writestr('launch.exe', 'not an extension resource')
            if case == 'symlink':
                member = zipfile.ZipInfo('linked.js'); member.create_system = 3; member.external_attr = 0o120777 << 16
                package.writestr(member, '../outside.txt')
        result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
            str(bridge / 'extract-update.ps1'), '-Archive', str(archive), '-Destination', str(destination)], capture_output=True, text=True)
        assert (result.returncode == 0) == (case == 'valid'), (case, result.stderr)
        assert not (root / 'outside.txt').exists()
    target = root / 'chrome'
    target.mkdir()
    (target / 'manifest.json').write_text(json.dumps({**manifest, 'version': '1.8.1'}), encoding='utf-8')
    (target / 'old.js').write_text('original', encoding='utf-8')
    (bridge / 'bridge.config.json').write_text(json.dumps({'chromeExtensionPath': str(target)}), encoding='utf-8')
    # Real native updater + real PowerShell extraction, with a fake GitHub response.
    # No network, browser registry, account process, credential or translation.
    runner = root / 'fixture.mjs'
    runner.write_text("""
import fs from 'node:fs/promises';import path from 'node:path';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
const root=process.argv[2], bridge=path.join(root,'bridge');
const {manageExtensionUpdate}=await import(pathToFileURL(path.join(bridge,'extension-update.mjs')));
const {runProcess}=await import(pathToFileURL(path.join(bridge,'host.mjs')));
const bytes=await fs.readFile(path.join(root,'valid.zip')), name='wupage-codex-1.9.0-chrome.zip';
const prefix='https://github.com/kiwimana/wupage-codex-translator/releases/download/v1.9.0/';
const metadata={draft:false,prerelease:false,tag_name:'v1.9.0',assets:[{name,size:bytes.length,browser_download_url:prefix+name},{name:'SHA256SUMS.txt',browser_download_url:prefix+'SHA256SUMS.txt'}]};
let calls=0;
const fetcher=async url=>{calls++;if(url.endsWith('/releases/latest'))return new Response(JSON.stringify(metadata));if(url===prefix+'SHA256SUMS.txt')return new Response(createHash('sha256').update(bytes).digest('hex')+'  '+name+'\\n');if(url===prefix+name)return new Response(bytes);throw new Error('Unexpected URL');};
const result=await manageExtensionUpdate({type:'extension-update',expectedVersion:'1.9.0'},AbortSignal.timeout(30000),runProcess,bridge,fetcher);
if(!result.ok||result.version!=='1.9.0'||calls!==3)throw new Error('Fixture update failed');console.log(JSON.stringify(result));
""", encoding='utf-8')
    result = subprocess.run([node, str(runner), str(root)], capture_output=True, text=True, encoding='utf-8', timeout=45)
    assert result.returncode == 0, result.stderr
    assert json.loads((target / 'manifest.json').read_text(encoding='utf-8'))['version'] == '1.9.0'
    assert not (target / 'old.js').exists()
    assert not list(root.glob('.wupage-update-*'))
print(json.dumps({'passed': True, 'zip_cases': 5, 'real_windows_update': True, 'network_calls': 0, 'login_actions': 0, 'registry_changed': False}))
