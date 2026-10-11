import { randomUUID } from "node:crypto";
import { embedding, embedModel } from "./letter-ai.js";
import { fail } from "./letter-validation.js";
export function chunks(text) {
  const result = [];
  for (let offset = 0; offset < text.length; offset += 1400) {
    result.push(text.slice(offset, offset + 1800));
    if (result.length >= 200) break;
  }
  return result;
}
export async function indexCorrespondence(prisma, item) {
  const parts = chunks(item.text);
  // Compute outside the transaction; atomically replace only the same generation.
  const vectors = [];
  if (process.env.LETTER_SEMANTIC_ENABLED === "true")
    for (const text of parts) vectors.push(await embedding(text));
  await prisma.$transaction(
    async (tx) => {
      const locked =
        await tx.$queryRaw`SELECT id FROM letter_correspondence WHERE id=${item.id} AND "userId"=${item.userId} AND generation=${item.generation} AND included=true FOR UPDATE`;
      if (!locked.length) return;
      await tx.letterChunk.deleteMany({ where: { correspondenceId: item.id } });
      for (let position = 0; position < parts.length; position++) {
        const id = randomUUID();
        await tx.letterChunk.create({
          data: {
            id,
            correspondenceId: item.id,
            position,
            text: parts[position],
            embeddingModel: vectors[position] ? embedModel() : null,
          },
        });
        if (vectors[position])
          await tx.$executeRawUnsafe(
            "UPDATE letter_chunk SET embedding=$1::vector WHERE id=$2",
            JSON.stringify(vectors[position]),
            id,
          );
      }
      await tx.letterCorrespondence.update({
        where: { id: item.id },
        data: { state: "ready", error: null, lockedAt: null },
      });
    },
    { timeout: 120000 },
  );
}
export async function searchMemory(
  prisma,
  userId,
  query,
  { ids = [], includeDrafts = false } = {},
) {
  const q = String(query || "")
    .trim()
    .slice(0, 2000);
  const sources = await prisma.$queryRawUnsafe(
    `SELECT id,title,text,rank FROM (SELECT DISTINCT ON (c.id) c.id,c.title,k.text,ts_rank_cd(to_tsvector('english', k.text),websearch_to_tsquery('english',$2)) AS rank FROM letter_chunk k JOIN letter_correspondence c ON c.id=k."correspondenceId" WHERE c."userId"=$1 AND c.included=true AND c.state='ready' AND ($3::text[] IS NULL OR c.id=ANY($3::text[])) AND ($3::text[] IS NOT NULL OR $2='' OR to_tsvector('english', k.text) @@ websearch_to_tsquery('english',$2)) ORDER BY c.id,rank DESC) candidates ORDER BY rank DESC LIMIT 12`,
    userId,
    q,
    ids.length ? ids : null,
  );
  let semantic = [];
  if (q && process.env.LETTER_SEMANTIC_ENABLED === "true") {
    const v = await embedding(q, "query");
    semantic = await prisma.$queryRawUnsafe(
      `SELECT id,title,text FROM (SELECT DISTINCT ON(c.id) c.id,c.title,k.text,k.embedding <=> $2::vector AS distance FROM letter_chunk k JOIN letter_correspondence c ON c.id=k."correspondenceId" WHERE c."userId"=$1 AND c.included=true AND c.state='ready' AND k."embeddingModel"=$3 AND ($4::text[] IS NULL OR c.id=ANY($4::text[])) AND vector_dims(k.embedding)=vector_dims($2::vector) AND (k.embedding <=> $2::vector)<=0.45 ORDER BY c.id,distance) candidates ORDER BY distance LIMIT 12`,
      userId,
      JSON.stringify(v),
      embedModel(),
      ids.length ? ids : null,
    );
  }
  // Reciprocal-rank fusion, then one relevant excerpt per letter.
  const scores = new Map();
  for (const list of [sources, semantic])
    list.forEach((s, i) => {
      const key = s.id + "\0" + s.text;
      const entry = scores.get(key) || { ...s, rank: 0 };
      entry.rank += 1 / (60 + i);
      scores.set(key, entry);
    });
  const result = [],
    seen = new Set();
  for (const s of [...scores.values()].sort((a, b) => b.rank - a.rank)) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    result.push({ id: s.id, title: s.title, text: s.text });
    if (result.length === 6) break;
  }
  if (includeDrafts && ids.length) {
    const drafts = await prisma.letterDocument.findMany({
      where: { userId, id: { in: ids }, kind: "document" },
      take: 3,
    });
    const { documentText } = await import("../public/js/letter-model.js");
    for (const d of drafts)
      result.push({
        id: d.id,
        kind: "document",
        title: `Draft: ${d.title}`,
        text: documentText(d.data).slice(0, 1800),
      });
  }
  return result.slice(0, 6);
}
export function requireOwned(item, userId) {
  if (!item || item.userId !== userId) throw fail("Document not found.", 404);
  return item;
}
