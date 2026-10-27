import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
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


if __name__ == "__main__": unittest.main()
