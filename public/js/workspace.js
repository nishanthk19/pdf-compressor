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

// Export for module or global script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PDFWorkspaceManager };
} else {
  window.PDFWorkspaceManager = PDFWorkspaceManager;
}
