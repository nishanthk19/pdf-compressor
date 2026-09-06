import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { compressPdf, runCommand } from "../src/pdf-tools.js";
import { ProcessingPool } from "../src/processing-pool.js";

test("worker operations preserve merge order, extract ranges, rotation and deletions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibify-test-"));
  const pool = new ProcessingPool({ size: 2 });
  try {
    const a = await PDFDocument.create();
    a.addPage([200, 300]);
    a.addPage([210, 300]);
    const b = await PDFDocument.create();
    b.addPage([400, 500]);
    const first = path.join(dir, "first.pdf"),
      second = path.join(dir, "second.pdf"),
      output = path.join(dir, "merged.pdf");
    await fs.writeFile(first, await a.save());
    await fs.writeFile(second, await b.save());
    await pool.run("mergePdfs", [[second, first], output]);
    const merged = await PDFDocument.load(await fs.readFile(output));
    assert.deepEqual(
      merged.getPages().map((p) => p.getWidth()),
      [400, 200, 210],
    );
    const extracted = path.join(dir, "extracted.pdf"),
      rotated = path.join(dir, "rotated.pdf"),
      deleted = path.join(dir, "deleted.pdf");
    await Promise.all([
      pool.run("extractPages", [output, extracted, 2, 3]),
      pool.run("rotatePdf", [output, rotated, 90]),
      pool.run("deletePages", [output, deleted, "2"]),
    ]);
    assert.equal(
      (await PDFDocument.load(await fs.readFile(extracted))).getPageCount(),
      2,
    );
    assert.equal(
      (await PDFDocument.load(await fs.readFile(rotated)))
        .getPage(0)
        .getRotation().angle,
      90,
    );
    assert.deepEqual(
      (await PDFDocument.load(await fs.readFile(deleted)))
        .getPages()
        .map((p) => p.getWidth()),
      [400, 210],
    );
    await assert.rejects(
      pool.run("extractPages", [output, extracted, 0, 7]),
      /Page range/,
    );
    await assert.rejects(
      pool.run("deletePages", [output, deleted, "1-3"]),
      /all of its pages/,
    );
    await assert.rejects(pool.run("notAllowed", []), /Unsupported/);
    await pool.run("paginatePdf", [
      first,
      path.join(dir, "numbered.pdf"),
      { position: "bottom-center", startPage: 1 },
    ]);
  } finally {
    await pool.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("compression retains a matching candidate after one pass and cleans scratch output", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibify-compress-test-"));
  try {
    const input = path.join(dir, "input.pdf"),
      output = path.join(dir, "out.pdf");
    await fs.writeFile(input, Buffer.alloc(2 * 1024 * 1024));
    let calls = 0;
    await compressPdf(input, output, 1, async (_command, args) => {
      calls++;
      const target = args.find((a) => a.startsWith("-sOutputFile=")).slice(13);
      await fs.writeFile(target, Buffer.alloc(1_020_000, 7));
    });
    assert.equal(calls, 1);
    assert.equal((await fs.stat(output)).size, 1_020_000);
    await assert.rejects(fs.stat(`${output}.candidate.pdf`), {
      code: "ENOENT",
    });
    await compressPdf(output, path.join(dir, "copy.pdf"), 2, () => {
      throw new Error("should not execute");
    });
    assert.deepEqual(
      await fs.readFile(output),
      await fs.readFile(path.join(dir, "copy.pdf")),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("compression retains best successful result without rerunning and cleans failed attempts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibify-search-test-"));
  try {
    const input = path.join(dir, "in.pdf"),
      output = path.join(dir, "out.pdf");
    await fs.writeFile(input, Buffer.alloc(2_000_000));
    let calls = 0;
    let best = 0;
    await compressPdf(input, output, 1, async (_, args) => {
      calls++;
      const dpi = Number(
        args.find((a) => a.startsWith("-dColorImageResolution=")).split("=")[1],
      );
      const size = dpi <= 130 ? 700_000 : 1_200_000;
      if (size < 1_048_576) best = dpi;
      await fs.writeFile(
        args.find((a) => a.startsWith("-sOutputFile=")).slice(13),
        Buffer.alloc(size, dpi),
      );
    });
    assert.ok(calls <= 7);
    assert.equal((await fs.readFile(output))[0], best);
    await assert.rejects(
      compressPdf(input, output, 1, async (_, args) => {
        await fs.writeFile(
          args.find((a) => a.startsWith("-sOutputFile=")).slice(13),
          Buffer.alloc(1_200_000),
        );
      }),
      /too small/,
    );
    await assert.rejects(fs.stat(`${output}.candidate.pdf`), {
      code: "ENOENT",
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("external process timeout stops a hung command", async () => {
  await assert.rejects(
    runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], 100),
    /time limit/,
  );
});
