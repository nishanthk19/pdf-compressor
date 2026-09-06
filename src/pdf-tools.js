import fs from "fs/promises";
import { spawn } from "child_process";
import { Document, Packer, PageBreak, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

let pdfjsPromise;

function getPdfJs() {
    pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjsPromise;
}

const children = new Set();
function killCommand(child) {
    if (process.platform !== 'win32' && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); return; } catch {}
    }
    child.kill('SIGKILL');
}
export function stopCommands() { for (const child of children) killCommand(child); }
export function runCommand(command, args, timeout = 180_000) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'] });
        children.add(child);
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; killCommand(child); }, timeout);
        const cleanup = () => { clearTimeout(timer); children.delete(child); };
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-8192); });
        child.on("error", error => { cleanup(); reject(new Error(error.code === 'ENOENT' ? `${command} is unavailable on this server.` : 'Unable to start PDF processing.')); });
        child.on("close", (code) => {
            cleanup();
            if (timedOut) reject(new Error('This document exceeded the processing time limit. Try a smaller PDF.'));
            else if (code === 0) resolve();
            else reject(new Error(/password|encrypted/i.test(stderr) ? 'This PDF requires a valid password.' : 'The document could not be processed. Check that it is a valid, supported PDF.'));
        });
    });
}

async function loadPdf(path, options = {}) {
    return PDFDocument.load(await fs.readFile(path), options);
}

export async function mergePdfs(inputPaths, outputPath) {
    const output = await PDFDocument.create();
    for (const inputPath of inputPaths) {
        const source = await loadPdf(inputPath);
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => output.addPage(page));
    }
    await fs.writeFile(outputPath, await output.save());
}

export async function extractPages(inputPath, outputPath, startPage, endPage) {
    const source = await loadPdf(inputPath);
    const start = Number(startPage);
    const end = Number(endPage);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > source.getPageCount()) {
        throw new Error(`Page range must be between 1 and ${source.getPageCount()}.`);
    }
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, Array.from({ length: end - start + 1 }, (_, index) => start - 1 + index));
    pages.forEach((page) => output.addPage(page));
    await fs.writeFile(outputPath, await output.save());
}

export async function rotatePdf(inputPath, outputPath, angle) {
    const document = await loadPdf(inputPath);
    const rotation = Number(angle);
    if (![90, 180, 270, -90].includes(rotation)) throw new Error("Rotation must be 90, 180, or 270 degrees.");
    document.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + rotation + 360) % 360)));
    await fs.writeFile(outputPath, await document.save());
}

function parsePageList(value, pageCount) {
    const pages = new Set();
    for (const token of String(value || "").split(",")) {
        const part = token.trim();
        if (!part) continue;
        const match = part.match(/^(\d+)(?:-(\d+))?$/);
        if (!match) throw new Error(`Invalid page selection: ${part}`);
        const start = Number(match[1]);
        const end = Number(match[2] || match[1]);
        if (start < 1 || end < start || end > pageCount) throw new Error(`Pages must be between 1 and ${pageCount}.`);
        for (let page = start; page <= end; page += 1) pages.add(page - 1);
    }
    return [...pages].sort((a, b) => b - a);
}

export async function deletePages(inputPath, outputPath, selection) {
    const document = await loadPdf(inputPath);
    const pages = parsePageList(selection, document.getPageCount());
    if (!pages.length) throw new Error("Select at least one page to delete.");
    if (pages.length === document.getPageCount()) throw new Error("A PDF cannot have all of its pages deleted.");
    pages.forEach((page) => document.removePage(page));
    await fs.writeFile(outputPath, await document.save());
}

export async function paginatePdf(inputPath, outputPath, rawConfig) {
    const document = await loadPdf(inputPath);
    const config = typeof rawConfig === "string" ? JSON.parse(rawConfig || "{}") : rawConfig || {};
    const font = await document.embedFont(StandardFonts.Helvetica);
    const pages = document.getPages();
    const fromPage = Math.max(1, Number(config.fromPage) || 1);
    const toPage = Math.min(pages.length, Number(config.toPage) || pages.length);
    const startNumber = Math.max(1, Number(config.startPage) || 1);
    const size = Math.min(72, Math.max(6, Number(config.fontSize) || 12));
    const marginMap = { small: 15, recommended: 30, big: 50 };
    const margin = marginMap[config.margin] || 30;
    const position = String(config.position || "bottom-center");
    const color = /^#[0-9a-f]{6}$/i.test(config.color || "") ? config.color.slice(1) : "000000";
    const fill = rgb(Number.parseInt(color.slice(0, 2), 16) / 255, Number.parseInt(color.slice(2, 4), 16) / 255, Number.parseInt(color.slice(4, 6), 16) / 255);

    pages.forEach((page, index) => {
        const pageNumber = index + 1;
        if (pageNumber < fromPage || pageNumber > toPage) return;
        const text = String(config.pattern || "{num}").replaceAll("{num}", String(startNumber + pageNumber - fromPage)).replaceAll("{total}", String(pages.length));
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);
        const textHeight = font.heightAtSize(size);
        const x = position.includes("left") ? margin : position.includes("right") ? width - margin - textWidth : (width - textWidth) / 2;
        const y = position.includes("top") ? height - margin - textHeight : position.includes("middle") ? (height - textHeight) / 2 : margin;
        page.drawText(text, { x, y, size, font, color: fill });
    });
    await fs.writeFile(outputPath, await document.save());
}

async function extractTextPages(inputPath) {
    const pdfjs = await getPdfJs();
    const document = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(inputPath)), useSystemFonts: true }).promise;
    const pages = [];
    try {
    for (let number = 1; number <= document.numPages; number += 1) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        pages.push({ viewport, content });
        page.cleanup();
    }
    return pages;
    } finally { await document.destroy(); }
}

export async function extractCoordinates(inputPath) {
    const pages = await extractTextPages(inputPath);
    const result = pages.map(({ viewport, content }, index) => ({
        pageIndex: index,
        pageNumber: index + 1,
        width: viewport.width,
        height: viewport.height,
        spans: content.items.filter((item) => item.str?.trim()).map((item) => {
            const height = Math.abs(item.transform?.[3]) || item.height || 11;
            const x = item.transform?.[4] || 0;
            const bottom = viewport.height - (item.transform?.[5] || 0);
            return { text: item.str, bbox: [x, bottom - height, x + (item.width || 0), bottom], size: height, font: item.fontName || "Helvetica" };
        }),
    }));
    return { totalPages: result.length, pages: result, spans: result[0]?.spans || [] };
}

function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function extractHtml(inputPath) {
    const pages = await extractTextPages(inputPath);
    return pages.map(({ content }) => `<p>${escapeHtml(content.items.map((item) => item.str || "").join(" ").trim())}</p>`).join("<hr>");
}

export async function convertToWord(inputPath, outputPath) {
    const pages = await extractTextPages(inputPath);
    const children = [];
    pages.forEach(({ content }, index) => {
        const text = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
        children.push(new Paragraph({ children: [new TextRun(text || " ")] }));
        if (index < pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
    });
    await fs.writeFile(outputPath, await Packer.toBuffer(new Document({ sections: [{ children }] })));
}

export async function compressPdf(inputPath, outputPath, targetSizeMb, runner = runCommand) {
    const targetBytes = Number(targetSizeMb) * 1024 * 1024;
    if (!Number.isFinite(targetBytes) || targetBytes < 100 * 1024 || targetBytes > 50 * 1024 * 1024) throw new Error("Target size must be between 0.1 and 50 MB.");
    const originalSize = (await fs.stat(inputPath)).size;
    if (originalSize <= targetBytes) {
        await fs.copyFile(inputPath, outputPath);
        return;
    }
    let low = 36;
    let high = 180;
    let bestDpi = null;
    const candidatePath = `${outputPath}.candidate.pdf`;
    try {
    for (let attempt = 0; attempt < 7 && low <= high; attempt += 1) {
        const dpi = Math.round((low + high) / 2);
        await runner("gs", ["-dSAFER", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4", "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dDownsampleColorImages=true", `-dColorImageResolution=${dpi}`, "-dDownsampleGrayImages=true", `-dGrayImageResolution=${dpi}`, "-dDownsampleMonoImages=true", `-dMonoImageResolution=${Math.max(150, dpi * 2)}`, `-sOutputFile=${candidatePath}`, inputPath]);
        const size = (await fs.stat(candidatePath)).size;
        if (size <= targetBytes) {
            low = dpi + 1; bestDpi = dpi;
            await fs.copyFile(candidatePath, outputPath);
            // Close enough to the requested limit: keep this usable output.
            if (size >= targetBytes * 0.95) break;
        }
        else high = dpi - 1;
    }
    if (bestDpi === null) throw new Error("The requested target is too small for this document without severe quality loss.");
    } finally { await fs.unlink(candidatePath).catch(() => {}); }
}

export const protectPdf = (inputPath, outputPath, password) => {
    if (!String(password || "").trim()) throw new Error("Password cannot be empty.");
    return runCommand("qpdf", ["--encrypt", password, password, "256", "--", inputPath, outputPath]);
};

export const unlockPdf = (inputPath, outputPath, password) => runCommand("qpdf", [`--password=${password || ""}`, "--decrypt", inputPath, outputPath]);

export const archivePdf = (inputPath, outputPath) => runCommand("gs", ["-dPDFA=1", "-dBATCH", "-dNOPAUSE", "-sColorConversionStrategy=RGB", "-sDEVICE=pdfwrite", "-dPDFACompatibilityPolicy=1", `-sOutputFile=${outputPath}`, inputPath]);

export const ocrPdf = (inputPath, outputPath) => runCommand("ocrmypdf", ["--skip-text", "--jobs", "1", "--optimize", "1", inputPath, outputPath]);
