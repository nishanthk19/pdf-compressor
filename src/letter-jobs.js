import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { indexCorrespondence } from "./letter-memory.js";
const execute = promisify(execFile);
export function startLetterJobs(prisma) {
  let busy = false,
    stopped = false;
  let lastWarning=0;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      // One durable job claim across app instances. Expired leases retry after restarts.
      const items = await prisma.$queryRawUnsafe(
        `UPDATE letter_correspondence SET state='processing',"lockedAt"=now(),attempts=attempts+1 WHERE id=(SELECT id FROM letter_correspondence WHERE included=true AND attempts<3 AND (state='pending' OR (state='processing' AND "lockedAt"<now()-interval '15 minutes')) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      );
      const item = items[0];
      if (!item) return;
      try {
        if (item.filePath && !item.metadata?.textReviewed) {
          if (!(process.env.LETTER_EXTRACT_PYTHON || process.env.LETTER_DOCLING_PYTHON))
            throw new Error("Document extraction is not configured.");
          const { stdout } = await execute(
            process.env.LETTER_EXTRACT_PYTHON || process.env.LETTER_DOCLING_PYTHON,
            [
              new URL(
                "../scripts/letter-extract.py",
                import.meta.url,
              ).pathname.replace(/^\/(\w:)/, "$1"),
              item.filePath,
            ],
            {
              timeout: 300000,
              maxBuffer: 2_000_000,
              windowsHide: true,
              env: {
                PATH: process.env.PATH,
                LANG: "C.UTF-8",
                HOME: "/tmp",
                TESSDATA_PREFIX: process.env.TESSDATA_PREFIX,
                OMP_NUM_THREADS: "1",
                OPENBLAS_NUM_THREADS: "1",
              },
            },
          );
          const extracted = JSON.parse(stdout);
          if (typeof extracted.text !== "string" || !extracted.text.trim())
            throw new Error("No readable text found.");
          const updated = await prisma.letterCorrespondence.updateMany({
            where: {
              id: item.id,
              userId: item.userId,
              generation: item.generation,
              included: true,
            },
            data: {
              text: extracted.text.slice(0, 250000),
              metadata: extracted.metadata || {},
            },
          });
          if (!updated.count) return;
          item.text = extracted.text.slice(0, 250000);
        }
        await indexCorrespondence(prisma, item);
      } catch {
        await prisma.letterCorrespondence.updateMany({
          where: { id: item.id, generation: item.generation },
          data: {
            state: "failed",
            lockedAt: null,
            error:
              "Extraction or indexing failed. Check the file, local extraction runtime, and AI service, then retry.",
          },
        });
      }
    } catch {
      if(Date.now()-lastWarning>60000){lastWarning=Date.now();console.warn("Letter Studio worker unavailable. Check database connectivity and additive migrations.");}
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 4000);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
