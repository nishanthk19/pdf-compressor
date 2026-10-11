// Real PostgreSQL SQL engine in WASM. Does not replace target-host Prisma tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { searchMemory } from "../src/letter-memory.js";
test("additive migration, FTS, account isolation, exclusion, deletion and revision CAS on PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE \"user\"(id TEXT PRIMARY KEY); INSERT INTO \"user\" VALUES ('a'),('b');",
    );
    const sql = await readFile(
      new URL("../prisma/letter-studio.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    for (const user of ["a", "b"]) {
      await db.query(
        'INSERT INTO letter_document(id,"userId",title,data) VALUES ($1,$2,$3,$4)',
        [user + "-doc", user, "Letter " + user, { version: 1 }],
      );
      await db.query(
        'INSERT INTO letter_correspondence(id,"userId","documentId",title,text,state) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          user + "-letter",
          user,
          user + "-doc",
          "Ref " + user,
          "Scanner stock report due October 12",
          "ready",
        ],
      );
      await db.query(
        'INSERT INTO letter_chunk(id,"correspondenceId",position,text) VALUES ($1,$2,0,$3)',
        [
          user + "-chunk",
          user + "-letter",
          "Scanner stock report due October 12",
        ],
      );
    }
    const prisma = {
      $queryRawUnsafe: async (sql, ...params) =>
        (await db.query(sql, params)).rows,
    };
    assert.deepEqual(
      (await searchMemory(prisma, "a", "scanner")).map((s) => s.id),
      ["a-letter"],
    );
    assert.deepEqual(
      (await searchMemory(prisma, "b", "scanner")).map((s) => s.id),
      ["b-letter"],
    );
    assert.deepEqual(
      await searchMemory(prisma, "a", "scanner", { ids: ["b-letter"] }),
      [],
    );
    assert.deepEqual(await searchMemory(prisma, "a", "absent evidence"), []);
    assert.equal(
      (
        await searchMemory(prisma, "a", "unrelated request", {
          ids: ["a-letter"],
        })
      ).length,
      1,
    );
    await db.query(
      "UPDATE letter_correspondence SET included=false WHERE id=$1",
      ["a-letter"],
    );
    assert.deepEqual(await searchMemory(prisma, "a", "scanner"), []);
    const changes = await Promise.all(
      [1, 2].map(() =>
        db.query(
          'UPDATE letter_document SET revision=revision+1 WHERE id=$1 AND "userId"=$2 AND revision=1 RETURNING revision',
          ["a-doc", "a"],
        ),
      ),
    );
    assert.equal(
      changes.reduce((n, r) => n + r.rows.length, 0),
      1,
    );
    await db.query("DELETE FROM letter_document WHERE id=$1", ["a-doc"]);
    assert.equal(
      (
        await db.query("SELECT count(*)::int n FROM letter_chunk WHERE id=$1", [
          "a-chunk",
        ])
      ).rows[0].n,
      0,
    );
    assert.equal((await searchMemory(prisma, "b", "scanner")).length, 1);
  } finally {
    await db.close();
  }
});
