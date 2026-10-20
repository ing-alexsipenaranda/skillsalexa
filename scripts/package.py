"""Package only explicitly listed deployable files. Never include local secrets."""
from pathlib import Path
import tarfile
import zipfile
root = Path(__file__).resolve().parent.parent
with zipfile.ZipFile(root / 'dist/evoll-lambda.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / 'dist/lambda').iterdir()):
        if path.is_file():
            archive.write(path, path.name)
with tarfile.open(root / 'dist/evoll-linking.tar.gz', 'w:gz') as archive:
    for name in ['broker/server.js', 'broker/store.js', 'broker/revoke.js',
                 'broker/.env.example', 'package.json', 'package-lock.json',
                 'dist/linking/index.html', 'dist/linking/app.js', 'README.md']:
        archive.add(root / name, arcname=name, recursive=False)
with tarfile.open(root / 'dist/evoll-docker.tar.gz', 'w:gz') as archive:
    names = ['Dockerfile', 'compose.yaml', 'compose.hostinger.yaml', '.dockerignore', '.gitignore',
             '.env.compose.example', 'package.json', 'package-lock.json',
             'README.md', 'scripts/build.mjs', 'broker/server.js',
             'broker/store.js', 'broker/revoke.js', 'broker/.env.example']
    for folder in ['src', 'linking', 'skill-package']:
        names.extend(str(p.relative_to(root)) for p in (root / folder).rglob('*') if p.is_file())
    for name in sorted(names):
        archive.add(root / name, arcname=name, recursive=False)
print('Created Lambda, linking and Docker packages in dist/ (no credentials).')
