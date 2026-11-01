from pathlib import Path
import importlib.util
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('guard', ROOT / 'scripts/check-public-package.py')
guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)

class PublicPackageTest(unittest.TestCase):
    def test_generated_machine_configuration_cannot_be_published(self):
        self.assertTrue(guard.check_bytes('native-chatgpt/bridge.config.json', b'{}'))
        self.assertTrue(guard.check_bytes('native-chatgpt/org.wupage.codex_bridge.json', b'{}'))
        self.assertTrue(guard.check_bytes('native-chatgpt/org.wupage.codex_bridge.chrome.json', b'{}'))
        self.assertTrue(guard.check_bytes('.codex/auth.json', b'{}'))
        self.assertTrue(guard.check_bytes('browser/logins.json', b'{}'))
        self.assertTrue(guard.check_bytes('browser/cookies.sqlite', b'data'))
        self.assertTrue(guard.check_bytes('renamed-launcher.exe', b'binary'))

    def test_secret_detection_does_not_echo_secret_values(self):
        token = ('gh' + 'p_' + 'X' * 36).encode()
        result = guard.check_bytes('accidental.txt', token)
        self.assertEqual(result, [('accidental.txt', 'github-token')])
        self.assertNotIn(token.decode(), str(result))

    def test_windows_profiles_and_private_tunnels_are_rejected(self):
        profile = ('C:' + '/' + 'Users' + '/' + 'example' + '/auth.json').encode()
        self.assertTrue(guard.check_bytes('setup.txt', profile))
        self.assertTrue(guard.check_bytes('endpoint.txt', ('https://' + 'example' + '.ts.net').encode()))

    def test_native_source_and_dynamic_local_test_servers_are_allowed(self):
        self.assertFalse(guard.check_bytes('host.mjs', (ROOT / 'native-chatgpt/host.mjs').read_bytes()))
        self.assertFalse(guard.check_bytes('test.mjs', b"server.listen(0, '127.0.0.1')"))

    def test_archive_path_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix='wupage-public-guard-') as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()))
            archive = Path(directory) / 'test.zip'
            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('../outside.txt', 'test')
            findings, _ = guard.check_zip(archive)
            self.assertIn(('../outside.txt', 'unsafe-path'), findings)

if __name__ == '__main__':
    unittest.main()
