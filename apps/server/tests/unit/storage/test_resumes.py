import asyncio
import io
import os
import threading
from hashlib import sha256
from pathlib import Path
from uuid import UUID

import pytest

from riva.storage import (
    LocalResumeObjectStorage,
    ResumeStorageError,
    build_resume_storage_key,
)


def run(coroutine):
    return asyncio.run(coroutine)


def test_store_read_and_delete(tmp_path: Path) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")
    key = "users/user/resumes/document/source"
    payload = b"resume contents"
    source = io.BytesIO(payload)

    stored = run(storage.store_file(key, source, max_bytes=1024))

    assert stored.key == key
    assert stored.byte_size == len(payload)
    assert stored.sha256 == sha256(payload).hexdigest()
    assert run(storage.read_bytes(key)) == payload

    run(storage.delete(key))
    with pytest.raises(ResumeStorageError) as error:
        run(storage.read_bytes(key))
    assert error.value.code == "resume_object_not_found"


def test_store_reads_in_chunks_and_does_not_close_source(tmp_path: Path) -> None:
    class ChunkedSource(io.BytesIO):
        def __init__(self, value: bytes) -> None:
            super().__init__(value)
            self.read_sizes: list[int] = []

        def read(self, size: int = -1) -> bytes:
            self.read_sizes.append(size)
            return super().read(size)

    storage = LocalResumeObjectStorage(tmp_path / "resumes")
    storage.CHUNK_SIZE = 3
    source = ChunkedSource(b"abcdefgh")

    stored = run(storage.store_file("a/b", source, max_bytes=8))

    assert stored.byte_size == 8
    assert source.closed is False
    assert source.read_sizes == [3, 3, 3, 1]


def test_empty_file_is_rejected_and_temporary_file_is_removed(tmp_path: Path) -> None:
    root = tmp_path / "resumes"
    storage = LocalResumeObjectStorage(root)

    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file("a/b", io.BytesIO(), max_bytes=10))

    assert error.value.code == "resume_file_empty"
    assert list(root.rglob(".riva-resume-*")) == []


def test_file_larger_than_limit_is_rejected_without_extra_reads(tmp_path: Path) -> None:
    class CountingSource(io.BytesIO):
        def __init__(self, value: bytes) -> None:
            super().__init__(value)
            self.read_count = 0

        def read(self, size: int = -1) -> bytes:
            self.read_count += 1
            return super().read(size)

    root = tmp_path / "resumes"
    storage = LocalResumeObjectStorage(root)
    source = CountingSource(b"12345")

    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file("a/b", source, max_bytes=4))

    assert error.value.code == "resume_file_too_large"
    assert source.read_count == 1
    assert list(root.rglob(".riva-resume-*")) == []


def test_existing_target_is_never_overwritten(tmp_path: Path) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")
    key = "a/b"

    run(storage.store_file(key, io.BytesIO(b"original"), max_bytes=100))
    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file(key, io.BytesIO(b"replacement"), max_bytes=100))

    assert error.value.code == "resume_storage_collision"
    assert run(storage.read_bytes(key)) == b"original"


def test_same_key_concurrent_writes_only_publish_one_object(tmp_path: Path) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")
    barrier = threading.Barrier(2)

    class CoordinatedSource(io.BytesIO):
        def read(self, size: int = -1) -> bytes:
            barrier.wait()
            return super().read(size)

    async def write_once(payload: bytes):
        return await storage.store_file(
            "same/key",
            CoordinatedSource(payload),
            max_bytes=100,
        )

    async def run_writes():
        return await asyncio.gather(
            write_once(b"first"),
            write_once(b"second"),
            return_exceptions=True,
        )

    results = run(run_writes())

    successes = [result for result in results if not isinstance(result, Exception)]
    collisions = [
        result
        for result in results
        if isinstance(result, ResumeStorageError)
        and result.code == "resume_storage_collision"
    ]
    assert len(successes) == 1
    assert len(collisions) == 1
    assert run(storage.read_bytes("same/key")) in {b"first", b"second"}


@pytest.mark.parametrize(
    "key",
    [
        "/absolute/path",
        "../escape",
        "a/../escape",
        r"a\..\escape",
        "a//b",
        "a/./b",
        "a/b/",
        "",
        "C:/absolute/path",
        "C:relative/path",
        "a\x00b",
    ],
)
def test_invalid_storage_keys_are_rejected(tmp_path: Path, key: str) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")

    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file(key, io.BytesIO(b"data"), max_bytes=100))

    assert error.value.code == "invalid_storage_key"


def test_symlink_outside_root_is_rejected(tmp_path: Path) -> None:
    root = tmp_path / "resumes"
    outside = tmp_path / "outside"
    outside.mkdir()
    (root / "a").mkdir(parents=True)
    (root / "a" / "link").symlink_to(outside, target_is_directory=True)
    storage = LocalResumeObjectStorage(root)

    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file("a/link/source", io.BytesIO(b"data"), max_bytes=100))

    assert error.value.code == "invalid_storage_key"
    assert list(outside.iterdir()) == []


def test_write_failure_cleans_temporary_file(tmp_path: Path) -> None:
    class FailingSource(io.BytesIO):
        def read(self, size: int = -1) -> bytes:
            if self.tell() > 0:
                raise OSError("simulated source failure")
            return super().read(size)

    root = tmp_path / "resumes"
    storage = LocalResumeObjectStorage(root)

    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file("a/b", FailingSource(b"data"), max_bytes=100))

    assert error.value.code == "resume_storage_unavailable"
    assert list(root.rglob(".riva-resume-*")) == []


def test_post_publish_temporary_cleanup_failure_removes_new_target(
    tmp_path: Path,
    monkeypatch,
) -> None:
    root = tmp_path / "resumes"
    storage = LocalResumeObjectStorage(root)
    original_unlink = os.unlink
    temporary_cleanup_failed = False

    def fail_post_publish_temporary_cleanup(path) -> None:
        nonlocal temporary_cleanup_failed
        if not temporary_cleanup_failed and Path(path).name.startswith(
            storage._TEMP_PREFIX
        ):
            temporary_cleanup_failed = True
            raise OSError("controlled temporary cleanup failure")
        original_unlink(path)

    monkeypatch.setattr(os, "unlink", fail_post_publish_temporary_cleanup)

    with pytest.raises(ResumeStorageError) as error:
        run(storage.store_file("a/b", io.BytesIO(b"data"), max_bytes=100))

    assert error.value.code == "resume_storage_unavailable"
    assert temporary_cleanup_failed is True
    with pytest.raises(ResumeStorageError) as read_error:
        run(storage.read_bytes("a/b"))
    assert read_error.value.code == "resume_object_not_found"
    assert list(root.rglob(".riva-resume-*")) == []


def test_missing_delete_is_idempotent(tmp_path: Path) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")

    run(storage.delete("missing/object"))
    run(storage.delete("missing/object"))


def test_key_does_not_use_original_filename() -> None:
    key = build_resume_storage_key(
        user_id=UUID("11111111-1111-1111-1111-111111111111"),
        resume_document_id=UUID("22222222-2222-2222-2222-222222222222"),
    )

    assert "resume.pdf" not in key
    assert key == (
        "users/11111111111111111111111111111111/"
        "resumes/22222222222222222222222222222222/source"
    )


def test_generated_keys_are_stable_and_uuid_scoped() -> None:
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    document_id = UUID("22222222-2222-2222-2222-222222222222")

    assert build_resume_storage_key(user_id, document_id) == build_resume_storage_key(
        user_id, document_id
    )
    assert build_resume_storage_key(user_id, document_id) != build_resume_storage_key(
        user_id, UUID("33333333-3333-3333-3333-333333333333")
    )


@pytest.mark.skipif(os.name != "posix", reason="POSIX permissions are unavailable")
def test_posix_permissions_are_restrictive(tmp_path: Path) -> None:
    root = tmp_path / "resumes"
    storage = LocalResumeObjectStorage(root)
    key = "users/user/resumes/document/source"

    run(storage.store_file(key, io.BytesIO(b"data"), max_bytes=100))

    assert (root.stat().st_mode & 0o777) == 0o700
    assert (root / "users").stat().st_mode & 0o777 == 0o700
    document_directory = root / "users" / "user" / "resumes" / "document"
    stored_file = document_directory / "source"
    assert document_directory.stat().st_mode & 0o777 == 0o700
    assert stored_file.stat().st_mode & 0o777 == 0o600


def test_storage_operations_run_in_a_worker_thread(tmp_path: Path, monkeypatch) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")
    called = threading.Event()
    original_to_thread = asyncio.to_thread

    async def tracking_to_thread(function, /, *args, **kwargs):
        called.set()
        return await original_to_thread(function, *args, **kwargs)

    monkeypatch.setattr(asyncio, "to_thread", tracking_to_thread)

    run(storage.store_file("a/b", io.BytesIO(b"data"), max_bytes=100))

    assert called.is_set()


def test_no_other_document_is_removed_when_parent_is_not_empty(tmp_path: Path) -> None:
    storage = LocalResumeObjectStorage(tmp_path / "resumes")
    first_key = "users/u/resumes/one/source"
    second_key = "users/u/resumes/two/source"

    run(storage.store_file(first_key, io.BytesIO(b"one"), max_bytes=100))
    run(storage.store_file(second_key, io.BytesIO(b"two"), max_bytes=100))
    run(storage.delete(first_key))

    assert run(storage.read_bytes(second_key)) == b"two"
