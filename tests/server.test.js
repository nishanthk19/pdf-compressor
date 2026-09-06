import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { ProcessingPool } from "../src/processing-pool.js";

test("bounded queue rejects excess work and recovers after worker failure", async () => {
  const pool = new ProcessingPool({
    size: 1,
    maxQueue: 1,
    worker: new URL("./fixtures/pool-worker.js", import.meta.url),
  });
  try {
    const first = pool.run("echo", ["first", 50]);
    const second = pool.run("echo", ["second", 0]);
    await assert.rejects(
      pool.run("echo", ["excess", 0]),
      (error) => error.status === 503,
    );
    assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
    const interrupted = assert.rejects(
      pool.run("echo", ["killed", 5000]),
      /stopped unexpectedly/,
    );
    pool.slots[0].child.kill();
    await interrupted;
    assert.equal(await pool.run("echo", ["recovered", 0]), "recovered");
  } finally {
    await pool.close();
  }
});

test("HTTP routes, uploads, worker results, auth boundary and overload response", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      PORT: "3099",
      APP_URL: "http://localhost:3099",
      BETTER_AUTH_URL: "http://localhost:3099",
      BETTER_AUTH_SECRET: "test-only-auth-secret-123456789012345678901234",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  const base = "http://localhost:3099";
  try {
    const started = Date.now();
    while (!output.includes("Server running")) {
      if (child.exitCode !== null || Date.now() - started > 20000)
        throw new Error("Test server failed to start: " + output);
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const route of [
      "/",
      "/tools/merge",
      "/tools/merge.html",
      "/compress",
      "/editor",
      "/flow-editor",
      "/overlay-editor",
      "/paginate-editor",
      "/tools/pdf-maker",
      "/tools/add-text",
      "/login",
      "/profile",
      "/admin",
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("content-type"), /text\/html/);
    }
    for (const id of [
      "compress",
      "word",
      "extract",
      "rotate",
      "delete",
      "ocr",
      "protect",
      "unlock",
      "paginate",
      "archive",
    ]) {
      assert.match(
        await (await fetch(base + "/tools/" + id)).text(),
        /\/js\/tool.js/,
      );
    }
    assert.equal((await fetch(base + "/api/admin/data")).status, 401);
    assert.equal((await fetch(base + "/does-not-exist")).status, 404);
    assert.equal(
      (await fetch(base + "/api/health")).headers.get("x-powered-by"),
      null,
    );
    const a = await PDFDocument.create();
    a.addPage([300, 400]);
    a.addPage([310, 400]);
    const b = await PDFDocument.create();
    b.addPage([500, 600]);
    const ab = await a.save(),
      bb = await b.save();
    const upload = async (route, values = {}, blobs = [ab]) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(values)) form.append(k, v);
      for (const [i, data] of blobs.entries())
        form.append(
          route === "merge" ? "pdfs" : "pdf",
          new Blob([data], { type: "application/pdf" }),
          `fixture-${i}.pdf`,
        );
      return fetch(base + "/" + route, { method: "POST", body: form });
    };
    let response = await upload("merge", {}, [bb, ab]);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /attachment/);
    let doc = await PDFDocument.load(await response.arrayBuffer());
    assert.deepEqual(
      doc.getPages().map((p) => p.getWidth()),
      [500, 300, 310],
    );
    response = await upload("extract", { startPage: "2", endPage: "2" });
    assert.equal(response.status, 200);
    assert.equal(
      (await PDFDocument.load(await response.arrayBuffer())).getPageCount(),
      1,
    );
    response = await upload("rotate", { angle: "90" });
    assert.equal(response.status, 200);
    assert.equal(
      (await PDFDocument.load(await response.arrayBuffer()))
        .getPage(0)
        .getRotation().angle,
      90,
    );
    response = await upload("paginate", {
      position: "bottom-center",
      startPage: "1",
    });
    assert.equal(response.status, 200);
    response = await upload("compress", { targetSize: "2" });
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), ab);
    response = await upload("word");
    assert.equal(response.status, 200);
    assert.equal(new Uint8Array(await response.arrayBuffer())[0], 80);
    response = await upload("extract-coords");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).totalPages, 2);
    response = await upload("extract-html");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<p>/);
    response = await upload("merge");
    assert.equal(response.status, 400);
    response = await upload("extract", { startPage: "3", endPage: "1" });
    assert.equal(response.status, 400);
    response = await upload("rotate", { angle: "15" });
    assert.equal(response.status, 400);
    response = await upload("rotate", { angle: "90" }, [
      new TextEncoder().encode("not a PDF"),
    ]);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not a valid PDF/);
    response = await upload("merge", {}, Array(21).fill(ab));
    assert.equal(response.status, 400);
    assert.equal((await fetch(base + "/api/health")).status, 200);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
});
