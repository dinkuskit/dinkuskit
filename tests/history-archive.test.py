import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import subprocess
import unittest

spec = importlib.util.spec_from_file_location("archive_check", Path(__file__).resolve().parents[1] / "scripts/check-history-archive.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveTest(unittest.TestCase):
    def fixture(self, root, *, member_name=".grilltrack/ledger.json", link=False, missing=False):
        content = b'{"synthetic": true}\n'
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as tar:
            if not missing:
                info = tarfile.TarInfo(member_name)
                info.size = len(content)
                if link:
                    info.type = tarfile.SYMTYPE
                    info.linkname = "/etc/passwd"
                    info.size = 0
                tar.addfile(info, None if link else io.BytesIO(content))
        archive = gzip.compress(raw.getvalue(), mtime=0)
        (root / "pre-cleanup.tar.gz").write_bytes(archive)
        manifest = {"schema": "dinkuskit.history-archive.v1", "sourceCommit": "a" * 40,
                    "archive": "pre-cleanup.tar.gz", "archiveBytes": len(archive), "archiveSha256": hashlib.sha256(archive).hexdigest(),
                    "files": [{"path": member_name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}]}
        path = root / "manifest.json"
        path.write_text(json.dumps(manifest))
        return path

    def test_valid_and_tampered_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            self.assertEqual(module.verify(manifest)["files"], 1)
            with (root / "pre-cleanup.tar.gz").open("ab") as file:
                file.write(b"changed")
            with self.assertRaises(ValueError): module.verify(manifest)

    def test_missing_member(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError): module.verify(self.fixture(Path(directory), missing=True))

    def test_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError): module.verify(self.fixture(Path(directory), member_name=".grilltrack/../../escape"))

    def test_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError): module.verify(self.fixture(Path(directory), link=True))

    def test_retained_tags_work_after_squash_style_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", *args], cwd=root).decode().strip()
            git("init", "--quiet")
            (root / ".grilltrack").mkdir()
            (root / ".grilltrack/ledger.json").write_bytes(b'{"synthetic": true}\n')
            git("add", ".grilltrack"); git("commit", "-qm", "Original history")
            source = git("rev-parse", "HEAD"); tree = git("rev-parse", "HEAD:.grilltrack")
            git("tag", "source-retained")
            manifest = self.fixture(root)
            archive_path = "proof/guide-pilot/history/pre-cleanup.tar.gz"
            (root / archive_path).parent.mkdir(parents=True)
            (root / archive_path).write_bytes((root / "pre-cleanup.tar.gz").read_bytes())
            git("add", "proof"); git("commit", "-qm", "Retained archive")
            archive_commit = git("rev-parse", "HEAD"); blob = git("rev-parse", "HEAD:" + archive_path)
            git("tag", "archive-retained")
            data = json.loads(manifest.read_text())
            data.update(sourceCommit=source, sourceTree=tree, retainedRef="refs/tags/source-retained", archiveGitCommit=archive_commit,
                        archiveGitPath=archive_path, archiveGitBlob=blob, archiveRetainedRef="refs/tags/archive-retained")
            # A squash result has no ancestry edge to the original commits.
            git("checkout", "--orphan", "squash-result")
            git("rm", "-rf", "--quiet", ".grilltrack", "proof")
            (root / "README").write_text("Squashed product source\n")
            git("add", "README"); git("commit", "-qm", "Squash result")
            manifest.write_text(json.dumps(data))
            previous_root = module.ROOT
            try:
                module.ROOT = root
                self.assertTrue(module.verify(manifest, check_git=True)["gitSourceVerified"])
            finally:
                module.ROOT = previous_root


if __name__ == "__main__": unittest.main()
