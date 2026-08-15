/**
 * Shared PDF Workspace Manager Script (iLovePDF Inspired Layout)
 * Handles PDF drag-and-drop, PDF.js canvas thumbnail rendering, and state toggling.
 */

class PDFWorkspaceManager {
  constructor(options = {}) {
    this.dropzoneSelector = options.dropzoneSelector || '.dropzone-state';
    this.previewStateSelector = options.previewStateSelector || '.preview-state';
    this.previewGridSelector = options.previewGridSelector || '.preview-grid';
    this.fileInputSelector = options.fileInputSelector || '#fileInput';
    this.fileSelectBtnSelector = options.fileSelectBtnSelector || '.btn-select-file';
    this.fileNameDisplaySelector = options.fileNameDisplaySelector || '.file-name';
    this.pageCountDisplaySelector = options.pageCountDisplaySelector || '.page-count';

    this.onThumbnailRendered = options.onThumbnailRendered || null;
    this.onFileLoaded = options.onFileLoaded || null;

    this.selectedFile = null;
    this.pdfDocument = null;

    this.initPDFJS();
    this.bindEvents();
  }

  initPDFJS() {
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  bindEvents() {
    const dropzone = document.querySelector(this.dropzoneSelector);
    const fileInput = document.querySelector(this.fileInputSelector);
    const selectBtn = document.querySelector(this.fileSelectBtnSelector);

    if (selectBtn && fileInput) {
      selectBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.loadFile(e.target.files[0]);
        }
      });
    }

    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) {
          this.loadFile(dt.files[0]);
        }
      });
    }
  }

  async loadFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF document.');
      return;
    }

    this.selectedFile = file;

    // Update File Name Display
    const nameElem = document.querySelector(this.fileNameDisplaySelector);
    if (nameElem) {
      nameElem.textContent = file.name;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // Update Page Count Display
      const countElem = document.querySelector(this.pageCountDisplaySelector);
      if (countElem) {
        countElem.textContent = `${this.pdfDocument.numPages} Pages`;
      }

      // Switch view state
      this.showPreviewState();

      // Render thumbnails
      await this.renderThumbnails();

      if (typeof this.onFileLoaded === 'function') {
        this.onFileLoaded(this.selectedFile, this.pdfDocument);
      }
    } catch (err) {
      console.error('Error rendering PDF:', err);
      alert('Failed to parse PDF document. ' + err.message);
    }
  }

  showPreviewState() {
    const dropzone = document.querySelector(this.dropzoneSelector);
    const previewState = document.querySelector(this.previewStateSelector);

    if (dropzone) dropzone.style.display = 'none';
    if (previewState) previewState.classList.add('active');
  }

  showDropzoneState() {
    const dropzone = document.querySelector(this.dropzoneSelector);
    const previewState = document.querySelector(this.previewStateSelector);

    if (dropzone) dropzone.style.display = 'flex';
    if (previewState) previewState.classList.remove('active');
  }

  async renderThumbnails() {
    const grid = document.querySelector(this.previewGridSelector);
    if (!grid || !this.pdfDocument) return;

    grid.innerHTML = '';
    const totalPages = this.pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await this.pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.4 });

      // Create Card Element
      const card = document.createElement('div');
      card.className = 'thumbnail-card';
      card.setAttribute('data-page', pageNum);

      // Canvas Container
      const canvasContainer = document.createElement('div');
      canvasContainer.className = 'thumbnail-canvas-container';

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      canvasContainer.appendChild(canvas);

      // Card Footer Label
      const footer = document.createElement('div');
      footer.className = 'thumbnail-footer';
      footer.textContent = `Page ${pageNum}`;

      card.appendChild(canvasContainer);
      card.appendChild(footer);
      grid.appendChild(card);

      // Render PDF Page onto Canvas
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      // Invoke Custom Overlay Callback Hook
      if (typeof this.onThumbnailRendered === 'function') {
        this.onThumbnailRendered(canvas, pageNum, canvasContainer, card);
      }
    }
  }

  getSelectedFile() {
    return this.selectedFile;
  }

  getPDFDocument() {
    return this.pdfDocument;
  }
}

/* ==========================================================================
   UNIVERSAL VIBIFY SERVICE PROGRESS BAR CONTROLLER
   ========================================================================== */
class VibifyProgressBarController {
  constructor() {
    this.overlayElem = null;
    this.fillElem = null;
    this.percentElem = null;
    this.stageElem = null;
    this.titleElem = null;
    this.subtitleElem = null;
    this.iconElem = null;
    this.timer = null;
    this.currentPercent = 0;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.createModalDOM());
    } else {
      this.createModalDOM();
    }
  }

  createModalDOM() {
    if (!document.body) return;
    let overlay = document.getElementById('vibifyProgressOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vibifyProgressOverlay';
      overlay.className = 'vibify-progress-overlay';
      overlay.innerHTML = `
        <div class="vibify-progress-card">
          <div id="vibifyProgressIcon" class="vibify-progress-icon">⚡</div>
          <h3 id="vibifyProgressTitle" class="vibify-progress-title">Processing Request</h3>
          <p id="vibifyProgressSubtitle" class="vibify-progress-subtitle">Optimizing, processing, and generating your PDF...</p>
          <div class="vibify-progress-track">
            <div id="vibifyProgressFill" class="vibify-progress-fill"></div>
          </div>
          <div class="vibify-progress-meta">
            <span id="vibifyProgressStage" class="vibify-progress-stage">Initializing...</span>
            <span id="vibifyProgressPercent" class="vibify-progress-percent">0%</span>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    this.overlayElem = overlay;
    this.fillElem = overlay.querySelector('#vibifyProgressFill');
    this.percentElem = overlay.querySelector('#vibifyProgressPercent');
    this.stageElem = overlay.querySelector('#vibifyProgressStage');
    this.titleElem = overlay.querySelector('#vibifyProgressTitle');
    this.subtitleElem = overlay.querySelector('#vibifyProgressSubtitle');
    this.iconElem = overlay.querySelector('#vibifyProgressIcon');
  }

  start(options = {}) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.createModalDOM();
    const icon = options.icon || '⚡';
    const title = options.title || 'Processing Request';
    const subtitle = options.subtitle || 'Please wait while Vibify processes your document...';
    const stage = options.stage || options.stageMessage || 'Starting service engine...';
    const startPercent = options.initialPercent !== undefined ? options.initialPercent : 5;

    if (this.iconElem) this.iconElem.textContent = icon;
    if (this.titleElem) this.titleElem.textContent = title;
    if (this.subtitleElem) this.subtitleElem.textContent = subtitle;
    if (this.stageElem) this.stageElem.textContent = stage;
    this.update(startPercent, stage);

    if (this.overlayElem) {
      this.overlayElem.classList.add('active');
    }
  }

  show(options = {}) {
    this.start(options);
  }

  update(percent, stageMessage) {
    if (!this.overlayElem) this.createModalDOM();
    this.currentPercent = Math.min(100, Math.max(0, Math.round(percent)));
    if (this.fillElem) this.fillElem.style.width = `${this.currentPercent}%`;
    if (this.percentElem) this.percentElem.textContent = `${this.currentPercent}%`;
    if (stageMessage && this.stageElem) this.stageElem.textContent = stageMessage;
  }

  complete(options = {}) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const title = options.title || 'Processing Complete!';
    const subtitle = options.subtitle || 'Your document is ready.';
    const icon = options.icon || '✅';
    const stage = options.stage || options.stageMessage || 'Complete!';

    if (this.iconElem) this.iconElem.textContent = icon;
    if (this.titleElem) this.titleElem.textContent = title;
    if (this.subtitleElem) this.subtitleElem.textContent = subtitle;
    this.update(100, stage);

    setTimeout(() => {
      this.hide();
    }, 1200);
  }

  fail(options = {}) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const title = options.title || 'Operation Failed';
    const subtitle = options.subtitle || 'An error occurred during processing.';
    const icon = options.icon || '❌';

    if (this.iconElem) this.iconElem.textContent = icon;
    if (this.titleElem) this.titleElem.textContent = title;
    if (this.subtitleElem) this.subtitleElem.textContent = subtitle;
    if (this.stageElem) this.stageElem.textContent = 'Error';

    setTimeout(() => {
      this.hide();
    }, 3000);
  }

  simulate(options = {}) {
    this.start(options);
    const stages = options.stages || [
      { at: 15, msg: 'Reading file & validating structure...' },
      { at: 45, msg: 'Applying PDF transform engine...' },
      { at: 75, msg: 'Rebuilding pages & compressing stream...' },
      { at: 92, msg: 'Finalizing document download...' }
    ];

    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      if (this.currentPercent < 95) {
        this.currentPercent += Math.floor(Math.random() * 6) + 2;
        const matchingStage = stages.find(s => this.currentPercent >= s.at && this.currentPercent < s.at + 15);
        const stageMsg = matchingStage ? matchingStage.msg : (options.stage || options.stageMessage || 'Processing service...');
        this.update(this.currentPercent, stageMsg);
      }
    }, 250);
  }

  hide() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.overlayElem) {
      this.overlayElem.classList.remove('active');
    }
  }
}

window.VibifyProgressBar = new VibifyProgressBarController();

// Auto-hook forms on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', () => {
      const pageTitle = document.title || 'PDF Tool';
      let icon = '⚡';
      if (pageTitle.includes('Compress')) icon = '🗜️';
      else if (pageTitle.includes('Merge')) icon = '🧩';
      else if (pageTitle.includes('Word')) icon = '📄';
      else if (pageTitle.includes('OCR')) icon = '🔍';
      else if (pageTitle.includes('Protect')) icon = '🔒';
      else if (pageTitle.includes('Unlock')) icon = '🔓';
      else if (pageTitle.includes('Rotate')) icon = '🔄';
      else if (pageTitle.includes('Delete')) icon = '🗑️';
      else if (pageTitle.includes('Extract')) icon = '✂️';

      window.VibifyProgressBar.simulate({
        icon,
        title: `Running ${pageTitle.split('-')[0].trim()}`,
        subtitle: 'Vibify is processing your document. Please wait...'
      });
    });
  });
});

// Export for module or global script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PDFWorkspaceManager, VibifyProgressBar: window.VibifyProgressBar };
} else {
  window.PDFWorkspaceManager = PDFWorkspaceManager;
}

