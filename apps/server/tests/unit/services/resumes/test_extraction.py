import asyncio
import zipfile
from io import BytesIO

import pytest
from pypdf import PdfWriter

import riva.services.resumes.extraction as extraction_module
from riva.services.resumes.extraction import (
    APPLICATION_DOCX,
    APPLICATION_PDF,
    DefaultResumeTextExtractor,
    ResumeExtractionError,
    normalize_resume_text,
)


def run(coroutine):
    return asyncio.run(coroutine)


def extract(
    data: bytes,
    *,
    declared_media_type: str | None = None,
    max_characters: int = 100_000,
    extractor: DefaultResumeTextExtractor | None = None,
):
    extractor = extractor or DefaultResumeTextExtractor()
    return run(
        extractor.extract(
            data,
            declared_media_type=declared_media_type,
            max_characters=max_characters,
        )
    )


def assert_error(
    data: bytes,
    code: str,
    *,
    declared_media_type: str | None = None,
    max_characters: int = 100_000,
    extractor: DefaultResumeTextExtractor | None = None,
) -> None:
    with pytest.raises(ResumeExtractionError) as error:
        extract(
            data,
            declared_media_type=declared_media_type,
            max_characters=max_characters,
            extractor=extractor,
        )
    assert error.value.code == code
    assert str(error.value) == code


def make_pdf(pages: list[str]) -> bytes:
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    page_ids: list[int] = []
    next_object_id = 4
    for page_text in pages:
        page_id = next_object_id
        contents_id = page_id + 1
        page_ids.append(page_id)
        escaped_text = (
            page_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        )
        stream = f"BT /F1 12 Tf 72 720 Td ({escaped_text}) Tj ET".encode("latin-1")
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> "
            f"/Contents {contents_id} 0 R >>"
        ).encode()
        objects[contents_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"
        )
        next_object_id += 2

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[2] = (f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>").encode()
    max_object_id = max(objects)

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0] * (max_object_id + 1)
    for object_id in range(1, max_object_id + 1):
        offsets[object_id] = len(pdf)
        pdf.extend(f"{object_id} 0 obj\n".encode())
        pdf.extend(objects[object_id])
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {max_object_id + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for object_id in range(1, max_object_id + 1):
        pdf.extend(f"{offsets[object_id]:010d} 00000 n \n".encode())
    pdf.extend(
        (
            f"trailer\n<< /Size {max_object_id + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode()
    )
    return bytes(pdf)


MAIN_DOCUMENT_CONTENT_TYPE = (
    b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
)
CONTENT_TYPES = (
    b'<?xml version="1.0" encoding="UTF-8"?>\n'
    b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
    b'  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
    b'  <Default Extension="xml" ContentType="application/xml"/>\n'
    b'  <Override PartName="/word/document.xml" ContentType="'
    + MAIN_DOCUMENT_CONTENT_TYPE
    + b'"/>\n</Types>'
)
DOCUMENT_XML = (
    b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
    b"  <w:body><w:p><w:r><w:t>Resume</w:t></w:r></w:p></w:body>\n"
    b"</w:document>"
)


def make_docx(
    *,
    document_xml: bytes = DOCUMENT_XML,
    content_types: bytes = CONTENT_TYPES,
    extra_entries: list[tuple[str | zipfile.ZipInfo, bytes]] | None = None,
    compression: int = zipfile.ZIP_STORED,
    include_content_types: bool = True,
    include_document: bool = True,
) -> bytes:
    output = BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=compression) as archive:
        if include_content_types:
            archive.writestr("[Content_Types].xml", content_types)
        if include_document:
            archive.writestr("word/document.xml", document_xml)
        for name, value in extra_entries or []:
            if isinstance(name, zipfile.ZipInfo):
                archive.writestr(name, value)
            else:
                archive.writestr(name, value)
    return output.getvalue()


def encode_xml(value: bytes, encoding: str, *, bom: bool = True) -> bytes:
    text = value.decode("utf-8")
    encoded = text.encode(encoding)
    if not bom:
        return encoded
    if encoding == "utf-16-le":
        return b"\xff\xfe" + encoded
    if encoding == "utf-16-be":
        return b"\xfe\xff" + encoded
    if encoding == "utf-32-le":
        return b"\xff\xfe\x00\x00" + encoded
    if encoding == "utf-32-be":
        return b"\x00\x00\xfe\xff" + encoded
    raise AssertionError(f"unsupported test encoding: {encoding}")


def xml_with_declaration(value: bytes, encoding: str) -> bytes:
    return value.replace(
        b'encoding="UTF-8"',
        f'encoding="{encoding}"'.encode(),
        1,
    )


def paragraph(text: str) -> str:
    return f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"


def word_part(text: str) -> bytes:
    return (
        "<w:hdr "
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"{paragraph(text)}</w:hdr>"
    ).encode()


def test_media_type_parameters_and_octet_stream_use_content_detection() -> None:
    text_result = extract(
        "中文 resume".encode(),
        declared_media_type=" TEXT/PLAIN; charset=UTF-8 ",
    )
    pdf_result = extract(
        make_pdf(["PDF"]),
        declared_media_type="application/octet-stream",
    )

    assert text_result.media_type == "text/plain"
    assert text_result.text == "中文 resume"
    assert pdf_result.media_type == APPLICATION_PDF
    assert pdf_result.text == "PDF"


def test_declared_media_type_mismatch_and_unknown_type() -> None:
    assert_error(
        b"plain text",
        "resume_media_type_mismatch",
        declared_media_type=APPLICATION_PDF,
    )
    assert_error(
        make_pdf(["PDF"]),
        "resume_media_type_unsupported",
        declared_media_type="application/x-pdf",
    )


@pytest.mark.parametrize(
    "data",
    [
        b"{\\rtf1\\ansi unsupported}",
        b"<!doctype html><html><body>unsupported</body></html>",
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy document",
        b"\x89PNG\r\n\x1a\nimage",
    ],
)
def test_known_unsupported_formats_are_not_accepted_as_txt(data: bytes) -> None:
    assert_error(data, "resume_media_type_unsupported")


def test_empty_data_and_invalid_limits() -> None:
    assert_error(b"", "resume_text_empty")

    with pytest.raises(ValueError):
        extract(b"text", max_characters=0)
    with pytest.raises(ValueError):
        DefaultResumeTextExtractor(max_pdf_pages=0)
    with pytest.raises(ValueError):
        DefaultResumeTextExtractor(max_compression_ratio=float("nan"))


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ("plain UTF-8 中文".encode(), "plain UTF-8 中文"),
        (b"\xef\xbb\xbfwith UTF-8 BOM", "with UTF-8 BOM"),
        (
            "UTF-16 LE 中文".encode("utf-16-le").join([b"\xff\xfe", b""]),
            "UTF-16 LE 中文",
        ),
        (b"\xfe\xff" + "UTF-16 BE 中文".encode("utf-16-be"), "UTF-16 BE 中文"),
    ],
)
def test_txt_encoding_and_unicode_are_preserved(data: bytes, expected: str) -> None:
    result = extract(data)

    assert result.media_type == "text/plain"
    assert result.text == expected


def test_text_normalization_preserves_tabs_and_structure() -> None:
    value = "  A\r\n\rB\r\n\r\n\r\nC \t\n\tD\x00\x01  "

    assert normalize_resume_text(value, max_characters=100) == ("A\n\nB\n\n\nC\n\tD")


def test_txt_rejects_invalid_utf8_and_binary_controls() -> None:
    assert_error(b"\xff\xfe\xfa", "resume_text_decode_failed")
    assert_error(b"safe\x00text", "resume_text_decode_failed")
    assert_error(b"safe\x01text", "resume_text_decode_failed")


def test_normalized_empty_and_character_limits_are_not_silently_truncated() -> None:
    assert_error(b"\x00\x01", "resume_text_decode_failed")
    assert_error(b"     \n\t", "resume_text_empty")
    assert extract(b"12345", max_characters=5).text == "12345"
    assert_error(b"123456", "resume_text_too_large", max_characters=5)
    with pytest.raises(ResumeExtractionError) as error:
        normalize_resume_text("123456", max_characters=5)
    assert error.value.code == "resume_text_too_large"


def test_input_bytes_are_not_modified_and_async_work_is_offloaded(monkeypatch) -> None:
    data = b"immutable text"
    original_to_thread = asyncio.to_thread
    called = False

    async def tracking_to_thread(function, /, *args, **kwargs):
        nonlocal called
        called = True
        return await original_to_thread(function, *args, **kwargs)

    monkeypatch.setattr(asyncio, "to_thread", tracking_to_thread)
    result = extract(data)

    assert result.text == "immutable text"
    assert data == b"immutable text"
    assert called is True


def test_pdf_pages_are_extracted_in_order() -> None:
    result = extract(make_pdf(["First", "Second"]))

    assert result.media_type == APPLICATION_PDF
    assert result.text.index("First") < result.text.index("Second")


def test_pdf_blank_and_invalid_files() -> None:
    assert_error(make_pdf([""]), "resume_text_empty")
    assert_error(b"%PDF-1.7\ntruncated", "resume_pdf_invalid")
    assert_error(
        b"not a PDF",
        "resume_media_type_mismatch",
        declared_media_type=APPLICATION_PDF,
    )


def test_pdf_encryption_and_page_limits() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.encrypt("secret")
    encrypted = BytesIO()
    writer.write(encrypted)

    assert_error(encrypted.getvalue(), "resume_pdf_encrypted")
    assert_error(
        make_pdf(["one", "two"]),
        "resume_pdf_too_many_pages",
        extractor=DefaultResumeTextExtractor(max_pdf_pages=1),
    )


def test_pdf_character_limit_and_extraction_failure_mapping(monkeypatch) -> None:
    assert_error(
        make_pdf(["123456"]),
        "resume_text_too_large",
        max_characters=5,
    )

    class BrokenPage:
        def extract_text(self):
            raise RuntimeError("hidden parser detail")

    class FakeReader:
        is_encrypted = False
        pages = [BrokenPage()]

    monkeypatch.setattr(
        extraction_module,
        "PdfReader",
        lambda *args, **kwargs: FakeReader(),
    )
    assert_error(make_pdf(["ignored"]), "resume_pdf_extraction_failed")


def test_docx_extracts_paragraphs_tables_tabs_breaks_and_unicode() -> None:
    document = f"""<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        {paragraph("第一段")}
        <w:p><w:r><w:t>Tab</w:t><w:tab/><w:t>Separated</w:t>
          <w:br/><w:t>Line</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc>{paragraph("表格文字")}</w:tc></w:tr></w:tbl>
      </w:body>
    </w:document>""".encode()

    result = extract(
        make_docx(document_xml=document),
        declared_media_type=APPLICATION_DOCX,
    )

    assert result.media_type == APPLICATION_DOCX
    assert "第一段" in result.text
    assert "Tab\tSeparated\nLine" in result.text
    assert "表格文字" in result.text
    assert result.text.index("第一段") < result.text.index("表格文字")


@pytest.mark.parametrize(
    ("encoding", "bom", "declaration"),
    [
        ("utf-16-le", True, "UTF-16"),
        ("utf-16-be", True, "UTF-16"),
        ("utf-16-le", False, "UTF-16"),
        ("utf-16-be", False, "UTF-16"),
        ("utf-32-le", True, "UTF-32"),
        ("utf-32-be", True, "UTF-32"),
        ("utf-32-le", False, "UTF-32"),
        ("utf-32-be", False, "UTF-32"),
    ],
)
def test_docx_rejects_multibyte_doctype_and_entity_before_xml_parse(
    encoding: str,
    bom: bool,
    declaration: str,
    monkeypatch,
) -> None:
    unsafe_document = (
        b'<!DoCtYpE w:document [<!EnTiTy secret "blocked">]>'
        + DOCUMENT_XML.replace(b"Resume", b"&secret;")
    )
    unsafe_content_types = b'<!EnTiTy secret "blocked">' + CONTENT_TYPES
    document = encode_xml(unsafe_document, encoding, bom=bom)
    content_types = encode_xml(
        xml_with_declaration(unsafe_content_types, declaration),
        encoding,
        bom=bom,
    )

    def fail(*args, **kwargs):
        raise AssertionError("ElementTree.fromstring must not be called")

    monkeypatch.setattr(extraction_module.ElementTree, "fromstring", fail)
    assert_error(
        make_docx(document_xml=document, content_types=content_types),
        "resume_docx_unsafe",
    )


@pytest.mark.parametrize(
    ("encoding", "bom", "declaration"),
    [
        ("utf-16-le", True, "UTF-16"),
        ("utf-16-be", False, "UTF-16"),
    ],
)
def test_docx_content_types_multibyte_doctype_is_rejected(
    encoding: str,
    bom: bool,
    declaration: str,
) -> None:
    unsafe_content_types = b"<!DoCtYpE Types>" + CONTENT_TYPES

    assert_error(
        make_docx(
            content_types=encode_xml(
                xml_with_declaration(unsafe_content_types, declaration),
                encoding,
                bom=bom,
            )
        ),
        "resume_docx_unsafe",
    )


def test_docx_preflights_every_xml_member_before_elementtree(monkeypatch) -> None:
    unsafe_document = (
        b'<!DoCtYpE w:document [<!EnTiTy secret "blocked">]>'
        + DOCUMENT_XML.replace(b"Resume", b"&secret;")
    )

    def fail(*args, **kwargs):
        raise AssertionError("ElementTree.fromstring must not be called")

    monkeypatch.setattr(extraction_module.ElementTree, "fromstring", fail)
    assert_error(
        make_docx(
            document_xml=encode_xml(unsafe_document, "utf-16-le"),
        ),
        "resume_docx_unsafe",
    )


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be"])
@pytest.mark.parametrize("bom", [True, False])
def test_docx_extracts_safe_utf16_document_and_content_types(
    encoding: str,
    bom: bool,
) -> None:
    document = encode_xml(
        DOCUMENT_XML.replace(b"Resume", "中文简历".encode()),
        encoding,
        bom=bom,
    )
    content_types = encode_xml(
        xml_with_declaration(CONTENT_TYPES, "UTF-16"),
        encoding,
        bom=bom,
    )

    result = extract(
        make_docx(document_xml=document, content_types=content_types),
        declared_media_type=APPLICATION_DOCX,
    )

    assert result.text == "中文简历"


def test_docx_rejects_damaged_utf16_as_invalid() -> None:
    damaged_document = encode_xml(DOCUMENT_XML, "utf-16-le")[:-1]

    assert_error(
        make_docx(document_xml=damaged_document),
        "resume_docx_invalid",
    )


def test_docx_internal_entity_cannot_reach_extracted_text() -> None:
    document = b'<!ENTITY secret "must not appear">' + DOCUMENT_XML.replace(
        b"Resume", b"&secret;"
    )

    assert_error(make_docx(document_xml=document), "resume_docx_unsafe")


def test_docx_character_limit_is_exact_and_not_silently_truncated() -> None:
    exact = make_docx(document_xml=DOCUMENT_XML.replace(b"Resume", b"12345"))
    over = make_docx(document_xml=DOCUMENT_XML.replace(b"Resume", b"123456"))

    assert extract(exact, max_characters=5).text == "12345"
    assert_error(over, "resume_text_too_large", max_characters=5)


def test_docx_appends_header_footer_footnotes_and_endnotes_stably() -> None:
    extra = [
        ("word/header2.xml", word_part("Header two")),
        ("word/header1.xml", word_part("Header one")),
        ("word/footer1.xml", word_part("Footer")),
        ("word/footnotes.xml", word_part("Footnote")),
        ("word/endnotes.xml", word_part("Endnote")),
    ]

    result = extract(make_docx(extra_entries=extra))

    assert all(
        value in result.text
        for value in (
            "Resume",
            "Endnote",
            "Footer",
            "Header one",
            "Header two",
            "Footnote",
        )
    )
    assert result.text.index("Resume") < result.text.index("Endnote")
    assert result.text.index("Header one") < result.text.index("Header two")


def test_docx_requires_real_structure_and_standard_content_type() -> None:
    ordinary_zip = BytesIO()
    with zipfile.ZipFile(ordinary_zip, "w") as archive:
        archive.writestr("hello.txt", b"not a docx")
    assert_error(ordinary_zip.getvalue(), "resume_docx_invalid")

    assert_error(
        make_docx(include_content_types=False),
        "resume_docx_invalid",
    )
    assert_error(
        make_docx(include_document=False),
        "resume_docx_invalid",
    )
    wrong_content_types = CONTENT_TYPES.replace(
        MAIN_DOCUMENT_CONTENT_TYPE,
        b"application/xml",
    )
    assert_error(
        make_docx(content_types=wrong_content_types),
        "resume_docx_invalid",
    )


def test_docx_rejects_macros_and_vba_project() -> None:
    macro_types = CONTENT_TYPES.replace(
        MAIN_DOCUMENT_CONTENT_TYPE,
        b"application/vnd.ms-word.document.macroEnabled.main+xml",
    )
    assert_error(
        make_docx(content_types=macro_types),
        "resume_docx_unsafe",
    )
    assert_error(
        make_docx(extra_entries=[("word/vbaProject.bin", b"macro")]),
        "resume_docx_unsafe",
    )


@pytest.mark.parametrize(
    "entry_name",
    [
        "../escape.xml",
        "/absolute.xml",
        r"word\\escape.xml",
        "word//empty.xml",
        "word/./dot.xml",
        "word/../escape.xml",
        "C:drive.xml",
    ],
)
def test_docx_rejects_unsafe_member_names(entry_name: str) -> None:
    assert_error(
        make_docx(extra_entries=[(entry_name, b"unsafe")]),
        "resume_docx_unsafe",
    )


def test_docx_rejects_nul_member_names() -> None:
    with pytest.raises(ResumeExtractionError) as error:
        extraction_module._validate_zip_member_name("word/unsafe\x00.xml")
    assert error.value.code == "resume_docx_unsafe"


def test_docx_rejects_bad_zip_truncated_xml_and_xml_declarations() -> None:
    valid = make_docx()
    assert_error(valid[:-10], "resume_docx_invalid")
    assert_error(b"PK\x03\x04not a zip", "resume_docx_invalid")

    malformed_xml = b"<w:document xmlns:w='urn:w'><w:body>"
    assert_error(
        make_docx(document_xml=malformed_xml),
        "resume_docx_invalid",
    )
    for declaration in (b"<!DOCTYPE document>", b"<!ENTITY secret 'x'>"):
        assert_error(
            make_docx(document_xml=declaration + DOCUMENT_XML),
            "resume_docx_unsafe",
        )


def test_docx_archive_security_limits_are_checked_before_reading() -> None:
    too_many = make_docx(extra_entries=[("word/extra.xml", b"x")])
    assert_error(
        too_many,
        "resume_docx_archive_too_large",
        extractor=DefaultResumeTextExtractor(max_archive_members=2),
    )
    assert_error(
        make_docx(),
        "resume_docx_archive_too_large",
        extractor=DefaultResumeTextExtractor(max_total_uncompressed_bytes=10),
    )
    assert_error(
        make_docx(),
        "resume_docx_archive_too_large",
        extractor=DefaultResumeTextExtractor(max_xml_member_bytes=10),
    )
    assert_error(
        make_docx(
            extra_entries=[("word/repetitive.xml", b"A" * 10_000)],
            compression=zipfile.ZIP_DEFLATED,
        ),
        "resume_docx_archive_too_large",
        extractor=DefaultResumeTextExtractor(max_compression_ratio=1),
    )


def test_docx_rejects_encrypted_and_unsupported_compression_members() -> None:
    encrypted_archive = bytearray(make_docx())
    local_signature = b"PK\x03\x04"
    central_signature = b"PK\x01\x02"
    offset = 0
    while (local_offset := encrypted_archive.find(local_signature, offset)) >= 0:
        encrypted_archive[local_offset + 6 : local_offset + 8] = (1).to_bytes(
            2,
            "little",
        )
        offset = local_offset + len(local_signature)
    offset = 0
    while (central_offset := encrypted_archive.find(central_signature, offset)) >= 0:
        encrypted_archive[central_offset + 8 : central_offset + 10] = (1).to_bytes(
            2,
            "little",
        )
        offset = central_offset + len(central_signature)
    assert_error(
        bytes(encrypted_archive),
        "resume_docx_unsafe",
    )

    if hasattr(zipfile, "ZIP_BZIP2"):
        assert_error(
            make_docx(compression=zipfile.ZIP_BZIP2),
            "resume_docx_unsafe",
        )


def test_docx_does_not_read_images_or_call_extract_methods(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise AssertionError("archive extraction is forbidden")

    monkeypatch.setattr(zipfile.ZipFile, "extract", fail)
    monkeypatch.setattr(zipfile.ZipFile, "extractall", fail)
    result = extract(
        make_docx(extra_entries=[("word/media/image1.png", b"image bytes")])
    )

    assert result.text == "Resume"
