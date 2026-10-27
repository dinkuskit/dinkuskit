#!/usr/bin/env python3
"""Verify the complete pre-cleanup PR history without changing live GrillTrack state."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "proof/guide-pilot/history/manifest.json"
MAX_BYTES = 16 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(manifest_path=MANIFEST, check_git=False):
    manifest = json.loads(Path(manifest_path).read_text())
    require(manifest.get("schema") == "dinkuskit.history-archive.v1", "Unknown archive schema")
    require(manifest.get("archive") == "pre-cleanup.tar.gz", "Unexpected archive name")
    require(re.fullmatch(r"[0-9a-f]{40}", manifest.get("sourceCommit", "")), "Invalid source commit")
    records = manifest.get("files")
    require(isinstance(records, list) and 0 < len(records) <= 1000, "Invalid file inventory")
    expected = {}
    for item in records:
        path = item["path"]
        parts = PurePosixPath(path).parts
        require(path.startswith(".grilltrack/") and "\\" not in path and all(p not in (".", "..") for p in parts), "Unsafe archive path")
        require(path == str(PurePosixPath(path)) and path not in expected, "Duplicate or noncanonical archive path")
        require(re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")), "Invalid file hash")
        require(type(item.get("bytes")) is int and 0 <= item["bytes"] <= MAX_BYTES, "Invalid file size")
        expected[path] = item
    archive = (Path(manifest_path).parent / manifest["archive"]).read_bytes()
    require(len(archive) == manifest["archiveBytes"] and len(archive) <= MAX_BYTES, "Archive size mismatch")
    require(hashlib.sha256(archive).hexdigest() == manifest["archiveSha256"], "Archive digest mismatch")
    with gzip.GzipFile(fileobj=io.BytesIO(archive)) as zipped:
        unpacked = zipped.read(MAX_BYTES + 1)
    require(len(unpacked) <= MAX_BYTES, "Expanded archive exceeds limit")
    actual = {}
    with tarfile.open(fileobj=io.BytesIO(unpacked), mode="r:") as tar:
        for member in tar:
            require(member.isfile() and member.name in expected and member.name not in actual, "Unexpected archive member or link")
            data = tar.extractfile(member).read(MAX_BYTES + 1)
            item = expected[member.name]
            require(len(data) == member.size == item["bytes"], "File size mismatch")
            require(hashlib.sha256(data).hexdigest() == item["sha256"], "File digest mismatch")
            actual[member.name] = data
    require(set(actual) == set(expected), "Missing archive members")
    if check_git:
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=ROOT)
        source = manifest["sourceCommit"]
        require(git("rev-parse", source + ":.grilltrack").decode().strip() == manifest["sourceTree"], "Source tree mismatch")
        entries = git("ls-tree", "-r", "-z", source, "--", ".grilltrack").split(b"\0")
        source_paths = set()
        for entry in filter(None, entries):
            metadata, encoded_path = entry.split(b"\t", 1)
            mode, kind, oid = metadata.decode().split()
            path = encoded_path.decode()
            require(mode == "100644" and kind == "blob", "Unexpected source entry")
            require(path in actual and git("cat-file", "blob", oid) == actual[path], "Archived bytes differ from original Git source")
            source_paths.add(path)
        require(source_paths == set(actual), "Source inventory mismatch")
        git("merge-base", "--is-ancestor", source, "HEAD")
    return {"files": len(actual), "rawBytes": sum(map(len, actual.values())), "archiveBytes": len(archive),
            "archiveSha256": manifest["archiveSha256"], "sourceCommit": manifest["sourceCommit"], "gitSourceVerified": check_git}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-git", action="store_true", help="Compare every archived byte with the original ancestor commit")
    args = parser.parse_args()
    print(json.dumps(verify(check_git=args.check_git), indent=2))
