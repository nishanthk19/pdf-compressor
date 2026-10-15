import test from "node:test";
import assert from "node:assert/strict";
import { nvidia, nvidiaTokens } from "../src/letter-nvidia.js";
import { streamDraft, embedding, aiConfigured } from "../src/letter-ai.js";
import express from "express";
import { createLetterRouter } from "../src/letter-routes.js";
import { readFile } from "node:fs/promises";

test("public AI wording is Vibify-branded without removing consent or source access", async () => {
  const editor = await readFile(new URL("../frontend/letter-studio.js", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../public/js/catalog.js", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /nvidia|nvedia|AGPL-3\.0/i);
  assert.match(editor, /Vibify AI/);
  assert.match(editor, /Allow external AI processing/);
  assert.match(editor, /name="accepted" required/);
  assert.match(editor, /Source code/);
  assert.doesNotMatch(catalog, />AGPL-3\.0 license</);
  assert.match(catalog, /blob\/main\/LICENSE/);
  assert.match(catalog, /Legal information/);
});

function sse(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7)
          controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const frame = (text) =>
  "data: " +
  JSON.stringify({ choices: [{ delta: { content: text } }] }) +
  "\r\n\r\n";
test("NVIDIA SSE handles Unicode/packet boundaries and rejects truncated or limited output", async () => {
  const collect = async (r) => {
    let out = "";
    for await (const t of nvidiaTokens(r)) out += t;
    return out;
  };
  assert.equal(
    await collect(
      sse(
        ": heartbeat\r\n\r\n" +
          frame("Receipt — received.") +
          "data: [DONE]\r\n\r\n",
      ),
    ),
    "Receipt — received.",
  );
  await assert.rejects(collect(sse(frame("partial"))), /before completion/);
  await assert.rejects(
    collect(
      sse('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'),
    ),
    /incomplete/,
  );
  await assert.rejects(
    collect(sse('data: {"error":"SECRET"}\n\n')),
    /could not complete/,
  );
});

test("NVIDIA credentials stay server-side; fixed endpoint, approval, citations, embeddings and sanitized failures", async () => {
  const keys = [
    "LETTER_AI_PROVIDER",
    "LETTER_EMBED_PROVIDER",
    "NVIDIA_API_KEY",
    "LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED",
    "LETTER_AI_ENABLED",
    "LETTER_AI_BENCHMARK_PASSED",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]])),
    fetchBefore = globalThis.fetch;
  const calls = [];
  try {
    process.env.LETTER_AI_PROVIDER = process.env.LETTER_EMBED_PROVIDER =
      "nvidia";
    process.env.LETTER_AI_ENABLED = process.env.LETTER_AI_BENCHMARK_PASSED =
      "true";
    process.env.NVIDIA_API_KEY = "synthetic-test-secret";
    delete process.env.LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED;
    assert.equal(aiConfigured(), false);
    await assert.rejects(nvidia("chat/completions", {}), /data transfer/);
    assert.equal(calls.length, 0);
    process.env.LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED = "true";
    assert.equal(aiConfigured(), true);
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options, body: JSON.parse(options.body) });
      return String(url).endsWith("/embeddings")
        ? Response.json({ data: [{ embedding: [0.1, 0.2] }] })
        : sse(frame("Reference 42 [S1].") + "data: [DONE]\n\n");
    };
    let output = "";
    const res = {
      set() {},
      flushHeaders() {},
      write(s) {
        output += s;
      },
      end(s) {
        output += s;
      },
    };
    await streamDraft(
      {
        action: "reply",
        tone: "Formal",
        prompt: "Confirm",
        text: "",
        sources: [{ id: "doc", title: "Ref 42", text: "Receipt confirmed." }],
      },
      res,
    );
    assert.match(output, /Reference 42/);
    assert.doesNotMatch(output, /synthetic-test-secret/);
    assert.equal(JSON.parse(output.trim().split("\n").at(-1)).done, true);
    assert.equal(
      calls[0].url,
      "https://integrate.api.nvidia.com/v1/chat/completions",
    );
    assert.equal(calls[0].options.redirect, "error");
    assert.equal(
      calls[0].options.headers.authorization,
      "Bearer synthetic-test-secret",
    );
    assert.equal(calls[0].body.messages[1].role, "user");
    assert.equal(calls[0].body.max_tokens, 1800);
    assert.deepEqual(await embedding("Archive passage"), [0.1, 0.2]);
    assert.equal(calls.at(-1).body.input_type, "passage");
    await embedding("Query", "query");
    assert.equal(calls.at(-1).body.input_type, "query");
    globalThis.fetch = async () =>
      new Response("synthetic-test-secret private upstream detail", {
        status: 401,
      });
    await assert.rejects(
      nvidia("chat/completions", {}),
      (e) =>
        /credentials need attention/.test(e.message) &&
        !/nvidia/i.test(e.message) &&
        !e.message.includes("synthetic"),
    );
    globalThis.fetch = async () => new Response("private", { status: 429 });
    await assert.rejects(nvidia("chat/completions", {}), /rate limit/);
    globalThis.fetch = async () =>
      sse(frame("Unknown [S9].") + "data: [DONE]\n\n");
    await assert.rejects(
      streamDraft(
        {
          action: "draft",
          tone: "Formal",
          prompt: "Test",
          text: "",
          sources: [],
        },
        res,
      ),
      /unknown source citation/,
    );
  } finally {
    globalThis.fetch = fetchBefore;
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});

test("NVIDIA HTTP drafting requires explicit consent before retrieving correspondence", async () => {
  const keys = [
    "LETTER_AI_PROVIDER",
    "NVIDIA_API_KEY",
    "LETTER_NVIDIA_DATA_TRANSFER_ACCEPTED",
    "LETTER_AI_ENABLED",
    "LETTER_AI_BENCHMARK_PASSED",
    "LETTER_STUDIO_ENABLED",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  let server,
    retrievals = 0;
  try {
    process.env.LETTER_AI_PROVIDER = "nvidia";
    process.env.NVIDIA_API_KEY = "synthetic-test-secret";
    for (const k of keys.filter(
      (k) => !["LETTER_AI_PROVIDER", "NVIDIA_API_KEY"].includes(k),
    ))
      process.env[k] = "true";
    const app = express();
    app.use(express.json());
    app.use(
      "/api/letters",
      createLetterRouter({
        prisma: {
          $queryRawUnsafe: () => {
            retrievals++;
            throw new Error("Should not retrieve");
          },
        },
        auth: { api: { getSession: async () => ({ user: { id: "user-a" } }) } },
      }),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const config = await (await fetch(base + "/api/letters/config")).json();
    assert.equal(config.ai, true);
    assert.equal(config.externalAI, true);
    assert.doesNotMatch(JSON.stringify(config), /synthetic-test-secret/);
    const denied = await fetch(base + "/api/letters/ai", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        action: "draft",
        prompt: "Test",
        text: "",
        tone: "Formal",
        sourceIds: [],
      }),
    });
    assert.equal(denied.status, 400);
    assert.match((await denied.json()).error, /Confirm sending/);
    assert.equal(retrievals, 0);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
