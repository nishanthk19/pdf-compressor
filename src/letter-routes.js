import express from "express";
import multer from "multer";
import { mkdir, unlink, open, rename, chmod } from "node:fs/promises";
import path from "node:path";
import { fromNodeHeaders } from "better-auth/node";
import { validateLetter, fail } from "./letter-validation.js";
import {
  newLetter,
  documentText,
  missingFields,
} from "../public/js/letter-model.js";
import { exportPdf, exportDocx } from "./letter-export.js";
import { searchMemory } from "./letter-memory.js";
import {
  streamDraft,
  aiReady,
  aiProvider,
  embedProvider,
} from "./letter-ai.js";
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export function createLetterRouter({ prisma, auth }) {
  const router = express.Router(),
    root = path.resolve(
      process.env.LETTER_STORAGE_DIR || "./data/letter-studio",
    );
  const publicRoot = path.resolve("./public");
  if (root === publicRoot || root.startsWith(publicRoot + path.sep))
    throw new Error("Letter storage must be outside public/.");
  const upload = multer({
    dest: root,
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  });
  let active = 0;
  let activeUploads = 0;
  const uploadAdmission = (req, res, next) => {
    if (activeUploads >= 2)
      return next(
        fail("The upload service is busy. Please try again shortly.", 503),
      );
    activeUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  const rates = new Map();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (process.env.LETTER_STUDIO_ENABLED !== "true")
      return res.status(404).json({ error: "Letter Studio is not enabled." });
    next();
  });
  router.use(
    wrap(async (req, res, next) => {
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.get("origin");
        if (!origin || new URL(origin).host !== req.get("host"))
          throw fail("A same-origin request is required.", 403);
      }
      const session = await auth.api
        .getSession({ headers: fromNodeHeaders(req.headers) })
        .catch(() => null);
      req.letterUser = session?.user?.id || null;
      next();
    }),
  );
  router.use((req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) return next();
    const now = Date.now(),
      key = req.letterUser || req.ip;
    for (const [k, v] of rates) if (now - v.time > 60000) rates.delete(k);
    if (rates.size > 10000) return next(fail("The service is busy.", 503));
    const entry = rates.get(key) || { time: now, count: 0 };
    entry.count++;
    rates.set(key, entry);
    if (entry.count > 60) {
      res.set("Retry-After", "60");
      return next(fail("Too many requests. Please wait a minute.", 429));
    }
    next();
  });
  const user = (req, _res, next) =>
    req.letterUser
      ? next()
      : next(
          fail(
            "Sign in to save documents and use private correspondence memory.",
            401,
          ),
        );
  router.get("/config", (req, res) =>
    res.json({
      signedIn: !!req.letterUser,
      userId: req.letterUser,
      ai: aiReady(),
      aiProvider: aiProvider(),
      externalAI: aiProvider() === "nvidia",
      externalEmbeddings:
        process.env.LETTER_SEMANTIC_ENABLED === "true" &&
        embedProvider() === "nvidia",
      extraction: !!process.env.LETTER_DOCLING_PYTHON,
      semantic: process.env.LETTER_SEMANTIC_ENABLED === "true",
    }),
  );
  router.get("/templates/builtin", (_req, res) =>
    res.json(
      [
        "formal",
        "request",
        "reply",
        "reminder",
        "notice",
        "covering",
        "blank",
      ].map((id) => ({ id, ...newLetter(id) })),
    ),
  );
  router.get(
    "/documents",
    user,
    wrap(async (req, res) =>
      res.json(
        await prisma.letterDocument.findMany({
          where: { userId: req.letterUser, state: { not: "draft" } },
          orderBy: { updatedAt: "desc" },
          take: 200,
          select: {
            id: true,
            title: true,
            kind: true,
            revision: true,
            updatedAt: true,
          },
        }),
      ),
    ),
  );
  router.post(
    "/documents",
    user,
    wrap(async (req, res) => {
      const data = validateLetter(req.body.data),
        kind = ["document", "template", "stationery"].includes(req.body.kind)
          ? req.body.kind
          : "document";
      if (data.status === "final" && missingFields(data).length)
        throw fail("Complete all required fields before finalizing.");
      res.status(201).json(
        await prisma.$transaction(async (tx) => {
          const d = await tx.letterDocument.create({
            data: {
              userId: req.letterUser,
              title: data.title,
              kind,
              data,
              revisions: { create: { revision: 1, data } },
            },
          });
          if (kind === "document" && data.status === "final")
            await tx.letterCorrespondence.create({
              data: {
                documentId: d.id,
                userId: req.letterUser,
                title: data.title,
                text: documentText(data),
              },
            });
          return d;
        }),
      );
    }),
  );
  router.get(
    "/documents/:id",
    user,
    wrap(async (req, res) => {
      const d = await prisma.letterDocument.findFirst({
        where: { id: req.params.id, userId: req.letterUser },
      });
      if (!d) throw fail("Document not found.", 404);
      res.json(d);
    }),
  );
  router.put(
    "/documents/:id",
    user,
    wrap(async (req, res) => {
      const data = validateLetter(req.body.data),
        revision = Number(req.body.revision);
      if (data.status === "final" && missingFields(data).length)
        throw fail("Complete all required fields before finalizing.");
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw fail("A valid revision is required.");
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.letterDocument.updateMany({
          where: { id: req.params.id, userId: req.letterUser, revision },
          data: { data, title: data.title, revision: { increment: 1 } },
        });
        if (!updated.count) {
          const exists = await tx.letterDocument.findFirst({
            where: { id: req.params.id, userId: req.letterUser },
            select: { id: true },
          });
          throw fail(
            exists
              ? "This document changed in another tab. Your local copy has been preserved."
              : "Document not found.",
            exists ? 409 : 404,
          );
        }
        await tx.letterRevision.create({
          data: { documentId: req.params.id, revision: revision + 1, data },
        });
        const d = await tx.letterDocument.findFirst({
          where: { id: req.params.id, userId: req.letterUser },
        });
        if (d.kind === "document" && data.status === "final") {
          const previous = await tx.letterCorrespondence.findUnique({
            where: { documentId: d.id },
          });
          await tx.letterCorrespondence.upsert({
            where: { documentId: d.id },
            create: {
              documentId: d.id,
              userId: req.letterUser,
              title: data.title,
              text: documentText(data),
            },
            update: {
              title: data.title,
              text: documentText(data),
              generation: { increment: 1 },
              state: previous?.included === false ? "excluded" : "pending",
              attempts: 0,
            },
          });
        } else if (d.kind === "document") {
          await tx.letterChunk.deleteMany({
            where: {
              correspondence: { documentId: d.id, userId: req.letterUser },
            },
          });
          await tx.letterCorrespondence.updateMany({
            where: { documentId: d.id, userId: req.letterUser },
            data: {
              state: "draft",
              generation: { increment: 1 },
              lockedAt: null,
            },
          });
        }
        return d;
      });
      res.json(result);
    }),
  );
  router.get(
    "/documents/:id/revisions",
    user,
    wrap(async (req, res) =>
      res.json(
        await prisma.letterRevision.findMany({
          where: { document: { id: req.params.id, userId: req.letterUser } },
          orderBy: { revision: "desc" },
          take: 100,
          select: { id: true, revision: true, createdAt: true },
        }),
      ),
    ),
  );
  router.get(
    "/documents/:id/revisions/:revision",
    user,
    wrap(async (req, res) => {
      const revision = Number(req.params.revision);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw fail("Invalid revision.");
      const item = await prisma.letterRevision.findFirst({
        where: {
          revision,
          document: { id: req.params.id, userId: req.letterUser },
        },
      });
      if (!item) throw fail("Revision not found.", 404);
      res.json(item);
    }),
  );
  router.delete(
    "/documents/:id",
    user,
    wrap(async (req, res) => {
      await prisma.letterDocument.deleteMany({
        where: { id: req.params.id, userId: req.letterUser },
      });
      res.json({ ok: true });
    }),
  );
  router.post(
    "/export/:format",
    wrap(async (req, res) => {
      if (active >= 2)
        throw fail(
          "The export service is busy. Please try again shortly.",
          503,
        );
      active++;
      try {
        const format = req.params.format;
        if (!["pdf", "docx"].includes(format))
          throw fail("Unsupported export format.");
        const data = validateLetter(req.body.data);
        const bytes = await (format === "pdf"
          ? exportPdf(data)
          : exportDocx(data));
        res
          .type(
            format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          )
          .attachment(`${data.title.replace(/[^a-z0-9_-]/gi, "_")}.${format}`)
          .send(bytes);
      } finally {
        active--;
      }
    }),
  );
  router.get(
    "/correspondence",
    user,
    wrap(async (req, res) =>
      res.json(
        await prisma.letterCorrespondence.findMany({
          where: { userId: req.letterUser },
          orderBy: { updatedAt: "desc" },
          take: 200,
          select: {
            id: true,
            title: true,
            metadata: true,
            state: true,
            error: true,
            included: true,
            createdAt: true,
          },
        }),
      ),
    ),
  );
  router.post(
    "/correspondence",
    user,
    uploadAdmission,
    wrap(async (req, _res, next) => {
      if (
        !process.env.LETTER_DOCLING_PYTHON ||
        !process.env.LETTER_DOCLING_MODELS
      )
        throw fail("Local document extraction has not been configured.", 503);
      if (
        (await prisma.letterCorrespondence.count({
          where: { userId: req.letterUser },
        })) >= 1000
      )
        throw fail(
          "Your correspondence archive has reached its 1,000-file limit.",
          413,
        );
      await mkdir(root, { recursive: true, mode: 0o700 });
      next();
    }),
    upload.single("file"),
    wrap(async (req, res) => {
      try {
        if (!req.file || !/\.(pdf|docx)$/i.test(req.file.originalname))
          throw fail("Choose a PDF or DOCX file.");
        const h = await open(req.file.path, "r");
        let bytes;
        try {
          bytes = Buffer.alloc(5);
          await h.read(bytes, 0, 5, 0);
        } finally {
          await h.close();
        }
        if (
          bytes.toString() !== "%PDF-" &&
          bytes.subarray(0, 2).toString() !== "PK"
        )
          throw fail("Invalid document file.");
        const suffix = bytes.toString() === "%PDF-" ? ".pdf" : ".docx";
        if (path.extname(req.file.originalname).toLowerCase() !== suffix)
          throw fail("The file extension does not match its content.");
        const stored = req.file.path + suffix;
        await rename(req.file.path, stored);
        req.file.path = stored;
        await chmod(stored, 0o600);
        res.status(202).json(
          await prisma.letterCorrespondence.create({
            data: {
              userId: req.letterUser,
              title: req.file.originalname.slice(0, 150),
              fileName: req.file.originalname.slice(0, 150),
              filePath: req.file.path,
              metadata: { reviewRequired: true },
            },
          }),
        );
      } catch (e) {
        if (req.file) await unlink(req.file.path).catch(() => {});
        throw e;
      }
    }),
  );
  router.get(
    "/correspondence/:id",
    user,
    wrap(async (req, res) => {
      const item = await prisma.letterCorrespondence.findFirst({
        where: { id: req.params.id, userId: req.letterUser },
      });
      if (!item) throw fail("Correspondence not found.", 404);
      const { filePath, ...safe } = item;
      res.json(safe);
    }),
  );
  router.get(
    "/correspondence/:id/original",
    user,
    wrap(async (req, res) => {
      const item = await prisma.letterCorrespondence.findFirst({
        where: { id: req.params.id, userId: req.letterUser },
      });
      if (!item?.filePath) throw fail("Original file not found.", 404);
      res.attachment(item.fileName).sendFile(item.filePath);
    }),
  );
  router.patch(
    "/correspondence/:id",
    user,
    wrap(async (req, res) => {
      const item = await prisma.letterCorrespondence.findFirst({
        where: { id: req.params.id, userId: req.letterUser },
      });
      if (!item) throw fail("Correspondence not found.", 404);
      const data = { generation: { increment: 1 }, attempts: 0 };
      if (typeof req.body.included === "boolean")
        data.included = req.body.included;
      if (typeof req.body.title === "string")
        data.title = req.body.title.slice(0, 150);
      if (typeof req.body.text === "string") {
        data.text = req.body.text.slice(0, 250000);
        data.metadata = {
          ...item.metadata,
          textReviewed: true,
          reviewRequired: false,
        };
      }
      if (req.body.metadata && JSON.stringify(req.body.metadata).length < 10000)
        data.metadata = {
          ...item.metadata,
          ...req.body.metadata,
          ...(typeof req.body.text === "string"
            ? { textReviewed: true, reviewRequired: false }
            : {}),
        };
      data.state = (data.included ?? item.included) ? "pending" : "excluded";
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM letter_correspondence WHERE id=${item.id} FOR UPDATE`;
        await tx.letterChunk.deleteMany({
          where: { correspondenceId: item.id },
        });
        await tx.letterCorrespondence.update({ where: { id: item.id }, data });
      });
      res.json({ ok: true });
    }),
  );
  router.delete(
    "/correspondence/:id",
    user,
    wrap(async (req, res) => {
      const item = await prisma.letterCorrespondence.findFirst({
        where: { id: req.params.id, userId: req.letterUser },
      });
      if (item) {
        if (item.filePath)
          await unlink(item.filePath).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        await prisma.letterCorrespondence.deleteMany({
          where: { id: item.id, userId: req.letterUser },
        });
      }
      res.json({ ok: true });
    }),
  );
  router.get(
    "/search",
    user,
    wrap(async (req, res) =>
      res.json(await searchMemory(prisma, req.letterUser, req.query.q)),
    ),
  );
  router.post(
    "/ai",
    user,
    wrap(async (req, res) => {
      const {
        action = "draft",
        prompt = "",
        text = "",
        tone = "Professional",
        sourceIds = [],
        includeDrafts = false,
      } = req.body;
      if (
        ![
          "Professional",
          "Formal",
          "Firm and courteous",
          "Warm",
          "Concise",
        ].includes(tone)
      )
        throw fail("Invalid writing tone.");
      if (
        ![
          "draft",
          "rewrite",
          "shorten",
          "formalize",
          "summarize",
          "reply",
          "translate",
        ].includes(action) ||
        typeof prompt !== "string" ||
        typeof text !== "string" ||
        prompt.length > 8000 ||
        text.length > 16000 ||
        !Array.isArray(sourceIds) ||
        sourceIds.length > 10
      )
        throw fail("Invalid AI drafting request.");
      if (!aiReady())
        throw fail(
          "AI is awaiting server configuration and quality validation.",
          503,
        );
      if (aiProvider() === "nvidia" && req.body.externalConsent !== true)
        throw fail(
          "Confirm sending this request and relevant correspondence excerpts to NVIDIA.",
          400,
        );
      const sources = await searchMemory(prisma, req.letterUser, prompt, {
        ids: sourceIds.filter((id) => typeof id === "string"),
        includeDrafts: !!includeDrafts,
      });
      const abort = new AbortController(),
        timer = setTimeout(() => abort.abort(), 180000);
      res.once("close", () => abort.abort());
      try {
        await streamDraft(
          { action, prompt, text, tone: String(tone).slice(0, 80), sources },
          res,
          abort.signal,
        );
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  router.use((error, req, res, _next) => {
    if (req.file) unlink(req.file.path).catch(() => {});
    const status = error.status || 400;
    const message = error.status
      ? error.message
      : "Letter Studio could not complete this request.";
    if (res.headersSent)
      return res.end(JSON.stringify({ error: message }) + "\n");
    res.status(status).json({ error: message });
  });
  return router;
}
