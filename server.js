const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'upload_' + uniqueSuffix + '.pdf');
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'), false);
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(publicDir));

// Route to serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Helper function to clean up temporary files
function cleanupFiles(filePaths) {
  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Failed to delete temporary file ${filePath}:`, err.message);
      }
    }
  });
}

// POST route /compress
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

    const tempFilesCreated = [inputPath];
    const compressionLogs = {
      filename: req.file.originalname,
      originalSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
      targetSizeMB: targetSizeMB,
      targetSizeBytes: targetSizeBytes,
      iterations: []
    };

    // Binary search parameters
    let minDpi = 36;
    let maxDpi = 300;
    let bestOutput = null;
    let bestDiff = Infinity;
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i++) {
      const midDpi = Math.round((minDpi + maxDpi) / 2);
      const outputPath = path.join(uploadDir, `compressed_${Date.now()}_iter${i}_${Math.random().toString(36).substring(2, 7)}.pdf`);
      tempFilesCreated.push(outputPath);

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

          // Break early if within 5% of target byte size
          if (diff / targetSizeBytes <= 0.05) {
            break;
          }

          if (currentSize > targetSizeBytes) {
            // Output is too large, reduce DPI to compress further
            maxDpi = midDpi - 1;
          } else {
            // Output is smaller than target, increase DPI for better quality
            minDpi = midDpi + 1;
          }

          if (minDpi > maxDpi) {
            break;
          }
        }
      } catch (gsErr) {
        console.error(`Ghostscript iteration ${i} failed at ${midDpi} DPI:`, gsErr.message);
        compressionLogs.iterations.push({
          iteration: i + 1,
          dpi: midDpi,
          error: gsErr.message
        });
      }
    }

    if (!bestOutput || !fs.existsSync(bestOutput)) {
      cleanupFiles(tempFilesCreated);
      return res.status(500).json({ error: 'Failed to compress PDF with Ghostscript.' });
    }

    // Mark best iteration
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
        console.error('Error delivering compressed file to client:', downloadErr.message);
      }
      // Ensure all temporary input and output files are deleted from the server after download completes
      cleanupFiles(tempFilesCreated);
    });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
