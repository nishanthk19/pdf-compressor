const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up storage directories
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Multer disk storage configuration
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

// Helper function to safely clean up (delete) disk files
function cleanupFiles(filePaths) {
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

// Serve root SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ==========================================
// 1. EXACT SIZE COMPRESSOR (/compress)
// ==========================================
app.post('/compress', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file to upload.' });
    }

    const inputPath = req.file.path;
    const targetSizeMB = parseFloat(req.body.targetSize) || 2.0;
    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    const tempFiles = [inputPath];

    const compressionLogs = {
      filename: req.file.originalname,
      originalSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      targetSizeMB: targetSizeMB,
      targetSizeBytes: targetSizeBytes,
      iterations: []
    };

    let minDpi = 36;
    let maxDpi = 300;
    let bestOutput = null;
    let bestDiff = Infinity;
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i++) {
      const midDpi = Math.round((minDpi + maxDpi) / 2);
      const outputPath = path.join(uploadDir, `compress_${Date.now()}_iter${i}_${Math.random().toString(36).substring(2, 7)}.pdf`);
      tempFiles.push(outputPath);

      try {
        const gsCmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/default -dNOPAUSE -dQUIET -dBATCH \
-dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=${midDpi} \
-dDownsampleGrayImages=true -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=${midDpi} \
-dDownsampleMonoImages=true -dMonoImageDownsampleType=/Bicubic -dMonoImageResolution=${midDpi} \
-sOutputFile="${outputPath}" "${inputPath}"`;

        execSync(gsCmd);

        if (fs.existsSync(outputPath)) {
          const currentSize = fs.statSync(outputPath).size;
          const currentSizeMB = (currentSize / (1024 * 1024)).toFixed(2);
          const diff = Math.abs(currentSize - targetSizeBytes);
          const accuracyPct = Math.max(0, (100 - (diff / targetSizeBytes) * 100)).toFixed(1);

          let note = '';
          if (diff / targetSizeBytes <= 0.05) {
            note = `Accuracy: ${accuracyPct}%. Match found within 5% threshold.`;
          } else if (currentSize > targetSizeBytes) {
            note = 'Result too large. Increasing compression ratio.';
          } else {
            note = 'Result too small. Relaxing compression ratio.';
          }

          compressionLogs.iterations.push({
            iteration: i + 1,
            dpi: midDpi,
            sizeMB: currentSizeMB,
            sizeBytes: currentSize,
            diff: diff,
            accuracyPct: accuracyPct,
            note: note,
            isBest: false
          });

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
      } catch (gsErr) {
        console.error(`Ghostscript iteration ${i} failed:`, gsErr.message);
        compressionLogs.iterations.push({
          iteration: i + 1,
          dpi: midDpi,
          error: gsErr.message
        });
      }
    }

    if (!bestOutput || !fs.existsSync(bestOutput)) {
      cleanupFiles(tempFiles);
      return res.status(500).json({ error: 'Failed to compress PDF using Ghostscript.' });
    }

    if (compressionLogs.iterations.length > 0) {
      let bestIdx = 0;
      let minLogDiff = Infinity;
      compressionLogs.iterations.forEach((item, idx) => {
        if (item.diff !== undefined && item.diff < minLogDiff) {
          minLogDiff = item.diff;
          bestIdx = idx;
        }
      });
      compressionLogs.iterations[bestIdx].isBest = true;
    }

    const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
    const downloadFilename = `${safeOriginalName}_compressed_${targetSizeMB}MB.pdf`;

    res.setHeader('Access-Control-Expose-Headers', 'X-Compression-Log, Content-Disposition');
    res.setHeader('X-Compression-Log', JSON.stringify(compressionLogs));

    res.download(bestOutput, downloadFilename, (downloadErr) => {
      if (downloadErr) {
        console.error('Error serving compressed file:', downloadErr.message);
      }
      cleanupFiles(tempFiles);
    });
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
      if (req.files) cleanupFiles(req.files.map(f => f.path));
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
        cleanupFiles(tempFiles);
        return res.status(500).json({ error: 'Merged PDF file was not created.' });
      }

      res.download(outputPath, 'merged_document.pdf', (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving merged file:', downloadErr.message);
        }
        cleanupFiles(tempFiles);
      });
    } catch (gsErr) {
      console.error('Merge Ghostscript error:', gsErr.message);
      cleanupFiles(tempFiles);
      res.status(500).json({ error: 'Failed to merge PDFs with Ghostscript.' });
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
      cleanupFiles(inputPath);
      return res.status(400).json({ error: 'Invalid page range specified. Start page must be >= 1 and end page >= start page.' });
    }

    const outputPath = path.join(uploadDir, `extracted_${Date.now()}_p${startPage}-${endPage}.pdf`);
    const tempFiles = [inputPath, outputPath];

    try {
      const gsCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -dFirstPage=${startPage} -dLastPage=${endPage} -sOutputFile="${outputPath}" "${inputPath}"`;

      execSync(gsCmd);

      if (!fs.existsSync(outputPath)) {
        cleanupFiles(tempFiles);
        return res.status(500).json({ error: 'Extracted PDF file was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_p${startPage}-p${endPage}.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving extracted file:', downloadErr.message);
        }
        cleanupFiles(tempFiles);
      });
    } catch (gsErr) {
      console.error('Extract Ghostscript error:', gsErr.message);
      cleanupFiles(tempFiles);
      res.status(500).json({ error: 'Failed to extract pages with Ghostscript.' });
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
        cleanupFiles(tempFiles);
        return res.status(500).json({ error: 'Grayscale PDF was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_grayscale.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving grayscale file:', downloadErr.message);
        }
        cleanupFiles(tempFiles);
      });
    } catch (gsErr) {
      console.error('Grayscale Ghostscript error:', gsErr.message);
      cleanupFiles(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to grayscale.' });
    }
  });
});

// ==========================================
// 5. GENERATE IMAGE PREVIEW (/preview)
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
        cleanupFiles(tempFiles);
        return res.status(500).json({ error: 'Preview image was not generated.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_preview.jpg`;

      res.setHeader('Content-Type', 'image/jpeg');
      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving preview image:', downloadErr.message);
        }
        cleanupFiles(tempFiles);
      });
    } catch (gsErr) {
      console.error('Preview Ghostscript error:', gsErr.message);
      cleanupFiles(tempFiles);
      res.status(500).json({ error: 'Failed to generate JPEG preview with Ghostscript.' });
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
        cleanupFiles(tempFiles);
        return res.status(500).json({ error: 'Archival PDF/A file was not created.' });
      }

      const safeOriginalName = (req.file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      const downloadFilename = `${safeOriginalName}_PDFA.pdf`;

      res.download(outputPath, downloadFilename, (downloadErr) => {
        if (downloadErr) {
          console.error('Error serving PDF/A file:', downloadErr.message);
        }
        cleanupFiles(tempFiles);
      });
    } catch (gsErr) {
      console.error('PDF/A Ghostscript error:', gsErr.message);
      cleanupFiles(tempFiles);
      res.status(500).json({ error: 'Failed to convert PDF to archival PDF/A.' });
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled app error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF Precision Platform running on port ${PORT}`);
});
