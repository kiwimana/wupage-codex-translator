"""Reject local credentials and installation-specific files before publication.

Reports contain file names and rule names only, never matched secret values.
"""
from pathlib import Path, PurePosixPath
import argparse
import json
import re
import stat
import subprocess
import zipfile

IGNORED = {'.git', 'node_modules', '.npm-cache', 'artifacts', '__pycache__',
           'dist', 'dist-firefox', 'dist-firefox-chatgpt', 'dist-video-preview'}
PRIVATE_NAMES = {'auth.json', 'credentials.json', 'logins.json', 'prefs.js', 'config.toml', 'bridge.config.json',
                 'org.wupage.codex_bridge.json', 'wupage-chatgpt-host.exe'}
PRIVATE_PARTS = {'.codex', '.ssh', '.aws', 'browser-profile', 'sessionstore-backups'} | IGNORED
RULES = {
    'personal-windows-path': re.compile(rb'[A-Za-z]:[\\/]+Users[\\/]+[^\s"\x00]+', re.I),
    'github-token': re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
    'openai-key': re.compile(rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}'),
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'jwt-credential': re.compile(rb'\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'),
    'private-network-address': re.compile(rb'\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b'),
    'personal-tunnel': re.compile(rb'https?://[a-zA-Z0-9.-]+\.(?:ts\.net|trycloudflare\.com|ngrok(?:-free)?\.(?:app|io))\b'),
}

def source_paths(root):
    root = Path(root).resolve()
    if (root / '.git').exists():
        raw = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root)
        names = sorted(set(raw.decode().split('\0')) - {''})
    else:
        names = sorted(p.relative_to(root).as_posix() for p in root.rglob('*')
                       if p.is_file() and not set(p.relative_to(root).parts).intersection(IGNORED))
    return [(name, root / name) for name in names if (root / name).is_file()]

def check_bytes(name, data):
    path = PurePosixPath(name.replace('\\', '/'))
    findings = []
    if path.is_absolute() or '..' in path.parts or re.match(r'^[a-z]:', name, re.I):
        findings.append((name, 'unsafe-path'))
    if (path.name.lower() in PRIVATE_NAMES or set(path.parts).intersection(PRIVATE_PARTS)
        or path.name.startswith('.env') or path.suffix.lower() in {'.key', '.pem', '.p12', '.pfx', '.log', '.jsonl', '.pyc', '.sqlite', '.db', '.exe'}):
        findings.append((name, 'local-or-secret-file'))
    # Binary resources are scanned too, so an accidentally embedded credential
    # is not excused merely because it was copied into a different file type.
    findings.extend((name, rule) for rule, pattern in RULES.items() if pattern.search(data))
    return findings

def check_source(root):
    findings = []
    paths = source_paths(root)
    for name, path in paths:
        if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):
            findings.append((name, 'external-or-symlink'))
        else:
            findings.extend(check_bytes(name, path.read_bytes()))
    return findings, len(paths)

def check_zip(path, extension=False):
    findings = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            findings.append((Path(path).name, 'duplicate-members'))
        for info in archive.infolist():
            if stat.S_ISLNK(info.external_attr >> 16):
                findings.append((info.filename, 'symlink-member'))
            findings.extend(check_bytes(info.filename, archive.read(info)))
        if archive.testzip() is not None:
            findings.append((Path(path).name, 'zip-integrity'))
        if extension:
            if [name for name in names if PurePosixPath(name).name.lower() == 'manifest.json'] != ['manifest.json']:
                findings.append((Path(path).name, 'single-root-manifest-required'))
            else:
                manifest = json.loads(archive.read('manifest.json'))
                if manifest.get('browser_specific_settings', {}).get('gecko', {}).get('id') != 'codex-translator@wupage.local':
                    findings.append(('manifest.json', 'unexpected-extension-id'))
            if Path(path).stat().st_size >= 10_000_000:
                findings.append((Path(path).name, 'extension-too-large'))
    return findings, len(names)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    parser.add_argument('--zip', type=Path, action='append', default=[])
    parser.add_argument('--extension', action='store_true')
    args = parser.parse_args()
    if not args.source and not args.zip:
        parser.error('Specify --source or --zip')
    findings = []
    count = 0
    if args.source:
        found, scanned = check_source(args.source)
        findings.extend(found); count += scanned
    for archive in args.zip:
        found, scanned = check_zip(archive, args.extension)
        findings.extend(found); count += scanned
    print(json.dumps({'passed': not findings, 'files_scanned': count,
                      'findings': [{'file': f, 'rule': r} for f, r in findings]}, ensure_ascii=False))
    return 1 if findings else 0

if __name__ == '__main__':
    raise SystemExit(main())
