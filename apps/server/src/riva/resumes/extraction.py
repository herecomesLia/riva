from __future__ import annotations

import asyncio
from dataclasses import dataclass
from io import BytesIO
import math
from pathlib import PurePosixPath, PureWindowsPath
import re
from typing import Protocol
import unicodedata
import xml.etree.ElementTree as ElementTree
import zipfile

from pypdf import PdfReader


TEXT_PLAIN = "text/plain"
APPLICATION_PDF = "application/pdf"
APPLICATION_DOCX = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
APPLICATION_OCTET_STREAM = "application/octet-stream"

RESUME_MEDIA_TYPE_UNSUPPORTED = "resume_media_type_unsupported"
RESUME_MEDIA_TYPE_MISMATCH = "resume_media_type_mismatch"
RESUME_TEXT_DECODE_FAILED = "resume_text_decode_failed"
RESUME_TEXT_EMPTY = "resume_text_empty"
RESUME_TEXT_TOO_LARGE = "resume_text_too_large"
RESUME_PDF_INVALID = "resume_pdf_invalid"
RESUME_PDF_ENCRYPTED = "resume_pdf_encrypted"
RESUME_PDF_TOO_MANY_PAGES = "resume_pdf_too_many_pages"
RESUME_PDF_EXTRACTION_FAILED = "resume_pdf_extraction_failed"
RESUME_DOCX_INVALID = "resume_docx_invalid"
RESUME_DOCX_UNSAFE = "resume_docx_unsafe"
RESUME_DOCX_ARCHIVE_TOO_LARGE = "resume_docx_archive_too_large"
RESUME_DOCX_EXTRACTION_FAILED = "resume_docx_extraction_failed"

_SUPPORTED_MEDIA_TYPES = frozenset(
    {TEXT_PLAIN, APPLICATION_PDF, APPLICATION_DOCX}
)
_ERROR_CODES = frozenset(
    {
        RESUME_MEDIA_TYPE_UNSUPPORTED,
        RESUME_MEDIA_TYPE_MISMATCH,
        RESUME_TEXT_DECODE_FAILED,
        RESUME_TEXT_EMPTY,
        RESUME_TEXT_TOO_LARGE,
        RESUME_PDF_INVALID,
        RESUME_PDF_ENCRYPTED,
        RESUME_PDF_TOO_MANY_PAGES,
        RESUME_PDF_EXTRACTION_FAILED,
        RESUME_DOCX_INVALID,
        RESUME_DOCX_UNSAFE,
        RESUME_DOCX_ARCHIVE_TOO_LARGE,
        RESUME_DOCX_EXTRACTION_FAILED,
    }
)
_WORDPROCESSINGML_DOCUMENT_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
)
_XML_UNSAFE_PATTERN = re.compile(rb"<!\s*(?:doctype|entity)\b", re.IGNORECASE)
_ZIP_SIGNATURES = {
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
}
_OLE_COMPOUND_FILE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_HTML_OR_RTF_PATTERN = re.compile(
    rb"^\s*(?:\{\\rtf(?:\d|\b)|<!doctype\s+html\b|<html(?:\s|>))",
    re.IGNORECASE,
)
_IMAGE_SIGNATURES = (
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"GIF87a",
    b"GIF89a",
    b"BM",
    b"II*\x00",
    b"MM\x00*",
)


@dataclass(frozen=True, slots=True)
class ExtractedResumeText:
    media_type: str
    text: str


class ResumeExtractionError(RuntimeError):
    code: str

    def __init__(self, code: str) -> None:
        if code not in _ERROR_CODES:
            raise ValueError("unsupported resume extraction error code")
        self.code = code
        super().__init__(code)


class ResumeTextExtractor(Protocol):
    async def extract(
        self,
        data: bytes,
        *,
        declared_media_type: str | None,
        max_characters: int,
    ) -> ExtractedResumeText:
        ...


def normalize_resume_text(
    value: str,
    *,
    max_characters: int,
) -> str:
    if not isinstance(value, str):
        raise TypeError("value must be a string")
    _validate_max_characters(max_characters)

    normalized = unicodedata.normalize("NFC", value)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")

    cleaned: list[str] = []
    for character in normalized:
        if character in {"\t", "\n"}:
            cleaned.append(character)
        elif unicodedata.category(character) != "Cc":
            cleaned.append(character)
    normalized = "".join(cleaned)

    lines = [line.rstrip() for line in normalized.split("\n")]
    collapsed_lines: list[str] = []
    blank_line_count = 0
    for line in lines:
        if line == "":
            blank_line_count += 1
            if blank_line_count <= 2:
                collapsed_lines.append(line)
        else:
            blank_line_count = 0
            collapsed_lines.append(line)

    normalized = "\n".join(collapsed_lines).strip()
    if not normalized:
        raise ResumeExtractionError(RESUME_TEXT_EMPTY)
    if len(normalized) > max_characters:
        raise ResumeExtractionError(RESUME_TEXT_TOO_LARGE)
    return normalized


class DefaultResumeTextExtractor:
    def __init__(
        self,
        *,
        max_pdf_pages: int = 100,
        pdf_root_object_recovery_limit: int = 10_000,
        max_archive_members: int = 256,
        max_total_uncompressed_bytes: int = 32 * 1024 * 1024,
        max_xml_member_bytes: int = 8 * 1024 * 1024,
        max_compression_ratio: float = 200,
    ) -> None:
        _validate_positive_limit(max_pdf_pages, "max_pdf_pages")
        _validate_positive_limit(
            pdf_root_object_recovery_limit,
            "pdf_root_object_recovery_limit",
        )
        _validate_positive_limit(max_archive_members, "max_archive_members")
        _validate_positive_limit(
            max_total_uncompressed_bytes,
            "max_total_uncompressed_bytes",
        )
        _validate_positive_limit(max_xml_member_bytes, "max_xml_member_bytes")
        _validate_positive_limit(max_compression_ratio, "max_compression_ratio")

        self.max_pdf_pages = max_pdf_pages
        self.pdf_root_object_recovery_limit = pdf_root_object_recovery_limit
        self.max_archive_members = max_archive_members
        self.max_total_uncompressed_bytes = max_total_uncompressed_bytes
        self.max_xml_member_bytes = max_xml_member_bytes
        self.max_compression_ratio = max_compression_ratio

    async def extract(
        self,
        data: bytes,
        *,
        declared_media_type: str | None,
        max_characters: int,
    ) -> ExtractedResumeText:
        if not isinstance(data, bytes):
            raise TypeError("data must be bytes")
        _validate_max_characters(max_characters)
        return await asyncio.to_thread(
            self._extract_sync,
            data,
            declared_media_type,
            max_characters,
        )

    def _extract_sync(
        self,
        data: bytes,
        declared_media_type: str | None,
        max_characters: int,
    ) -> ExtractedResumeText:
        if not data:
            raise ResumeExtractionError(RESUME_TEXT_EMPTY)

        declared = _normalize_declared_media_type(declared_media_type)
        detected = _detect_media_type(data)
        if declared is not None and declared != detected:
            raise ResumeExtractionError(RESUME_MEDIA_TYPE_MISMATCH)

        if detected == TEXT_PLAIN:
            text = _extract_text(data, max_characters=max_characters)
        elif detected == APPLICATION_PDF:
            text = self._extract_pdf(data, max_characters=max_characters)
        else:
            text = self._extract_docx(data, max_characters=max_characters)
        return ExtractedResumeText(media_type=detected, text=text)

    def _extract_pdf(self, data: bytes, *, max_characters: int) -> str:
        try:
            reader = PdfReader(
                BytesIO(data),
                strict=False,
                root_object_recovery_limit=self.pdf_root_object_recovery_limit,
            )
        except Exception:
            raise ResumeExtractionError(RESUME_PDF_INVALID) from None

        try:
            encrypted = reader.is_encrypted
        except Exception:
            raise ResumeExtractionError(RESUME_PDF_INVALID) from None
        if encrypted:
            raise ResumeExtractionError(RESUME_PDF_ENCRYPTED)

        try:
            pages = reader.pages
            page_count = len(pages)
        except Exception:
            raise ResumeExtractionError(RESUME_PDF_INVALID) from None
        if page_count > self.max_pdf_pages:
            raise ResumeExtractionError(RESUME_PDF_TOO_MANY_PAGES)

        accumulator = _TextAccumulator(max_characters)
        try:
            for page_number, page in enumerate(pages):
                try:
                    page_text = page.extract_text()
                except ResumeExtractionError:
                    raise
                except Exception:
                    raise ResumeExtractionError(
                        RESUME_PDF_EXTRACTION_FAILED
                    ) from None
                if page_text is None:
                    page_text = ""
                if not isinstance(page_text, str):
                    raise ResumeExtractionError(RESUME_PDF_EXTRACTION_FAILED)
                if page_number:
                    accumulator.add("\n", structural=True)
                accumulator.add(page_text)
        except ResumeExtractionError:
            raise
        except Exception:
            raise ResumeExtractionError(RESUME_PDF_EXTRACTION_FAILED) from None

        return normalize_resume_text(
            accumulator.value,
            max_characters=max_characters,
        )

    def _extract_docx(self, data: bytes, *, max_characters: int) -> str:
        try:
            archive = zipfile.ZipFile(BytesIO(data), mode="r")
        except Exception:
            raise ResumeExtractionError(RESUME_DOCX_INVALID) from None

        try:
            infos = archive.infolist()
            members = self._validate_archive(infos)
            content_types_info = members.get("[Content_Types].xml")
            document_info = members.get("word/document.xml")
            if content_types_info is None or document_info is None:
                raise ResumeExtractionError(RESUME_DOCX_INVALID)

            content_types = self._read_xml_member(
                archive,
                content_types_info,
            )
            self._validate_content_types(content_types)

            xml_names = ["word/document.xml"]
            xml_names.extend(
                sorted(
                    name
                    for name in members
                    if _is_additional_word_text_member(name)
                )
            )
            accumulator = _TextAccumulator(max_characters)
            for member_number, name in enumerate(xml_names):
                if member_number and accumulator.has_value:
                    accumulator.add("\n", structural=True)
                xml_data = self._read_xml_member(archive, members[name])
                root = _parse_xml(xml_data)
                try:
                    _append_wordprocessingml_text(root, accumulator)
                except ResumeExtractionError:
                    raise
                except Exception:
                    raise ResumeExtractionError(
                        RESUME_DOCX_EXTRACTION_FAILED
                    ) from None

            return normalize_resume_text(
                accumulator.value,
                max_characters=max_characters,
            )
        except ResumeExtractionError:
            raise
        except Exception:
            raise ResumeExtractionError(RESUME_DOCX_INVALID) from None
        finally:
            archive.close()

    def _validate_archive(
        self,
        infos: list[zipfile.ZipInfo],
    ) -> dict[str, zipfile.ZipInfo]:
        if len(infos) > self.max_archive_members:
            raise ResumeExtractionError(RESUME_DOCX_ARCHIVE_TOO_LARGE)

        total_uncompressed_bytes = 0
        members: dict[str, zipfile.ZipInfo] = {}
        for info in infos:
            _validate_zip_member_name(info.filename)
            if info.filename in members:
                raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
            if info.flag_bits & 0x1:
                raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
            if info.compress_type not in {
                zipfile.ZIP_STORED,
                zipfile.ZIP_DEFLATED,
            }:
                raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
            if info.file_size < 0 or info.compress_size < 0:
                raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
            if info.file_size > 0 and info.compress_size == 0:
                raise ResumeExtractionError(RESUME_DOCX_ARCHIVE_TOO_LARGE)

            total_uncompressed_bytes += info.file_size
            if total_uncompressed_bytes > self.max_total_uncompressed_bytes:
                raise ResumeExtractionError(RESUME_DOCX_ARCHIVE_TOO_LARGE)

            compressed_size = max(info.compress_size, 1)
            if info.file_size / compressed_size > self.max_compression_ratio:
                raise ResumeExtractionError(RESUME_DOCX_ARCHIVE_TOO_LARGE)

            if info.filename.casefold() == "word/vbaproject.bin":
                raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
            members[info.filename] = info
        return members

    def _read_xml_member(
        self,
        archive: zipfile.ZipFile,
        info: zipfile.ZipInfo,
    ) -> bytes:
        if info.file_size > self.max_xml_member_bytes:
            raise ResumeExtractionError(RESUME_DOCX_ARCHIVE_TOO_LARGE)

        chunks: list[bytes] = []
        total_bytes = 0
        try:
            with archive.open(info, mode="r") as member:
                while True:
                    chunk = member.read(
                        min(64 * 1024, self.max_xml_member_bytes - total_bytes + 1)
                    )
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > self.max_xml_member_bytes:
                        raise ResumeExtractionError(
                            RESUME_DOCX_ARCHIVE_TOO_LARGE
                        )
                    chunks.append(chunk)
        except ResumeExtractionError:
            raise
        except Exception:
            raise ResumeExtractionError(RESUME_DOCX_INVALID) from None
        return b"".join(chunks)

    @staticmethod
    def _validate_content_types(data: bytes) -> None:
        root = _parse_xml(data)
        has_standard_main_document = False
        for element in root.iter():
            content_type = element.attrib.get("ContentType", "")
            if "macroenabled" in content_type.casefold():
                raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
            if (
                element.tag.rsplit("}", 1)[-1] == "Override"
                and element.attrib.get("PartName", "").casefold()
                == "/word/document.xml"
                and content_type
                == _WORDPROCESSINGML_DOCUMENT_CONTENT_TYPE
            ):
                has_standard_main_document = True
        if not has_standard_main_document:
            raise ResumeExtractionError(RESUME_DOCX_INVALID)


def _validate_max_characters(max_characters: int) -> None:
    _validate_positive_limit(max_characters, "max_characters")


def _validate_positive_limit(value: int | float, name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite positive number")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{name} must be a finite positive number")
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")


def _normalize_declared_media_type(
    declared_media_type: str | None,
) -> str | None:
    if declared_media_type is None:
        return None
    if not isinstance(declared_media_type, str):
        raise TypeError("declared_media_type must be a string or None")

    media_type = declared_media_type.split(";", 1)[0].strip().lower()
    if not media_type or media_type == APPLICATION_OCTET_STREAM:
        return None
    if media_type not in _SUPPORTED_MEDIA_TYPES:
        raise ResumeExtractionError(RESUME_MEDIA_TYPE_UNSUPPORTED)
    return media_type


def _detect_media_type(data: bytes) -> str:
    if _looks_like_pdf(data):
        return APPLICATION_PDF
    if _looks_like_zip(data):
        return APPLICATION_DOCX
    if _looks_like_unsupported_format(data):
        raise ResumeExtractionError(RESUME_MEDIA_TYPE_UNSUPPORTED)
    return TEXT_PLAIN


def _looks_like_pdf(data: bytes) -> bool:
    return b"%PDF-" in data[:1024]


def _looks_like_zip(data: bytes) -> bool:
    return data[:4] in _ZIP_SIGNATURES or zipfile.is_zipfile(BytesIO(data))


def _looks_like_unsupported_format(data: bytes) -> bool:
    if data.startswith(_OLE_COMPOUND_FILE_SIGNATURE):
        return True
    if data.startswith((b"RIFF",)) and data[8:12] == b"WEBP":
        return True
    if data.startswith(_IMAGE_SIGNATURES):
        return True
    text_prefix = data.lstrip(b" \t\r\n\xef\xbb\xbf")
    return _HTML_OR_RTF_PATTERN.match(text_prefix) is not None


def _extract_text(data: bytes, *, max_characters: int) -> str:
    text = _decode_text(data)
    if _contains_binary_control_character(text):
        raise ResumeExtractionError(RESUME_TEXT_DECODE_FAILED)
    return normalize_resume_text(text, max_characters=max_characters)


def _decode_text(data: bytes) -> str:
    if data.startswith((b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff")):
        raise ResumeExtractionError(RESUME_TEXT_DECODE_FAILED)
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        encoding = "utf-16"
    elif data.startswith(b"\xef\xbb\xbf"):
        encoding = "utf-8-sig"
    else:
        encoding = "utf-8"

    try:
        return data.decode(encoding)
    except UnicodeDecodeError:
        raise ResumeExtractionError(RESUME_TEXT_DECODE_FAILED) from None


def _contains_binary_control_character(value: str) -> bool:
    return any(
        unicodedata.category(character) == "Cc"
        and character not in {"\t", "\n", "\r"}
        for character in value
    )


def _validate_zip_member_name(name: str) -> None:
    if not name or "\x00" in name or "\\" in name:
        raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
    if PurePosixPath(name).is_absolute():
        raise ResumeExtractionError(RESUME_DOCX_UNSAFE)

    windows_path = PureWindowsPath(name)
    if windows_path.is_absolute() or windows_path.drive:
        raise ResumeExtractionError(RESUME_DOCX_UNSAFE)

    parts = name.split("/")
    if any(not part or part in {".", ".."} for part in parts):
        raise ResumeExtractionError(RESUME_DOCX_UNSAFE)


def _is_additional_word_text_member(name: str) -> bool:
    return (
        name.startswith("word/header") and name.endswith(".xml")
    ) or (
        name.startswith("word/footer") and name.endswith(".xml")
    ) or name in {"word/footnotes.xml", "word/endnotes.xml"}


def _parse_xml(data: bytes) -> ElementTree.Element:
    if _XML_UNSAFE_PATTERN.search(data):
        raise ResumeExtractionError(RESUME_DOCX_UNSAFE)
    try:
        return ElementTree.fromstring(data)
    except Exception:
        raise ResumeExtractionError(RESUME_DOCX_INVALID) from None


def _append_wordprocessingml_text(
    element: ElementTree.Element,
    accumulator: _TextAccumulator,
) -> None:
    local_name = element.tag.rsplit("}", 1)[-1]
    if local_name == "t":
        accumulator.add(element.text or "")
    elif local_name == "tab":
        accumulator.add("\t")
    elif local_name in {"br", "cr"}:
        accumulator.add("\n")

    for child in element:
        _append_wordprocessingml_text(child, accumulator)
    if local_name == "p":
        accumulator.add("\n", structural=True)


class _TextAccumulator:
    def __init__(self, max_characters: int) -> None:
        self.max_characters = max_characters
        self._parts: list[str] = []
        self._character_count = 0

    @property
    def value(self) -> str:
        return "".join(self._parts)

    @property
    def has_value(self) -> bool:
        return bool(self._parts)

    def add(self, value: str, *, structural: bool = False) -> None:
        next_count = self._character_count + len(value)
        if not structural and next_count > self.max_characters:
            raise ResumeExtractionError(RESUME_TEXT_TOO_LARGE)
        self._parts.append(value)
        if not structural:
            self._character_count = next_count
