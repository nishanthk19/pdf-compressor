import http from "node:http";
import path from "node:path";
import { fail } from "./letter-validation-error.js";

export function renderViaSocket(letter, socketPath = process.env.LETTER_RENDER_SOCKET) {
  if (!socketPath || !path.isAbsolute(socketPath))
    throw fail("The PDF worker socket is not configured.", 503);
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(letter);
    const request = http.request({ socketPath, path: "/render", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) request.destroy(new Error("Response too large"));
        else chunks.push(chunk);
      });
      response.on("error", () => reject(fail("PDF worker connection failed.", 503)));
      response.on("end", () => {
        const output = Buffer.concat(chunks);
        if (response.statusCode !== 200 || output.subarray(0, 5).toString() !== "%PDF-")
          return reject(fail("PDF rendering failed. Please check the letter layout and try again.", 503));
        resolve(output);
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error("Render timeout")), 50000);
    deadline.unref();
    request.on("error", () => reject(fail("The PDF export worker is unavailable. Please retry shortly.", 503)));
    request.on("close", () => clearTimeout(deadline));
    request.end(body);
  });
}
