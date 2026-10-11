# Letter Studio rollout

## Deployment contract

Studio replaces `/tools/pdf-maker` only when `LETTER_STUDIO_ENABLED=true`.
The original Maker remains at `/tools/pdf-maker/legacy`. Turning the flag off
restores it without deleting new documents, correspondence or browser drafts.
Sign-in/sign-up and unrelated PDF tools are retained.

Required runtime configuration:

- `LETTER_STORAGE_DIR=/data/letters`, backed by private persistent storage.
- `LETTER_RENDER_SOCKET=/run/letter-renderer/worker.sock`, backed by the worker socket directory.
- `LETTER_EXTRACT_PYTHON=/opt/word-venv/bin/python` (the Docker image default).
- `LETTER_AI_PROVIDER=nvidia` and `NVIDIA_API_KEY` as a runtime-only secret.
- `LETTER_NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b` is the target-tested candidate.
- `LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED=true` after operator approval.
- `LETTER_AI_ENABLED=true` and `LETTER_AI_BENCHMARK_PASSED=true` only after quality checks.
- `LETTER_SEMANTIC_ENABLED=false` on the current PostgreSQL host, which has no pgvector.

Do not set `LETTER_CHROMIUM_NO_SANDBOX` in the main application.
Use `deploy/letter-renderer.compose.yml` for the separately approved PDF worker:
non-root, no network, read-only root filesystem, no capabilities, no-new-privileges,
600 MB memory, one CPU, bounded processes and temporary storage. Its only host
mount is the private Unix socket directory. No database/API credentials or
correspondence archive are passed to it. Pin `LETTER_RENDER_IMAGE` to a verified
release image and check it after upgrades. The app and worker use UID 1000.

## Lightweight processing and privacy

At the user's request on 11 October 2026, heavy Docling/Torch models were removed.
PDF text extraction uses the existing PyMuPDF runtime; image-only pages use local
English Tesseract OCR. DOCX correspondence uses python-docx, including tables.
These are reference imports, not complex Word-layout round-trip editing.
One bounded background job runs at a time; files are limited to 20 MB/50 PDF pages,
expanded DOCX to 50 MB, extracted text to 250,000 characters and processing to
five minutes. The child process receives no application credentials.

NVIDIA processes confirmed prompts, selected/current text and relevant retrieved
excerpts outside the VPS. Original files, local OCR, exports and PostgreSQL
storage remain on the VPS. Every AI request requires explicit browser consent.
The provider URL is fixed server-side; redirects and browser-supplied endpoints
are rejected. Keys and upstream error bodies are never returned to the browser.
The screenshot key was not used; the replacement was entered directly in Coolify.
Account quota, terms and public-production eligibility still require operator
review; successful API requests do not establish an SLA.

Search is private PostgreSQL full-text retrieval. Optional semantic retrieval is
implemented but disabled: it requires pgvector, a validated embedding model and
separate consent for external background embeddings. Do not enable the historical
embedding candidate without checking current availability. Only finalized letters
are automatically indexed; drafts enter context only when explicitly selected.
Imported text is untrusted evidence. AI never sends letters and never silently
changes the editor: proposals require acceptance and are undoable.

## Migration and rollback

Back up PostgreSQL in custom format, verify restore to a separate database, and
back up persistent document storage before additive migrations. Apply
`prisma/letter-studio.sql` with `psql -v ON_ERROR_STOP=1`. Authentication tables
are unchanged. Startup intentionally does not run `prisma db push`; fresh installs
must provision the existing authentication schema separately.

On 11 October 2026 the production backup was restored successfully into a separate
database, the additive migration was tested there, a fresh production backup was
taken, and the additive production migration completed. Backups remain private
under `/data/backups/vibify-letter-studio-20261011`; never put them or credentials
in Git. Archive storage and worker socket directories are independent mounts.
Retain database/storage backups and the previous app image for rollback.

## Acceptance evidence and release gates

- GitHub Linux acceptance runs cover build/check, unit/provider tests, native
  PostgreSQL 18 two-account CRUD/history/CAS/search/exclusion/deletion isolation,
  browser recovery/templates/explicit AI accept/undo and multipage export.
- Offline searchable PDF, scanned English PDF and DOCX extraction passed in CI
  and on the VPS in a network-disabled, 500 MB/one-CPU test container.
- Actual Unix-socket export returned a valid PDF on the VPS. Worker inspection
  confirmed network isolation, read-only filesystem, memory/CPU/capability limits.
- Synthetic NVIDIA tests cover drafting, a cited reminder reply and embedded
  prompt-injection resistance. Review outputs and repeat under PDF load before
  enabling the benchmark flag; never use private correspondence as QA fixtures.
- Visual PDF and LibreOffice-rendered DOCX fixtures include first-page stationery,
  non-square images, a 60-row table, repeated headers and manual page breaks.
  Word image line-height clipping was found through visual inspection and fixed;
  review the final rendered artifacts, not only package XML or CI status.
- Run `npm run letter:readiness` in the deployed app after verifying both mounts.
  Check the public page, sign-in route, a real export download and existing tools.
  A healthy deployment alone does not prove the intended UI is served.

The inspected host has 2 CPUs, 3.7 GB RAM and no swap. Obsolete Letter Studio test
images/containers and unused build cache were removed with user authorization,
recovering about 10.7 GB; production volumes, backups and rollback images were
preserved. No local drafting model is installed. Keep bounded workers and monitor
disk growth; archive files intentionally persist until their owner deletes them.
