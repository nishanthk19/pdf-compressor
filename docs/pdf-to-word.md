# Self-hosted PDF to Word

The `/word` endpoint runs `convert.py` inside the existing bounded processing
pool. It does not call a cloud conversion API, upload PDFs to a third party,
or download models at request time. Authentication and database schema are unchanged.

## Conversion behavior

- Native PDFs: pdf2docx reconstructs text styling, paragraphs, tables, images,
  and columns as DOCX content. It is a rule-based reconstruction, not a promise
  of identical layout. Font substitution can change wrapping in Word.
- Scans: PyMuPDF's built-in Tesseract recognizes text locally. OpenCV detects
  intersecting horizontal/vertical grid rules, removes them from OCR input,
  and supplies their coordinates as table borders. Recognized text is editable.
- Mixed PDFs: OCR is selected per page; native pages keep the digital path.
- Scanned illustrations, photos, handwriting, mathematical notation, complex
  tables, skewed scans, and unusual scripts/layouts remain limitations. Full-page
  scan images are deliberately not inserted behind the OCR text. The UI discloses
  that scanned figures may be absent and asks users to proofread OCR results.
- Empty output is rejected, and pdf2docx is configured to fail instead of
  silently ignoring page-conversion errors.

## API

Multipart POST `/word` accepts `pdf` and optional fields:

| Field | Values / default |
| --- | --- |
| `ocr` | `auto` (default), `off`, `force` |
| `language` | `eng` (default), `eng+hin`, `eng+tam`, `fra`, `deu`, `spa`, `por` |
| `startPage` | One-based first page, default 1 |
| `endPage` | Inclusive last page; empty means end of document |

Success is a DOCX attachment, with `X-Vibify-Pages` (source page count) and
`X-Vibify-OCR-Pages`. Source pages do not necessarily equal the number of Word
pages after reflow. Errors return JSON containing a user-safe `error` string.

Limits: 100 MB upload, 200 selected pages, 40 OCR pages, maximum page dimension
40 inches, up to 12 megapixels per OCR raster, 8-minute subprocess timeout,
150 MB output, and 1.5 GB subprocess address space on Linux. Native threads
are restricted to one; the Node processing pool controls overall concurrency.
Use `PDF_WORKERS=1` on a small VPS and configure a container memory limit with
headroom for Node and the conversion child. These limits are not a security
sandbox; keep native parsers patched and isolate the container in production.

## Installation and deployment

The Dockerfile installs pinned dependencies from `requirements-word.txt` in
`/opt/word-venv` and installs Tesseract language data using Debian packages.
`PDF_WORD_PYTHON` points to its Python executable; `TESSDATA_PREFIX` points to
`/usr/share/tesseract-ocr/5/tessdata`. No paid credentials are needed.

For development, install the requirements in an isolated Python 3.11+ environment
and set those two variables to its executable and your local trained-data folder.
`eng.traineddata` is required for English tests. OCR language data must be installed
before running the server; missing languages produce a clear error.

Deployment requires rebuilding the Docker image, not just restarting Node.
Do not set these new example environment values blindly over existing Coolify
authentication or database settings. The Docker image already supplies them.

## Open-source dependencies and release checklist

- [pdf2docx](https://github.com/ArtifexSoftware/pdf2docx) 0.5.13: MIT. Artifex no
  longer actively maintains it; this adapter and dependency updates need regression testing.
- [PyMuPDF / MuPDF](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright):
  available under AGPL or a commercial license. This implementation selects the
  open-source dependency, not a paid API or proprietary conversion engine.
- [Tesseract](https://github.com/tesseract-ocr/tesseract): Apache-2.0.
- [OpenCV](https://github.com/opencv/opencv): Apache-2.0.
- [python-docx](https://github.com/python-openxml/python-docx): MIT.

Vibify is released under AGPL-3.0-only with the owner's approval. See the root
`LICENSE` for the full license. Corresponding source, build instructions, and
dependency manifests are available at https://github.com/nishanthk19/pdf-compressor.
The site's footer links to this source and license. Keep source available for
the deployed version and retain third-party license notices in distributed images.

## Verification

1. Install `requirements-word.txt` plus `reportlab` for synthetic test fixtures.
2. Set `PDF_WORD_PYTHON` and `TESSDATA_PREFIX` as above.
3. Run `npm test` (includes live local HTTP conversion when the Python variable is set).
4. Run `python tests/word-conversion.py` using that Python environment.
5. Render and compare `.artifacts/word-qa/native.docx`, `scan.docx`, `mixed.docx`,
   and `range.docx` with the input PDFs using LibreOffice or Word before release.
6. Test representative real documents and verify non-English OCR languages on Linux.

Automated assertions check editable table cells, numbers, native images, styling,
OCR text, mixed native/scanned pages, page selection, malformed settings, encrypted
input, empty input, subprocess timeout, and temporary-report cleanup. A ZIP header
is not used as the only conversion-quality check. Visual pagination fidelity is
a separate release check, not established by these structural tests.
