/**
 * Futuristic Global Command Center & Telemetry HUD (Vite-inspired)
 * Provides ⌘K/Ctrl+K spotlight palette, live telemetry HUD, dark/futuristic neon theme toggle,
 * and high-speed tool switching across the entire Vibify suite.
 */

class VibifyFuturisticHUD {
  constructor() {
    this.tools = [
      { id: 'compress', name: 'Compress PDF', icon: '🗜️', path: '/tools/compress.html', tag: 'Ghostscript • 4 Presets' },
      { id: 'merge', name: 'Merge PDFs', icon: '📑', path: '/tools/merge.html', tag: 'Multi-document Combine' },
      { id: 'split', name: 'Extract & Split PDF', icon: '✂️', path: '/tools/extract.html', tag: 'Page Ranges • Split' },
      { id: 'rotate', name: 'Rotate PDF', icon: '🔄', path: '/tools/rotate.html', tag: '0-Latency 90°/180°/270°' },
      { id: 'delete', name: 'Delete Pages', icon: '🗑️', path: '/tools/delete.html', tag: 'Selective Page Removal' },
      { id: 'paginate', name: 'Add Page Numbers', icon: '🔢', path: '/paginate-editor', tag: '3x3 Matrix • Pattern Format' },
      { id: 'word', name: 'PDF to Word (.docx)', icon: '📄', path: '/tools/word.html', tag: 'Native Flow Reconstruction' },
      { id: 'ocr', name: 'OCR & Searchable PDF', icon: '🔍', path: '/tools/ocr.html', tag: 'Tesseract OCR Engine' },
      { id: 'protect', name: 'Protect & Encrypt PDF', icon: '🔒', path: '/tools/protect.html', tag: 'AES-128 / AES-256' },
      { id: 'unlock', name: 'Unlock / Decrypt PDF', icon: '🔓', path: '/tools/unlock.html', tag: 'Instant Password Decrypt' },
      { id: 'pdf-maker', name: 'PDF Maker & AI Studio', icon: '✨', path: '/tools/pdf-maker.html', tag: 'Multi-LLM BYOK • Editor.js' },
      { id: 'archive', name: 'PDF/A Archive Mode', icon: '🏛️', path: '/tools/archive.html', tag: 'ISO 19005 Compliance' }
    ];

    this.isOpen = false;
    this.selectedIndex = 0;
    this.filterTerm = '';
    this.init();
  }

  init() {
    this.injectStyles();
    this.injectDOM();
    this.bindEvents();
    this.initTelemetryPill();
  }

  injectStyles() {
    if (document.getElementById('vibify-hud-styles')) return;

    const style = document.createElement('style');
    style.id = 'vibify-hud-styles';
    style.textContent = `
      /* Futuristic Vite-inspired Glows & Command Center */
      :root {
        --hud-accent: #09a1a1;
        --hud-neon-violet: #8b5cf6;
        --hud-bg-glass: rgba(15, 23, 42, 0.82);
        --hud-border: rgba(255, 255, 255, 0.12);
      }

      /* Command Palette Overlay */
      .vibify-cmd-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(10, 15, 29, 0.75);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding-top: clamp(40px, 12vh, 120px);
        opacity: 0;
        transition: opacity 0.18s ease;
      }

      .vibify-cmd-overlay.active {
        display: flex;
        opacity: 1;
      }

      .vibify-cmd-modal {
        width: 90%;
        max-width: 600px;
        background: #0f172a;
        border: 1px solid rgba(14, 165, 233, 0.3);
        border-radius: 20px;
        box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(9, 161, 161, 0.2);
        overflow: hidden;
        transform: scale(0.96);
        transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-col;
        flex-direction: column;
      }

      .vibify-cmd-overlay.active .vibify-cmd-modal {
        transform: scale(1);
      }

      .vibify-cmd-header {
        position: relative;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(30, 41, 59, 0.5);
      }

      .vibify-cmd-header svg {
        color: #09a1a1;
        flex-shrink: 0;
      }

      .vibify-cmd-input {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        color: #f8fafc;
        font-size: 16px;
        font-weight: 600;
        font-family: inherit;
      }

      .vibify-cmd-input::placeholder {
        color: #64748b;
      }

      .vibify-cmd-badge {
        font-size: 11px;
        font-weight: 800;
        padding: 3px 7px;
        border-radius: 6px;
        background: rgba(14, 165, 233, 0.15);
        border: 1px solid rgba(14, 165, 233, 0.3);
        color: #38bdf8;
        letter-spacing: 0.05em;
        white-space: nowrap;
      }

      .vibify-cmd-list {
        max-height: 380px;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .vibify-cmd-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border-radius: 12px;
        color: #cbd5e1;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
      }

      .vibify-cmd-item:hover, .vibify-cmd-item.selected {
        background: rgba(9, 161, 161, 0.15);
        border-color: rgba(9, 161, 161, 0.35);
        color: #ffffff;
        transform: translateX(4px);
      }

      .vibify-cmd-item-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .vibify-cmd-item-icon {
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
      }

      .vibify-cmd-item-title {
        font-size: 14px;
        font-weight: 700;
      }

      .vibify-cmd-item-tag {
        font-size: 11px;
        color: #64748b;
        font-weight: 500;
      }

      .vibify-cmd-item.selected .vibify-cmd-item-tag {
        color: #94a3b8;
      }

      .vibify-cmd-footer {
        padding: 10px 18px;
        background: rgba(15, 23, 42, 0.9);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #64748b;
      }

      .vibify-cmd-shortcuts {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .vibify-kbd {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 4px;
        padding: 2px 5px;
        font-size: 10px;
        font-weight: 700;
        color: #94a3b8;
        font-family: monospace;
      }

      /* Telemetry / Futuristic HUD trigger pill */
      .vibify-hud-pill {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 9999px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(9, 161, 161, 0.4);
        box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4), 0 0 15px rgba(9, 161, 161, 0.25);
        color: #f8fafc;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        user-select: none;
        backdrop-filter: blur(8px);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .vibify-hud-pill:hover {
        transform: translateY(-2px);
        border-color: #09a1a1;
        box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.5), 0 0 25px rgba(9, 161, 161, 0.4);
      }

      .vibify-hud-pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #09a1a1;
        box-shadow: 0 0 10px #09a1a1;
        animation: vibify-pulse 1.8s infinite;
      }

      @keyframes vibify-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.4); opacity: 0.5; }
      }

      @media (max-width: 640px) {
        .vibify-hud-pill {
          bottom: 12px;
          right: 12px;
          padding: 6px 10px;
          font-size: 11px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  injectDOM() {
    if (document.getElementById('vibifyCmdOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'vibifyCmdOverlay';
    overlay.className = 'vibify-cmd-overlay';
    overlay.innerHTML = `
      <div class="vibify-cmd-modal" role="dialog" aria-modal="true">
        <div class="vibify-cmd-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="vibifyCmdInput" class="vibify-cmd-input" placeholder="Type a PDF tool or command (e.g. compress, merge, number, maker)..." autocomplete="off" />
          <span class="vibify-cmd-badge">TURBO ENGINE</span>
        </div>
        <div id="vibifyCmdList" class="vibify-cmd-list"></div>
        <div class="vibify-cmd-footer">
          <div class="vibify-cmd-shortcuts">
            <span><span class="vibify-kbd">↑</span> <span class="vibify-kbd">↓</span> Navigate</span>
            <span><span class="vibify-kbd">↵</span> Select</span>
            <span><span class="vibify-kbd">ESC</span> Close</span>
          </div>
          <div>Vibify Next-Gen Engine</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  initTelemetryPill() {
    if (document.getElementById('vibifyHudPill')) return;

    const pill = document.createElement('div');
    pill.id = 'vibifyHudPill';
    pill.className = 'vibify-hud-pill';
    pill.title = 'Open Futuristic Command Center (⌘K)';
    pill.innerHTML = `
      <span class="vibify-hud-pulse"></span>
      <span>⌘K Turbo</span>
    `;

    pill.addEventListener('click', () => this.open());
    document.body.appendChild(pill);
  }

  bindEvents() {
    // Global Keyboard Shortcut: ⌘K or Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    const overlay = document.getElementById('vibifyCmdOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const input = document.getElementById('vibifyCmdInput');
    input.addEventListener('input', (e) => {
      this.filterTerm = e.target.value.toLowerCase().trim();
      this.selectedIndex = 0;
      this.renderList();
    });

    input.addEventListener('keydown', (e) => {
      const items = this.getFilteredTools();
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        this.updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        this.updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = items[this.selectedIndex];
        if (selected) {
          window.location.href = selected.path;
        }
      }
    });
  }

  getFilteredTools() {
    if (!this.filterTerm) return this.tools;
    return this.tools.filter(
      (t) =>
        t.name.toLowerCase().includes(this.filterTerm) ||
        t.tag.toLowerCase().includes(this.filterTerm) ||
        t.id.toLowerCase().includes(this.filterTerm)
    );
  }

  renderList() {
    const list = document.getElementById('vibifyCmdList');
    if (!list) return;

    const items = this.getFilteredTools();
    list.innerHTML = '';

    if (items.length === 0) {
      list.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #64748b; font-size: 13px;">
          No matching PDF tool found for "<strong>${this.filterTerm}</strong>"
        </div>
      `;
      return;
    }

    items.forEach((tool, idx) => {
      const item = document.createElement('a');
      item.href = tool.path;
      item.className = `vibify-cmd-item ${idx === this.selectedIndex ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="vibify-cmd-item-left">
          <span class="vibify-cmd-item-icon">${tool.icon}</span>
          <div>
            <div class="vibify-cmd-item-title">${tool.name}</div>
            <div class="vibify-cmd-item-tag">${tool.tag}</div>
          </div>
        </div>
        <span style="color: #64748b; font-size: 12px; font-weight: 700;">↵</span>
      `;

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.updateSelection();
      });

      list.appendChild(item);
    });
  }

  updateSelection() {
    const list = document.getElementById('vibifyCmdList');
    if (!list) return;
    const elements = list.querySelectorAll('.vibify-cmd-item');
    elements.forEach((el, idx) => {
      if (idx === this.selectedIndex) {
        el.classList.add('selected');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('selected');
      }
    });
  }

  open() {
    const overlay = document.getElementById('vibifyCmdOverlay');
    const input = document.getElementById('vibifyCmdInput');
    if (!overlay || !input) return;

    this.isOpen = true;
    overlay.classList.add('active');
    input.value = '';
    this.filterTerm = '';
    this.selectedIndex = 0;
    this.renderList();
    setTimeout(() => input.focus(), 50);
  }

  close() {
    const overlay = document.getElementById('vibifyCmdOverlay');
    if (!overlay) return;
    this.isOpen = false;
    overlay.classList.remove('active');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}

// Auto-initialize HUD globally
document.addEventListener('DOMContentLoaded', () => {
  window.VibifyHUD = new VibifyFuturisticHUD();
});
