import { fork } from "node:child_process";
import os from "node:os";

export class ProcessingPool {
  constructor({
    size = Math.max(1, Math.min(2, os.availableParallelism() - 1)),
    maxQueue = 6,
    timeout = 10 * 60_000,
    worker = new URL("./processing-worker.js", import.meta.url),
  } = {}) {
    this.size = size;
    this.maxQueue = maxQueue;
    this.timeout = timeout;
    this.worker = worker;
    this.slots = [];
    this.queue = [];
    this.closed = false;
  }
  run(operation, args) {
    if (this.closed)
      return Promise.reject(
        new Error("Processing is shutting down. Please try again shortly."),
      );
    if (
      this.queue.length >= this.maxQueue &&
      this.slots.length >= this.size &&
      this.slots.every((s) => s.job)
    ) {
      return Promise.reject(
        Object.assign(
          new Error("All processing slots are busy. Please try again shortly."),
          { status: 503 },
        ),
      );
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, args, resolve, reject });
      this.drain();
    });
  }
  spawn() {
    const child = fork(this.worker, [], {
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      windowsHide: true,
      execArgv: [],
    });
    const slot = { child, job: null };
    this.slots.push(slot);
    child.on("message", (message) => {
      const job = slot.job;
      if (!job) return;
      clearTimeout(job.timer);
      slot.job = null;
      if (message.error) job.reject(new Error(message.error));
      else job.resolve(message.result);
      this.drain();
    });
    const failed = () => {
      if (!this.slots.includes(slot)) return;
      this.slots.splice(this.slots.indexOf(slot), 1);
      if (slot.job) {
        clearTimeout(slot.job.timer);
        slot.job.reject(
          new Error(
            "Processing stopped unexpectedly. Please try a smaller PDF.",
          ),
        );
        slot.job = null;
      }
      this.drain();
    };
    child.on("error", failed);
    child.on("exit", failed);
    return slot;
  }
  terminate(slot) {
    slot.child.kill("SIGTERM");
    const forceTimer = setTimeout(() => slot.child.kill("SIGKILL"), 2000);
    slot.child.once("exit", () => clearTimeout(forceTimer));
  }
  drain() {
    if (this.closed) return;
    while (this.queue.length) {
      let slot = this.slots.find((s) => !s.job);
      if (!slot && this.slots.length < this.size) slot = this.spawn();
      if (!slot) return;
      const job = this.queue.shift();
      slot.job = job;
      job.timer = setTimeout(() => {
        // Reject only after the child exits so request cleanup cannot race its writes.
        this.terminate(slot);
      }, this.timeout);
      slot.child.send({ operation: job.operation, args: job.args }, (error) => {
        if (error) slot.child.kill();
      });
    }
  }
  async close() {
    this.closed = true;
    this.queue
      .splice(0)
      .forEach((job) => job.reject(new Error("Server is shutting down.")));
    await Promise.all(
      this.slots.map(
        (slot) =>
          new Promise((resolve) => {
            if (slot.child.exitCode !== null) return resolve();
            slot.child.once("exit", resolve);
            this.terminate(slot);
          }),
      ),
    );
  }
}
const configured = Number(process.env.PDF_WORKERS);
export const processingPool = new ProcessingPool(
  Number.isInteger(configured) && configured >= 1 && configured <= 8
    ? { size: configured }
    : {},
);
export const mergePdfs = (...args) => processingPool.run("mergePdfs", args);
export const compressPdf = (...args) => processingPool.run("compressPdf", args);
export const convertToWord = (...args) =>
  processingPool.run("convertToWord", args);
export const deletePages = (...args) => processingPool.run("deletePages", args);
export const extractCoordinates = (...args) =>
  processingPool.run("extractCoordinates", args);
export const extractHtml = (...args) => processingPool.run("extractHtml", args);
export const extractPages = (...args) =>
  processingPool.run("extractPages", args);
export const ocrPdf = (...args) => processingPool.run("ocrPdf", args);
export const paginatePdf = (...args) => processingPool.run("paginatePdf", args);
export const protectPdf = (...args) => processingPool.run("protectPdf", args);
export const rotatePdf = (...args) => processingPool.run("rotatePdf", args);
export const unlockPdf = (...args) => processingPool.run("unlockPdf", args);
export const archivePdf = (...args) => processingPool.run("archivePdf", args);
