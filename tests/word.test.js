import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { wordOptions } from "../src/word-options.js";
import { convertToWord } from "../src/pdf-tools.js";

test("Word settings validate ranges and allowlisted OCR arguments", () => {
  assert.deepEqual(wordOptions(), { ocr: "auto", language: "eng", start: 1, end: undefined });
  assert.deepEqual(wordOptions({ startPage: "2", endPage: "8", language: "eng+tam" }), { ocr: "auto", language: "eng+tam", start: 2, end: 8 });
  for (const settings of [{ ocr: "--evil" }, { language: "../eng" }, { startPage: "1.5" }, { startPage: "0" }, { startPage: "9", endPage: "2" }, { endPage: "201" }, { startPage: ["2", "3"] }]) assert.throws(() => wordOptions(settings));
});

test("Word worker uses isolated process, bounded timeout, and cleans reports", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "word-test-"));
  let reportPath;
  const runner = async (_command, args, timeout) => {
    assert.equal(timeout, 480000);
    assert.ok(args[0].endsWith("convert.py"));
    assert.equal(args[args.indexOf("--language") + 1], "eng+hin");
    assert.equal(args[args.indexOf("--end") + 1], "3");
    reportPath = args[args.indexOf("--report") + 1];
    await fs.writeFile(reportPath, JSON.stringify({ pages: 2, ocrPages: 1 }));
  };
  try {
    assert.deepEqual(await convertToWord("input.pdf", path.join(dir, "out.docx"), { startPage: "2", endPage: "3", language: "eng+hin" }, runner), { pages: 2, ocrPages: 1 });
    await assert.rejects(fs.stat(path.dirname(reportPath)), { code: "ENOENT" });
    const output = path.join(dir, "failed.docx");
    await fs.writeFile(output, "partial output");
    await assert.rejects(convertToWord("input.pdf", output, {}, async () => { throw Object.assign(new Error("private file content"), { converterCode: "OCR_REQUIRED" }); }), /Enable automatic OCR/);
    await assert.rejects(fs.stat(output), { code: "ENOENT" });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
