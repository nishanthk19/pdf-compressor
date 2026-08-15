/**
 * Futuristic Client-Side PDF Turbo Engine (Vite-inspired)
 * Utilizes pdf-lib directly in the browser for 0-latency instant operations,
 * fallback to server when needed, plus real-time telemetry and execution metrics.
 */

// Dynamically load pdf-lib on demand if not already present
let pdfLibLoadedPromise = null;
function ensurePdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (pdfLibLoadedPromise) return pdfLibLoadedPromise;

  pdfLibLoadedPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    script.onload = () => resolve(window.PDFLib);
    script.onerror = (err) => reject(new Error('Failed to load PDF-Lib client engine: ' + err.message));
    document.head.appendChild(script);
  });
  return pdfLibLoadedPromise;
}

window.VibifyTurboEngine = {
  // Check if client-side execution is enabled
  isClientTurboAvailable: () => true,

  // 1. Instant Client-Side Merge
  async mergeFiles(fileList, onProgress) {
    const t0 = performance.now();
    if (onProgress) onProgress(10, 'Initializing Turbo WASM/JS Engine...');
    const { PDFDocument } = await ensurePdfLib();
    
    if (onProgress) onProgress(30, 'Creating unified PDF stream...');
    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (onProgress) onProgress(30 + Math.round(((i + 1) / fileList.length) * 50), `Stitching document ${i + 1} of ${fileList.length}...`);
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach((page) => mergedDoc.addPage(page));
    }

    if (onProgress) onProgress(90, 'Serializing high-speed output...');
    const pdfBytes = await mergedDoc.save();
    const duration = Math.round(performance.now() - t0);

    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      durationMs: duration,
      engine: 'Turbo Client Engine (WASM/ESM)'
    };
  },

  // 2. Instant Client-Side Rotate
  async rotatePdf(file, rotationAngle, pageSelection = 'all', onProgress) {
    const t0 = performance.now();
    if (onProgress) onProgress(15, 'Loading document into memory...');
    const { PDFDocument, degrees } = await ensurePdfLib();
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    
    if (onProgress) onProgress(50, `Applying ${rotationAngle}° rotation...`);
    const pages = pdfDoc.getPages();
    pages.forEach((page, idx) => {
      const pageNum = idx + 1;
      let shouldRotate = true;
      if (pageSelection === 'odd') shouldRotate = pageNum % 2 !== 0;
      if (pageSelection === 'even') shouldRotate = pageNum % 2 === 0;

      if (shouldRotate) {
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + rotationAngle) % 360));
      }
    });

    if (onProgress) onProgress(90, 'Generating rotated document...');
    const pdfBytes = await pdfDoc.save();
    const duration = Math.round(performance.now() - t0);

    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      durationMs: duration,
      engine: 'Turbo Client Engine (WASM/ESM)'
    };
  },

  // 3. Instant Client-Side Delete Pages
  async deletePages(file, pagesToDeleteArray, onProgress) {
    const t0 = performance.now();
    if (onProgress) onProgress(15, 'Parsing page indices...');
    const { PDFDocument } = await ensurePdfLib();
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    
    // Sort descending so indices don't shift
    const sorted = [...new Set(pagesToDeleteArray)].sort((a, b) => b - a);
    const totalPages = pdfDoc.getPageCount();

    if (onProgress) onProgress(55, `Pruning ${sorted.length} pages...`);
    for (const p of sorted) {
      if (p >= 1 && p <= totalPages) {
        pdfDoc.removePage(p - 1);
      }
    }

    if (onProgress) onProgress(90, 'Compacting PDF...');
    const pdfBytes = await pdfDoc.save();
    const duration = Math.round(performance.now() - t0);

    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      durationMs: duration,
      engine: 'Turbo Client Engine (WASM/ESM)'
    };
  },

  // 4. Instant Client-Side Extract Pages
  async extractPages(file, pagesToExtractArray, onProgress) {
    const t0 = performance.now();
    if (onProgress) onProgress(15, 'Loading document structure...');
    const { PDFDocument } = await ensurePdfLib();
    const bytes = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();

    const totalPages = srcDoc.getPageCount();
    const validIndices = pagesToExtractArray
      .filter((p) => p >= 1 && p <= totalPages)
      .map((p) => p - 1);

    if (onProgress) onProgress(50, `Extracting ${validIndices.length} isolated pages...`);
    const copiedPages = await newDoc.copyPages(srcDoc, validIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    if (onProgress) onProgress(90, 'Exporting extracted document...');
    const pdfBytes = await newDoc.save();
    const duration = Math.round(performance.now() - t0);

    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      durationMs: duration,
      engine: 'Turbo Client Engine (WASM/ESM)'
    };
  },

  // 5. Instant Client-Side Page Numbering / Pagination
  async paginatePdf(file, config, onProgress) {
    const t0 = performance.now();
    if (onProgress) onProgress(15, 'Compiling font and layout matrix...');
    const { PDFDocument, rgb, StandardFonts } = await ensurePdfLib();
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const totalPages = pdfDoc.getPageCount();
    const fromPage = Math.max(1, parseInt(config.fromPage, 10) || 1);
    const toPage = Math.min(totalPages, parseInt(config.toPage, 10) || totalPages);
    const startNum = parseInt(config.startPage, 10) || 1;
    const fontSize = parseInt(config.fontSize, 10) || 12;
    const pattern = config.pattern || '{num}';
    const position = config.position || 'bottom-center';
    const marginType = config.margin || 'recommended';

    let margin = 30;
    if (marginType === 'small') margin = 15;
    if (marginType === 'big') margin = 50;

    // Parse hex color
    const hex = (config.color || '#1e293b').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255 || 0.12;
    const g = parseInt(hex.substring(2, 4), 16) / 255 || 0.16;
    const b = parseInt(hex.substring(4, 6), 16) / 255 || 0.23;

    if (onProgress) onProgress(50, 'Stamping page numbers at 60 FPS...');

    for (let i = fromPage - 1; i < toPage; i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      const currentNumber = startNum + (i - (fromPage - 1));
      const text = pattern.replace(/{num}/g, currentNumber).replace(/{total}/g, totalPages);
      const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
      const textHeight = helveticaFont.heightAtSize(fontSize);

      let x = margin;
      let y = margin;

      if (position.includes('center')) x = (width - textWidth) / 2;
      else if (position.includes('right')) x = width - margin - textWidth;
      else x = margin;

      if (position.startsWith('top')) y = height - margin - textHeight;
      else if (position.startsWith('middle')) y = (height - textHeight) / 2;
      else y = margin;

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(r, g, b)
      });
    }

    if (onProgress) onProgress(90, 'Finalizing fast pagination stream...');
    const pdfBytes = await pdfDoc.save();
    const duration = Math.round(performance.now() - t0);

    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      durationMs: duration,
      engine: 'Turbo Client Engine (WASM/ESM)'
    };
  }
};
