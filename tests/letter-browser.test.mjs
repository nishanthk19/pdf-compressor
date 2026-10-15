import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { chromium } from "playwright";
import { newLetter, paragraph } from "../public/js/letter-model.js";
import { exportPdf } from "../src/letter-export.js";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";

// Opt in on a host that permits Chromium subprocesses:
// LETTER_BROWSER_TEST=1 node --test tests/letter-browser.test.mjs
test(
  "browser recovery, templates, editable AI proposal/undo and PDF pagination",
  { skip: process.env.LETTER_BROWSER_TEST !== "1" },
  async () => {
    const app = express();
    app.use(express.json());
    const docs = new Map();
    let next = 1;
    app.get("/api/letters/config", (_q, r) =>
      r.json({ signedIn: true, userId: "browser-fixture", ai: true }),
    );
    app.get("/api/letters/documents", (_q, r) => r.json([...docs.values()]));
    app.post("/api/letters/documents", (q, r) => {
      const d = {
        id: String(next++),
        kind: q.body.kind,
        data: q.body.data,
        title: q.body.data.title,
        revision: 1,
      };
      docs.set(d.id, d);
      r.json(d);
    });
    app.put("/api/letters/documents/:id", (q, r) => {
      const d = docs.get(q.params.id);
      if (q.body.revision !== d.revision)
        return r.status(409).json({ error: "Revision conflict" });
      Object.assign(d, {
        data: q.body.data,
        title: q.body.data.title,
        revision: d.revision + 1,
      });
      r.json(d);
    });
    app.get("/api/letters/ai", (_q, r) => r.status(405).end());
    app.post("/api/letters/ai", (_q, r) =>
      r
        .type("application/x-ndjson")
        .end(
          JSON.stringify({ sources: [] }) +
            "\n" +
            JSON.stringify({ token: "Proposed replacement text." }) +
            "\n" +
            JSON.stringify({ done: true }) +
            "\n",
        ),
    );
    app.use(
      express.static(
        new URL("../public", import.meta.url).pathname.replace(
          /^\/(\w:)/,
          "$1",
        ),
      ),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    let browser, page;
    try {
      browser = await chromium.launch({
        executablePath: process.env.LETTER_CHROMIUM_PATH || undefined,
      });
      page = await browser.newPage({
        viewport: { width: 1536, height: 960 },
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        "http://127.0.0.1:" + server.address().port + "/letter-studio.html",
      );
      await page.locator('#studio[data-ready="true"]').waitFor();
      await page
        .getByRole("textbox", { name: "Letter document", exact: true })
        .fill("Original letter body.");
      await page
        .getByRole("textbox", { name: "Document title" })
        .fill("Recovery test");
      await page.waitForTimeout(1800);
      await page.reload();
      await page.locator('#studio[data-ready="true"]').waitFor();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Document title" })
          .inputValue(),
        "Recovery test",
      );
      await page.getByRole("tab", {name:"View",exact:true}).click();
      await page.getByRole("button", {name:"Assistant pane",exact:true}).click();
      await page.getByRole("tab", {name:"Home",exact:true}).click();
      await page.getByRole("button", { name: "Formalize", exact: true }).click();
      await page
        .getByRole("button", { name: "Accept suggestion", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Letter document", exact: true })
          .innerText(),
        "Original letter body.",
      );
      await page
        .getByRole("button", { name: "Accept suggestion", exact: true })
        .click();
      assert.match(
        await page
          .getByRole("textbox", { name: "Letter document", exact: true })
          .innerText(),
        /Proposed replacement/,
      );
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.match(
        await page
          .getByRole("textbox", { name: "Letter document", exact: true })
          .innerText(),
        /Original letter body/,
      );
      await page.getByRole("button", { name: "More document actions" }).click();
      await page.locator('dialog select[name="action"]').selectOption("template");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Reusable template");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: "Templates ↗", exact: true }).click();
      await page
        .getByRole("button", { name: "Reusable template", exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      const letter = newLetter("blank");
      letter.content.content = [
        paragraph("Searchable first page."),
        { type: "pageBreak" },
        paragraph("Searchable second page."),
      ];
      letter.required = [];
      letter.stationery.header = "Office";
      letter.stationery.footer = "Confidential";
      const pdf = await PDFDocument.load(await exportPdf(letter));
      assert.equal(pdf.getPageCount(), 2);
      letter.content.content = [
        {
          type: "table",
          content: Array.from({ length: 80 }, (_, i) => ({
            type: "tableRow",
            content: [
              {
                type: i === 0 ? "tableHeader" : "tableCell",
                content: [paragraph("Row " + i)],
              },
              {
                type: i === 0 ? "tableHeader" : "tableCell",
                content: [paragraph("Evidence " + i)],
              },
            ],
          })),
        },
      ];
      assert.ok(
        (await PDFDocument.load(await exportPdf(letter))).getPageCount() > 1,
      );
    } finally {
      await mkdir(".artifacts/qa", { recursive: true });
      await page?.screenshot({ path: ".artifacts/qa/editor.png", fullPage: true }).catch(() => {});
      if (page) await writeFile(".artifacts/qa/editor.html", await page.content()).catch(() => {});
      await browser?.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  },
);
