"""Package only portable extension files and native-host source."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile
from importlib.util import spec_from_file_location, module_from_spec

root = Path(__file__).resolve().parent.parent
spec = spec_from_file_location('public_guard', root / 'scripts/check-public-package.py')
guard = module_from_spec(spec); spec.loader.exec_module(guard)
findings, source_count = guard.check_source(root)
if findings:
    raise SystemExit(json.dumps({'passed': False, 'findings': findings}))
build = root / 'dist-firefox-chatgpt'
manifest = json.loads((build / 'manifest.json').read_text(encoding='utf-8'))
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
assert manifest['version'] == version
assert manifest['browser_specific_settings']['gecko']['id'] == 'codex-translator@wupage.local'
output = root / 'artifacts'; output.mkdir(exist_ok=True)
extension = output / f'wupage-codex-{version}-firefox.zip'
bridge = output / f'wupage-codex-{version}-windows-bridge.zip'
source = output / f'wupage-codex-{version}-source.zip'
bridge_names = ['host.mjs', 'launcher.cs', 'translation-schema.json', 'install.ps1',
                'uninstall.ps1', 'repair.cmd', 'connect.ps1', 'README.md']
with zipfile.ZipFile(extension, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(build.rglob('*')):
        if path.is_file():
            assert path.resolve().is_relative_to(build.resolve())
            archive.write(path, path.relative_to(build).as_posix())
with zipfile.ZipFile(bridge, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in bridge_names:
        archive.write(root / 'native-chatgpt' / name, name)
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, path in guard.source_paths(root):
        archive.write(path, name)
checks = []
for path in [extension, bridge, source]:
    found, count = guard.check_zip(path, extension=path == extension)
    assert not found, found
    checks.append({'file': path.name, 'bytes': path.stat().st_size, 'entries': count,
                   'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
report = {'passed': True, 'version': version, 'source_files_scanned': source_count,
          'native_host': 'org.wupage.codex_bridge', 'extension_id': 'codex-translator@wupage.local',
          'credentials_included': False, 'machine_configuration_included': False, 'packages': checks}
(output / 'PUBLICATION-CHECK.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
(output / 'SHA256SUMS.txt').write_text(''.join(p['sha256'] + '  ' + p['file'] + '\n' for p in checks), encoding='ascii')
shutil.copy2(root / 'README.md', output / 'README.md')
print(json.dumps(report))
