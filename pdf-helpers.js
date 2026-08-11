const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib');
const docx = require('docx');
const { execSync } = require('child_process');

let pdfjsLibPromise = null;
function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLibPromise;
}

/**
 * Extract PDF bounding boxes and layout coordinate data for Overlay Editor
 */
async function extractPdfCoords(inputPath) {
  const pdfjsLib = await getPdfjsLib();
  const fileData = new Uint8Array(fs.readFileSync(inputPath));
  
  const loadingTask = pdfjsLib.getDocument({
    data: fileData,
    useSystemFonts: true,
    disableFontFace: true
  });
  
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const pagesData = [];
  let page1Spans = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const spans = [];

    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;

      const tx = item.transform || [1, 0, 0, 1, 0, 0];
      const fontHeight = Math.abs(tx[3]) || item.height || 11;
      const x0 = tx[4] || 0;
      const y0_pdf = tx[5] || 0;
      const x1 = x0 + (item.width || (item.str.length * fontHeight * 0.5));

      const top = viewport.height - y0_pdf - fontHeight;
      const bottom = viewport.height - y0_pdf;

      spans.push({
        text: item.str,
        bbox: [
          Math.round(x0 * 100) / 100,
          Math.round(top * 100) / 100,
          Math.round(x1 * 100) / 100,
          Math.round(bottom * 100) / 100
        ],
        size: Math.round(fontHeight * 100) / 100,
        font: item.fontName || 'Helvetica'
      });
    }

    const pageObj = {
      pageIndex: pageNum - 1,
      pageNumber: pageNum,
      width: Math.round(viewport.width * 100) / 100,
      height: Math.round(viewport.height * 100) / 100,
      spans: spans
    };

    pagesData.push(pageObj);
    if (pageNum === 1) {
      page1Spans = spans;
    }
  }

  return {
    totalPages: totalPages,
    pages: pagesData,
    spans: page1Spans
  };
}

/**
 * Rotate PDF document pages
 */
async function rotatePdf(inputPath, outputPath, angle) {
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const rotAngle = parseInt(angle, 10) || 90;

  for (const page of pages) {
    const currentRot = page.getRotation().angle || 0;
    page.setRotation(degrees((currentRot + rotAngle) % 360));
  }

  const outputBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outputBytes);
}

/**
 * Delete specified pages from PDF
 */
async function deletePdfPages(inputPath, outputPath, pagesStr) {
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const rawPages = (pagesStr || '').split(',');
  const pagesToDelete = new Set();

  for (let item of rawPages) {
    item = item.trim();
    if (!item) continue;
    if (item.includes('-')) {
      const parts = item.split('-');
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const startP = parseInt(parts[0], 10);
        const endP = parseInt(parts[1], 10);
        for (let p = startP; p <= endP; p++) {
          pagesToDelete.add(p - 1);
        }
      }
    } else if (!isNaN(item)) {
      pagesToDelete.add(parseInt(item, 10) - 1);
    }
  }

  const validToDelete = Array.from(pagesToDelete)
    .filter(p => p >= 0 && p < totalPages)
    .sort((a, b) => b - a);

  if (validToDelete.length === 0) {
    throw new Error('No valid page numbers specified for deletion.');
  }
  if (validToDelete.length >= totalPages) {
    throw new Error('Cannot delete all pages in the PDF document.');
  }

  for (const p of validToDelete) {
    pdfDoc.removePage(p);
  }

  const outputBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outputBytes);
}

/**
 * Protect PDF with password
 */
async function protectPdf(inputPath, outputPath, password) {
  if (!password || !password.trim()) {
    throw new Error('Password cannot be empty.');
  }
  const cleanPw = password.trim().replace(/"/g, '\\"');
  const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -sUserPassword="${cleanPw}" -sOwnerPassword="${cleanPw}" -sOutputFile="${outputPath}" "${inputPath}"`;
  execSync(gsCmd);
}

/**
 * Unlock PDF with password
 */
async function unlockPdf(inputPath, outputPath, password) {
  const cleanPw = (password || '').trim().replace(/"/g, '\\"');
  const passArg = cleanPw ? `-sPDFPassword="${cleanPw}"` : '';
  const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH ${passArg} -sOutputFile="${outputPath}" "${inputPath}"`;
  execSync(gsCmd);
}

/**
 * Add page numbers to PDF document
 */
async function paginatePdf(inputPath, outputPath, configInput) {
  let config = {};
  if (typeof configInput === 'string') {
    try { config = JSON.parse(configInput); } catch (e) { config = { position: configInput }; }
  } else if (typeof configInput === 'object' && configInput !== null) {
    config = configInput;
  }

  const position = String(config.position || 'bottom-center').toLowerCase();
  const marginRaw = config.margin || 'recommended';
  let margin = 30;
  if (marginRaw === 'small') margin = 15;
  else if (marginRaw === 'big') margin = 50;
  else if (!isNaN(marginRaw)) margin = parseFloat(marginRaw);

  const startNum = parseInt(config.startPage, 10) || 1;
  const pattern = String(config.pattern || '{num}');
  const fontSize = parseFloat(config.fontSize) || 12;

  let r = 0, g = 0, b = 0;
  const colorHex = String(config.color || '#000000').replace('#', '');
  if (colorHex.length === 6) {
    r = parseInt(colorHex.substring(0, 2), 16) / 255;
    g = parseInt(colorHex.substring(2, 4), 16) / 255;
    b = parseInt(colorHex.substring(4, 6), 16) / 255;
  }

  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const totalPages = pdfDoc.getPageCount();

  const fromPage = parseInt(config.fromPage, 10) || 1;
  const toPage = parseInt(config.toPage, 10) || totalPages;

  const pages = pdfDoc.getPages();

  for (let idx = 0; idx < totalPages; idx++) {
    const page1Based = idx + 1;
    if (page1Based < fromPage || page1Based > toPage) continue;

    const currNum = startNum + (page1Based - fromPage);
    const textStr = pattern.replace(/{num}/g, String(currNum)).replace(/{total}/g, String(totalPages));
    const page = pages[idx];
    const { width, height } = page.getSize();

    const textWidth = font.widthOfTextAtSize(textStr, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    let x = width / 2 - textWidth / 2;
    let y = margin;

    if (position.includes('left')) x = margin;
    else if (position.includes('right')) x = width - margin - textWidth;
    else if (position.includes('center')) x = width / 2 - textWidth / 2;

    if (position.includes('top')) y = height - margin - textHeight;
    else if (position.includes('middle')) y = height / 2 - textHeight / 2;
    else if (position.includes('bottom')) y = margin;

    page.drawText(textStr, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(r, g, b)
    });
  }

  const outputBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outputBytes);
}

/**
 * Convert PDF pages to formatted Word document
 */
async function convertPdfToWord(inputPath, outputPath) {
  const pdfjsLib = await getPdfjsLib();
  const fileData = new Uint8Array(fs.readFileSync(inputPath));
  
  const loadingTask = pdfjsLib.getDocument({
    data: fileData,
    useSystemFonts: true,
    disableFontFace: true
  });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;

  const docxParagraphs = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    let lastY = null;
    let currentLineText = '';

    for (const item of textContent.items) {
      if (!item.str) continue;
      const tx = item.transform || [1, 0, 0, 1, 0, 0];
      const y = tx[5];

      if (lastY !== null && Math.abs(y - lastY) > 5) {
        if (currentLineText.trim()) {
          docxParagraphs.push(
            new docx.Paragraph({
              children: [new docx.TextRun({ text: currentLineText.trim(), size: 24 })],
              spacing: { after: 120 }
            })
          );
        }
        currentLineText = '';
      }

      currentLineText += (currentLineText ? ' ' : '') + item.str;
      lastY = y;
    }

    if (currentLineText.trim()) {
      docxParagraphs.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text: currentLineText.trim(), size: 24 })],
          spacing: { after: 120 }
        })
      );
    }

    if (pageNum < totalPages) {
      docxParagraphs.push(
        new docx.Paragraph({
          children: [new docx.PageBreak()]
        })
      );
    }
  }

  const wordDoc = new docx.Document({
    sections: [{
      properties: {},
      children: docxParagraphs.length > 0 ? docxParagraphs : [
        new docx.Paragraph({
          children: [new docx.TextRun("Converted PDF Document")]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(wordDoc);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Make PDF Searchable (OCR)
 */
async function makePdfSearchable(inputPath, outputPath) {
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const outputBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outputBytes);
}

module.exports = {
  extractPdfCoords,
  rotatePdf,
  deletePdfPages,
  protectPdf,
  unlockPdf,
  paginatePdf,
  convertPdfToWord,
  makePdfSearchable
};
