import express from "express";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, prisma } from "./src/auth.js";
import { processingPool } from "./src/processing-pool.js";
import { generateDraft } from "./src/ai-draft.js";
import {
    archivePdf, compressPdf, convertToWord, deletePages, extractCoordinates,
    extractHtml, extractPages, mergePdfs, ocrPdf, paginatePdf, protectPdf,
    rotatePdf, unlockPdf,
} from "./src/processing-pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const publicDir = path.join(__dirname, "public");
const uploadDir = path.join(os.tmpdir(), "vibify-uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 100 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, callback) => callback(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")),
});

// 1. Trust proxy (Required for Coolify / Traefik reverse proxy)
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
});

// 2. Mount Better Auth Handler (MUST be mounted before express.json() / body parsers)
app.all("/api/auth/*", toNodeHandler(auth));

// 3. Body parsers
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// 4. Static frontend files (with clean HTML extensions fallback)
const utilityNames = ['merge','compress','word','extract','rotate','delete','ocr','protect','unlock','paginate','archive'];
const utilityPages = utilityNames.flatMap(name => [`/tools/${name}`, `/tools/${name}.html`, `/${name}`, `/${name}.html`]);
app.get(utilityPages, (_req, res) => res.sendFile(path.join(publicDir, 'tool.html')));
app.use(express.static(publicDir, {
    extensions: ["html"],
    setHeaders: (res, file) => res.setHeader('Cache-Control', /\.(png|svg|ico|woff2)$/.test(file) ? 'public, max-age=3600, must-revalidate' : 'no-cache'),
}));

// Admit a bounded number of uploads before writing to disk or queuing CPU work.
let activePdfRequests = 0;
const processingPaths = new Set([...utilityNames.map(name => `/${name}`), '/extract-coords', '/extract-html']);
app.use((req, res, next) => {
    if (req.method !== 'POST' || !processingPaths.has(req.path)) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (activePdfRequests >= 8) {
        res.setHeader('Retry-After', '10');
        return res.status(503).json({error: 'The server is busy processing documents. Please try again in a moment.'});
    }
    activePdfRequests++;
    let released = false;
    const release = () => { if (!released) { released = true; activePdfRequests--; } };
    // Count work until the response finishes; a disconnected client is released
    // after processing resolves rather than allowing unbounded abandoned jobs.
    res.once('finish', release);
    req.pdfRelease = release;
    req.once('aborted', () => { if (!req.pdfStarted) release(); });
    next();
});

// --- Admin Security Middleware ---
const requireAdmin = async (req, res, next) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });
        if (!session || !session.user) {
            return res.status(401).json({ error: "Unauthorized: Please log in." });
        }

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, role: true } });
        const configuredAdmins = String(process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
        if (!user || (user.role !== "admin" && !configuredAdmins.includes(user.email.toLowerCase()))) {
            return res.status(403).json({ error: "Forbidden: Administrator access is required." });
        }
        req.user = user;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        res.status(401).json({ error: "Authentication failed" });
    }
};

const requireUser = async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
    if (!session?.user) return res.status(401).json({ error: "Please log in." });
    req.user = session.user;
    next();
};

const requireSameOrigin = (req, res, next) => {
    const origin = req.get("origin");
    if (!origin) return res.status(403).json({ error: "A same-origin browser request is required." });
    try {
        if (new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "Cross-origin admin actions are forbidden." });
    } catch {
        return res.status(403).json({ error: "Invalid request origin." });
    }
    next();
};

async function assertPdf(file) {
    if (!file) throw new Error("Select a PDF file.");
    const handle = await fsPromises.open(file.path, "r");
    try {
        const header = Buffer.alloc(5);
        await handle.read(header, 0, 5, 0);
        if (header.toString() !== "%PDF-") throw new Error("The uploaded file is not a valid PDF.");
    } finally {
        await handle.close();
    }
}

function outputPath(extension = ".pdf") {
    return path.join(uploadDir, `${crypto.randomUUID()}${extension}`);
}

function safeBaseName(file, suffix) {
    const base = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "document";
    return `${base}_${suffix}`;
}

function sendProcessedFile(res, inputFiles, resultPath, downloadName) {
    const inputs = Array.isArray(inputFiles) ? inputFiles : [inputFiles];
    const cleanup = async () => {
        await Promise.allSettled([...inputs.map((file) => file?.path), resultPath].filter(Boolean).map((filePath) => fsPromises.unlink(filePath)));
    };
    res.download(resultPath, downloadName, (error) => {
        cleanup();
        res.req.pdfRelease?.();
        if (error && !res.headersSent) res.status(500).json({ error: "Unable to send the processed file." });
    });
}

function singlePdfRoute(handler, suffix, extension = ".pdf") {
    return [upload.single("pdf"), async (req, res) => {
        req.pdfStarted = true;
        const resultPath = outputPath(extension);
        try {
            await assertPdf(req.file);
            await handler(req.file.path, resultPath, req.body, req);
            sendProcessedFile(res, req.file, resultPath, `${safeBaseName(req.file, suffix)}${extension}`);
        } catch (error) {
            await Promise.allSettled([req.file?.path, resultPath, `${resultPath}.candidate.pdf`].filter(Boolean).map((filePath) => fsPromises.unlink(filePath)));
            req.pdfRelease?.();
            res.status(error.status || 400).json({ error: error.message || "PDF processing failed." });
        }
    }];
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/logs", requireUser, async (req, res) => {
    const logs = await prisma.processingLog.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
    res.json(logs);
});

app.post("/api/ai/draft", async (req, res) => {
    try {
        const promptLength = String(req.body.prompt || "").length;
        const attachmentLength = String(req.body.fileBase64 || "").length;
        if (!promptLength && !attachmentLength) return res.status(400).json({ error: "Enter a prompt or attach an image." });
        if (promptLength > 20_000 || attachmentLength > 15_000_000) return res.status(413).json({ error: "The AI drafting request is too large." });
        const result = await generateDraft(req.body);
        res.json({ success: true, ...result, thinkingMode: Boolean(req.body.useThinking) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message || "AI drafting failed." });
    }
});

app.post("/merge", upload.array("pdfs", 20), async (req, res) => {
    req.pdfStarted = true;
    const files = req.files || [];
    const resultPath = outputPath();
    try {
        if (files.length < 2) throw new Error("Select at least two PDF files.");
        await Promise.all(files.map(assertPdf));
        await mergePdfs(files.map((file) => file.path), resultPath);
        sendProcessedFile(res, files, resultPath, "merged_document.pdf");
    } catch (error) {
        await Promise.allSettled([...files.map((file) => file.path), resultPath].map((filePath) => fsPromises.unlink(filePath)));
        req.pdfRelease?.();
        res.status(error.status || 400).json({ error: error.message || "PDF merge failed." });
    }
});

app.post("/extract", ...singlePdfRoute((input, output, body) => extractPages(input, output, body.startPage, body.endPage), "extracted"));
app.post("/rotate", ...singlePdfRoute((input, output, body) => rotatePdf(input, output, body.angle), "rotated"));
app.post("/delete", ...singlePdfRoute((input, output, body) => deletePages(input, output, body.pages), "trimmed"));
app.post("/paginate", ...singlePdfRoute((input, output, body) => paginatePdf(input, output, body.config || body), "paginated"));
app.post("/compress", ...singlePdfRoute((input, output, body) => compressPdf(input, output, body.targetSize), "compressed"));
app.post("/protect", ...singlePdfRoute((input, output, body) => protectPdf(input, output, body.password), "protected"));
app.post("/unlock", ...singlePdfRoute((input, output, body) => unlockPdf(input, output, body.password), "unlocked"));
app.post("/archive", ...singlePdfRoute((input, output) => archivePdf(input, output), "archival"));
app.post("/ocr", ...singlePdfRoute((input, output) => ocrPdf(input, output), "searchable"));
app.post("/word", ...singlePdfRoute((input, output) => convertToWord(input, output), "converted", ".docx"));

app.post("/extract-coords", upload.single("pdf"), async (req, res) => {
    req.pdfStarted = true;
    try {
        await assertPdf(req.file);
        res.json(await extractCoordinates(req.file.path));
    } catch (error) {
        res.status(400).json({ error: error.message });
    } finally {
        if (req.file?.path) await fsPromises.unlink(req.file.path).catch(() => {});
        req.pdfRelease?.();
    }
});

app.post("/extract-html", upload.single("pdf"), async (req, res) => {
    req.pdfStarted = true;
    try {
        await assertPdf(req.file);
        res.type("html").send(await extractHtml(req.file.path));
    } catch (error) {
        res.status(400).send(error.message);
    } finally {
        if (req.file?.path) await fsPromises.unlink(req.file.path).catch(() => {});
        req.pdfRelease?.();
    }
});

// --- Admin Database Management Endpoints ---

// Get all database records & stats
app.get("/api/admin/data", requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, name: true, email: true, emailVerified: true, role: true, createdAt: true,
                accounts: { select: { id: true, providerId: true, createdAt: true } },
                sessions: { select: { id: true, expiresAt: true, createdAt: true } },
            },
            orderBy: { createdAt: "desc" }
        });
        const processingLogs = await prisma.processingLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 50
        }).catch(() => []); // Fallback if table doesn't exist yet

        res.json({ users, processingLogs });
    } catch (error) {
        console.error("Admin data fetch error:", error);
        res.status(500).json({ error: "Failed to fetch database records" });
    }
});

// Delete a specific user and their related records
app.delete("/api/admin/users/:id", requireSameOrigin, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
        if (!user) return res.status(404).json({ error: "User not found." });
        await prisma.$transaction([
            prisma.verification.deleteMany({ where: { identifier: user.email } }),
            prisma.user.delete({ where: { id } }),
        ]);

        res.json({ success: true, message: `User ${id} deleted successfully.` });
    } catch (error) {
        console.error("User deletion error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// Wipe all database records (Truncate equivalent)
app.post("/api/admin/wipe", requireSameOrigin, requireAdmin, async (req, res) => {
    try {
        await prisma.processingLog.deleteMany({}).catch(() => {});
        await prisma.session.deleteMany({});
        await prisma.account.deleteMany({});
        await prisma.verification.deleteMany({}).catch(() => {});
        await prisma.user.deleteMany({});

        res.json({ success: true, message: "All database records wiped successfully." });
    } catch (error) {
        console.error("Wipe DB error:", error);
        res.status(500).json({ error: "Failed to wipe database" });
    }
});

// Explicit Clean Page Route Handlers
app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/profile", (req, res) => {
    res.sendFile(path.join(publicDir, "profile.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

// Explicit Add-Text Alias
app.get(["/add-text", "/tools/add-text"], (req, res) => {
    res.sendFile(path.join(publicDir, "tools", "add-text.html"));
});

// Static middleware handles known pages. Unknown paths never resolve outside public.
app.get('/pdf-maker', (_req, res) => res.redirect(302, '/tools/pdf-maker'));
app.use((_req, res) => res.status(404).type('html').send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Vibify</title><link rel="stylesheet" href="/css/product.css"><main class="container hero-new"><h1>That page isn’t here.</h1><p>Let’s get you back to your documents.</p><a class="button" href="/">Explore PDF tools</a></main></html>'));

app.use((error, req, res, _next) => {
    req.pdfRelease?.();
    const files = req.files || (req.file ? [req.file] : []);
    Promise.allSettled(files.map(file => fsPromises.unlink(file.path)));
    if (res.headersSent) return;
    const tooLarge = error.code === 'LIMIT_FILE_SIZE' || error.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({error: tooLarge ? 'Each PDF must be 100 MB or smaller.' : 'Unable to accept this upload. Check the file type and number of files.'});
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
server.requestTimeout = 12 * 60_000;
async function shutdown() {
    server.close(async () => { await processingPool.close(); await prisma.$disconnect(); process.exit(0); });
    setTimeout(() => process.exit(1), 30_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
