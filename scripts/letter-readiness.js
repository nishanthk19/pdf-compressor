import os from "node:os";
import { mkdir, access, constants } from "node:fs/promises";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { aiConfigured, aiProvider } from "../src/letter-ai.js";
const prisma = new PrismaClient(),
  checks = [];
const check = async (name, fn) => {
  try {
    checks.push({ name, ok: true, detail: await fn() });
  } catch (e) {
    checks.push({ name, ok: false, detail: e.message });
  }
};
await check("PostgreSQL tables", async () => {
  await prisma.$queryRawUnsafe("SELECT id FROM letter_document LIMIT 1");
  await prisma.$queryRawUnsafe("SELECT id FROM letter_chunk LIMIT 1");
  return "Additive migration present";
});
await check("Persistent storage", async () => {
  if (!process.env.LETTER_STORAGE_DIR)
    throw new Error("Set LETTER_STORAGE_DIR to a mounted persistent volume.");
  await mkdir(process.env.LETTER_STORAGE_DIR, { recursive: true });
  await access(process.env.LETTER_STORAGE_DIR, constants.W_OK);
  return "Writable; operator must verify volume survives redeploys";
});
await check("Chromium", async () => {
  const b = await chromium.launch({
    executablePath: process.env.LETTER_CHROMIUM_PATH || undefined,
    chromiumSandbox: process.env.LETTER_CHROMIUM_NO_SANDBOX !== "true",
    args:
      process.env.LETTER_CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
  });
  try {
    const p = await b.newPage();
    await p.setContent("<p>Vibify</p>");
    return (await p.pdf()).length + " PDF bytes";
  } finally {
    await b.close();
  }
});
if (process.env.LETTER_SEMANTIC_ENABLED === "true")
  await check("pgvector", async () => {
    await prisma.$queryRawUnsafe("SELECT embedding FROM letter_chunk LIMIT 1");
    return "vector column present";
  });
if (process.env.LETTER_AI_ENABLED === "true")
  await check("AI acceptance gate", async () => {
    if (process.env.LETTER_AI_BENCHMARK_PASSED !== "true")
      throw new Error("Benchmark and quality acceptance are required.");
    if (!aiConfigured())
      throw new Error(
        "AI provider credentials/endpoint or data-transfer approval missing.",
      );
    return aiProvider() + ": operator quality acceptance flag set";
  });
console.log(
  JSON.stringify(
    {
      capacity: {
        cpus: os.availableParallelism(),
        ramGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      },
      checks,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
if (checks.some((c) => !c.ok)) process.exitCode = 1;
