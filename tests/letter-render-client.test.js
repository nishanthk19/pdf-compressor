import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderViaSocket } from "../src/letter-render-client.js";

test("private PDF socket client validates binary responses and hides worker errors", {
  skip: process.platform === "win32",
}, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "letter-render-test-"));
  const socket = path.join(dir, "worker.sock");
  let bad = false;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(req.url, "/render");
    assert.equal(JSON.parse(Buffer.concat(chunks)).title, "Fixture");
    res.writeHead(bad ? 500 : 200).end(bad ? "private failure details" : "%PDF-synthetic fixture");
  });
  await new Promise((resolve) => server.listen(socket, resolve));
  try {
    assert.match((await renderViaSocket({ title: "Fixture" }, socket)).toString(), /^%PDF-/);
    bad = true;
    await assert.rejects(renderViaSocket({ title: "Fixture" }, socket), /PDF rendering failed/);
    assert.throws(() => renderViaSocket({}, "relative.sock"), /not configured/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
