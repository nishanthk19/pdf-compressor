# PDF suite redesign

The home page now provides a searchable, categorized directory. Eleven server-backed utilities share one upload, settings and download workspace. Merge supports additional files, drag reordering, accessible move buttons and removal. Existing rich editors and account screens receive the shared theme. Email/password, Google sign-in, verification and account data retain the existing Better Auth configuration and Prisma schema.

## Processing changes

- CPU-heavy PDF work runs in reusable child processes, keeping the HTTP event loop available. Default concurrency is at most two workers; set `PDF_WORKERS` from 1 to 8 to suit the VPS memory and CPU budget.
- At most eight PDF requests are admitted at once, with bounded worker queuing and a retryable busy response. Uploads remain limited to 100 MB per PDF and 20 files for merging.
- Compression preserves the best successful candidate, eliminates the final duplicate Ghostscript run, and stops when output falls within 95–100% of the requested size. An input already below the target is copied without Ghostscript. These changes reduce work; actual latency depends on the document and VPS.
- External commands have a three-minute timeout and bounded diagnostic buffering. Workers have a ten-minute job limit and are replaced after failure. Linux command groups are terminated together.
- Text extraction releases PDF.js page/document resources. Server and authentication reuse one Prisma client.
- Upload/result cleanup occurs after success or failure. No schema migration was introduced.
- Known HTML pages use static routing; unknown routes return 404. Scripts and styles revalidate on deployment. Existing browser PDF.js integrations disable evaluation per Mozilla's CVE-2024-4367 workaround.
- Dependency lockfile and `npm ci` make installs repeatable. Targeted overrides address audited qs and deepmerge-ts vulnerabilities without changing Prisma's major version. The deepmerge override changes nested Map merge behavior; the app has no custom Prisma config using Maps.

## Verification

Run `npm ci`, `npm run build`, `npm run check`, and `npm test`. The tests create synthetic PDFs and do not use production accounts or a production database. They check merge order, extraction, deletion, rotation, pagination, compression candidate selection/cleanup, external-command timeouts, queue limits/recovery, HTTP routes, file validation and the admin authentication boundary.

Browser checks cover home/search, mobile layouts, multi-file selection/reordering, merge download, and sign-in/sign-up form switching. Actual account creation requires a configured test database and email provider; the local test configuration intentionally has neither.

Ghostscript, qpdf and OCRmyPDF are installed by the existing Linux Dockerfile. On Windows, compression's external-run search is covered by an injected test runner; the complete native compression/OCR/encryption/archive paths must also be smoke-tested in the Linux deployment before treating their runtime behavior as verified. PDF-to-Word extracts text rather than reconstructing original layout. Archival output requires independent compliance validation where mandated.

## Deployment

Use the existing Coolify application and environment variables. Preserve `DATABASE_URL`, `BETTER_AUTH_SECRET`, Google OAuth and SMTP configuration. Build the Docker image from the committed lockfile, then verify health, authentication and native PDF tools. The existing startup schema push was not changed. Roll back to the preceding image/commit if verification fails.
