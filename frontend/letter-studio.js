import { Editor, Extension, Node } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontSize } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import {
  newLetter,
  FIELDS,
  escapeHtml as e,
  documentText,
  pageDimensions,
  nodeHtml,
  missingFields,
  legacyLetter,
  resolveFields,
  PRINT_CSS,
  stationeryHtml,
} from "../public/js/letter-model.js";
import { paginate } from "../public/js/letter-pagination.js";
import { LivePages } from "./letter-live-pages.js";
const $ = (s) => document.querySelector(s);
const printStyle = document.createElement("style");
document.head.append(printStyle);
let config = { signedIn: false },
  letter = newLetter("formal"),
  record = null,
  revision = 0,
  dirty = 0,
  saved = 0,
  saveTimer,
  savePromise,
  conflict = false,
  preview = false,
  aiAbort,
  aiProposal = "",
  aiSnapshot = "",
  aiRange,
  library = [],
  localLibrary = [];
let editingKind = "document",
  selectedDrafts = [];
let activeLibrary = "document",
  libraryRequest = 0;
const key = () => `vibify_letter_studio_${config.userId || "guest"}`;
function notice(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#notice").hidden = true), 5500);
}
async function api(path, options = {}) {
  const response = await fetch("/api/letters" + path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 409) conflict = true;
    throw new Error(data.error || "Unable to complete this request.");
  }
  return data;
}
function dialog(title, markup, submit = "Save") {
  return new Promise((resolve) => {
    const previous = $("#dialog"),
      d = document.createElement("dialog");
    d.id = "dialog";
    if (previous.open) previous.close();
    previous.replaceWith(d);
    d.innerHTML = `<form><h2>${e(title)}</h2>${markup}<div class="modal-actions"><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">${e(submit)}</button></div></form>`;
    d.querySelector("[data-cancel]").onclick = () => d.close();
    d.onclose = () => resolve(null);
    d.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      d.onclose = null;
      d.close();
      resolve(data);
    };
    d.showModal();
  });
}
const layout = Extension.create({
  name: "letterLayout",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (n) => parseFloat(n.style.marginLeft) / 12 || 0,
            renderHTML: (a) => ({
              style: `margin-left:${(Number(a.indent) || 0) * 12}mm`,
            }),
          },
          lineHeight: {
            default: null,
            parseHTML: (n) => parseFloat(n.style.lineHeight) || null,
            renderHTML: (a) =>
              a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {},
          },
          spaceAfter: {
            default: null,
            renderHTML: (a) =>
              a.spaceAfter ? { style: `margin-bottom:${a.spaceAfter}pt` } : {},
          },
        },
      },
    ];
  },
});
const pageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: "div.page-break" }],
  renderHTML: () => ["div", { class: "page-break" }],
});
$("#studio").innerHTML =
  `<header class="top"><a class="brand" href="/">vibify.<small>LETTER STUDIO</small></a><div class="top-actions"><button data-action="library" aria-label="Toggle document library">☰</button><button data-action="assistant">✧ Assistant</button><button data-action="finalize" class="desktop">Mark final</button><button data-action="docx">Word ↓</button><button data-action="pdf" class="primary">Export PDF ↓</button><a id="account" class="avatar" href="/login" aria-label="Sign in">↗</a></div></header>
<div class="workspace"><aside class="left"><span class="eyebrow">Your workspace</span><h2>Good words. Clear intent.</h2><button class="primary" data-action="new">＋ New letter</button><nav><button data-kind="document" class="active">Documents <span>01</span></button><button data-kind="template">Templates <span>↗</span></button><button data-kind="stationery">Stationery <span>↗</span></button><button data-kind="correspondence">Correspondence <span>↗</span></button></nav><div id="library"></div><div class="left-bottom"><span id="privacy">Your browser, your drafts.</span><a href="/tools/pdf-maker/legacy">Open original PDF Maker</a><a href="https://github.com/nishanthk19/pdf-compressor">Source · AGPL-3.0</a></div></aside>
<main class="center"><div class="document-bar"><div><input id="title" class="title" aria-label="Document title" value="Formal letter"><span id="saveState" class="save-state">Draft · Saved on this device</span></div><div class="doc-tools"><button data-action="fields">Letter fields</button><button data-action="page">Page setup</button><button data-action="preview" id="previewButton">Print preview</button><button data-action="more" aria-label="More document actions">•••</button></div></div>
<div class="ribbon" role="toolbar" aria-label="Document formatting"><select id="style" aria-label="Paragraph style"><option value="0">Normal text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select><select id="font" aria-label="Font family">${["Arial", "Times New Roman", "Georgia", "Courier New", "Calibri"].map((f) => `<option>${f}</option>`).join("")}</select><select id="fontSize" aria-label="Font size">${[9, 10, 11, 12, 14, 16, 18, 20, 24, 32, 48].map((n) => `<option ${n === 11 ? "selected" : ""}>${n}</option>`).join("")}</select><span class="divider"></span><button data-command="toggleBold" aria-label="Bold"><b>B</b></button><button data-command="toggleItalic" aria-label="Italic"><i>I</i></button><button data-command="toggleUnderline" aria-label="Underline"><u>U</u></button><button data-command="toggleStrike" aria-label="Strikethrough"><s>S</s></button><input id="color" type="color" value="#17222e" aria-label="Text color"><span class="divider"></span>${["left", "center", "right", "justify"].map((align, i) => `<button data-align="${align}" aria-label="Align ${align}">${["☰", "≡", "☷", "▤"][i]}</button>`).join("")}<button data-command="toggleBulletList" aria-label="Bullet list">• ≡</button><button data-command="toggleOrderedList" aria-label="Numbered list">1. ≡</button><button data-action="indent" aria-label="Increase indent">→|</button><button data-action="outdent" aria-label="Decrease indent">|←</button><button data-action="spacing">Spacing</button><span class="divider"></span><button data-action="table">Table</button><button data-action="image">Image</button><button data-action="link">Link</button><button data-action="break">Page break</button><button data-action="find">Find</button><button data-command="undo" aria-label="Undo">↶</button><button data-command="redo" aria-label="Redo">↷</button></div>
<div class="ruler" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<span>${i * 2}</span>`).join("")}</div><div class="canvas"><article class="paper" id="paper"><div class="paper-header" id="letterhead"></div><div id="editor"></div><img id="signature" class="paper-signature" alt="Signature" hidden><div class="paper-footer" id="letterfooter"></div></article><div id="printPreview" hidden></div></div><footer class="bottom"><span id="metrics">0 words</span><span id="pageMetrics">A4 · Portrait</span><span>English · Private workspace</span></footer></main>
<aside class="right"><div class="assistant-title"><span class="spark">✧</span><h2>Writing assistant</h2></div><p>A thoughtful first draft. A sharper final word.</p><span class="status-pill" id="aiStatus">Checking local AI…</span><label>What would you like to write?<textarea id="prompt" placeholder="Draft a reply confirming receipt and requesting the missing enclosures…"></textarea></label><div class="ai-chips"><button data-ai="draft">Draft letter</button><button data-ai="reply">Draft reply</button><button data-ai="formalize">Formalize</button><button data-ai="shorten">Shorten</button><button data-ai="summarize">Summarize</button></div><label>Writing tone<select id="tone"><option>Professional</option><option>Formal</option><option>Firm and courteous</option><option>Warm</option><option>Concise</option></select></label><button class="primary" data-action="generate" id="generate">✧ Create suggestion</button><button data-action="cancelAI" hidden id="cancelAI">Cancel generation</button><div id="aiResult" class="ai-result" aria-live="polite"></div><div class="ai-actions" id="aiActions" hidden><button data-action="acceptAI" class="primary">Accept suggestion</button><button data-action="rejectAI">Discard</button></div><div id="aiSources"></div><section class="memory-box"><h3>Correspondence memory</h3><p>Find a previous letter and use it as context. Sources stay visible beside every suggestion.</p><input id="memoryQuery" aria-label="Search correspondence" placeholder="Search your letters…"><div id="memorySources"></div><button data-action="import">＋ Import correspondence</button><button data-action="contextDrafts">Choose draft context</button><small id="draftContext">No other drafts selected</small></section></aside></div>`;
const editor = new Editor({
  element: $("#editor"),
  extensions: [
    StarterKit.configure({
      codeBlock: false,
      code: false,
      link: { openOnClick: false, protocols: ["http", "https"] },
    }),
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    TextAlign.configure({ types: ["paragraph", "heading"] }),
    Image.configure({
      allowBase64: true,
      resize: {
        enabled: true,
        directions: ["bottom-right", "bottom-left"],
        alwaysPreserveAspectRatio: true,
      },
    }),
    TableKit.configure({ table: { resizable: true } }),
    layout,
    pageBreak,
    LivePages.configure({
      getLetter: () => letter,
      onPages: (pages) => {
        const s = letter.stationery;
        $("#letterfooter").textContent =
          resolveFields(
            pages === 1 && s.differentFirst ? s.firstFooter : s.footer,
            letter.fields,
          ) + (s.pageNumbers ? "\nPage " + pages : "");
        if (!preview)
          $("#pageMetrics").textContent =
            pages +
            " page(s) · " +
            letter.page.size +
            " · " +
            letter.page.orientation;
      },
    }),
  ],
  content: letter.content,
  editorProps: {
    attributes: {
      "aria-label": "Letter document",
      role: "textbox",
      "aria-multiline": "true",
    },
  },
  onUpdate: () => changed(),
  onSelectionUpdate: () => {
    for (const b of document.querySelectorAll("[data-command]")) {
      const type = b.dataset.command
        .replace("toggle", "")
        .replace(/^./, (c) => c.toLowerCase());
      b.setAttribute("aria-pressed", String(editor.isActive(type)));
    }
  },
});
function snapshot() {
  return { ...letter, title: $("#title").value, content: editor.getJSON() };
}
function cache() {
  try {
    localStorage.setItem(
      key(),
      JSON.stringify({
        letter: snapshot(),
        record,
        revision,
        editingKind,
        dirty: dirty > saved,
        conflict,
      }),
    );
  } catch {
    notice("Device storage is full. Export a copy before leaving.");
  }
}
function changed() {
  dirty++;
  cache();
  $("#saveState").textContent = config.signedIn
    ? "Unsaved changes…"
    : "Draft · Saved on this device";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => save().catch((err) => notice(err.message)),
    1200,
  );
  metrics();
}
function metrics() {
  $("#metrics").textContent =
    `${documentText(snapshot()).split(/\s+/).filter(Boolean).length} words · ${letter.status === "final" ? "Final" : "Draft"}`;
}
function apply(data, { id = null, rev = 0 } = {}) {
  editingKind = "document";
  letter = structuredClone(data);
  record = id;
  revision = rev;
  dirty = 0;
  saved = 0;
  conflict = false;
  $("#title").value = letter.title;
  editor.commands.setContent(letter.content, { emitUpdate: false });
  preview = false;
  $("#paper").hidden = false;
  $("#printPreview").hidden = true;
  $("#previewButton").textContent = "Print preview";
  selectedDrafts = [];
  $("#draftContext").textContent = "No other drafts selected";
  paint();
  cache();
}
function paint() {
  const [w, h] = pageDimensions(letter.page);
  printStyle.textContent = `@scope (#printPreview) { ${PRINT_CSS} } @scope (.tiptap) { ${PRINT_CSS} } @media print { @page {size:${w}mm ${h}mm;margin:0} .printed-page:last-child{break-after:auto} }`;
  $("#paper").style.cssText =
    `--letter-margin:${letter.page.margin}mm;width:${w}mm;min-height:${h}mm;padding:${letter.page.margin}mm;font-family:"${letter.page.font}";font-size:${letter.page.fontSize}pt;line-height:${letter.page.lineHeight}`;
  const s = letter.stationery;
  $("#letterhead").replaceChildren();
  if (s.logo) {
    const img = document.createElement("img");
    img.src = s.logo;
    $("#letterhead").append(img);
  }
  $("#letterhead").append(
    document.createTextNode(
      resolveFields(s.differentFirst ? s.firstHeader : s.header, letter.fields),
    ),
  );
  $("#letterfooter").textContent =
    (s.differentFirst ? s.firstFooter : s.footer) +
    (s.pageNumbers ? "\nPage 1" : "");
  $("#signature").hidden = !s.signature;
  if (s.signature) $("#signature").src = s.signature;
  $("#pageMetrics").textContent =
    `${letter.page.size} · ${letter.page.orientation} · ${letter.page.margin} mm margins`;
  metrics();
  editor.commands.refreshLetterPages();
}
async function save() {
  if (!config.signedIn) {
    if (!record) record = crypto.randomUUID();
    const d = {
      id: record,
      kind: editingKind,
      title: $("#title").value,
      data: snapshot(),
      updatedAt: new Date().toISOString(),
    };
    const i = localLibrary.findIndex((x) => x.id === record);
    if (i < 0) localLibrary.push(d);
    else localLibrary[i] = d;
    localStorage.setItem(key() + "_library", JSON.stringify(localLibrary));
    saved = dirty;
    cache();
    await refreshLibrary();
    return;
  }
  if (savePromise) {
    await savePromise;
    if (dirty > saved && !conflict) return save();
    return;
  }
  if (conflict)
    throw new Error(
      "Save paused: a newer server revision exists. Use More → Resolve save conflict.",
    );
  const generation = dirty,
    data = snapshot();
  savePromise = (async () => {
    const result = record
      ? await api("/documents/" + record, {
          method: "PUT",
          body: JSON.stringify({ data, revision }),
        })
      : await api("/documents", {
          method: "POST",
          body: JSON.stringify({ data, kind: editingKind }),
        });
    record = result.id;
    revision = result.revision;
    saved = generation;
    $("#saveState").textContent =
      `${data.status === "final" ? "Final" : "Draft"} · Saved · Revision ${revision}`;
    cache();
  })();
  try {
    await savePromise;
  } catch (err) {
    $("#saveState").textContent = conflict
      ? "Save conflict · Local changes preserved"
      : "Not saved to server · Local copy preserved";
    cache();
    throw err;
  } finally {
    savePromise = null;
  }
}
async function leaveCurrent() {
  clearTimeout(saveTimer);
  if (config.signedIn && dirty > saved) await save();
  else if (dirty > saved) await save();
  else cache();
}
async function refreshLibrary(kind = activeLibrary) {
  activeLibrary = kind;
  const request = ++libraryRequest;
  document
    .querySelectorAll("[data-kind]")
    .forEach((b) => b.classList.toggle("active", b.dataset.kind === kind));
  if (kind === "correspondence") {
    if (!config.signedIn) {
      $("#library").innerHTML =
        '<p class="notice">Sign in to build a private correspondence archive.</p>';
      return;
    }
    const rows = await api("/correspondence");
    if (request !== libraryRequest) return;
    $("#library").replaceChildren();
    for (const row of rows) {
      const box = document.createElement("div");
      box.className = "library-card";
      const b = document.createElement("button");
      b.textContent = row.title;
      b.onclick = () => viewSource(row.id);
      const small = document.createElement("small");
      small.textContent = `${row.state}${row.included ? "" : " · Excluded"}`;
      box.append(b, small);
      $("#library").append(box);
    }
    return;
  }
  library = config.signedIn ? await api("/documents") : localLibrary;
  if (request !== libraryRequest) return;
  $('[data-kind="document"] span').textContent = String(
    library.filter((d) => d.kind === "document").length,
  ).padStart(2, "0");
  $("#library").replaceChildren();
  if (kind === "template") {
    const b = document.createElement("button");
    b.textContent = "Browse starter templates";
    b.onclick = () => actions.new();
    $("#library").append(b);
  }
  if (kind === "stationery") {
    const b = document.createElement("button");
    b.textContent = "Design stationery";
    b.onclick = () => actions.stationery();
    $("#library").append(b);
  }
  for (const d of library.filter((d) => d.kind === kind)) {
    const box = document.createElement("div");
    box.className = "library-card";
    const b = document.createElement("button");
    b.textContent = d.title;
    b.onclick = async () => {
      try {
        await leaveCurrent();
        const item = config.signedIn ? await api("/documents/" + d.id) : d;
        if (item.kind === "stationery") {
          letter.stationery = structuredClone(item.data.stationery);
          letter.page = structuredClone(item.data.page);
          paint();
          changed();
          notice("Stationery applied to your current letter.");
        } else {
          apply(item.data, {
            id: item.kind === "document" ? item.id : null,
            rev: item.revision,
          });
          if (item.kind === "template") changed();
        }
      } catch (err) {
        notice(err.message);
      }
    };
    const small = document.createElement("small");
    small.textContent = `${kind} · ${new Date(d.updatedAt || Date.now()).toLocaleDateString()}`;
    const manage = document.createElement("button");
    manage.textContent = "Manage";
    manage.style.cssText = "margin-top:8px;font-size:10px;color:#61705d";
    manage.onclick = () =>
      manageLibrary(d.id).catch((err) => notice(err.message));
    box.append(b, small, manage);
    $("#library").append(box);
  }
}
async function uploadImage() {
  const f = await chooseFile("image/png,image/jpeg");
  if (!f) return null;
  if (f.size > 900000)
    throw new Error("Choose a PNG or JPEG smaller than 900 KB.");
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(r.result);
    r.readAsDataURL(f);
  });
}
function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
let aiAction = "draft";
const actions = {
  library: () => $(".left").classList.toggle("open"),
  assistant: () => $(".right").classList.toggle("open"),
  async new() {
    const d = $("#dialog");
    d.innerHTML = `<h2>Begin with a little structure.</h2><p>Choose a starting point. Every detail is yours to change.</p><div class="template-grid">${["blank", "formal", "request", "reply", "reminder", "notice", "covering"].map((k) => `<button data-template="${k}"><strong>${k[0].toUpperCase() + k.slice(1)}</strong><small>${{ blank: "A clean page for your ideas.", formal: "Clear, professional correspondence.", request: "Make a well-structured request.", reply: "Respond with context and clarity.", reminder: "A courteous follow-up.", notice: "Communicate an official update.", covering: "Introduce enclosed documents." }[k]}</small></button>`).join("")}</div><div class="modal-actions"><button data-close>Cancel</button></div>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    d.querySelectorAll("[data-template]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await leaveCurrent();
            apply(newLetter(b.dataset.template));
            changed();
            d.close();
          } catch (err) {
            notice(err.message);
          }
        }),
    );
    d.showModal();
  },
  async fields() {
    const missing = missingFields(snapshot());
    const data = await dialog(
      "Letter details",
      `<p>Use {{field}} anywhere in the letter. Fields are filled when you preview or export.</p><div class="field-grid">${FIELDS.map((k) => `<label>${k[0].toUpperCase() + k.slice(1)}${letter.required.includes(k) ? " *" : ""}${["address", "enclosures"].includes(k) ? `<textarea name="${k}" class="${missing.includes(k) ? "required-missing" : ""}">${e(letter.fields[k])}</textarea>` : `<input name="${k}" value="${e(letter.fields[k])}" class="${missing.includes(k) ? "required-missing" : ""}">`}</label>`).join("")}</div>`,
    );
    if (data) {
      letter.fields = data;
      changed();
    }
  },
  async page() {
    const p = letter.page;
    const data = await dialog(
      "Page setup",
      `<div class="field-grid"><label>Paper<select name="size"><option ${p.size === "A4" ? "selected" : ""}>A4</option><option ${p.size === "Letter" ? "selected" : ""}>Letter</option></select></label><label>Orientation<select name="orientation"><option ${p.orientation === "portrait" ? "selected" : ""}>portrait</option><option ${p.orientation === "landscape" ? "selected" : ""}>landscape</option></select></label><label>Margins (mm)<input name="margin" type="number" min="12" max="40" value="${p.margin}" required></label><label>Body size (pt)<input name="fontSize" type="number" min="8" max="24" value="${p.fontSize}" required></label><label>Body font<select name="font">${["Arial", "Times New Roman", "Georgia", "Courier New", "Calibri"].map((f) => `<option ${f === p.font ? "selected" : ""}>${f}</option>`).join("")}</select></label><label>Line spacing<input name="lineHeight" type="number" step="0.1" min="1" max="2.5" value="${p.lineHeight}" required></label></div>`,
    );
    if (data) {
      letter.page = {
        ...data,
        margin: +data.margin,
        fontSize: +data.fontSize,
        lineHeight: +data.lineHeight,
      };
      paint();
      changed();
    }
  },
  async stationery() {
    const s = letter.stationery;
    const data = await dialog(
      "Your letterhead & footer",
      `<p>Short stationery text leaves more room for your letter. Preview checks the layout before export.</p><div class="field-grid"><label>Letterhead<textarea name="header">${e(s.header)}</textarea></label><label>Footer<textarea name="footer">${e(s.footer)}</textarea></label><label><span><input name="differentFirst" type="checkbox" ${s.differentFirst ? "checked" : ""}> Different first page</span></label><label><span><input name="pageNumbers" type="checkbox" ${s.pageNumbers ? "checked" : ""}> Page numbers</span></label><label><span><input name="removeLogo" type="checkbox"> Remove logo</span></label><label><span><input name="removeSignature" type="checkbox"> Remove signature image</span></label><label>First-page letterhead<textarea name="firstHeader">${e(s.firstHeader)}</textarea></label><label>First-page footer<textarea name="firstFooter">${e(s.firstFooter)}</textarea></label></div>`,
    );
    if (data) {
      letter.stationery = {
        ...s,
        ...data,
        logo: data.removeLogo ? "" : s.logo,
        signature: data.removeSignature ? "" : s.signature,
        differentFirst: !!data.differentFirst,
        pageNumbers: !!data.pageNumbers,
      };
      paint();
      changed();
    }
  },
  async logo() {
    const src = await uploadImage();
    if (src) {
      letter.stationery.logo = src;
      paint();
      changed();
    }
  },
  async signature() {
    const src = await uploadImage();
    if (src) {
      letter.stationery.signature = src;
      paint();
      changed();
    }
  },
  async spacing() {
    const data = await dialog(
      "Paragraph spacing",
      '<div class="field-grid"><label>Line spacing<input name="lineHeight" type="number" min="1" max="2.5" step="0.1" value="1.5"></label><label>Space after (pt)<input name="spaceAfter" type="number" min="0" max="36" value="9"></label></div>',
    );
    if (data)
      editor
        .chain()
        .focus()
        .updateAttributes("paragraph", {
          lineHeight: +data.lineHeight,
          spaceAfter: +data.spaceAfter,
        })
        .run();
  },
  indent: () =>
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", {
        indent: Math.min(
          4,
          (editor.getAttributes("paragraph").indent || 0) + 1,
        ),
      })
      .run(),
  outdent: () =>
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", {
        indent: Math.max(
          0,
          (editor.getAttributes("paragraph").indent || 0) - 1,
        ),
      })
      .run(),
  async table() {
    if (editor.isActive("table")) {
      const data = await dialog(
        "Edit table",
        '<label>Action<select name="command"><option value="addRowAfter">Add row below</option><option value="addColumnAfter">Add column after</option><option value="deleteRow">Delete row</option><option value="deleteColumn">Delete column</option><option value="mergeCells">Merge selected cells</option><option value="splitCell">Split cell</option><option value="deleteTable">Delete table</option></select></label>',
        "Apply",
      );
      if (data) editor.chain().focus()[data.command]().run();
    } else
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
        .run();
  },
  async image() {
    const src = await uploadImage();
    if (src)
      editor.chain().focus().setImage({ src, alt: "Letter image" }).run();
  },
  async link() {
    const data = await dialog(
      "Insert link",
      '<label>Web address<input name="url" type="url" placeholder="https://example.com" required></label>',
    );
    if (data && /^https?:\/\//.test(data.url))
      editor.chain().focus().setLink({ href: data.url }).run();
  },
  break: () =>
    editor.chain().focus().insertContent({ type: "pageBreak" }).run(),
  async find() {
    const data = await dialog(
      "Find & replace",
      '<div class="field-grid"><label>Find<input name="find" required></label><label>Replace with<input name="replacement"></label><label><span><input type="checkbox" name="all"> Replace all</span></label></div>',
      "Replace",
    );
    if (!data) return;
    const matches = [];
    editor.state.doc.descendants((n, pos) => {
      if (n.isText) {
        let start = 0,
          index;
        while ((index = n.text.indexOf(data.find, start)) >= 0) {
          matches.push({
            from: pos + index,
            to: pos + index + data.find.length,
          });
          start = index + data.find.length;
        }
      }
    });
    const use = data.all ? matches : matches.slice(0, 1);
    let tr = editor.state.tr;
    for (const m of use.reverse())
      tr = data.replacement
        ? tr.insertText(data.replacement, m.from, m.to)
        : tr.delete(m.from, m.to);
    editor.view.dispatch(tr);
    notice(`${use.length} replacement${use.length === 1 ? "" : "s"} made.`);
  },
  async preview() {
    if (preview) {
      preview = false;
      $("#paper").hidden = false;
      $("#printPreview").hidden = true;
      $("#previewButton").textContent = "Print preview";
      return;
    }
    const l = snapshot(),
      [width, height] = pageDimensions(l.page),
      s = l.stationery,
      root = $("#printPreview");
    root.innerHTML = nodeHtml(l.content, l.fields);
    root.replaceChildren(...root.firstChild.children);
    if (s.signature) {
      const img = document.createElement("img");
      img.src = s.signature;
      img.className = "signature";
      root.append(img);
    }
    root.style.cssText = `font-family:"${l.page.font}";font-size:${l.page.fontSize}pt;line-height:${l.page.lineHeight}`;
    root.hidden = false;
    await Promise.all(
      [...root.querySelectorAll("img")].map((i) => i.decode().catch(() => {})),
    );
    const count = paginate(root, {
      width,
      height,
      margin: l.page.margin,
      headerHtml: (i) => stationeryHtml(l, i),
      footerHtml: (i) => stationeryHtml(l, i, true),
    });
    preview = true;
    $("#paper").hidden = true;
    $("#previewButton").textContent = "Back to editing";
    $("#pageMetrics").textContent =
      `${count} pages · ${l.page.size} · Print preview`;
  },
  pdf: () => download("pdf"),
  docx: () => download("docx"),
  async finalize() {
    if (editingKind !== "document") {
      notice(
        "Templates and stationery are reusable designs. Open a letter to finalize correspondence.",
      );
      return;
    }
    if (missingFields(snapshot()).length) {
      notice("Complete the letter fields before marking final.");
      await actions.fields();
      return;
    }
    if (!config.signedIn) {
      notice("Sign in to finalize and index correspondence.");
      return;
    }
    letter.status = "final";
    changed();
    await save();
    notice("Final letter saved. Private memory indexing is queued.");
  },
  async reopen() {
    letter.status = "draft";
    changed();
    await save();
    notice("Reopened as draft. It is no longer searched automatically.");
  },
  async more() {
    const data = await dialog(
      "Document actions",
      `<label>Action<select name="action"><option value="stationery">Edit letterhead & footer</option><option value="logo">Upload logo</option><option value="signature">Upload signature</option><option value="template">Save as template</option><option value="saveStationery">Save as stationery</option><option value="duplicate">Save a separate copy</option><option value="history">Version history</option><option value="reopen">Reopen as draft</option><option value="recover">Resolve save conflict</option><option value="legacy">Import original Maker draft</option><option value="guestImport">Import guest draft</option><option value="json">Download editable backup</option><option value="delete">Delete this saved letter</option></select></label>`,
      "Continue",
    );
    if (data) await actions[data.action]();
  },
  async template() {
    await saveCollection("template");
  },
  async saveStationery() {
    await saveCollection("stationery");
  },
  async duplicate() {
    await leaveCurrent();
    record = null;
    revision = 0;
    letter.title = $("#title").value + " (copy)";
    $("#title").value = letter.title;
    conflict = false;
    changed();
    await save();
  },
  async recover() {
    if (!record) return;
    const data = await dialog(
      "Resolve save conflict",
      '<p>Your local draft is preserved. Choose whether to open the latest server revision or keep your edits as a separate document.</p><label>Resolution<select name="choice"><option value="copy">Save local edits as a separate document</option><option value="server">Open latest server revision</option></select></label>',
      "Resolve",
    );
    if (!data) return;
    if (data.choice === "copy") {
      record = null;
      revision = 0;
      conflict = false;
      dirty++;
      await save();
    } else {
      const d = await api("/documents/" + record);
      apply(d.data, { id: d.id, rev: d.revision });
    }
  },
  async history() {
    if (!config.signedIn) {
      notice("Sign in for server revision history.");
      return;
    }
    if (!record) {
      notice("Save a letter to start its version history.");
      return;
    }
    const rows = await api("/documents/" + record + "/revisions");
    const d = $("#dialog");
    d.innerHTML =
      "<h2>Version history</h2><p>Restoring creates a new revision and preserves the history.</p>";
    for (const row of rows) {
      const line = document.createElement("div");
      line.className = "history-row";
      const label = document.createElement("span");
      label.textContent = `Revision ${row.revision} · ${new Date(row.createdAt).toLocaleString()}`;
      const b = document.createElement("button");
      b.textContent = "Preview";
      b.onclick = async () => {
        const version = await api(
          "/documents/" + record + "/revisions/" + row.revision,
        );
        const result = await dialog(
          `Revision ${row.revision}`,
          `<pre style="white-space:pre-wrap">${e(documentText(version.data).slice(0, 12000))}</pre>`,
          "Restore as new revision",
        );
        if (result) {
          letter = version.data;
          editor.commands.setContent(letter.content, { emitUpdate: false });
          $("#title").value = letter.title;
          paint();
          changed();
        }
      };
      line.append(label, b);
      d.append(line);
    }
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => d.close();
    d.append(close);
    d.showModal();
  },
  async legacy() {
    const raw =
      localStorage.getItem("vibify_pdf_maker_draft") ||
      localStorage.getItem("vibify_pdf_maker_saved_doc");
    if (!raw) {
      notice("No original Maker draft was found in this browser.");
      return;
    }
    const draft = legacyLetter(raw);
    const result = await dialog(
      "Preview recovered draft",
      `<p>The original stays in browser storage. Review this recovered text before importing; unsupported legacy blocks are shown as text.</p><pre style="white-space:pre-wrap">${e(documentText(draft).slice(0, 12000))}</pre>`,
      "Import as new letter",
    );
    if (result) {
      await leaveCurrent();
      apply(draft);
      changed();
    }
  },
  async guestImport() {
    const cached = JSON.parse(
      localStorage.getItem("vibify_letter_studio_guest") || "null",
    );
    if (!cached?.letter) {
      notice("No guest draft is available on this device.");
      return;
    }
    const confirmed = await dialog(
      "Preview guest draft",
      `<p>The original guest draft will be kept.</p><pre style="white-space:pre-wrap">${e(documentText(cached.letter).slice(0, 12000))}</pre>`,
      "Import as new document",
    );
    if (confirmed) {
      await leaveCurrent();
      apply(cached.letter);
      changed();
    }
  },
  json() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "letter-backup.json");
  },
  async delete() {
    if (!record) return;
    const result = await dialog(
      "Delete saved letter",
      "<p>This removes this letter and its revisions from your library and private memory. Download a backup first if you need a copy.</p>",
      "Delete letter",
    );
    if (result) {
      if (config.signedIn)
        await api("/documents/" + record, { method: "DELETE" });
      else {
        localLibrary = localLibrary.filter((d) => d.id !== record);
        localStorage.setItem(key() + "_library", JSON.stringify(localLibrary));
      }
      apply(newLetter("blank"));
      await refreshLibrary();
    }
  },
  async import() {
    if (!config.signedIn) {
      notice("Sign in to import correspondence.");
      return;
    }
    const file = await chooseFile(".pdf,.docx");
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/letters/correspondence", {
      method: "POST",
      body: form,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    notice(
      "Uploaded. Local extraction is queued; review the text when it is ready.",
    );
    await refreshLibrary("correspondence");
  },
  async contextDrafts() {
    if (!config.signedIn) {
      notice("Sign in to select saved drafts.");
      return;
    }
    const docs = (await api("/documents")).filter((d) => d.kind === "document");
    const data = await dialog(
      "Explicit draft context",
      `<p>Only the checked documents are shared with the assistant for your next request. Drafts are not searched automatically.</p>${docs.map((d) => `<label><span><input type="checkbox" name="draft_${e(d.id)}" ${selectedDrafts.includes(d.id) ? "checked" : ""}> ${e(d.title)}</span></label>`).join("")}`,
      "Use selected drafts",
    );
    if (data) {
      selectedDrafts = Object.keys(data)
        .filter((k) => k.startsWith("draft_"))
        .map((k) => k.slice(6))
        .slice(0, 3);
      $("#draftContext").textContent =
        selectedDrafts.length + " draft(s) explicitly selected";
    }
  },
  generate: () => generateAI(),
  cancelAI: () => aiAbort?.abort(),
  acceptAI() {
    if (!aiProposal) return;
    if (JSON.stringify(editor.getJSON()) !== aiSnapshot) {
      notice(
        "The document changed. Generate a new suggestion before applying it.",
      );
      return;
    }
    const content = aiProposal
      .split(/\n+/)
      .filter(Boolean)
      .map((t) => ({
        type: "paragraph",
        content: [{ type: "text", text: t }],
      }));
    // Keep acceptance separate from nearby typing and document loading.
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.chain().focus().insertContentAt(aiRange, content).run();
    editor.view.dispatch(closeHistory(editor.state.tr));
    aiProposal = "";
    $("#aiActions").hidden = true;
    notice("Suggestion applied. Undo restores your previous text.");
  },
  rejectAI() {
    aiProposal = "";
    $("#aiResult").textContent = "";
    $("#aiSources").replaceChildren();
    $("#aiActions").hidden = true;
  },
};
async function saveCollection(kind) {
  const data = await dialog(
    kind === "template" ? "Save reusable template" : "Save reusable stationery",
    '<label>Name<input name="name" required maxlength="150"></label>',
  );
  if (!data) return;
  const content = snapshot();
  content.status = "draft";
  content.title = data.name;
  if (kind === "stationery") {
    content.content = { type: "doc", content: [{ type: "paragraph" }] };
    content.required = [];
  }
  if (config.signedIn)
    await api("/documents", {
      method: "POST",
      body: JSON.stringify({ kind, data: content }),
    });
  else {
    localLibrary.push({
      id: crypto.randomUUID(),
      kind,
      title: content.title,
      data: content,
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(key() + "_library", JSON.stringify(localLibrary));
  }
  await refreshLibrary(kind);
  notice("Saved to your library.");
}
async function manageLibrary(id) {
  const item = config.signedIn
    ? await api("/documents/" + id)
    : localLibrary.find((d) => d.id === id);
  if (!item) return;
  const choice = await dialog(
    "Manage " + item.kind,
    `<label>Name<input name="name" maxlength="150" required value="${e(item.title)}"></label><label>Action<select name="action"><option value="rename">Rename</option><option value="duplicate">Duplicate</option><option value="edit">Edit contents</option><option value="delete">Delete permanently</option></select></label>`,
    "Continue",
  );
  if (!choice) return;
  if (choice.action === "edit") {
    await leaveCurrent();
    apply(item.data, { id: item.id, rev: item.revision });
    editingKind = item.kind;
    notice("Editing " + item.kind + ". Changes will update this library item.");
    return;
  }
  if (choice.action === "delete") {
    if (
      !(await dialog(
        "Delete library item",
        "<p>Delete this item and its revision history? Download a backup first if needed.</p>",
        "Delete",
      ))
    )
      return;
    if (config.signedIn) await api("/documents/" + id, { method: "DELETE" });
    else localLibrary = localLibrary.filter((d) => d.id !== id);
  } else {
    item.data.title = choice.name;
    let updated;
    if (config.signedIn)
      updated = await api(
        choice.action === "duplicate" ? "/documents" : "/documents/" + id,
        {
          method: choice.action === "duplicate" ? "POST" : "PUT",
          body: JSON.stringify({
            data: item.data,
            kind: item.kind,
            revision: item.revision,
          }),
        },
      );
    else if (choice.action === "duplicate")
      localLibrary.push({
        ...item,
        id: crypto.randomUUID(),
        title: choice.name,
      });
    else item.title = choice.name;
    if (choice.action === "rename" && record === id) {
      revision = updated?.revision || revision;
      letter.title = choice.name;
      $("#title").value = choice.name;
      cache();
    }
  }
  if (!config.signedIn)
    localStorage.setItem(key() + "_library", JSON.stringify(localLibrary));
  await refreshLibrary();
  if (config.signedIn && localStorage.getItem("vibify_letter_studio_guest"))
    notice(
      "A guest draft is available. More → Import guest draft lets you preview and save it to this account.",
    );
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function download(format) {
  if (missingFields(snapshot()).length) {
    notice("Complete all highlighted letter fields before export.");
    await actions.fields();
    return;
  }
  await leaveCurrent();
  notice(`Preparing ${format.toUpperCase()}…`);
  const response = await fetch("/api/letters/export/" + format, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: snapshot() }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  downloadBlob(await response.blob(), snapshot().title + "." + format);
  notice("Your document is ready.");
}
async function viewSource(id) {
  const item = await api("/correspondence/" + id);
  const data = await dialog(
    "Review correspondence",
    `<p>${e(item.state)}${item.error ? " · " + e(item.error) : ""}</p><label>Title<input name="title" value="${e(item.title)}"></label><label>Extracted text<textarea name="text" style="min-height:220px">${e(item.text)}</textarea></label><label>Reference / participants / date<input name="details" value="${e(item.metadata?.details || [...(item.metadata?.references || []), ...(item.metadata?.dates || []), ...(item.metadata?.participants || [])].join(" · "))}"></label><label>Related correspondence IDs<input name="relatedIds" value="${e((item.metadata?.relatedIds || []).join(", "))}"></label><label><span><input name="included" type="checkbox" ${item.included ? "checked" : ""}> Include in private AI memory</span></label><label><span><input name="remove" type="checkbox"> Delete this correspondence and its memory</span></label>${item.fileName ? `<a href="/api/letters/correspondence/${encodeURIComponent(id)}/original">Download original</a>` : ""}`,
  );
  if (data) {
    if (data.remove) await api("/correspondence/" + id, { method: "DELETE" });
    else
      await api("/correspondence/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          title: data.title,
          text: data.text,
          included: !!data.included,
          metadata: {
            details: data.details,
            relatedIds: data.relatedIds
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 20),
            reviewRequired: false,
          },
        }),
      });
    await refreshLibrary("correspondence");
  }
}
async function viewDraftSource(id) {
  const item = await api("/documents/" + id);
  await dialog(
    "Draft source: " + item.title,
    `<pre style="white-space:pre-wrap">${e(documentText(item.data).slice(0, 12000))}</pre>`,
    "Close",
  );
}
async function memorySearch() {
  if (!config.signedIn) return;
  const rows = await api(
    "/search?q=" + encodeURIComponent($("#memoryQuery").value),
  );
  $("#memorySources").replaceChildren();
  for (const row of rows) {
    const div = document.createElement("div");
    div.className = "source";
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.value = row.id;
    label.append(input, document.createTextNode(row.title));
    const view = document.createElement("button");
    view.textContent = "View";
    view.onclick = () => viewSource(row.id);
    div.append(label, view);
    $("#memorySources").append(div);
  }
}
async function generateAI() {
  if (!config.ai) {
    notice(
      "AI is awaiting server configuration and quality validation. Your editor is ready to use.",
    );
    return;
  }
  if (aiAbort) return;
  if (config.externalAI) {
    const consent = await dialog(
      "Send this AI request to NVIDIA?",
      '<p>Your prompt, selected text (or current letter), and relevant excerpts retrieved from your correspondence will be sent to NVIDIA for processing. Originals and document storage remain on the VPS. Do not submit confidential information without permission.</p><label><input type="checkbox" name="accepted" required> I agree to send this request and its context to NVIDIA.</label>',
      "Send to NVIDIA",
    );
    if (!consent) return;
    if (aiAbort) return;
  }
  const selected = editor.state.selection;
  aiRange = selected.empty
    ? { from: 0, to: editor.state.doc.content.size }
    : { from: selected.from, to: selected.to };
  aiSnapshot = JSON.stringify(editor.getJSON());
  const selectedText = selected.empty
    ? documentText(snapshot())
    : editor.state.doc.textBetween(selected.from, selected.to, "\n");
  aiProposal = "";
  $("#aiResult").textContent = "";
  $("#aiActions").hidden = true;
  $("#aiSources").replaceChildren();
  aiAbort = new AbortController();
  $("#cancelAI").hidden = false;
  $("#generate").disabled = true;
  try {
    const response = await fetch("/api/letters/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: aiAction,
        prompt: $("#prompt").value,
        text: selectedText,
        tone: $("#tone").value,
        sourceIds: [
          ...[...document.querySelectorAll("#memorySources input:checked")].map(
            (n) => n.value,
          ),
          ...selectedDrafts,
        ].slice(0, 10),
        includeDrafts: selectedDrafts.length > 0,
        externalConsent: config.externalAI === true,
      }),
      signal: aiAbort.signal,
    });
    if (!response.ok) throw new Error((await response.json()).error);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    const read = (row) => {
      const part = JSON.parse(row);
      if (part.error) throw new Error(part.error);
      if (part.token) {
        aiProposal += part.token;
        $("#aiResult").textContent = aiProposal;
      }
      if (part.sources)
        for (const source of part.sources) {
          const b = document.createElement("button");
          b.className = "source";
          b.textContent = `[${source.label}] ${source.title}`;
          b.onclick = () =>
            (source.kind === "document"
              ? viewDraftSource(source.id)
              : viewSource(source.id)
            ).catch((err) => notice(err.message));
          $("#aiSources").append(b);
        }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const row = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (row.trim()) read(row);
      }
    }
    if (buffer.trim()) read(buffer);
    $("#aiActions").hidden = !aiProposal;
  } catch (err) {
    if (err.name !== "AbortError") notice(err.message);
    aiProposal = "";
    $("#aiActions").hidden = true;
  } finally {
    aiAbort = null;
    $("#cancelAI").hidden = true;
    $("#generate").disabled = false;
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.action) await actions[button.dataset.action]();
    if (button.dataset.command)
      editor.chain().focus()[button.dataset.command]().run();
    if (button.dataset.align)
      editor.chain().focus().setTextAlign(button.dataset.align).run();
    if (button.dataset.kind) await refreshLibrary(button.dataset.kind);
    if (button.dataset.ai) {
      aiAction = button.dataset.ai;
      await generateAI();
    }
  } catch (err) {
    notice(err.message);
  }
});
$("#title").oninput = changed;
$("#style").onchange = (event) => {
  const level = +event.target.value;
  level
    ? editor.chain().focus().setHeading({ level }).run()
    : editor.chain().focus().setParagraph().run();
};
$("#font").onchange = (event) =>
  editor.chain().focus().setFontFamily(event.target.value).run();
$("#fontSize").onchange = (event) =>
  editor
    .chain()
    .focus()
    .setFontSize(event.target.value + "pt")
    .run();
$("#color").oninput = (event) =>
  editor.chain().focus().setColor(event.target.value).run();
let searchTimer;
$("#memoryQuery").oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () => memorySearch().catch((err) => notice(err.message)),
    500,
  );
};
window.addEventListener("beforeunload", (event) => {
  cache();
  if (config.signedIn && dirty > saved) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    save()
      .then(() => notice("Saved."))
      .catch((err) => notice(err.message));
  }
});
try {
  config = await api("/config");
  const aiLabel = config.externalAI ? "NVIDIA API" : "Local AI";
  $("#aiStatus").textContent = config.ai
    ? `● ${aiLabel} ready`
    : `○ ${aiLabel} awaiting setup`;
  if (config.externalAI)
    $("#aiStatus").title =
      "AI requests and relevant context are processed by NVIDIA outside this VPS.";
  if (config.externalAI || config.externalEmbeddings) {
    const disclosure = document.createElement("p");
    disclosure.className = "muted";
    disclosure.textContent = config.externalEmbeddings
      ? "NVIDIA processes AI requests, search queries and indexed correspondence excerpts outside this VPS."
      : "NVIDIA processes confirmed AI requests and relevant excerpts outside this VPS.";
    $("#aiStatus").after(disclosure);
  }
  $("#account").textContent = config.signedIn ? "●" : "↗";
  $("#account").href = config.signedIn ? "/profile" : "/login";
  $("#privacy").textContent = config.signedIn
    ? "Your account. Your correspondence. Private by design."
    : "Your browser, your drafts. Sign in for your private library.";
  localLibrary = JSON.parse(localStorage.getItem(key() + "_library") || "[]");
  const cached = JSON.parse(localStorage.getItem(key()) || "null");
  if (cached?.letter) {
    apply(cached.letter, { id: cached.record, rev: cached.revision });
    editingKind = cached.editingKind || "document";
    conflict = !!cached.conflict;
    if (cached.dirty) {
      dirty = 1;
      saved = 0;
    }
  }
  paint();
  await refreshLibrary();
  if (localStorage.getItem("vibify_pdf_maker_draft"))
    notice(
      "An original PDF Maker draft is available. Use More → Import original Maker draft to recover it.",
    );
} catch (err) {
  paint();
  notice(err.message);
}
