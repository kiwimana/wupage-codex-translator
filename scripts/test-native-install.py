"""Verify portable installers generate separate local paths, without registry writes."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

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
        assert config['nodePath'] == node and config['codexPath'] == node
        assert set(config) == {'nodePath', 'codexPath', 'claudePath', 'geminiPath'}
        assert Path(manifest['path']).parent.resolve() == target.resolve()
        assert Path(manifest['path']).is_file()
        assert manifest['allowed_extensions'] == ['codex-translator@wupage.local']
        assert manifest['type'] == 'stdio'
        manifests.append(manifest['path'])
    assert manifests[0] != manifests[1]
print(json.dumps({'passed': True, 'installations': 2, 'registry_changed': False,
                  'login_files_read': False, 'paths_generated_per_installation': True}))
