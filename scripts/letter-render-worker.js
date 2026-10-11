// No TCP listener, credentials, archive mount or outbound network is needed.
import http from "node:http";
import path from "node:path";
import { chmod, lstat, unlink } from "node:fs/promises";
import { exportPdf } from "../src/letter-export.js";
const socket = process.env.LETTER_RENDER_SOCKET || "/run/letter-renderer/worker.sock";
if (!path.isAbsolute(socket)) throw new Error("An absolute worker socket is required.");
const previous = await lstat(socket).catch((e) => { if (e.code !== "ENOENT") throw e; });
if (previous) {
  if (!previous.isSocket()) throw new Error("Refusing to overwrite a non-socket path.");
  await unlink(socket);
}
let active = 0;
const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/render") { res.writeHead(404).end(); return; }
  if (active >= 3) { res.writeHead(503).end(); return; }
  active++;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2_000_000) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(chunk);
    }
    const output = await exportPdf(JSON.parse(Buffer.concat(chunks).toString()), { local: true });
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": output.length }).end(output);
  } catch {
    if (!res.headersSent) res.writeHead(422);
    res.end("Unable to render the supplied letter.");
  } finally { active--; }
});
server.maxConnections = 6;
server.requestTimeout = 55000;
server.headersTimeout = 10000;
server.listen(socket, async () => { await chmod(socket, 0o600); console.log("Private Letter Studio PDF worker ready."); });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
