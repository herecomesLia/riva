from __future__ import annotations

import asyncio
from dataclasses import dataclass
import errno
from hashlib import sha256
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import tempfile
from typing import BinaryIO, Protocol
from uuid import UUID


INVALID_STORAGE_KEY = "invalid_storage_key"
RESUME_FILE_EMPTY = "resume_file_empty"
RESUME_FILE_TOO_LARGE = "resume_file_too_large"
RESUME_STORAGE_COLLISION = "resume_storage_collision"
RESUME_STORAGE_UNAVAILABLE = "resume_storage_unavailable"
RESUME_OBJECT_NOT_FOUND = "resume_object_not_found"


@dataclass(frozen=True, slots=True)
class StoredResumeObject:
    key: str
    byte_size: int
    sha256: str


class ResumeStorageError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ResumeObjectStorage(Protocol):
    async def store_file(
        self,
        key: str,
        file_obj: BinaryIO,
        max_bytes: int,
    ) -> StoredResumeObject:
        ...

    async def read_bytes(self, key: str) -> bytes:
        ...

    async def delete(self, key: str) -> None:
        ...


def build_resume_storage_key(
    user_id: UUID,
    resume_document_id: UUID,
) -> str:
    if not isinstance(user_id, UUID) or not isinstance(resume_document_id, UUID):
        raise TypeError("user_id and resume_document_id must be UUID instances")
    return (
        f"users/{user_id.hex}/resumes/"
        f"{resume_document_id.hex}/source"
    )


class LocalResumeObjectStorage:
    CHUNK_SIZE = 64 * 1024
    _TEMP_PREFIX = ".riva-resume-"

    def __init__(self, root: Path) -> None:
        self._root = Path(root).resolve(strict=False)

    async def store_file(
        self,
        key: str,
        file_obj: BinaryIO,
        max_bytes: int,
    ) -> StoredResumeObject:
        if max_bytes <= 0:
            raise ValueError("max_bytes must be greater than zero")
        return await asyncio.to_thread(
            self._store_file_sync,
            key,
            file_obj,
            max_bytes,
        )

    async def read_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._read_bytes_sync, key)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete_sync, key)

    def _store_file_sync(
        self,
        key: str,
        file_obj: BinaryIO,
        max_bytes: int,
    ) -> StoredResumeObject:
        target = self._path_for_key(key)
        self._ensure_directory_tree(target.parent)
        temporary_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=target.parent,
                prefix=self._TEMP_PREFIX,
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                self._set_file_mode(temporary_path)
                digest = sha256()
                byte_size = 0

                while True:
                    read_size = min(
                        self.CHUNK_SIZE,
                        max_bytes - byte_size + 1,
                    )
                    chunk = file_obj.read(read_size)
                    if not chunk:
                        break
                    chunk_size = len(chunk)
                    if byte_size + chunk_size > max_bytes:
                        raise ResumeStorageError(RESUME_FILE_TOO_LARGE)
                    temporary_file.write(chunk)
                    digest.update(chunk)
                    byte_size += chunk_size

                if byte_size == 0:
                    raise ResumeStorageError(RESUME_FILE_EMPTY)

                temporary_file.flush()
                os.fsync(temporary_file.fileno())

            try:
                os.link(temporary_path, target, follow_symlinks=False)
            except FileExistsError:
                raise ResumeStorageError(RESUME_STORAGE_COLLISION) from None
            except OSError:
                raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None

            os.unlink(temporary_path)
            temporary_path = None
            return StoredResumeObject(
                key=key,
                byte_size=byte_size,
                sha256=digest.hexdigest(),
            )
        except ResumeStorageError:
            raise
        except Exception:
            raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None
        finally:
            if temporary_path is not None:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass
                except OSError:
                    pass

    def _read_bytes_sync(self, key: str) -> bytes:
        path = self._path_for_key(key)
        try:
            with path.open("rb") as stored_file:
                return stored_file.read()
        except FileNotFoundError:
            raise ResumeStorageError(RESUME_OBJECT_NOT_FOUND) from None
        except OSError:
            raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None

    def _delete_sync(self, key: str) -> None:
        path = self._path_for_key(key)
        try:
            path.unlink()
        except FileNotFoundError:
            return
        except OSError:
            raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None

        if path.parent == self._root:
            return

        try:
            path.parent.rmdir()
        except FileNotFoundError:
            pass
        except OSError as exc:
            if exc.errno not in (errno.ENOTEMPTY, errno.EEXIST):
                raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None

    def _path_for_key(self, key: str) -> Path:
        parts = _validate_storage_key(key)
        candidate = self._root.joinpath(*parts)
        try:
            resolved = candidate.resolve(strict=False)
            resolved.relative_to(self._root)
        except ValueError:
            raise ResumeStorageError(INVALID_STORAGE_KEY) from None
        except (OSError, RuntimeError):
            raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None
        return candidate

    def _ensure_directory_tree(self, directory: Path) -> None:
        try:
            relative_parts = directory.relative_to(self._root).parts
            current = self._root
            current.mkdir(mode=0o700, exist_ok=True)
            self._set_directory_mode(current)
            for part in relative_parts:
                current = current / part
                current.mkdir(mode=0o700, exist_ok=True)
                self._set_directory_mode(current)
        except OSError:
            raise ResumeStorageError(RESUME_STORAGE_UNAVAILABLE) from None

    @staticmethod
    def _set_directory_mode(directory: Path) -> None:
        if os.name == "posix":
            os.chmod(directory, 0o700)

    @staticmethod
    def _set_file_mode(file_path: Path) -> None:
        if os.name == "posix":
            os.chmod(file_path, 0o600)


def _validate_storage_key(key: str) -> tuple[str, ...]:
    if not isinstance(key, str) or not key or "\x00" in key or "\\" in key:
        raise ResumeStorageError(INVALID_STORAGE_KEY)
    if PurePosixPath(key).is_absolute():
        raise ResumeStorageError(INVALID_STORAGE_KEY)

    windows_path = PureWindowsPath(key)
    if windows_path.is_absolute() or windows_path.drive:
        raise ResumeStorageError(INVALID_STORAGE_KEY)

    parts = tuple(key.split("/"))
    if any(not part or part in {".", ".."} for part in parts):
        raise ResumeStorageError(INVALID_STORAGE_KEY)
    return parts
