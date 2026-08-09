const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Storage directories
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Multer Disk Storage Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeExt = path.extname(file.originalname) || '.pdf';
    cb(null, 'file_' + uniqueSuffix + safeExt);
  }
});

const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(publicDir));

// Helper for aggressive file deletion using fs.unlinkSync
function safeUnlinkSync(filePaths) {
  if (!filePaths) return;
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  paths.forEach(filePath => {
    if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err.message);
      }
    }
  });
}

// Serve SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Serve Visual PDF Editor
app.get('/edit', (req, res) => {
  res.sendFile(path.join(publicDir, 'editor.html'));
});

// Serve Smart Flowable Editor
app.get('/flow-editor', (req, res) => {
  res.sendFile(path.join(publicDir, 'flow-editor.html'));
});

// ==========================================
// 1. COMPRESS PDF (/compress)
// ==========================================
app.post('/compress', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const targetSizeMB = parseFloat(req.body.targetSize) || 2.0;
    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    const tempFiles = [inputPath];

    let minDpi = 36;
    let maxDpi = 300;
    let bestOutput = null;
    let bestDiff = Infinity;
    const maxIterations = 5;

    try {
      for (let i = 0; i < maxIterations; i++) {
        const midDpi = Math.round((minDpi + maxDpi) / 2);
        const outputPath = path.join(uploadDir, `compress_${Date.now()}_iter${i}_${Math.random().toString(36).substring(2, 7)}.pdf`);
        tempFiles.push(outputPath);

        const gsCmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/default -dNOPAUSE -dQUIET -dBATCH \
-dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=${midDpi} \
-dDownsampleGrayImages=true -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=${midDpi} \
-dDownsampleMonoImages=true -dMonoImageDownsampleType=/Bicubic -dMonoImageResolution=${midDpi} \
-sOutputFile="${outputPath}" "${inputPath}"`;

        execSync(gsCmd);

        if (fs.existsSync(outputPath)) {
          const currentSize = fs.statSync(outputPath).size;
          const diff = Math.abs(currentSize - targetSizeBytes);

          if (diff < bestDiff || !bestOutput) {
            bestDiff = diff;
            bestOutput = outputPath;
          }

          if (diff / targetSizeBytes <= 0.05) {
            break;
          }

          if (currentSize > targetSizeBytes) {
            maxDpi = midDpi - 1;
          } else {
            minDpi = midDpi + 1;
          }

          if (minDpi > maxDpi) {
            break;
          }
        }
      }

      if (!bestOutput || !fs.existsSync(bestOutput)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Failed to compress PDF using Ghostscript.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_compressed_${targetSizeMB}MB.pdf`;

      res.download(bestOutput, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving compressed file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (error) {
      console.error('Compression error:', error.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to compress PDF.' });
    }
  });
});

// ==========================================
// 2. MERGE PDFs (/merge)
// ==========================================
app.post('/merge', (req, res) => {
  upload.array('pdfs', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Files upload failed.' });
    }
    if (!req.files || req.files.length < 2) {
      if (req.files) safeUnlinkSync(req.files.map(f => f.path));
      return res.status(400).json({ error: 'Please upload at least 2 PDF files to merge.' });
    }

    const inputPaths = req.files.map(file => file.path);
    const outputPath = path.join(uploadDir, `merged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [...inputPaths, outputPath];

    try {
      const inputsQuoted = inputPaths.map(p => `"${p}"`).join(' ');
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" ${inputsQuoted}`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Merged PDF file was not created.' });
      }

      res.download(outputPath, 'merged_document.pdf', (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving merged file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Merge error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to merge PDFs.' });
    }
  });
});

// ==========================================
// 3. EXTRACT PAGES (/extract)
// ==========================================
app.post('/extract', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const startPage = parseInt(req.body.startPage, 10) || 1;
    const endPage = parseInt(req.body.endPage, 10) || startPage;

    if (startPage < 1 || endPage < startPage) {
      safeUnlinkSync(inputPath);
      return res.status(400).json({ error: 'Invalid page range specified.' });
    }

    const outputPath = path.join(uploadDir, `extracted_${Date.now()}_p${startPage}-${endPage}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -dFirstPage=${startPage} -dLastPage=${endPage} -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Extracted PDF file was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_p${startPage}-p${endPage}.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving extracted file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Extract error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to extract pages.' });
    }
  });
});

// ==========================================
// 4. CONVERT TO GRAYSCALE (/grayscale)
// ==========================================
app.post('/grayscale', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `grayscale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Grayscale PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_grayscale.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving grayscale file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Grayscale error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to grayscale.' });
    }
  });
});

// ==========================================
// 5. GENERATE JPEG PREVIEW (/preview)
// ==========================================
app.post('/preview', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `preview_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=jpeg -r300 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Preview image was not generated.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_preview.jpg`;

      res.setHeader('Content-Type', 'image/jpeg');
      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving preview image:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('Preview error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to generate JPEG preview.' });
    }
  });
});

// ==========================================
// 6. CONVERT TO ARCHIVAL PDF/A (/archive)
// ==========================================
app.post('/archive', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `pdfa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -dPDFA -dBATCH -dNOPAUSE -sProcessColorModel=DeviceRGB -sDEVICE=pdfwrite -dPDFACompatibilityPolicy=1 -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Archival PDF/A file was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_PDFA.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving PDF/A file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (gsErr) {
      console.error('PDF/A error:', gsErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to archival PDF/A.' });
    }
  });
});

// ==========================================
// 7. CONVERT PDF TO WORD (/word)
// ==========================================
app.post('/word', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `word_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.docx`);
    const tempFiles = [inputPath, outputPath];

    try {
      const convertScript = path.join(__dirname, 'convert.py');
      const cmd = `python3 "${convertScript}" "${inputPath}" "${outputPath}"`;

      execSync(cmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync(tempFiles);
        return res.status(500).json({ error: 'Word document (.docx) was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving Word file:', downloadErr.message);
        }
        safeUnlinkSync(tempFiles);
      });
    } catch (pythonErr) {
      console.error('PDF to Word error:', pythonErr.message);
      safeUnlinkSync(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to Word document.' });
    }
  });
});

// ==========================================
// 8. MAKE PDF SEARCHABLE (OCR) (/ocr)
// ==========================================
app.post('/ocr', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`);

    try {
      const ocrCmd = `ocrmypdf --force-ocr --optimize 1 "${inputPath}" "${outputPath}"`;

      execSync(ocrCmd);

      if (!fs.existsSync(outputPath)) {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        return res.status(500).json({ error: 'OCR processed PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_ocr.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving OCR file:', downloadErr.message);
        }
        // Aggressive file cleanup for both input and output files inside res.download callback
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
    } catch (ocrErr) {
      console.error('OCR error:', ocrErr.message);
      // Aggressive file cleanup for both input and output files inside catch block
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      res.status(500).json({ error: 'Failed to perform OCR on PDF document.' });
    }
  });
});

// ==========================================
// 10. EXTRACT HTML FOR FLOW EDITOR (/extract-html)
// ==========================================
app.post('/extract-html', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).send(`Upload error: ${err.message || 'File upload failed.'}`);
    }
    if (!req.file) {
      return res.status(400).send('Please select a PDF file.');
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `extracted_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.html`);

    try {
      const pythonCmd = `python3 extract_html.py "${inputPath}" "${outputPath}"`;
      execSync(pythonCmd);

      if (!fs.existsSync(outputPath)) {
        safeUnlinkSync([inputPath, outputPath]);
        return res.status(500).send('HTML extraction failed.');
      }

      const htmlContent = fs.readFileSync(outputPath, 'utf-8');

      // Aggressively delete both input PDF and output HTML from server
      safeUnlinkSync([inputPath, outputPath]);

      res.send(htmlContent);
    } catch (cmdErr) {
      console.error('HTML extraction error:', cmdErr.message);
      safeUnlinkSync([inputPath, outputPath]);
      res.status(500).send('Failed to extract HTML from PDF.');
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF Precision Platform running on port ${PORT}`);
});
