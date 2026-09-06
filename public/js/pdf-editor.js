(() => {
  'use strict';

  if (!window.pdfjsLib || !window.PDFLib) {
    document.body.innerHTML = '<p style="padding:32px;font-family:sans-serif">The PDF editor libraries could not be loaded. Check your connection and reload.</p>';
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const $ = (selector) => document.querySelector(selector);
  $('#togglePagesBtn')?.addEventListener('click', () => {
    const open = $('#editorShell').classList.toggle('pages-open');
    $('#togglePagesBtn').setAttribute('aria-expanded', String(open));
  });
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  $$('.tool-btn[title], .sidebar-tab[title]').forEach(button => button.setAttribute('aria-label', button.title));
  const uid = () => `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deepClone = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value = '') => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const normalizeRotation = (value) => ((value % 360) + 360) % 360;
  const displayScale = () => 1.25 * state.zoom;
  const visiblePages = () => state.pages;
  const currentPage = () => state.pages[state.currentIndex] || null;
  const currentAnnotations = () => currentPage()?.annotations || [];

  const state = {
    file: null,
    fileName: 'document.pdf',
    fileKey: '',
    rawBytes: null,
    pdf: null,
    pages: [],
    currentIndex: 0,
    zoom: 1,
    tool: 'select',
    mode: 'annotate',
    selectedId: null,
    undo: [],
    redo: [],
    activity: [],
    renderToken: 0,
    signatureMode: 'draw',
    pendingSignature: null,
    dragPageIndex: null,
    isBusy: false
  };

  const refs = {
    uploadView: $('#uploadView'), uploadCard: $('#uploadCard'), openPdfBtn: $('#openPdfBtn'), fileInput: $('#pdfFileInput'),
    canvasScroll: $('#canvasScroll'), pageStage: $('#pageStage'), canvas: $('#pdfCanvas'), layer: $('#annotationLayer'),
    thumbnails: $('#thumbnailList'), rightPanel: $('#rightPanel'), propertiesEmpty: $('#propertiesEmpty'), propertiesForm: $('#propertiesForm'),
    propertiesTitle: $('#propertiesTitle'), propertiesSubtitle: $('#propertiesSubtitle'), selectionIcon: $('#selectionIcon'),
    pageStatus: $('#pageStatus'), pageNumber: $('#pageNumberInput'), pageCount: $('#pageCount'), previousPage: $('#previousPageBtn'), nextPage: $('#nextPageBtn'),
    zoomValue: $('#zoomValue'), zoomOut: $('#zoomOutBtn'), zoomIn: $('#zoomInBtn'), fit: $('#fitBtn'),
    undo: $('#undoBtn'), redo: $('#redoBtn'), download: $('#downloadBtn'), print: $('#printBtn'), title: $('#documentTitle'), saveState: $('#saveState'),
    searchInput: $('#searchInput'), searchSummary: $('#searchSummary'), searchResults: $('#searchResults'),
    commentList: $('#commentList'), commentEmpty: $('#commentEmpty'), commentCount: $('#commentCount'), historyList: $('#historyList'),
    signatureModal: $('#signatureModal'), signatureCanvas: $('#signatureCanvas'), typedSignature: $('#typedSignature'), typedPreview: $('#typedSignaturePreview'),
    imageInput: $('#imageFileInput'), busy: $('#busyOverlay'), busyTitle: $('#busyTitle'), busyDetail: $('#busyDetail'), toastRegion: $('#toastRegion')
  };

  function toast(message, type = '') {
    const element = document.createElement('div');
    element.className = `toast ${type}`.trim();
    element.textContent = message;
    refs.toastRegion.appendChild(element);
    setTimeout(() => element.remove(), 3400);
  }

  function setBusy(active, title = 'Preparing document…', detail = 'This stays in your browser.') {
    state.isBusy = active;
    refs.busyTitle.textContent = title;
    refs.busyDetail.textContent = detail;
    refs.busy.classList.toggle('hidden', !active);
  }

  function capture() {
    return { pages: deepClone(state.pages), currentIndex: state.currentIndex, selectedId: state.selectedId };
  }

  function restore(snapshot) {
    state.pages = deepClone(snapshot.pages);
    state.currentIndex = clamp(snapshot.currentIndex, 0, Math.max(0, state.pages.length - 1));
    state.selectedId = snapshot.selectedId;
    renderAll();
  }

  function checkpoint(label) {
    if (!state.pages.length) return;
    state.undo.push({ label, snapshot: capture() });
    if (state.undo.length > 50) state.undo.shift();
    state.redo.length = 0;
    state.activity.unshift(label);
    if (state.activity.length > 12) state.activity.pop();
    updateHistory();
    updateUndoRedo();
  }

  function undo() {
    const entry = state.undo.pop();
    if (!entry) return;
    state.redo.push({ label: entry.label, snapshot: capture() });
    restore(entry.snapshot);
    updateUndoRedo();
    toast(`Undid: ${entry.label}`);
  }

  function redo() {
    const entry = state.redo.pop();
    if (!entry) return;
    state.undo.push({ label: entry.label, snapshot: capture() });
    restore(entry.snapshot);
    updateUndoRedo();
    toast(`Redid: ${entry.label}`);
  }

  function updateUndoRedo() {
    refs.undo.disabled = !state.undo.length;
    refs.redo.disabled = !state.redo.length;
  }

  function updateHistory() {
    if (!state.activity.length) {
      refs.historyList.innerHTML = '<p>No edits yet</p>';
      return;
    }
    refs.historyList.innerHTML = state.activity.map((label) => `<div class="history-entry">${esc(label)}</div>`).join('');
  }

  function scheduleLocalSave() {
    refs.saveState.innerHTML = '<i style="background:#e5a52a"></i> Saving locally…';
    clearTimeout(scheduleLocalSave.timer);
    scheduleLocalSave.timer = setTimeout(() => {
      try {
        const pages = state.pages.map(({ textCache: _textCache, ...page }) => page);
        const payload = { version: 2, pages, title: refs.title.value, savedAt: Date.now() };
        localStorage.setItem(`vibify-editor:${state.fileKey}`, JSON.stringify(payload));
        refs.saveState.innerHTML = '<i></i> Saved in this browser';
      } catch {
        refs.saveState.textContent = 'Local save unavailable';
      }
    }, 450);
  }

  async function loadFile(file) {
    if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
      toast('Please choose a valid PDF file.', 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast('This PDF is larger than the 100 MB limit.', 'error');
      return;
    }
    setBusy(true, 'Opening your PDF…', 'Reading pages and preparing the workspace.');
    try {
      const raw = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(raw.slice(0)), isEvalSupported: false }).promise;
      state.file = file;
      state.fileName = file.name;
      state.fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      state.rawBytes = raw;
      state.pdf = pdf;
      state.currentIndex = 0;
      state.selectedId = null;
      state.undo = [];
      state.redo = [];
      state.activity = [];
      state.pages = [];

      for (let index = 1; index <= pdf.numPages; index += 1) {
        const page = await pdf.getPage(index);
        const view = page.view;
        state.pages.push({
          id: uid(), sourceIndex: index, synthetic: false,
          width: Math.abs(view[2] - view[0]), height: Math.abs(view[3] - view[1]),
          baseRotation: page.rotate || 0, rotation: 0, annotations: [], textCache: null
        });
      }

      let restored = false;
      try {
        const saved = JSON.parse(localStorage.getItem(`vibify-editor:${state.fileKey}`) || 'null');
        if (saved?.version === 2 && Array.isArray(saved.pages) && saved.pages.length) {
          const sourcesValid = saved.pages.every((page) => page.synthetic || (page.sourceIndex >= 1 && page.sourceIndex <= pdf.numPages));
          if (sourcesValid) {
            state.pages = saved.pages;
            refs.title.value = saved.title || file.name.replace(/\.pdf$/i, '');
            restored = true;
          }
        }
      } catch { /* Ignore malformed browser storage. */ }

      if (!restored) refs.title.value = file.name.replace(/\.pdf$/i, '');
      refs.uploadView.classList.add('hidden');
      refs.canvasScroll.classList.remove('hidden');
      refs.pageStatus.classList.remove('hidden');
      [refs.download, refs.print, refs.zoomOut, refs.zoomIn, refs.zoomValue, refs.fit].forEach((button) => { button.disabled = false; });
      await renderAll();
      if (restored) toast('Restored your locally saved edits.');
      else toast(`Opened ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error(error);
      toast('This PDF could not be opened. It may be damaged or password protected.', 'error');
    } finally {
      setBusy(false);
      refs.fileInput.value = '';
    }
  }

  async function getPdfPage(model) {
    return model.synthetic ? null : state.pdf.getPage(model.sourceIndex);
  }

  function displayRotation(model) {
    return normalizeRotation((model.baseRotation || 0) + (model.rotation || 0));
  }

  async function renderCurrentPage() {
    const model = currentPage();
    if (!model) return;
    const token = ++state.renderToken;
    const scale = displayScale();
    const pdfPage = await getPdfPage(model);
    let width;
    let height;

    if (pdfPage) {
      const viewport = pdfPage.getViewport({ scale, rotation: displayRotation(model) });
      width = Math.round(viewport.width);
      height = Math.round(viewport.height);
      refs.canvas.width = width;
      refs.canvas.height = height;
      const context = refs.canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    } else {
      const rotated = displayRotation(model) % 180 !== 0;
      width = Math.round((rotated ? model.height : model.width) * scale);
      height = Math.round((rotated ? model.width : model.height) * scale);
      refs.canvas.width = width;
      refs.canvas.height = height;
      const context = refs.canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
    }
    if (token !== state.renderToken) return;
    refs.pageStage.style.width = `${width}px`;
    refs.pageStage.style.height = `${height}px`;
    refs.layer.style.width = `${width}px`;
    refs.layer.style.height = `${height}px`;
    refs.pageNumber.value = state.currentIndex + 1;
    refs.pageCount.textContent = state.pages.length;
    refs.previousPage.disabled = state.currentIndex === 0;
    refs.nextPage.disabled = state.currentIndex >= state.pages.length - 1;
    refs.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    updateToolCursor();
    renderAnnotations();
  }

  async function renderThumbnails() {
    refs.thumbnails.innerHTML = '';
    state.pages.forEach((model, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `thumbnail-item${index === state.currentIndex ? ' active' : ''}`;
      button.draggable = true;
      button.dataset.index = index;
      button.innerHTML = `<span class="thumbnail-canvas-wrap"><canvas aria-label="Preview of page ${index + 1}"></canvas></span><small>Page ${index + 1}</small>${model.annotations.length ? `<span class="thumb-badge">${model.annotations.length}</span>` : ''}`;
      button.addEventListener('click', () => goToPage(index));
      button.addEventListener('dragstart', () => { state.dragPageIndex = index; button.classList.add('dragging'); });
      button.addEventListener('dragend', () => button.classList.remove('dragging'));
      button.addEventListener('dragover', (event) => event.preventDefault());
      button.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = state.dragPageIndex;
        if (from === null || from === index) return;
        checkpoint('Reordered pages');
        const [moved] = state.pages.splice(from, 1);
        state.pages.splice(index, 0, moved);
        state.currentIndex = index;
        state.dragPageIndex = null;
        renderAll();
        scheduleLocalSave();
      });
      refs.thumbnails.appendChild(button);
      renderThumbnail(model, button.querySelector('canvas')).catch(() => {});
    });
  }

  async function renderThumbnail(model, canvas) {
    const pdfPage = await getPdfPage(model);
    const maxWidth = 134;
    const rotation = displayRotation(model);
    const baseWidth = rotation % 180 ? model.height : model.width;
    const scale = maxWidth / baseWidth;
    const height = Math.round((rotation % 180 ? model.width : model.height) * scale);
    canvas.width = Math.round(baseWidth * scale);
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (pdfPage) {
      const viewport = pdfPage.getViewport({ scale, rotation });
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    }
    renderThumbnailAnnotations(context, model, canvas.width, canvas.height);
  }

  function renderThumbnailAnnotations(context, model, width, height) {
    model.annotations.forEach((annotation) => {
      const x = annotation.x * width;
      const y = annotation.y * height;
      const w = annotation.w * width;
      const h = annotation.h * height;
      if (annotation.type === 'highlight') {
        context.fillStyle = colorWithAlpha(annotation.color || '#ffe14c', annotation.opacity ?? .45);
        context.fillRect(x, y, w, h);
      } else if (annotation.type === 'redact') {
        context.fillStyle = '#111'; context.fillRect(x, y, w, h);
      } else if (annotation.type === 'text' || annotation.type === 'stamp') {
        context.fillStyle = annotation.color || '#222';
        context.font = `bold ${Math.max(5, (annotation.fontSize || 14) * height / model.height)}px sans-serif`;
        context.fillText((annotation.text || '').slice(0, 30), x, y + Math.max(7, h * .7));
      } else if (annotation.type === 'shape') {
        context.strokeStyle = annotation.color || '#5b45e0'; context.lineWidth = 1;
        if (annotation.shape === 'ellipse') { context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); context.stroke(); }
        else context.strokeRect(x, y, w, h);
      }
    });
  }

  async function renderAll() {
    if (!state.pages.length) return;
    await renderCurrentPage();
    renderThumbnails();
    renderComments();
    updateProperties();
    updateUndoRedo();
  }

  async function goToPage(index) {
    if (index < 0 || index >= state.pages.length || index === state.currentIndex) return;
    state.currentIndex = index;
    state.selectedId = null;
    await renderCurrentPage();
    renderThumbnails();
    updateProperties();
  }

  function annotationClass(annotation) {
    if (annotation.type === 'text') return 'annotation-text';
    if (annotation.type === 'highlight') return 'annotation-highlight';
    if (annotation.type === 'redact') return 'annotation-redact';
    if (annotation.type === 'shape') return `annotation-shape ${annotation.shape || 'rectangle'}`;
    if (annotation.type === 'note') return 'annotation-note';
    if (annotation.type === 'stamp') return 'annotation-stamp';
    if (['text-field', 'checkbox', 'radio', 'date-field', 'signature-field'].includes(annotation.type)) return `annotation-form ${annotation.type}`;
    if (annotation.type === 'signature') return `annotation-signature ${annotation.signatureKind || ''}`;
    if (annotation.type === 'image') return 'annotation-image';
    if (annotation.type === 'ink') return 'annotation-ink';
    return '';
  }

  function renderAnnotations() {
    refs.layer.innerHTML = '';
    currentAnnotations().forEach((annotation) => {
      const element = document.createElement('div');
      element.className = `annotation ${annotationClass(annotation)}${annotation.id === state.selectedId ? ' selected' : ''}`;
      element.dataset.id = annotation.id;
      element.style.left = `${annotation.x * 100}%`;
      element.style.top = `${annotation.y * 100}%`;
      element.style.width = `${annotation.w * 100}%`;
      element.style.height = `${annotation.h * 100}%`;
      element.style.opacity = annotation.opacity ?? 1;
      buildAnnotationContent(element, annotation);
      element.addEventListener('pointerdown', (event) => startAnnotationDrag(event, annotation, element));
      element.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        state.selectedId = annotation.id;
        updateProperties();
        if (window.innerWidth < 940) refs.rightPanel.classList.add('open');
      });
      if (annotation.id === state.selectedId && !['ink', 'line'].includes(annotation.type)) {
        const resize = document.createElement('span');
        resize.className = 'resize-handle';
        resize.addEventListener('pointerdown', (event) => startAnnotationResize(event, annotation, element));
        element.appendChild(resize);
      }
      refs.layer.appendChild(element);
    });
  }

  function buildAnnotationContent(element, annotation) {
    if (annotation.type === 'text') {
      element.textContent = annotation.text || 'Type here';
      element.style.color = annotation.color || '#20232b';
      element.style.fontFamily = annotation.font || 'Arial, sans-serif';
      element.style.fontSize = `${(annotation.fontSize || 14) * displayScale()}px`;
      element.style.fontWeight = annotation.bold ? '700' : '400';
      element.style.fontStyle = annotation.italic ? 'italic' : 'normal';
      element.style.textAlign = annotation.align || 'left';
    } else if (annotation.type === 'shape') {
      element.style.borderWidth = `${Math.max(1, (annotation.strokeWidth || 2) * state.zoom)}px`;
      element.style.borderColor = annotation.color || '#5b45e0';
      if (annotation.fill && annotation.fill !== 'transparent') element.style.background = annotation.fill;
      if (annotation.shape === 'line' || annotation.shape === 'arrow') {
        element.style.border = '0';
        element.innerHTML = shapeSvg(annotation, annotation.shape === 'arrow');
      }
    } else if (annotation.type === 'note') {
      element.textContent = '✦';
      element.title = annotation.comment || 'Comment';
    } else if (annotation.type === 'stamp') {
      element.textContent = annotation.text || 'APPROVED';
      element.style.color = annotation.color || '#2b9b70';
      element.style.fontSize = `${Math.max(9, (annotation.fontSize || 18) * state.zoom)}px`;
    } else if (['text-field', 'date-field', 'signature-field'].includes(annotation.type)) {
      element.textContent = annotation.value || ({ 'text-field': 'Text field', 'date-field': 'MM / DD / YYYY', 'signature-field': 'Sign here' }[annotation.type]);
    } else if (annotation.type === 'checkbox') {
      element.textContent = annotation.checked ? '✓' : '';
    } else if (annotation.type === 'radio') {
      element.textContent = annotation.checked ? '●' : '';
    } else if (annotation.type === 'signature') {
      if (annotation.signatureKind === 'typed') {
        element.textContent = annotation.text;
        element.style.fontSize = `${28 * state.zoom}px`;
      } else {
        const img = new Image(); img.src = annotation.dataUrl; img.alt = 'Signature'; element.appendChild(img);
      }
    } else if (annotation.type === 'image') {
      const img = new Image(); img.src = annotation.dataUrl; img.alt = 'Inserted image'; element.appendChild(img);
    } else if (annotation.type === 'ink') {
      element.innerHTML = inkSvg(annotation);
    }
  }

  function shapeSvg(annotation, arrow) {
    const color = esc(annotation.color || '#5b45e0');
    const stroke = Math.max(1, annotation.strokeWidth || 2);
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style="overflow:visible"><defs><marker id="arrow-${annotation.id}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${color}"/></marker></defs><line x1="2" y1="50" x2="98" y2="50" stroke="${color}" stroke-width="${stroke}" vector-effect="non-scaling-stroke" ${arrow ? `marker-end="url(#arrow-${annotation.id})"` : ''}/></svg>`;
  }

  function inkSvg(annotation) {
    const points = annotation.points || [];
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style="overflow:visible"><path d="${path}" fill="none" stroke="${esc(annotation.color || '#5b45e0')}" stroke-width="${Math.max(1, annotation.strokeWidth || 2)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function startAnnotationDrag(event, annotation, element) {
    if (event.target.classList.contains('resize-handle')) return;
    event.stopPropagation();
    state.selectedId = annotation.id;
    renderAnnotations();
    updateProperties();
    if (state.tool !== 'select') return;
    event.preventDefault();
    checkpoint(`Moved ${typeLabel(annotation.type)}`);
    const rect = refs.layer.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = annotation.x;
    const originalY = annotation.y;
    element.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      annotation.x = clamp(originalX + (moveEvent.clientX - startX) / rect.width, 0, 1 - annotation.w);
      annotation.y = clamp(originalY + (moveEvent.clientY - startY) / rect.height, 0, 1 - annotation.h);
      element.style.left = `${annotation.x * 100}%`;
      element.style.top = `${annotation.y * 100}%`;
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      scheduleLocalSave();
      renderThumbnails();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  }

  function startAnnotationResize(event, annotation, element) {
    event.preventDefault();
    event.stopPropagation();
    checkpoint(`Resized ${typeLabel(annotation.type)}`);
    const rect = refs.layer.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalW = annotation.w;
    const originalH = annotation.h;
    const move = (moveEvent) => {
      annotation.w = clamp(originalW + (moveEvent.clientX - startX) / rect.width, .015, 1 - annotation.x);
      annotation.h = clamp(originalH + (moveEvent.clientY - startY) / rect.height, .012, 1 - annotation.y);
      element.style.width = `${annotation.w * 100}%`;
      element.style.height = `${annotation.h * 100}%`;
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      scheduleLocalSave();
      renderThumbnails();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  }

  function setTool(tool) {
    if (!state.pages.length && tool !== 'select') {
      toast('Open a PDF before choosing an editing tool.');
      return;
    }
    if (tool === 'signature') {
      openSignatureModal();
      return;
    }
    if (tool === 'image') {
      refs.imageInput.click();
      return;
    }
    state.tool = tool;
    $$('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    updateToolCursor();
  }

  function updateToolCursor() {
    refs.layer.className = `annotation-layer tool-${state.tool}`;
  }

  function pointFromEvent(event) {
    const rect = refs.layer.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }

  refs.layer.addEventListener('pointerdown', (event) => {
    if (event.target !== refs.layer) return;
    if (!currentPage()) return;
    const point = pointFromEvent(event);
    if (state.tool === 'select') {
      state.selectedId = null;
      renderAnnotations();
      updateProperties();
      return;
    }
    if (['highlight', 'shape', 'redact', 'ink'].includes(state.tool)) {
      startDraw(event, point);
      return;
    }
    const defaults = annotationDefaults(state.tool, point);
    if (!defaults) return;
    checkpoint(`Added ${typeLabel(state.tool)}`);
    currentAnnotations().push(defaults);
    state.selectedId = defaults.id;
    setTool('select');
    renderAnnotations();
    renderComments();
    updateProperties();
    renderThumbnails();
    scheduleLocalSave();
  });

  function annotationDefaults(type, point = { x: .18, y: .18 }) {
    const id = uid();
    const base = { id, type, x: clamp(point.x, 0, .75), y: clamp(point.y, 0, .9), w: .25, h: .06, opacity: 1 };
    if (type === 'text') return { ...base, w: .35, h: .07, text: 'Add your text', color: '#20232b', font: 'Arial, sans-serif', fontSize: 14, align: 'left', bold: false, italic: false };
    if (type === 'note') return { ...base, w: .04, h: .04, comment: 'Add a comment…', author: 'You' };
    if (type === 'stamp') return { ...base, w: .28, h: .075, text: 'APPROVED', color: '#2b9b70', fontSize: 18 };
    if (type === 'text-field') return { ...base, w: .32, h: .055, name: `Text_${id.slice(-4)}`, value: '', required: false };
    if (type === 'date-field') return { ...base, w: .24, h: .055, name: `Date_${id.slice(-4)}`, value: '', required: false };
    if (type === 'signature-field') return { ...base, w: .32, h: .075, name: `Signature_${id.slice(-4)}`, value: '', required: false };
    if (type === 'checkbox') return { ...base, w: .032, h: .032, name: `Checkbox_${id.slice(-4)}`, checked: false, required: false };
    if (type === 'radio') return { ...base, w: .032, h: .032, name: `Radio_${id.slice(-4)}`, checked: false, required: false };
    return null;
  }

  function startDraw(event, start) {
    event.preventDefault();
    const type = state.tool;
    checkpoint(`Added ${typeLabel(type)}`);
    const annotation = type === 'ink'
      ? { id: uid(), type: 'ink', x: start.x, y: start.y, w: .001, h: .001, points: [{ x: start.x, y: start.y }], color: '#5b45e0', strokeWidth: 2, opacity: 1 }
      : { id: uid(), type, x: start.x, y: start.y, w: .001, h: .001, color: type === 'highlight' ? '#ffe14c' : type === 'redact' ? '#111111' : '#5b45e0', opacity: type === 'highlight' ? .45 : 1, strokeWidth: 2, shape: 'rectangle', fill: 'transparent' };
    currentAnnotations().push(annotation);
    state.selectedId = annotation.id;
    const pointerId = event.pointerId;
    refs.layer.setPointerCapture?.(pointerId);

    const move = (moveEvent) => {
      const point = pointFromEvent(moveEvent);
      if (type === 'ink') {
        annotation.points.push(point);
      } else {
        annotation.x = Math.min(start.x, point.x);
        annotation.y = Math.min(start.y, point.y);
        annotation.w = Math.max(.003, Math.abs(point.x - start.x));
        annotation.h = Math.max(.003, Math.abs(point.y - start.y));
      }
      renderAnnotations();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      if (type === 'ink') normalizeInk(annotation);
      if (annotation.w < .01) annotation.w = type === 'highlight' ? .22 : .14;
      if (annotation.h < .008) annotation.h = type === 'highlight' ? .025 : .08;
      setTool('select');
      renderAnnotations();
      updateProperties();
      renderThumbnails();
      scheduleLocalSave();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  }

  function normalizeInk(annotation) {
    const absolute = annotation.points;
    const minX = Math.min(...absolute.map((p) => p.x));
    const minY = Math.min(...absolute.map((p) => p.y));
    const maxX = Math.max(...absolute.map((p) => p.x));
    const maxY = Math.max(...absolute.map((p) => p.y));
    annotation.x = minX;
    annotation.y = minY;
    annotation.w = Math.max(.005, maxX - minX);
    annotation.h = Math.max(.005, maxY - minY);
    annotation.points = absolute.map((point) => ({ x: (point.x - minX) / annotation.w, y: (point.y - minY) / annotation.h }));
  }

  function typeLabel(type) {
    return ({ text: 'text', highlight: 'highlight', ink: 'drawing', shape: 'shape', redact: 'redaction', note: 'comment', signature: 'signature', image: 'image', stamp: 'stamp', 'text-field': 'text field', checkbox: 'checkbox', radio: 'radio field', 'date-field': 'date field', 'signature-field': 'signature field' }[type] || 'item');
  }

  function selectedAnnotation() {
    return currentAnnotations().find((annotation) => annotation.id === state.selectedId) || null;
  }

  function updateProperties() {
    const annotation = selectedAnnotation();
    refs.propertiesEmpty.classList.toggle('hidden', Boolean(annotation));
    refs.propertiesForm.classList.toggle('hidden', !annotation);
    if (!annotation) {
      refs.propertiesTitle.textContent = 'Properties';
      refs.propertiesSubtitle.textContent = 'Nothing selected';
      refs.selectionIcon.textContent = '↖';
      return;
    }
    refs.propertiesTitle.textContent = typeLabel(annotation.type).replace(/^./, (c) => c.toUpperCase());
    refs.propertiesSubtitle.textContent = `Page ${state.currentIndex + 1}`;
    refs.selectionIcon.textContent = ({ text: 'T', highlight: 'T', ink: '⌁', shape: '□', redact: '▰', note: '◰', signature: '✒', image: '▧', stamp: '✓' }[annotation.type] || '◇');
    refs.propertiesForm.innerHTML = propertiesMarkup(annotation);
    bindPropertyControls(annotation);
    if (window.innerWidth < 940) refs.rightPanel.classList.add('open');
  }

  function propertiesMarkup(annotation) {
    let body = '';
    if (annotation.type === 'text') {
      body += textareaControl('Text', 'text', annotation.text);
      body += `<div class="property-group"><label class="property-label">Typeface</label><select class="property-control" data-prop="font"><option value="Arial, sans-serif" ${annotation.font?.startsWith('Arial') ? 'selected' : ''}>Arial</option><option value="Georgia, serif" ${annotation.font?.startsWith('Georgia') ? 'selected' : ''}>Georgia</option><option value="Courier New, monospace" ${annotation.font?.startsWith('Courier') ? 'selected' : ''}>Courier</option></select></div>`;
      body += `<div class="property-row">${numberControl('Size', 'fontSize', annotation.fontSize || 14, 7, 72)}${colorControl('Color', 'color', annotation.color || '#20232b')}</div>`;
      body += `<div class="property-row">${selectControl('Align', 'align', annotation.align || 'left', [['left','Left'],['center','Center'],['right','Right']])}${selectControl('Style', 'style', annotation.bold ? 'bold' : annotation.italic ? 'italic' : 'normal', [['normal','Regular'],['bold','Bold'],['italic','Italic']])}</div>`;
    } else if (annotation.type === 'shape') {
      body += selectControl('Shape', 'shape', annotation.shape || 'rectangle', [['rectangle','Rectangle'],['ellipse','Ellipse'],['line','Line'],['arrow','Arrow']]);
      body += `<div class="property-row">${colorControl('Stroke', 'color', annotation.color || '#5b45e0')}${numberControl('Width', 'strokeWidth', annotation.strokeWidth || 2, 1, 16)}</div>`;
      body += colorControl('Fill', 'fill', annotation.fill === 'transparent' ? '#ffffff' : annotation.fill || '#ffffff');
    } else if (annotation.type === 'highlight') {
      body += colorControl('Highlight color', 'color', annotation.color || '#ffe14c');
      body += rangeControl('Opacity', 'opacity', annotation.opacity ?? .45, 0.1, 1, .05);
    } else if (annotation.type === 'ink') {
      body += `<div class="property-row">${colorControl('Ink color', 'color', annotation.color || '#5b45e0')}${numberControl('Width', 'strokeWidth', annotation.strokeWidth || 2, 1, 16)}</div>`;
      body += rangeControl('Opacity', 'opacity', annotation.opacity ?? 1, .1, 1, .05);
    } else if (annotation.type === 'note') {
      body += textareaControl('Comment', 'comment', annotation.comment || '');
      body += textControl('Author', 'author', annotation.author || 'You');
    } else if (annotation.type === 'stamp') {
      body += selectControl('Stamp', 'text', annotation.text || 'APPROVED', [['APPROVED','Approved'],['REVIEWED','Reviewed'],['DRAFT','Draft'],['CONFIDENTIAL','Confidential'],['VOID','Void']]);
      body += colorControl('Color', 'color', annotation.color || '#2b9b70');
    } else if (['text-field','date-field','signature-field','checkbox','radio'].includes(annotation.type)) {
      body += textControl('Field name', 'name', annotation.name || 'Field');
      if (['text-field','date-field','signature-field'].includes(annotation.type)) body += textControl('Default value', 'value', annotation.value || '');
      else body += selectControl('Default state', 'checked', String(Boolean(annotation.checked)), [['false','Unchecked'],['true','Checked']]);
      body += selectControl('Required', 'required', String(Boolean(annotation.required)), [['false','Optional'],['true','Required']]);
    } else if (annotation.type === 'redact') {
      body += '<div class="property-group"><label class="property-label">Permanent redaction</label><p class="panel-hint" style="margin:0">The covered area will be flattened as a solid block in the exported PDF.</p></div>';
    } else if (annotation.type === 'image' || annotation.type === 'signature') {
      body += rangeControl('Opacity', 'opacity', annotation.opacity ?? 1, .1, 1, .05);
    }
    body += `<div class="property-actions"><button type="button" data-action="duplicate">Duplicate</button><button type="button" class="delete-action" data-action="delete">Delete</button></div>`;
    return body;
  }

  function textControl(label, prop, value) { return `<div class="property-group"><label class="property-label">${label}</label><input class="property-control" data-prop="${prop}" value="${esc(value)}"></div>`; }
  function textareaControl(label, prop, value) { return `<div class="property-group"><label class="property-label">${label}</label><textarea class="property-control" data-prop="${prop}">${esc(value)}</textarea></div>`; }
  function numberControl(label, prop, value, min, max) { return `<div class="property-group"><label class="property-label">${label}</label><input class="property-control" type="number" data-prop="${prop}" value="${value}" min="${min}" max="${max}"></div>`; }
  function colorControl(label, prop, value) { return `<div class="property-group"><label class="property-label">${label}</label><input class="property-control" type="color" data-prop="${prop}" value="${value}"></div>`; }
  function selectControl(label, prop, value, options) { return `<div class="property-group"><label class="property-label">${label}</label><select class="property-control" data-prop="${prop}">${options.map(([key, name]) => `<option value="${key}" ${String(value) === key ? 'selected' : ''}>${name}</option>`).join('')}</select></div>`; }
  function rangeControl(label, prop, value, min, max, step) { return `<div class="property-group"><label class="property-label">${label}</label><div class="range-control"><input type="range" data-prop="${prop}" min="${min}" max="${max}" step="${step}" value="${value}"><output>${Math.round(value * 100)}%</output></div></div>`; }

  function bindPropertyControls(annotation) {
    $$('[data-prop]', refs.propertiesForm).forEach((control) => {
      if (control.type === 'range') control.addEventListener('input', () => { control.nextElementSibling.textContent = `${Math.round(Number(control.value) * 100)}%`; });
      control.addEventListener('change', () => {
        checkpoint(`Changed ${typeLabel(annotation.type)} properties`);
        let value = control.value;
        if (control.type === 'number' || control.type === 'range') value = Number(value);
        if (['required','checked'].includes(control.dataset.prop)) value = value === 'true';
        if (control.dataset.prop === 'style') {
          annotation.bold = value === 'bold'; annotation.italic = value === 'italic';
        } else annotation[control.dataset.prop] = value;
        renderAnnotations();
        renderComments();
        renderThumbnails();
        scheduleLocalSave();
      });
    });
    refs.propertiesForm.querySelector('[data-action="delete"]')?.addEventListener('click', deleteSelected);
    refs.propertiesForm.querySelector('[data-action="duplicate"]')?.addEventListener('click', duplicateSelected);
  }

  function deleteSelected() {
    const index = currentAnnotations().findIndex((annotation) => annotation.id === state.selectedId);
    if (index < 0) return;
    checkpoint(`Deleted ${typeLabel(currentAnnotations()[index].type)}`);
    currentAnnotations().splice(index, 1);
    state.selectedId = null;
    renderAnnotations(); updateProperties(); renderComments(); renderThumbnails(); scheduleLocalSave();
  }

  function duplicateSelected() {
    const annotation = selectedAnnotation();
    if (!annotation) return;
    checkpoint(`Duplicated ${typeLabel(annotation.type)}`);
    const copy = deepClone(annotation);
    copy.id = uid(); copy.x = clamp(copy.x + .03, 0, 1 - copy.w); copy.y = clamp(copy.y + .03, 0, 1 - copy.h);
    currentAnnotations().push(copy); state.selectedId = copy.id;
    renderAnnotations(); updateProperties(); renderComments(); renderThumbnails(); scheduleLocalSave();
  }

  function renderComments() {
    const comments = [];
    state.pages.forEach((page, pageIndex) => page.annotations.filter((a) => a.type === 'note').forEach((annotation) => comments.push({ annotation, pageIndex })));
    refs.commentCount.textContent = comments.length;
    refs.commentEmpty.classList.toggle('hidden', Boolean(comments.length));
    refs.commentList.innerHTML = comments.map(({ annotation, pageIndex }) => `<button type="button" class="comment-card" data-page="${pageIndex}" data-id="${annotation.id}"><strong>${esc(annotation.author || 'You')} · Page ${pageIndex + 1}</strong><p>${esc(annotation.comment || 'Empty comment')}</p></button>`).join('');
    refs.commentList.querySelectorAll('.comment-card').forEach((button) => button.addEventListener('click', async () => {
      await goToPage(Number(button.dataset.page)); state.selectedId = button.dataset.id; renderAnnotations(); updateProperties();
    }));
  }

  async function runSearch() {
    const query = refs.searchInput.value.trim().toLowerCase();
    refs.searchResults.innerHTML = '';
    if (!state.pdf || !query) { refs.searchSummary.textContent = state.pdf ? 'Type a word or phrase to search.' : 'Open a PDF to search its text.'; return; }
    refs.searchSummary.textContent = 'Searching…';
    const results = [];
    for (let pageIndex = 0; pageIndex < state.pages.length; pageIndex += 1) {
      const model = state.pages[pageIndex];
      if (model.synthetic) continue;
      if (!model.textCache) {
        const page = await state.pdf.getPage(model.sourceIndex);
        const content = await page.getTextContent();
        model.textCache = content.items.map((item) => item.str).join(' ');
      }
      const text = model.textCache;
      const lower = text.toLowerCase();
      let position = lower.indexOf(query);
      while (position >= 0 && results.length < 100) {
        results.push({ pageIndex, excerpt: text.slice(Math.max(0, position - 34), Math.min(text.length, position + query.length + 55)) });
        position = lower.indexOf(query, position + query.length);
      }
    }
    refs.searchSummary.textContent = `${results.length} result${results.length === 1 ? '' : 's'} found`;
    refs.searchResults.innerHTML = results.map((result) => `<button class="search-result" type="button" data-page="${result.pageIndex}"><strong>Page ${result.pageIndex + 1}</strong><span>…${esc(result.excerpt)}…</span></button>`).join('');
    refs.searchResults.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => goToPage(Number(button.dataset.page))));
  }

  function rotateCurrent(amount) {
    if (!currentPage()) return;
    checkpoint(amount > 0 ? 'Rotated page right' : 'Rotated page left');
    currentPage().rotation = normalizeRotation((currentPage().rotation || 0) + amount);
    renderAll(); scheduleLocalSave();
  }

  function addBlankPage() {
    if (!state.pages.length) return;
    checkpoint('Added blank page');
    const source = currentPage();
    const page = { id: uid(), sourceIndex: null, synthetic: true, width: source.width, height: source.height, baseRotation: 0, rotation: 0, annotations: [], textCache: '' };
    state.pages.splice(state.currentIndex + 1, 0, page);
    state.currentIndex += 1; state.selectedId = null;
    renderAll(); scheduleLocalSave();
  }

  function duplicatePage() {
    if (!currentPage()) return;
    checkpoint('Duplicated page');
    const copy = deepClone(currentPage()); copy.id = uid(); copy.annotations.forEach((annotation) => { annotation.id = uid(); });
    state.pages.splice(state.currentIndex + 1, 0, copy); state.currentIndex += 1; state.selectedId = null;
    renderAll(); scheduleLocalSave();
  }

  function deletePage() {
    if (state.pages.length <= 1) { toast('A document must keep at least one page.', 'error'); return; }
    checkpoint('Deleted page');
    state.pages.splice(state.currentIndex, 1); state.currentIndex = clamp(state.currentIndex, 0, state.pages.length - 1); state.selectedId = null;
    renderAll(); scheduleLocalSave();
  }

  function setMode(mode) {
    state.mode = mode;
    $$('.mode-tab').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
    $('#primaryTools').classList.toggle('hidden', mode !== 'annotate');
    $('#organizeTools').classList.toggle('hidden', mode !== 'organize');
    $('#formTools').classList.toggle('hidden', mode !== 'forms');
    if (mode !== 'organize') setTool(mode === 'forms' ? 'text-field' : 'select');
    else setTool('select');
  }

  function changeZoom(next) {
    if (!state.pages.length) return;
    state.zoom = clamp(next, .4, 2.5);
    renderCurrentPage();
  }

  function fitPage() {
    const page = currentPage();
    if (!page) return;
    const rotation = displayRotation(page);
    const width = rotation % 180 ? page.height : page.width;
    const height = rotation % 180 ? page.width : page.height;
    const availableWidth = refs.canvasScroll.clientWidth - 100;
    const availableHeight = refs.canvasScroll.clientHeight - 105;
    state.zoom = clamp(Math.min(availableWidth / (width * 1.25), availableHeight / (height * 1.25)), .4, 2.5);
    renderCurrentPage();
  }

  function openSignatureModal() {
    if (!state.pages.length) { toast('Open a PDF first.'); return; }
    refs.signatureModal.classList.remove('hidden');
    resetSignatureCanvas();
    refs.typedSignature.value = '';
    refs.typedPreview.textContent = 'Your signature';
  }

  function closeSignatureModal() { refs.signatureModal.classList.add('hidden'); setTool('select'); }

  function resetSignatureCanvas() {
    const canvas = refs.signatureCanvas;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#20232b'; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round';
  }

  function useSignature() {
    let annotation;
    if (state.signatureMode === 'type') {
      const text = refs.typedSignature.value.trim();
      if (!text) { toast('Type your name to create a signature.', 'error'); return; }
      annotation = { id: uid(), type: 'signature', signatureKind: 'typed', text, x: .32, y: .4, w: .35, h: .09, opacity: 1 };
    } else {
      const context = refs.signatureCanvas.getContext('2d');
      const pixels = context.getImageData(0, 0, refs.signatureCanvas.width, refs.signatureCanvas.height).data;
      if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) { toast('Draw a signature first.', 'error'); return; }
      annotation = { id: uid(), type: 'signature', signatureKind: 'draw', dataUrl: refs.signatureCanvas.toDataURL('image/png'), x: .32, y: .4, w: .35, h: .1, opacity: 1 };
    }
    checkpoint('Added signature');
    currentAnnotations().push(annotation); state.selectedId = annotation.id;
    closeSignatureModal(); renderAnnotations(); updateProperties(); renderThumbnails(); scheduleLocalSave();
  }

  async function addImage(file) {
    if (!file) return;
    try {
      const dataUrl = await imageToPngDataUrl(file);
      checkpoint('Added image');
      const annotation = { id: uid(), type: 'image', dataUrl, x: .3, y: .3, w: .35, h: .24, opacity: 1 };
      currentAnnotations().push(annotation); state.selectedId = annotation.id;
      setTool('select'); renderAnnotations(); updateProperties(); renderThumbnails(); scheduleLocalSave();
    } catch { toast('That image could not be added.', 'error'); }
    refs.imageInput.value = '';
  }

  function imageToPngDataUrl(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        const max = 1800;
        const ratio = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = reject; image.src = url;
    });
  }

  function colorWithAlpha(hex, alpha) {
    const clean = hex.replace('#', '');
    const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function pdfColor(hex) {
    const clean = String(hex || '#000000').replace('#', '');
    const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
    return PDFLib.rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
  }

  function safePdfText(value) {
    return String(value || '').replace(/[^\x20-\x7E\n]/g, '?');
  }

  async function exportPdf() {
    if (!state.rawBytes || !state.pages.length) return null;
    const { PDFDocument, StandardFonts, degrees } = PDFLib;
    const source = await PDFDocument.load(state.rawBytes.slice(0), { ignoreEncryption: true });
    const output = await PDFDocument.create();
    const fonts = {
      regular: await output.embedFont(StandardFonts.Helvetica),
      bold: await output.embedFont(StandardFonts.HelveticaBold),
      italic: await output.embedFont(StandardFonts.TimesRomanItalic)
    };
    const form = output.getForm();
    const usedNames = new Set();

    for (let index = 0; index < state.pages.length; index += 1) {
      const model = state.pages[index];
      let target;
      if (model.synthetic) target = output.addPage([model.width, model.height]);
      else {
        const [copied] = await output.copyPages(source, [model.sourceIndex - 1]);
        target = output.addPage(copied);
      }
      target.setRotation(degrees(displayRotation(model)));
      const pdfjsPage = await getPdfPage(model);
      const viewport = pdfjsPage ? pdfjsPage.getViewport({ scale: 1, rotation: displayRotation(model) }) : syntheticViewport(model);
      for (const annotation of model.annotations) await drawAnnotation(output, target, form, fonts, annotation, viewport, usedNames);
    }
    try { form.updateFieldAppearances(fonts.regular); } catch { /* Some documents contain unsupported inherited fields. */ }
    return output.save();
  }

  function syntheticViewport(model) {
    const rotation = displayRotation(model);
    const width = rotation % 180 ? model.height : model.width;
    const height = rotation % 180 ? model.width : model.height;
    return { width, height, convertToPdfPoint: (x, y) => [x, model.height - y] };
  }

  function annotationGeometry(annotation, viewport) {
    const x1 = annotation.x * viewport.width;
    const y1 = annotation.y * viewport.height;
    const x2 = (annotation.x + annotation.w) * viewport.width;
    const y2 = (annotation.y + annotation.h) * viewport.height;
    const points = [viewport.convertToPdfPoint(x1, y1), viewport.convertToPdfPoint(x2, y1), viewport.convertToPdfPoint(x1, y2), viewport.convertToPdfPoint(x2, y2)];
    const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]);
    const x = Math.min(...xs); const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, displayX: x1, displayY: y1, displayW: x2 - x1, displayH: y2 - y1 };
  }

  async function drawAnnotation(document, page, form, fonts, annotation, viewport, usedNames) {
    const geo = annotationGeometry(annotation, viewport);
    const opacity = annotation.opacity ?? 1;
    if (annotation.type === 'highlight') {
      page.drawRectangle({ x: geo.x, y: geo.y, width: geo.width, height: geo.height, color: pdfColor(annotation.color), opacity });
    } else if (annotation.type === 'redact') {
      page.drawRectangle({ x: geo.x, y: geo.y, width: geo.width, height: geo.height, color: PDFLib.rgb(0.03,0.03,0.03) });
    } else if (annotation.type === 'text') {
      const font = annotation.bold ? fonts.bold : annotation.italic ? fonts.italic : fonts.regular;
      const size = clamp(Number(annotation.fontSize) || 14, 6, 72);
      const lines = safePdfText(annotation.text).split('\n');
      lines.forEach((line, lineIndex) => page.drawText(line.slice(0, 500), { x: geo.x, y: geo.y + geo.height - size * (lineIndex + 1), size, font, color: pdfColor(annotation.color), opacity }));
    } else if (annotation.type === 'shape') {
      const options = { x: geo.x, y: geo.y, width: geo.width, height: geo.height, borderColor: pdfColor(annotation.color), borderWidth: annotation.strokeWidth || 2, opacity };
      if (annotation.fill && annotation.fill !== 'transparent') options.color = pdfColor(annotation.fill);
      if (annotation.shape === 'ellipse') page.drawEllipse({ x: geo.x + geo.width / 2, y: geo.y + geo.height / 2, xScale: geo.width / 2, yScale: geo.height / 2, borderColor: options.borderColor, borderWidth: options.borderWidth, color: options.color, opacity });
      else if (annotation.shape === 'line' || annotation.shape === 'arrow') {
        page.drawLine({ start: { x: geo.x, y: geo.y + geo.height / 2 }, end: { x: geo.x + geo.width, y: geo.y + geo.height / 2 }, thickness: options.borderWidth, color: options.borderColor, opacity });
        if (annotation.shape === 'arrow') {
          const endX = geo.x + geo.width; const endY = geo.y + geo.height / 2;
          page.drawLine({ start: { x: endX - 10, y: endY + 5 }, end: { x: endX, y: endY }, thickness: options.borderWidth, color: options.borderColor });
          page.drawLine({ start: { x: endX - 10, y: endY - 5 }, end: { x: endX, y: endY }, thickness: options.borderWidth, color: options.borderColor });
        }
      } else page.drawRectangle(options);
    } else if (annotation.type === 'ink') {
      const absolute = annotation.points.map((point) => ({ x: (annotation.x + point.x * annotation.w) * viewport.width, y: (annotation.y + point.y * annotation.h) * viewport.height })).map((point) => viewport.convertToPdfPoint(point.x, point.y));
      for (let i = 1; i < absolute.length; i += 1) page.drawLine({ start: { x: absolute[i - 1][0], y: absolute[i - 1][1] }, end: { x: absolute[i][0], y: absolute[i][1] }, thickness: annotation.strokeWidth || 2, color: pdfColor(annotation.color), opacity });
    } else if (annotation.type === 'stamp') {
      page.drawRectangle({ x: geo.x, y: geo.y, width: geo.width, height: geo.height, borderColor: pdfColor(annotation.color), borderWidth: 2, opacity });
      page.drawText(safePdfText(annotation.text), { x: geo.x + 7, y: geo.y + Math.max(4, geo.height / 2 - 6), size: Math.min(annotation.fontSize || 18, geo.height * .55), font: fonts.bold, color: pdfColor(annotation.color), opacity });
    } else if (annotation.type === 'note') {
      page.drawRectangle({ x: geo.x, y: geo.y, width: Math.max(15, geo.width), height: Math.max(15, geo.height), color: PDFLib.rgb(1,.79,.18), borderColor: PDFLib.rgb(.8,.58,.03), borderWidth: 1 });
      page.drawText('N', { x: geo.x + 4, y: geo.y + 4, size: 8, font: fonts.bold, color: PDFLib.rgb(.3,.22,.02) });
    } else if (annotation.type === 'image' || (annotation.type === 'signature' && annotation.signatureKind === 'draw')) {
      const image = await document.embedPng(annotation.dataUrl);
      page.drawImage(image, { x: geo.x, y: geo.y, width: geo.width, height: geo.height, opacity });
    } else if (annotation.type === 'signature') {
      page.drawText(safePdfText(annotation.text), { x: geo.x, y: geo.y + geo.height * .2, size: Math.min(28, geo.height * .7), font: fonts.italic, color: PDFLib.rgb(.08,.08,.1), opacity });
    } else if (['text-field','date-field','signature-field','checkbox','radio'].includes(annotation.type)) {
      let name = safePdfText(annotation.name || `Field_${annotation.id}`);
      while (usedNames.has(name)) name += '_copy';
      usedNames.add(name);
      try {
        if (annotation.type === 'checkbox') {
          const field = form.createCheckBox(name); field.addToPage(page, { x: geo.x, y: geo.y, width: geo.width, height: geo.height, borderWidth: 1 }); if (annotation.checked) field.check();
        } else if (annotation.type === 'radio') {
          const field = form.createRadioGroup(name); field.addOptionToPage('Selected', page, { x: geo.x, y: geo.y, width: geo.width, height: geo.height, borderWidth: 1 }); if (annotation.checked) field.select('Selected');
        } else {
          const field = form.createTextField(name); field.addToPage(page, { x: geo.x, y: geo.y, width: geo.width, height: geo.height, borderWidth: 1, font: fonts.regular }); if (annotation.value) field.setText(safePdfText(annotation.value));
        }
      } catch (error) { console.warn('Skipped form field', name, error); }
    }
  }

  async function performExport(print = false) {
    setBusy(true, print ? 'Preparing print preview…' : 'Exporting your PDF…', `${state.pages.length} page${state.pages.length === 1 ? '' : 's'} · processed locally`);
    try {
      const bytes = await exportPdf();
      if (!bytes) return;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (print) {
        const frame = document.createElement('iframe');
        frame.style.position = 'fixed'; frame.style.width = '1px'; frame.style.height = '1px'; frame.style.opacity = '0'; frame.src = url;
        frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000); };
        document.body.appendChild(frame);
      } else {
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${refs.title.value.trim() || state.fileName.replace(/\.pdf$/i, '')}-edited.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast('Your edited PDF is ready.');
      }
    } catch (error) {
      console.error(error); toast(`Export failed: ${error.message}`, 'error');
    } finally { setBusy(false); }
  }

  function bindSignatureCanvas() {
    const canvas = refs.signatureCanvas;
    let drawing = false;
    const position = (event) => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
    canvas.addEventListener('pointerdown', (event) => { drawing = true; const point = position(event); const context = canvas.getContext('2d'); context.beginPath(); context.moveTo(point.x, point.y); canvas.setPointerCapture?.(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => { if (!drawing) return; const point = position(event); const context = canvas.getContext('2d'); context.lineTo(point.x, point.y); context.stroke(); });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    canvas.addEventListener('pointerleave', () => { drawing = false; });
  }

  refs.openPdfBtn.addEventListener('click', () => refs.fileInput.click());
  refs.fileInput.addEventListener('change', () => loadFile(refs.fileInput.files[0]));
  refs.uploadCard.addEventListener('dragover', (event) => { event.preventDefault(); refs.uploadCard.classList.add('dragover'); });
  refs.uploadCard.addEventListener('dragleave', () => refs.uploadCard.classList.remove('dragover'));
  refs.uploadCard.addEventListener('drop', (event) => { event.preventDefault(); refs.uploadCard.classList.remove('dragover'); loadFile(event.dataTransfer.files[0]); });
  $$('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $$('.mode-tab').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $$('.sidebar-tab').forEach((button) => button.addEventListener('click', () => {
    $$('.sidebar-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    $$('.side-section').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.panel));
  }));
  refs.previousPage.addEventListener('click', () => goToPage(state.currentIndex - 1));
  refs.nextPage.addEventListener('click', () => goToPage(state.currentIndex + 1));
  refs.pageNumber.addEventListener('change', () => goToPage(clamp(Number(refs.pageNumber.value || 1) - 1, 0, state.pages.length - 1)));
  refs.zoomOut.addEventListener('click', () => changeZoom(state.zoom - .1));
  refs.zoomIn.addEventListener('click', () => changeZoom(state.zoom + .1));
  refs.fit.addEventListener('click', fitPage);
  refs.zoomValue.addEventListener('click', () => changeZoom(1));
  refs.undo.addEventListener('click', undo); refs.redo.addEventListener('click', redo);
  refs.download.addEventListener('click', () => performExport(false)); refs.print.addEventListener('click', () => performExport(true));
  $('#rotateLeftBtn').addEventListener('click', () => rotateCurrent(-90)); $('#rotateRightBtn').addEventListener('click', () => rotateCurrent(90));
  $('#addPageBtn').addEventListener('click', addBlankPage); $('#sidebarAddPage').addEventListener('click', addBlankPage); $('#duplicatePageBtn').addEventListener('click', duplicatePage); $('#deletePageBtn').addEventListener('click', deletePage);
  refs.searchInput.addEventListener('input', () => { clearTimeout(runSearch.timer); runSearch.timer = setTimeout(runSearch, 300); });
  $('#closePropertiesBtn').addEventListener('click', () => refs.rightPanel.classList.remove('open'));
  $('#clearHistoryBtn').addEventListener('click', () => { state.activity = []; updateHistory(); });
  refs.title.addEventListener('change', scheduleLocalSave);
  refs.imageInput.addEventListener('change', () => addImage(refs.imageInput.files[0]));
  $('#closeSignatureModal').addEventListener('click', closeSignatureModal); $('#cancelSignatureBtn').addEventListener('click', closeSignatureModal); $('#useSignatureBtn').addEventListener('click', useSignature); $('#clearSignatureBtn').addEventListener('click', resetSignatureCanvas);
  $$('.signature-tabs button').forEach((button) => button.addEventListener('click', () => {
    state.signatureMode = button.dataset.signatureMode;
    $$('.signature-tabs button').forEach((tab) => tab.classList.toggle('active', tab === button));
    $('#drawSignaturePane').classList.toggle('active', state.signatureMode === 'draw'); $('#typeSignaturePane').classList.toggle('active', state.signatureMode === 'type');
  }));
  refs.typedSignature.addEventListener('input', () => { refs.typedPreview.textContent = refs.typedSignature.value || 'Your signature'; });
  refs.signatureModal.addEventListener('click', (event) => { if (event.target === refs.signatureModal) closeSignatureModal(); });
  bindSignatureCanvas();

  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    else if (!typing && (event.key === 'Delete' || event.key === 'Backspace')) deleteSelected();
    else if (!typing && event.key === 'Escape') { state.selectedId = null; setTool('select'); renderAnnotations(); updateProperties(); }
    else if (!typing && event.key === 'ArrowRight') goToPage(state.currentIndex + 1);
    else if (!typing && event.key === 'ArrowLeft') goToPage(state.currentIndex - 1);
  });

  window.addEventListener('beforeunload', scheduleLocalSave);
})();
