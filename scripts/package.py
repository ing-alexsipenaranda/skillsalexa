"""Package only explicitly listed deployable files. Never include local secrets."""
from pathlib import Path
import shutil
import tarfile
import zipfile
root = Path(__file__).resolve().parent.parent


def add_reproducible_file(archive, path, archive_name):
    """Write stable ZIP metadata so identical source creates an identical artifact."""
    info = zipfile.ZipInfo(archive_name, date_time=(2020, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    archive.writestr(info, path.read_bytes())


with zipfile.ZipFile(root / 'dist/evoll-lambda.zip', 'w') as archive:
    for path in sorted((root / 'dist/lambda').iterdir()):
        if path.is_file():
            add_reproducible_file(archive, path, path.name)
with zipfile.ZipFile(root / 'dist/evoll-alexa-hosted.zip', 'w') as archive:
    for path in sorted((root / 'dist/alexa-hosted/lambda').iterdir()):
        if path.is_file():
            add_reproducible_file(archive, path, 'lambda/' + path.name)
(root / 'downloads').mkdir(exist_ok=True)
shutil.copyfile(root / 'dist/evoll-alexa-hosted.zip', root / 'downloads/evoll-alexa-hosted.zip')
with tarfile.open(root / 'dist/evoll-linking.tar.gz', 'w:gz') as archive:
    for name in ['broker/server.js', 'broker/store.js', 'broker/revoke.js', 'broker/backup.js',
                 'broker/.env.example', 'package.json', 'package-lock.json',
                 'dist/linking/index.html', 'dist/linking/app.js', 'README.md']:
        archive.add(root / name, arcname=name, recursive=False)
with tarfile.open(root / 'dist/evoll-docker.tar.gz', 'w:gz') as archive:
    names = ['Dockerfile', 'compose.yaml', 'compose.hostinger.yaml', '.dockerignore', '.gitignore',
             '.env.compose.example', 'package.json', 'package-lock.json',
             'README.md', 'scripts/build.mjs', 'scripts/backup-vps.sh', 'scripts/health-vps.sh', 'scripts/update-vps.sh', 'scripts/verify-production.sh', 'broker/server.js',
             'broker/store.js', 'broker/revoke.js', 'broker/backup.js', 'broker/.env.example']
    for folder in ['src', 'linking', 'skill-package']:
        names.extend(str(p.relative_to(root)) for p in (root / folder).rglob('*') if p.is_file())
    for name in sorted(names):
        archive.add(root / name, arcname=name, recursive=False)
print('Created Lambda, linking and Docker packages in dist/ (no credentials).')
