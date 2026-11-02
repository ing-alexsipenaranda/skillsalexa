"""Exercise the release packager in an isolated copy, including local contaminants."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile


class PackageTests(unittest.TestCase):
    def test_complete_reproducible_packages_exclude_local_files(self):
        source = Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['scripts', 'broker', 'src', 'linking', 'skill-package', 'dist']:
                shutil.copytree(source / name, root / name,
                                ignore=shutil.ignore_patterns('*.zip', '*.tar.gz', '__pycache__'))
            for name in ['package.json', 'package-lock.json', 'README.md', 'Dockerfile',
                         'compose.yaml', 'compose.hostinger.yaml', '.dockerignore',
                         '.gitignore', '.env.compose.example']:
                shutil.copyfile(source / name, root / name)
            # These local files must never become release content, even when not ignored.
            for name in ['src/.env.production', 'linking/session.sqlite',
                         'skill-package/credentials.json', 'dist/lambda/debug.txt',
                         'dist/alexa-hosted/lambda/.env']:
                (root / name).write_text('LOCAL_ONLY_SENTINEL')
            def package():
                subprocess.run([sys.executable, 'scripts/package.py'], cwd=root,
                               check=True, capture_output=True)
                return {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in (root / 'dist').iterdir()
                        if p.name.endswith(('.zip', '.tar.gz'))}
            first = package()
            # Changing source timestamps must not change any archive hash.
            import os
            for folder in ['broker', 'src', 'linking', 'dist/lambda', 'dist/alexa-hosted/lambda']:
                for path in (root / folder).iterdir():
                    if path.is_file():
                        os.utime(path, (1800000000, 1800000000))
            self.assertEqual(first, package())
            self.assertEqual(len(first), 4)
            for name in first:
                path = root / 'dist' / name
                if name.endswith('.zip'):
                    with zipfile.ZipFile(path) as archive:
                        prefix = 'lambda/' if 'hosted' in name else ''
                        self.assertEqual(set(archive.namelist()),
                                         {prefix + 'index.js', prefix + 'package.json'})
                        for member in archive.namelist():
                            self.assertNotIn(b'LOCAL_ONLY_SENTINEL', archive.read(member))
                else:
                    with tarfile.open(path) as archive:
                        for member in archive:
                            self.assertTrue(member.isfile())
                            self.assertNotIn(b'LOCAL_ONLY_SENTINEL', archive.extractfile(member).read())
                        if 'linking' in name:
                            self.assertTrue({'dist/linking/privacy.html', 'dist/linking/terms.html'}
                                            <= set(archive.getnames()))
            # A symlink replacing an approved file must fail rather than export its target.
            (root / 'src/agent.js').unlink()
            (root / 'src/agent.js').symlink_to(root / 'src/.env.production')
            result = subprocess.run([sys.executable, 'scripts/package.py'], cwd=root,
                                    capture_output=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
