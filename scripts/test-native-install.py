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
        extra = []
        if name == 'install-b':
            chrome = Path(temporary) / 'chrome'
            chrome.mkdir()
            identity = json.loads((target / 'chrome-extension.json').read_text(encoding='utf-8'))
            (chrome / 'manifest.json').write_text(json.dumps({'manifest_version': 3, 'key': identity['key']}), encoding='utf-8')
            extra = ['-ChromeExtensionPath', str(chrome)]
        result = subprocess.run(['powershell.exe', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', str(target / 'install.ps1'), '-PrepareOnly', '-NodePath', node, '-CodexPath', node, *extra],
            capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        config = json.loads((target / 'bridge.config.json').read_text(encoding='utf-8-sig'))
        manifest = json.loads((target / 'org.wupage.codex_bridge.json').read_text(encoding='utf-8-sig'))
        chrome_manifest = json.loads((target / 'org.wupage.codex_bridge.chrome.json').read_text(encoding='utf-8-sig'))
        identity = json.loads((target / 'chrome-extension.json').read_text(encoding='utf-8'))
        assert config['nodePath'] == node and config['codexPath'] == node
        assert set(config) == {'nodePath', 'codexPath', 'claudePath', 'geminiPath'} | ({'chromeExtensionPath'} if extra else set())
        if extra: assert Path(config['chromeExtensionPath']).resolve() == chrome.resolve()
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
            process = subprocess.Popen([manifest['path'], *browser_args], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if name == 'install-b' else 0)
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
    # Keep the real script's discovery logic; replace only its final command
    # invocation so this check cannot launch an AI tool or a login window.
    local = Path(temporary) / 'local-app-data'
    ready = local / 'OpenAI' / 'Codex' / 'bin' / 'ready'
    incomplete = ready.parent / 'updating'
    ready.mkdir(parents=True); incomplete.mkdir()
    executable = ready / 'codex.exe'
    executable.write_bytes(b'fixture-not-executable')
    os.utime(ready, (100, 100)); os.utime(incomplete, (200, 200))
    target = Path(temporary) / 'install-a'
    script_file = target / 'connect.ps1'
    script = script_file.read_text(encoding='utf-8')
    assert script.count('    & $toolPath login') == 1
    script_file.write_text(script.replace('    & $toolPath login',
        '    Write-Output ("fixture-login-command:" + $toolPath)'), encoding='utf-8')
    config_file = target / 'bridge.config.json'
    config = json.loads(config_file.read_text(encoding='utf-8-sig'))
    config['codexPath'] = str(ready.parent / 'removed' / 'codex.exe')
    config_file.write_text(json.dumps(config), encoding='utf-8')
    original_config = config_file.read_bytes()
    command = ['powershell.exe', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
               '-File', str(target / 'connect.ps1'), '-Engine', 'codex', '-Run']
    environment = {**os.environ, 'LOCALAPPDATA': str(local)}
    linked = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=20)
    assert linked.returncode == 0 and 'fixture-login-command:' + str(executable) in linked.stdout, linked.stderr
    assert config_file.read_bytes() == original_config
    executable.unlink()
    missing = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=20)
    assert missing.returncode != 0 and 'Codex was moved or is updating' in missing.stderr
print(json.dumps({'passed': True, 'installations': 2, 'registry_changed': False,
                  'login_files_read': False, 'native_packets_checked': 4, 'paths_generated_per_installation': True,
                  'codex_update_recovery_checked': True, 'real_login_actions': 0}))
