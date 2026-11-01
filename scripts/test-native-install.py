"""Verify portable installers generate separate local paths, without registry writes."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import struct
from concurrent.futures import ThreadPoolExecutor

if os.name != 'nt':
    raise SystemExit('This installer check requires Windows.')
source = Path(__file__).resolve().parent.parent / 'native-chatgpt'
node = shutil.which('node.exe')
assert node
with tempfile.TemporaryDirectory(prefix='wupage-public-install-') as temporary:
    assert Path(temporary).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
    manifests = []
    for name in ['install-a', 'install-b']:
        target = Path(temporary) / name
        shutil.copytree(source, target)
        result = subprocess.run(['powershell.exe', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', str(target / 'install.ps1'), '-PrepareOnly', '-NodePath', node, '-CodexPath', node],
            capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        config = json.loads((target / 'bridge.config.json').read_text(encoding='utf-8-sig'))
        manifest = json.loads((target / 'org.wupage.codex_bridge.json').read_text(encoding='utf-8-sig'))
        chrome_manifest = json.loads((target / 'org.wupage.codex_bridge.chrome.json').read_text(encoding='utf-8-sig'))
        identity = json.loads((target / 'chrome-extension.json').read_text(encoding='utf-8'))
        assert config['nodePath'] == node and config['codexPath'] == node
        assert set(config) == {'nodePath', 'codexPath', 'claudePath', 'geminiPath'}
        assert Path(manifest['path']).parent.resolve() == target.resolve()
        assert Path(manifest['path']).is_file()
        assert manifest['allowed_extensions'] == ['codex-translator@wupage.local']
        assert manifest['type'] == 'stdio'
        origin = 'chrome-extension://' + identity['extensionId'] + '/'
        assert chrome_manifest['allowed_origins'] == [origin]
        assert 'allowed_extensions' not in chrome_manifest
        assert 'allowed_origins' not in manifest
        assert chrome_manifest['path'] == manifest['path']
        # Exercise Chrome's exact origin + parent-window argument through the
        # compiled launcher. Detection uses fake program paths, never AI login.
        for browser_args in [[origin, '--parent-window=0'], ['codex-translator@wupage.local']]:
            process = subprocess.Popen([manifest['path'], *browser_args], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                payload = json.dumps({'type': 'detect', 'engine': 'codex'}).encode('utf-8')
                process.stdin.write(struct.pack('<I', len(payload)) + payload); process.stdin.flush()
                def read_reply():
                    header = process.stdout.read(4)
                    assert len(header) == 4, 'Launcher returned no native header'
                    return json.loads(process.stdout.read(struct.unpack('<I', header)[0]))
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(read_reply)
                    try: reply = future.result(timeout=20)
                    except Exception:
                        process.kill()
                        raise
                assert reply == {'ok': True, 'engine': 'codex', 'installed': True, 'login': 'unchecked', 'bridgeVersion': 2}, f'Unexpected native detection response: {reply!r}'
                process.wait(timeout=10)
                assert process.returncode == 0
            finally:
                if process.poll() is None: process.kill()
                process.wait(timeout=10)
                process.stdin.close();process.stdout.close();process.stderr.close()
        manifests.append(manifest['path'])
    assert manifests[0] != manifests[1]
print(json.dumps({'passed': True, 'installations': 2, 'registry_changed': False,
                  'login_files_read': False, 'native_packets_checked': 4, 'paths_generated_per_installation': True}))
