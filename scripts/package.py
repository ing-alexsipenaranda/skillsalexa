"""Package only explicitly listed deployable files. Never include local secrets."""
from pathlib import Path
import gzip
import io
import shutil
import tarfile
import zipfile
root = Path(__file__).resolve().parent.parent


def add_reproducible_file(archive, path, archive_name):
    """Write stable ZIP metadata so identical source creates an identical artifact."""
    if path.is_symlink() or not path.is_file():
        raise ValueError(f'Expected a regular release file: {archive_name}')
    info = zipfile.ZipInfo(archive_name, date_time=(2020, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    archive.writestr(info, path.read_bytes())


with zipfile.ZipFile(root / 'dist/evoll-lambda.zip', 'w') as archive:
    for name in ['index.js', 'package.json']:
        add_reproducible_file(archive, root / 'dist/lambda' / name, name)
with zipfile.ZipFile(root / 'dist/evoll-alexa-hosted.zip', 'w') as archive:
    for name in ['index.js', 'package.json']:
        add_reproducible_file(archive, root / 'dist/alexa-hosted/lambda' / name, 'lambda/' + name)
(root / 'downloads').mkdir(exist_ok=True)
shutil.copyfile(root / 'dist/evoll-alexa-hosted.zip', root / 'downloads/evoll-alexa-hosted.zip')
def write_tar(destination, names):
    """Explicit manifest, regular files only, fixed metadata and gzip timestamp."""
    with destination.open('wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for name in sorted(names):
                    path = root / name
                    if path.is_symlink() or not path.is_file():
                        raise ValueError(f'Expected a regular release file: {name}')
                    data = path.read_bytes()
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o755 if name.endswith('.sh') else 0o644
                    archive.addfile(info, io.BytesIO(data))


broker_files = ['broker/server.js', 'broker/store.js', 'broker/revoke.js',
                'broker/backup.js', 'broker/.env.example']
common_files = ['package.json', 'package-lock.json', 'README.md']
write_tar(root / 'dist/evoll-linking.tar.gz', broker_files + common_files + [
    'dist/linking/index.html', 'dist/linking/app.js',
    'dist/linking/privacy.html', 'dist/linking/terms.html',
])
write_tar(root / 'dist/evoll-docker.tar.gz', broker_files + common_files + [
    'Dockerfile', 'compose.yaml', 'compose.hostinger.yaml', '.dockerignore',
    '.gitignore', '.env.compose.example', 'scripts/build.mjs',
    'scripts/backup-vps.sh', 'scripts/health-vps.sh', 'scripts/update-vps.sh',
    'scripts/verify-production.sh', 'src/index.js', 'src/hosted.js', 'src/agent.js',
    'linking/index.html', 'linking/app.js', 'linking/privacy.html', 'linking/terms.html',
    'skill-package/interactionModels/custom/es-ES.json',
    'skill-package/interactionModels/custom/es-MX.json',
    'skill-package/interactionModels/custom/es-US.json',
    'skill-package/interactionModels/custom/en-US.json',
])
print('Created Lambda, linking and Docker packages in dist/ (explicit file manifests).')
