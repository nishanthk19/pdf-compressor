# Letter Studio rollout

## Status and capacity gate

Studio is OFF by default. Existing Maker remains available at /tools/pdf-maker/legacy.
The inspected VPS has 2 CPUs, 3.7 GB RAM and no GPU; its PostgreSQL does not
offer pgvector. Do not enable Qwen3 8B there without a successful target-host
benchmark and concurrency test. NVIDIA hosted inference is now an explicitly
configured alternative, not an automatic fallback. It removes local drafting
model RAM requirements, but does not resolve export/OCR/database acceptance gates.

## NVIDIA hosted AI setup (requested 11 October 2026)

The supplied screenshot exposed a key and identifies it as testing-use-only.
That credential has not been copied into code, saved, or used. Revoke it and
create a replacement. Verify NVIDIA account permissions, quotas and production
eligibility before offering the public service.

In Coolify, add the replacement as a runtime secret NVIDIA_API_KEY (not a build
argument). Set LETTER_AI_PROVIDER=nvidia and
LETTER_NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b. This is a configurable candidate,
not a model-quality acceptance result. Set
LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED=true only after approving external
processing and updating the site's privacy disclosures. Keep LETTER_AI_ENABLED
and LETTER_AI_BENCHMARK_PASSED false until synthetic benchmark/acceptance passes.
Run npm run letter:benchmark from the configured server; it uses synthetic text,
never production correspondence. Then enable the two AI flags.

The fixed endpoint is https://integrate.api.nvidia.com/v1/chat/completions.
Keys stay on the server. Redirects are rejected; upstream error bodies are never
relayed to users. Prompts, current/selected text and relevant retrieved excerpts
leave the VPS. Each browser drafting request explicitly confirms that transfer;
the API rejects missing consent before retrieving correspondence. Document
originals, extraction, exports and PostgreSQL storage remain on the VPS.

Drafting, replies, selected-text rewrites, tone changes and summaries share this
provider. The retained legacy Maker's separate AI implementation is unchanged.
There is no silent switch to another provider when NVIDIA fails or rate limits.

Embeddings stay local by default (LETTER_EMBED_PROVIDER=ollama). FTS search needs
no embedding API. Optional LETTER_EMBED_PROVIDER=nvidia uses
nvidia/nv-embedqa-e5-v5 with passage mode for indexing and query mode for search.
Enabling semantic NVIDIA search sends archive excerpts and search terms
externally, including background indexing. Do not enable it before reviewing
user notice/consent and retention requirements. It still needs pgvector.
Reindex existing chunks after any embedding model/provider change; never compare
vectors from different models. Keep semantic search disabled until that finishes.

API references:
- https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct-infer
- https://docs.api.nvidia.com/nim/reference/nvidia-nv-embedqa-e5-v5-infer

### Live connection verification, 11 October 2026

The replacement key was supplied directly by the user in Coolify, never read or
copied into local files. Production and preview NVIDIA keys were made runtime-only.
The existing main commit 01e5dfbe was redeployed successfully without Letter Studio.
Its new container reports the key present and LETTER_STUDIO_ENABLED unset.
The old Llama 3.3 endpoint returned HTTP 410. The live model catalog and an
authenticated Nemotron Super request succeeded (HTTP 200, VIBIFY_TEST_OK, 717 ms).
Streaming returned HTTP 200, STREAM_TEST_OK and a completed SSE stream.
The public /api/health endpoint returned HTTP 200 with status ok.
Only synthetic prompts were submitted. These checks establish connectivity, not
letter quality, citation accuracy or load acceptance. Local defaults now use
Nemotron Super with reasoning disabled; that integration is not deployed yet.
The optional embedding candidate must also be rechecked against the live model
catalog before enabling semantic indexing; embeddings remain disabled.

## Prepare, without changing existing PDF tools

1. Back up PostgreSQL with pg_dump in custom format and back up the persistent
   document volume. Verify restore into a separate database. Never put credentials
   or backup files in Git. This implementation has NOT taken a production backup.
2. Apply prisma/letter-studio.sql with psql -v ON_ERROR_STOP=1 against the reviewed
   database. It only adds tables/indexes; authentication tables are unchanged.
   Startup no longer runs prisma db push. Fresh installs must provision the existing
   authentication schema separately before applying this migration.
3. If semantic search is desired, install the pgvector package matching PostgreSQL,
   apply prisma/letter-vector.sql, then set LETTER_SEMANTIC_ENABLED=true.
   Do not subsequently use prisma db push: the optional embedding column is
   deliberately managed by the additive SQL migration, not Prisma.
4. Mount a private persistent volume and set LETTER_STORAGE_DIR=/data/letters.
   It must not be under public/. Database backups and file-volume backups must
   represent the same point in time. Apply a retention/cleanup policy operationally.
5. Chromium is installed during the Docker build. A non-root runtime with a working
   browser sandbox is preferred. LETTER_CHROMIUM_NO_SANDBOX=true is an explicit
   operator exception only for an isolated container; no network requests are
   allowed during document rendering.
6. Provision Docling in a separate venv using requirements-letter.txt. Download
   its model artifacts during provisioning, not from document requests. Configure
   LETTER_DOCLING_PYTHON and LETTER_DOCLING_MODELS. Verify OCR on scanned English
   correspondence. One extraction runs at a time with size/page/time limits.
   Docker supports --build-arg INSTALL_LETTER_EXTRACTOR=true to create
   /opt/letter-venv. Mount pre-downloaded model artifacts read-only and set
   LETTER_DOCLING_PYTHON=/opt/letter-venv/bin/python. Keep the runtime off until
   English PDF, scanned PDF and DOCX extraction fixtures pass on the target.
   See https://docling-project.github.io/docling/usage/advanced_options/ for offline
   model provisioning. Remote services are explicitly disabled by the extractor.
7. Choose NVIDIA setup above, or set LETTER_AI_PROVIDER=ollama and run Ollama
   on a private, non-public interface. Set LETTER_OLLAMA_URL on the
   server only; never pass URLs from browser requests. Provision a pinned quantized
   qwen3:8b candidate and nomic-embed-text embedding model. Record actual model
   digest, quantization and license; these names are defaults, not benchmark results.
8. Run npm run letter:benchmark on the inference target. Review output for
   citations, injection resistance, facts and latency under PDF processing load.
   Then and only then set LETTER_AI_ENABLED=true and LETTER_AI_BENCHMARK_PASSED=true.
   npm run letter:readiness checks tables/storage/Chromium and optional vector gates.
   AI stays unavailable when either AI flag is absent.

## Acceptance, before enabling

Run npm test, npm run build and the optional browser tests:
node --test tests/letter-browser.test.mjs.
Use an isolated PostgreSQL database for two-account integration tests. Check
create/update/history, stale revision 409, unrelated-account 404, search isolation,
exclusion and deletion, extraction retry, and final-letter indexing. Do NOT use
production users or correspondence as test fixtures.

Compare PDF and DOCX with print preview for A4/Letter, portrait/landscape, custom
first-page headers, logo/signature, long tables and manual page breaks. DOCX uses
Word's own layout engine, so exact pagination can vary with installed fonts.
Do not sign off visual Word fidelity based only on ZIP/XML assertions.

Set LETTER_STUDIO_ENABLED=true only after these checks pass. Toggle it false to
restore the original Maker immediately; retain new tables, originals and browser
keys. No destructive rollback is required. Legacy draft import is previewed and
does not delete the original browser key.

## Privacy and operational limits

All document and correspondence reads/writes filter authenticated user ownership.
Only explicitly selected drafts enter AI context; finalized letters are indexed
automatically. Imported text is untrusted evidence, not application instructions.
AI proposals are never automatically applied or sent. NVIDIA processing, if
configured, is external and subject to the disclosures above. Guest drafts are stored in
this browser; export sends that document to this VPS only for rendering.
HTTP POST/PUT/PATCH/DELETE require a same-origin Origin header.
Export/AI queues and extraction concurrency are bounded. Plan storage quotas,
backups, monitoring and TLS at the reverse proxy before public release.

## Local verification evidence and remaining gates

- 15 Letter Studio unit/HTTP/PostgreSQL-engine/provider tests pass, including
  mocked NVIDIA streaming, credentials, consent, rate limits and embedding modes.
  No live NVIDIA API call or credential validation has been performed. Tests include multiline
  field fidelity, streaming
  Unicode and invalid-citation rejection. PostgreSQL SQL runs on PGlite, not the
  production Prisma connection; native target integration still needs sign-off.
- Browser recovery and resolved fields verified. Live editing and print preview
  both produce 3 pages for 65 short paragraphs, 4 pages for a long paragraph, and
  5 pages for a 60-row table; print headers repeat and bodies do not overflow.
- Template creation is verified in the browser after correcting a chained-dialog
  close-event race. Synthetic local AI suggestions are accepted explicitly,
  undoable, and discardable without changing the original letter. This is UI
  verification only, not acceptance of a live Ollama model.
- DOCX package structure is verified. Visual Word rendering is blocked locally
  by the missing bundled LibreOffice renderer. Chromium worker launch and four
  existing process-based tests are blocked by local Windows spawn permissions.
  The opt-in browser/export acceptance test and GitHub workflow cover a capable
  Linux runner; they have not been run remotely yet.
- npm audit --omit=dev reports zero production vulnerabilities. Seven existing
  build-tool advisories remain; a Tailwind major migration was not forced.
- No production migration, backup, deployment or AI enablement has been performed.
  Complete those steps only after the capacity, extraction and export gates pass.
