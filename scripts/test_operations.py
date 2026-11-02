"""Exercise upgrades against temporary Git repos and simulated Docker/HTTP failures."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parent.parent

class OperationsTests(unittest.TestCase):
    def test_upgrade_failure_matrix(self):
        for scenario in ['success', 'dirty', 'build', 'startup', 'health', 'locked']:
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                repo = root / 'repo'
                repo.mkdir()
                def git(*args):
                    return subprocess.check_output(['git', *args], cwd=repo, text=True).strip()
                git('init', '-b', 'codex/evoll-alexa')
                git('config', 'user.email', 'test@example.invalid')
                git('config', 'user.name', 'Test')
                (repo / 'scripts').mkdir()
                shutil.copyfile(SOURCE / 'scripts/update-vps.sh', repo / 'scripts/update-vps.sh')
                (repo / 'scripts/backup-vps.sh').write_text('#!/bin/sh\necho backup >> "$TEST_LOG"\n')
                (repo / 'scripts/backup-vps.sh').chmod(0o755)
                (repo / 'version').write_text('old')
                git('add', '.')
                git('commit', '-qm', 'old')
                old = git('rev-parse', 'HEAD')
                git('clone', '--bare', '.', str(root / 'remote'))
                git('remote', 'add', 'origin', str(root / 'remote'))
                (repo / 'version').write_text('new')
                git('commit', '-qam', 'new')
                git('push', 'origin', 'HEAD')
                git('reset', '--hard', old)
                binaries = root / 'bin'
                binaries.mkdir()
                commands = {
                    'docker': '''#!/bin/sh
 echo "docker $*" >> "$TEST_LOG"
 case "$*" in
   *'build linking'*) [ "$SCENARIO" != build ] || exit 1 ;;
   *'up -d'*)
     if [ ! -f "$TEST_FIRST_UP" ]; then
       touch "$TEST_FIRST_UP"
       [ "$SCENARIO" != startup ] || exit 1
     else
       touch "$TEST_RECOVERED"
     fi ;;
 esac
 exit 0
''',
                    'curl': '''#!/bin/sh
 echo curl >> "$TEST_LOG"
 if [ "$SCENARIO" = health ] && [ ! -f "$TEST_RECOVERED" ]; then exit 1; fi
 exit 0
''',
                    'sleep': '#!/bin/sh\nexit 0\n',
                }
                for name, content in commands.items():
                    (binaries / name).write_text(content)
                    (binaries / name).chmod(0o755)
                env = dict(os.environ, PATH=str(binaries)+':'+os.environ['PATH'],
                           SCENARIO=scenario, TEST_LOG=str(root/'log'),
                           TEST_FIRST_UP=str(root/'first'), TEST_RECOVERED=str(root/'recovered'))
                if scenario == 'dirty':
                    (repo / 'version').write_text('local edit')
                lock = None
                if scenario == 'locked':
                    import fcntl
                    lock = (repo / '.git/evoll-deploy.lock').open('w')
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                try:
                    result = subprocess.run(['bash', 'scripts/update-vps.sh'], cwd=repo,
                                            env=env, capture_output=True, text=True, timeout=10)
                finally:
                    if lock: lock.close()
                self.assertEqual(result.returncode == 0, scenario == 'success', result.stderr)
                self.assertEqual((repo/'version').read_text(),
                                 'new' if scenario == 'success' else 'local edit' if scenario == 'dirty' else 'old')
                log = (root/'log').read_text() if (root/'log').exists() else ''
                if scenario in ['dirty', 'locked']:
                    self.assertEqual(log, '')
                if scenario == 'build':
                    self.assertNotIn('up -d', log)
                if scenario in ['startup', 'health']:
                    self.assertEqual(log.count('up -d'), 2)
                    self.assertTrue((root/'recovered').exists())
                for line in log.splitlines():
                    if 'compose ' in line:
                        self.assertTrue(line.endswith(' linking'))

    def test_health_rejects_stopped_or_unhealthy_container(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, code in {'docker':'echo "$TEST_STATE"', 'curl':'exit 0'}.items():
                (root/name).write_text('#!/bin/sh\n'+code+'\n')
                (root/name).chmod(0o755)
            for state in ['running healthy', 'exited healthy', 'running unhealthy', 'running starting']:
                env = dict(os.environ, PATH=str(root)+':'+os.environ['PATH'], TEST_STATE=state,
                           ALERT_WEBHOOK_URL='')
                result = subprocess.run(['bash', str(SOURCE/'scripts/health-vps.sh')],
                                        env=env, capture_output=True)
                self.assertEqual(result.returncode == 0, state == 'running healthy')

if __name__ == '__main__':
    unittest.main()
