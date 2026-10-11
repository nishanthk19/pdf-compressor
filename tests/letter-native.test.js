import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { createLetterRouter } from "../src/letter-routes.js";
import { newLetter, paragraph } from "../public/js/letter-model.js";
import { indexCorrespondence } from "../src/letter-memory.js";

// Only an explicitly provisioned isolated database is accepted, never DATABASE_URL.
test("native PostgreSQL library, revisions, finalization, memory and two-account isolation", {
  skip: !process.env.LETTER_NATIVE_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.LETTER_NATIVE_DATABASE_URL);
  assert.match(url.pathname, /(?:fixture|acceptance|test)/);
  const prisma = new PrismaClient({ datasourceUrl: url.href });
  const oldFlag = process.env.LETTER_STUDIO_ENABLED;
  process.env.LETTER_STUDIO_ENABLED = "true";
  const prefix = "letter-test-" + Date.now();
  const users = await Promise.all(["a", "b"].map((id) => prisma.user.create({
    data: { id: prefix + id, name: "Synthetic account", email: prefix + id + "@example.invalid" },
  })));
  const app = express();
  app.use(express.json());
  app.use("/api/letters", createLetterRouter({ prisma, auth: { api: {
    getSession: async ({ headers }) => {
      const id = headers.get("x-test-user");
      return users.some((u) => u.id === id) ? { user: { id } } : null;
    },
  } } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const req = (user, route, method = "GET", body) => fetch(base + "/api/letters" + route, {
    method, headers: { "x-test-user": user, origin: base, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const letter = newLetter("blank");
    letter.required = [];
    letter.content.content = [paragraph("Synthetic scanner reconciliation reference TEST/42.")];
    const created = await req(users[0].id, "/documents", "POST", { data: letter });
    assert.equal(created.status, 201, await created.clone().text());
    const doc = await created.json();
    const listing = await req(users[0].id, "/documents");
    assert.equal(listing.status, 200, await listing.clone().text());
    assert.ok((await listing.json()).some((d) => d.id === doc.id));
    assert.deepEqual(await (await req(users[1].id, "/documents")).json(), []);
    assert.equal((await req(users[1].id, "/documents/" + doc.id)).status, 404);
    letter.status = "final";
    assert.equal((await req(users[0].id, "/documents/" + doc.id, "PUT", { revision: 1, data: letter })).status, 200);
    assert.equal((await req(users[0].id, "/documents/" + doc.id, "PUT", { revision: 1, data: letter })).status, 409);
    const history = await (await req(users[0].id, "/documents/" + doc.id + "/revisions")).json();
    assert.equal(history.length, 2);
    const source = await prisma.letterCorrespondence.findUnique({ where: { documentId: doc.id } });
    await indexCorrespondence(prisma, source);
    const search = async (user) => (await req(user, "/search?q=scanner")).json();
    assert.equal((await search(users[0].id)).length, 1);
    assert.equal((await search(users[1].id)).length, 0);
    assert.equal((await req(users[0].id, "/correspondence/" + source.id, "PATCH", { included: false })).status, 200);
    assert.equal((await search(users[0].id)).length, 0);
    letter.status = "draft";
    assert.equal((await req(users[0].id, "/documents/" + doc.id, "PUT", { revision: 2, data: letter })).status, 200);
    assert.deepEqual(await (await req(users[0].id, "/correspondence")).json(), []);
    assert.equal((await req(users[0].id, "/documents/" + doc.id, "DELETE")).status, 200);
    assert.equal(await prisma.letterChunk.count({ where: { correspondenceId: source.id } }), 0);
    assert.equal(await prisma.letterRevision.count({ where: { documentId: doc.id } }), 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
    if (oldFlag === undefined) delete process.env.LETTER_STUDIO_ENABLED;
    else process.env.LETTER_STUDIO_ENABLED = oldFlag;
  }
});
