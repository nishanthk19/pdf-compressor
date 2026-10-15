import { Extension, Mark } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";

// Browsers serialize pasted colors as rgb(), while stored documents use safe hex.
function storedColor(value) {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value || "");
  return rgb && rgb.slice(1).every(n => Number(n) <= 255)
    ? "#" + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, "0")).join("") : null;
}

export const Superscript = Mark.create({
  name: "superscript", excludes: "subscript",
  parseHTML: () => [{ tag: "sup" }], renderHTML: () => ["sup", 0],
});
export const Subscript = Mark.create({
  name: "subscript", excludes: "superscript",
  parseHTML: () => [{ tag: "sub" }], renderHTML: () => ["sub", 0],
});
export const WordFormatting = Extension.create({
  name: "wordFormatting",
  addGlobalAttributes() {
    const number = (css, suffix) => ({ default: null,
      parseHTML: n => Number.parseFloat(n.style[css]) || null,
      renderHTML: a => a[suffix] != null ? { style: `${css.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}:${a[suffix]}pt` } : {},
    });
    return [
      { types: ["textStyle"], attributes: { backgroundColor: { default: null,
        parseHTML: n => storedColor(n.style.backgroundColor),
        renderHTML: a => a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {},
      } } },
      { types: ["paragraph", "heading"], attributes: {
        spaceBefore: number("marginTop", "spaceBefore"),
        firstLine: number("textIndent", "firstLine"),
        keepNext: { default: false, parseHTML: n => n.style.breakAfter === "avoid",
          renderHTML: a => a.keepNext ? { style: "break-after:avoid" } : {} },
      } },
      { types: ["image"], attributes: { textAlign: { default: "left",
        parseHTML: n => n.dataset.align || "left",
        renderHTML: a => ({ "data-align": a.textAlign, style: `display:block;margin-left:${a.textAlign === "left" ? "0" : "auto"};margin-right:${a.textAlign === "right" ? "0" : "auto"}` }),
      } } },
      { types: ["tableCell", "tableHeader"], attributes: {
        backgroundColor: { default: null, parseHTML: n => storedColor(n.style.backgroundColor),
          renderHTML: a => a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {} },
        verticalAlign: { default: "top", parseHTML: n => n.style.verticalAlign || "top",
          renderHTML: a => ({ style: `vertical-align:${a.verticalAlign}` }) },
      } },
    ];
  },
});

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const button = (label, attr, icon = "", hint = "") => `<button type="button" ${attr} aria-label="${esc(label)}" title="${esc(label + (hint ? " · " + hint : ""))}">${icon ? `<span class="ribbon-icon" aria-hidden="true">${icon}</span>` : ""}<span>${esc(label)}</span></button>`;
const action = (label, name, icon = "") => button(label, `data-action="${name}"`, icon);
const own = (label, name, icon = "", hint = "") => button(label, `data-word="${name}"`, icon, hint);
const cmd = (label, name, icon = "", hint = "") => button(label, `data-command="${name}"`, icon, hint);
const group = (name, html, cls = "") => `<section class="ribbon-group ${cls}" aria-label="${name}"><div class="ribbon-controls">${html}</div><span class="ribbon-caption">${name}</span></section>`;
const select = (id, label, items) => `<label class="ribbon-select"><span>${label}</span><select id="${id}" aria-label="${label}">${items.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`;

export function installRibbon(editor, { actions, dialog, notice, getLetter, save, documentText }) {
  async function copySelection() {
    const text = selectedText();
    if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
      const container = document.createElement("div");
      container.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.selection.content().content));
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([container.innerHTML], { type: "text/html" }),
      })]);
    } else await navigator.clipboard.writeText(text);
  }
  const ribbon = document.querySelector(".ribbon");
  ribbon.classList.add("word-ribbon");
  ribbon.removeAttribute("role");
  const panels = {
    File: group("Document", action("New document", "new", "＋") + own("Save now", "save", "▣", "Ctrl+S") + action("Save a copy", "duplicate", "⧉") + action("Editable backup", "json", "↓")) +
      group("Reuse & recover", action("Save as template", "template") + action("Save as stationery", "saveStationery") + action("Version history", "history") + action("Import original draft", "legacy")) +
      group("Export", action("Download PDF", "pdf", "PDF") + action("Download Word", "docx", "W") + action("Preview document", "preview", "▧")),
    Home: group("Clipboard", own("Paste text", "paste", "▣", "Ctrl+V pastes formatted content in the document") + own("Copy", "copy", "⧉", "Ctrl+C") + own("Cut", "cut", "✂", "Ctrl+X") + own("Format painter", "painter", "▤")) +
      group("Font", `<div class="ribbon-row">${select("font", "Font family", ["Arial", "Times New Roman", "Georgia", "Courier New", "Calibri"].map(f => [f, f]))}${select("fontSize", "Font size", [8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72].map(n => [n,n]))}${own("Grow font", "grow", "A↑")}${own("Shrink font", "shrink", "A↓")}</div><div class="ribbon-row compact">${cmd("Bold", "toggleBold", "<b>B</b>", "Ctrl+B")}${cmd("Italic", "toggleItalic", "<i>I</i>", "Ctrl+I")}${cmd("Underline", "toggleUnderline", "<u>U</u>", "Ctrl+U")}${cmd("Strikethrough", "toggleStrike", "<s>S</s>")}${own("Subscript", "subscript", "x₂")}${own("Superscript", "superscript", "x²")}<label title="Text color">A<input id="color" type="color" value="#17222e" aria-label="Text color"></label><label title="Text highlight">▰<input id="highlight" type="color" value="#fff176" aria-label="Text highlight"></label>${own("Remove highlight", "unhighlight", "▱")}${own("Change case", "case", "Aa")}${own("Clear formatting", "clear", "A×")}</div>`, "font-group") +
      group("Paragraph", `<div class="ribbon-row compact">${cmd("Bullet list", "toggleBulletList", "• ≡")}${cmd("Numbered list", "toggleOrderedList", "1. ≡")}${action("Decrease indent", "outdent", "←|")}${action("Increase indent", "indent", "→|")}${own("Formatting marks", "marks", "¶")}</div><div class="ribbon-row compact">${["left","center","right","justify"].map((a,i) => button(`Align ${a}`,`data-align="${a}"`,["☰","≡","☷","▤"][i])).join("")}${action("Paragraph settings", "spacing", "↕")}</div>`) +
      group("Styles", `<div class="style-gallery">${["Normal", "Heading 1", "Heading 2", "Heading 3"].map((s,i)=>button(s,`data-stylequick="${i}" class="style-sample style-${i}"`)).join("")}</div>` + select("style", "Paragraph style", [[0,"Normal text"],[1,"Heading 1"],[2,"Heading 2"],[3,"Heading 3"]])) +
      group("Editing", action("Find & replace", "find", "⌕") + own("Select all", "selectAll", "▧", "Ctrl+A")),
    Insert: group("Pages", action("Page break", "break", "↵") + own("Horizontal rule", "rule", "━")) +
      group("Content", own("Insert table", "insertTable", "▦") + action("Insert picture", "image", "▧") + action("Insert link", "link", "↗") + own("Remove link", "unlink", "×↗") + own("Symbols", "symbols", "Ω") + own("Date & time", "date", "▦")) +
      group("Letter stationery", action("Header & footer", "stationery", "▤") + action("Logo", "logo", "▧") + action("Signature image", "signature", "✎") + action("Page numbers", "stationery", "#") + own("Reusable field", "field", "{ }")),
    Layout: group("Page setup", action("Paper & orientation", "page", "▯") + own("Page margins", "margins", "⊞")) +
      group("Paragraph layout", action("Indent & spacing", "spacing", "↕") + own("Quick line spacing", "lineSpacing", "↕") + own("Keep with next", "keepNext", "↳") + own("Quote", "quote", "❝")) +
      group("Typography", own("Font options", "fontOptions", "A…")) +
      group("Document", action("Edit letter details", "fields", "▤") + action("Preview pages", "preview", "▧")),
    Review: group("Review", own("Word count", "count", "123") + own("Spelling suggestions", "spelling", "ABC✓") + action("Document history", "history", "◷")) +
      group("Writing & correspondence", action("Draft with AI", "draftPopup", "✧") + own("Writing assistant", "assistant", "✧") + action("Finalize letter", "finalize", "✓") + action("Reopen draft", "reopen", "↶")),
    View: group("Workspace", own("Navigation pane", "navigation", "☰") + own("Assistant pane", "assistant", "✧") + own("Show ruler", "ruler", "↔") + own("Show formatting marks", "marks", "¶")) +
      group("Zoom", select("zoom", "Zoom", [[50,"50%"],[75,"75%"],[90,"90%"],[100,"100%"],[125,"125%"],[150,"150%"]]) + own("Fit page width", "fit", "↔") + own("Actual size", "actual", "100%")) +
      group("Navigate & help", own("Document outline", "outline", "☰") + own("Focus mode", "focus", "▣") + own("Keyboard shortcuts", "shortcuts", "⌨") + action("Print layout preview", "preview", "▧")),
    Table: "",
  };
  const tableCommands = [["Row above","addRowBefore"],["Row below","addRowAfter"],["Column left","addColumnBefore"],["Column right","addColumnAfter"],["Delete row","deleteRow"],["Delete column","deleteColumn"],["Merge cells","mergeCells"],["Split cell","splitCell"],["Header row","toggleHeaderRow"],["Header column","toggleHeaderColumn"],["Delete table","deleteTable"]];
  panels.Table = group("Rows & columns", tableCommands.slice(0,6).map(([l,c]) => cmd(l,c,"▦")).join("")) + group("Cells", tableCommands.slice(6,10).map(([l,c]) => cmd(l,c)).join("") + own("Cell appearance","cell","▰")) + group("Table", cmd("Delete table","deleteTable","×"));
  panels.Picture = group("Picture", own("Picture properties","picture","▧") + own("Replace picture","replacePicture","⧉") + own("Remove picture","removePicture","×"));
ribbon.innerHTML = `<div class="ribbon-tabs" role="tablist" aria-label="Editor ribbon">${Object.keys(panels).map((n,i) => `<button type="button" role="tab" id="ribbon-tab-${n}" aria-controls="ribbon-${n}" aria-selected="${n === "Home"}" tabindex="${n === "Home" ? 0 : -1}" data-tab="${n}" ${["Table","Picture"].includes(n) ? "hidden" : ""}>${n}</button>`).join("")}<button type="button" data-word="commands" class="command-search" aria-label="Find a command" title="Find a command · Alt+Q">⌕ <span>Search commands</span></button><div class="quick-actions">${cmd("Undo","undo","↶","Ctrl+Z")}${cmd("Redo","redo","↷","Ctrl+Y")}${own("Save document","save","▣","Ctrl+S")}</div></div>${Object.entries(panels).map(([n,h]) => `<div id="ribbon-${n}" class="ribbon-panel" role="tabpanel" aria-labelledby="ribbon-tab-${n}" ${n !== "Home" ? "hidden" : ""}>${h}</div>`).join("")}`;
  ribbon.querySelector("#fontSize").value = "11";
  ribbon.querySelector("#zoom").value = "100";
  let tab = "Home", painter = null;
  function openTab(name) {
    tab = name;
    ribbon.querySelectorAll("[data-tab]").forEach(b => { b.setAttribute("aria-selected", String(b.dataset.tab === name)); b.tabIndex = b.dataset.tab === name ? 0 : -1; });
    ribbon.querySelectorAll(".ribbon-panel").forEach(p => p.hidden = p.id !== "ribbon-" + name);
  }
  ribbon.querySelector(".ribbon-tabs").addEventListener("keydown", event => {
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key) || event.target.getAttribute("role") !== "tab") return;
    event.preventDefault();
    const tabs = [...ribbon.querySelectorAll('[role="tab"]')].filter(b => !b.hidden);
    const i = tabs.indexOf(event.target), next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    openTab(tabs[next].dataset.tab); tabs[next].focus();
  });
  ribbon.addEventListener("mousedown", event => { if (event.target.closest("button:not([role=tab])")) event.preventDefault(); });
  const formatBlock = attrs => editor.chain().focus().updateAttributes(editor.isActive("heading") ? "heading" : "paragraph", attrs).run();
  const toggleMark = type => editor.chain().focus().toggleMark(type).run();
  const selectedText = () => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n");
  function transformCase(mode) {
    const { from, to, empty } = editor.state.selection;
    if (empty) return notice("Select the text to change its case.");
    let tr = editor.state.tr;
    const replacements = [];
    editor.state.doc.nodesBetween(from,to,(n,pos) => {
      if (!n.isText) return;
      const start = Math.max(from,pos), end = Math.min(to,pos+n.nodeSize), original = n.text.slice(start-pos,end-pos);
      const text = mode === "upper" ? original.toUpperCase() : mode === "lower" ? original.toLowerCase() : original.replace(/\b\p{L}/gu,c=>c.toUpperCase());
      replacements.push({ start,end,text,marks:n.marks });
    });
    for (const r of replacements.reverse()) tr.replaceWith(r.start,r.end,editor.schema.text(r.text,r.marks));
    editor.view.dispatch(tr); editor.commands.focus();
  }
  let findQuery = "", findIndex = -1;
  function matches(query, matchCase, whole) {
    const found = [];
    if (!query) return found;
    editor.state.doc.descendants((node,pos) => {
      if (!node.isTextblock) return;
      let text = "", positions = [];
      node.descendants((n,offset) => {
        if (n.isText) { for (let i=0;i<n.text.length;i++) { text += n.text[i]; positions.push(pos+1+offset+i); } }
        else if (n.isLeaf) { text += "\u0000"; positions.push(pos+1+offset); }
      });
      const haystack = matchCase ? text : text.toLowerCase(), needle = matchCase ? query : query.toLowerCase();
      let i=0;
      while ((i=haystack.indexOf(needle,i)) !== -1) {
        if (!whole || (!/[\p{L}\p{N}_]/u.test(text[i-1] || "") && !/[\p{L}\p{N}_]/u.test(text[i+query.length] || ""))) found.push({from:positions[i],to:positions[i+query.length-1]+1});
        i+=needle.length;
      }
      return false;
    });
    return found;
  }
  // A persistent pane keeps find, replace and replacement preview separate.
  const findPane = document.createElement("section");
  findPane.className = "find-pane"; findPane.hidden = true;
  findPane.setAttribute("aria-label","Find and replace");
  findPane.innerHTML = `<div class="find-top"><strong>Find & replace</strong><button aria-label="Close find pane">×</button></div><label>Find text<input id="findText"></label><label>Replace with<input id="replaceText"></label><div><label><input id="matchCase" type="checkbox"> Match case</label><label><input id="wholeWord" type="checkbox"> Whole word</label></div><div class="find-buttons"><button data-find="next">Find next</button><button data-find="replace">Replace selection</button><button data-find="all">Replace all</button></div><output id="findCount" aria-live="polite"></output>`;
  document.querySelector(".document-bar").after(findPane);
  findPane.querySelector(".find-top button").onclick = () => { findPane.hidden = true; editor.commands.focus(); };
  findPane.addEventListener("click", event => {
    const operation = event.target.closest("[data-find]")?.dataset.find;
    if (!operation) return;
    const q = findPane.querySelector("#findText").value, replacement = findPane.querySelector("#replaceText").value;
    const found = matches(q, findPane.querySelector("#matchCase").checked, findPane.querySelector("#wholeWord").checked);
    const out = findPane.querySelector("#findCount");
    if (!found.length) { out.textContent="No matches found."; return; }
    if (operation === "next") {
      findIndex = q === findQuery ? (findIndex+1)%found.length : 0; findQuery=q;
      editor.commands.setTextSelection(found[findIndex]); editor.commands.scrollIntoView();
      out.textContent=`Match ${findIndex+1} of ${found.length}`;
    } else {
      const selection = editor.state.selection;
      const use = operation === "all" ? found : found.filter(m => m.from === selection.from && m.to === selection.to);
      if (!use.length) { out.textContent="Use Find next to select a match first."; return; }
      let tr = editor.state.tr;
      for (const m of [...use].reverse()) tr = replacement ? tr.insertText(replacement,m.from,m.to) : tr.delete(m.from,m.to);
      editor.view.dispatch(tr); out.textContent=`${use.length} replacement(s) made.`; findIndex=-1;
    }
  });
  actions.find = async () => { findPane.hidden = false; findPane.querySelector("#findText").focus(); };
  actions.spacing = async () => {
    const a = editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph");
    const data = await dialog("Paragraph settings", `<div class="field-grid"><label>Alignment<select name="textAlign">${["left","center","right","justify"].map(v=>`<option ${v===(a.textAlign||"left")?"selected":""}>${v}</option>`).join("")}</select></label><label>Line spacing<input name="lineHeight" type="number" min="1" max="2.5" step="0.05" value="${a.lineHeight || getLetter().page.lineHeight}" required></label><label>Before (pt)<input name="spaceBefore" type="number" min="0" max="36" value="${a.spaceBefore ?? 0}" required></label><label>After (pt)<input name="spaceAfter" type="number" min="0" max="36" value="${a.spaceAfter ?? 9}" required></label><label>Left indent (mm)<input name="indent" type="number" min="0" max="48" step="1" value="${(a.indent||0)*12}" required></label><label>First line indent (pt)<input name="firstLine" type="number" min="0" max="72" value="${a.firstLine ?? 0}" required></label><label><span><input name="keepNext" type="checkbox" ${a.keepNext?"checked":""}> Keep with next paragraph</span></label></div>`);
    if (data) formatBlock({ textAlign:data.textAlign, lineHeight:+data.lineHeight, spaceBefore:+data.spaceBefore, spaceAfter:+data.spaceAfter, indent:+data.indent/12, firstLine:+data.firstLine, keepNext:!!data.keepNext });
  };
  const tools = {
    async commands() {
      const seen = new Set(), commands = [];
      for (const b of ribbon.querySelectorAll('.ribbon-panel button')) {
        const label = b.getAttribute("aria-label");
        const panel = b.closest(".ribbon-panel").id.replace("ribbon-", "");
        if (b.disabled || seen.has(label) || ribbon.querySelector(`[data-tab="${panel}"]`).hidden) continue;
        seen.add(label); commands.push({ b, label, panel });
      }
      const pending = dialog("Find a command", '<label>Search commands<input name="query" placeholder="Try margins, tables, font, or page numbers…" autocomplete="off"></label><div class="command-results"></div>', "Close");
      const d = document.querySelector("#dialog"), input = d.querySelector("input"), results = d.querySelector(".command-results");
      d.classList.add("command-dialog");
      function draw() {
        results.replaceChildren();
        for (const c of commands.filter(c=>c.label.toLowerCase().includes(input.value.toLowerCase()))) {
          const item = document.createElement("button"); item.type = "button";
          item.textContent = c.label + " · " + c.panel;
          item.onclick = () => { d.close(); openTab(c.panel); c.b.click(); };
          results.append(item);
        }
        if (!results.childElementCount) results.textContent = "No matching command. Try a shorter word.";
      }
      input.oninput = draw; draw(); await pending;
    },
    async fontOptions() {
      const attrs = editor.getAttributes("textStyle");
      const d = await dialog("Font options", `<div class="field-grid"><label>Font family<select name="family">${["Arial", "Times New Roman", "Georgia", "Courier New", "Calibri"].map(f=>`<option ${f===(attrs.fontFamily||getLetter().page.font)?"selected":""}>${f}</option>`).join("")}</select></label><label>Size (pt)<input name="size" type="number" min="8" max="72" step="1" value="${parseFloat(attrs.fontSize)||getLetter().page.fontSize}" required></label></div>`, "Apply");
      if (d) editor.chain().focus().setFontFamily(d.family).setFontSize(d.size+"pt").run();
    },
    async lineSpacing() {
      const d = await dialog("Quick line spacing", '<label>Line spacing<select name="spacing"><option value="1">Single</option><option value="1.15">1.15 lines</option><option value="1.5">1.5 lines</option><option value="2">Double</option><option value="2.5">2.5 lines</option></select></label>', "Apply");
      if (d) formatBlock({lineHeight:+d.spacing});
    },
    async outline() {
      const headings = [];
      editor.state.doc.descendants((n,pos)=>{ if(n.type.name==="heading") headings.push({ text:n.textContent||"Untitled heading", pos, level:n.attrs.level }); });
      const pending = dialog("Document outline", '<p>Choose a heading to jump to its location.</p><div class="outline-list"></div>', "Close");
      const d = document.querySelector("#dialog"), list = d.querySelector(".outline-list");
      if (!headings.length) list.textContent = "Apply a Heading style to create your document outline.";
      for (const h of headings) { const b = document.createElement("button"); b.type="button"; b.textContent=h.text; b.style.paddingLeft=(h.level*12)+"px"; b.onclick=()=>{d.close(); editor.chain().focus().setTextSelection(h.pos+1).scrollIntoView().run();}; list.append(b); }
      await pending;
    },
    focus() { const w = document.querySelector(".workspace"); const enabled=!w.classList.contains("focus-mode"); w.classList.toggle("focus-mode",enabled); if(enabled) {w.dataset.previousPanes=JSON.stringify([w.classList.contains("hide-library"),w.classList.contains("hide-assistant")]); w.classList.add("hide-library","hide-assistant");} else {const previous=JSON.parse(w.dataset.previousPanes||"[false,true]"); w.classList.toggle("hide-library",previous[0]); w.classList.toggle("hide-assistant",previous[1]);} },
    shortcuts: () => dialog("Keyboard shortcuts", '<dl class="word-statistics"><dt>Bold / italic / underline</dt><dd>Ctrl+B / I / U</dd><dt>Undo / redo</dt><dd>Ctrl+Z / Shift+Z</dd><dt>Save</dt><dd>Ctrl+S</dd><dt>Find / replace</dt><dd>Ctrl+F / H</dd><dt>Find a command</dt><dd>Alt+Q</dd><dt>Select all</dt><dd>Ctrl+A</dd></dl><p>On macOS, use ⌘ instead of Ctrl. Ribbon tabs also support arrow keys.</p>', "Done"),
    save: async () => { await save(); notice("Document saved."); },
    selectAll: () => editor.chain().focus().selectAll().run(),
    clear: () => editor.chain().focus().unsetAllMarks().clearNodes().resetAttributes("paragraph", ["textAlign","indent","lineHeight","spaceAfter","spaceBefore","firstLine","keepNext"]).run(),
    subscript: () => toggleMark("subscript"), superscript: () => toggleMark("superscript"),
    unhighlight: () => editor.chain().focus().setMark("textStyle",{backgroundColor:null}).removeEmptyTextStyle().run(),
    grow: () => resizeFont(1), shrink: () => resizeFont(-1),
    quote: () => editor.chain().focus().toggleBlockquote().run(),
    rule: () => editor.chain().focus().setHorizontalRule().run(),
    unlink: () => editor.chain().focus().extendMarkRange("link").unsetLink().run(),
    async case() { const d = await dialog("Change case", '<label>Change selected text to<select name="mode"><option value="upper">UPPERCASE</option><option value="lower">lowercase</option><option value="title">Title Case</option></select></label>',"Apply"); if(d) transformCase(d.mode); },
    async copy() { if(!selectedText()) return notice("Select text to copy."); try { await copySelection(); notice("Selected text copied."); } catch { notice("Use Ctrl+C (⌘C on Mac) to copy the selected text."); } },
    async cut() { const text=selectedText(); if(!text) return notice("Select text to cut."); try { await copySelection(); editor.chain().focus().deleteSelection().run(); } catch { notice("Use Ctrl+X (⌘X on Mac) to cut. Nothing was removed."); } },
    async paste() { const d = await dialog("Paste text",'<p>Paste here for plain text. To retain formatting, paste directly into the document with Ctrl+V / ⌘V.</p><label>Text to paste<textarea name="text" required></textarea></label>',"Insert"); if(d) editor.chain().focus().insertContent(d.text.split(/\r?\n/).map(text=>({type:"paragraph",...(text?{content:[{type:"text",text}]}:{})}))).run(); },
    painter() { painter = (editor.state.storedMarks || editor.state.doc.nodeAt(editor.state.selection.from)?.marks || editor.state.selection.$from.marks()).map(m=>m.toJSON()); notice("Select the destination text, then choose Format painter again to apply."); tools.painter = () => { if(editor.state.selection.empty) return notice("Select destination text first."); const chain=editor.chain().focus().unsetAllMarks(); for(const m of painter) chain.setMark(m.type,m.attrs); chain.run(); painter=null; tools.painter=tools.capturePainter; notice("Formatting applied."); }; },
    async insertTable() { const d = await dialog("Insert table",'<div class="table-picker-preview" aria-hidden="true">▦</div><div class="field-grid"><label>Rows<input name="rows" type="number" min="1" max="50" value="3" required></label><label>Columns<input name="cols" type="number" min="1" max="12" value="2" required></label><label><span><input name="header" type="checkbox" checked> Header row</span></label></div>',"Insert table"); if(d) { editor.chain().focus().insertTable({rows:+d.rows,cols:+d.cols,withHeaderRow:!!d.header}).run(); openTab("Table"); } },
    async cell() { if(!editor.isActive("table")) return; const a=editor.getAttributes(editor.isActive("tableHeader")?"tableHeader":"tableCell"); const d=await dialog("Cell appearance",`<div class="field-grid"><label>Cell shading<input name="backgroundColor" type="color" value="${esc(a.backgroundColor || "#ffffff")}"></label><label>Vertical alignment<select name="verticalAlign">${["top","middle","bottom"].map(v=>`<option ${a.verticalAlign===v?"selected":""}>${v}</option>`).join("")}</select></label><label><input name="clear" type="checkbox"> Clear cell shading</label></div>`,"Apply"); if(d) editor.chain().focus().setCellAttribute("backgroundColor",d.clear?null:d.backgroundColor).setCellAttribute("verticalAlign",d.verticalAlign).run(); },
    async picture() { if(!editor.isActive("image")) return notice("Select a picture first."); const a=editor.getAttributes("image"); const d=await dialog("Picture properties",`<div class="field-grid"><label>Width (px)<input name="width" type="number" min="24" max="650" value="${Number(a.width)||240}" required></label><label>Alignment<select name="textAlign">${["left","center","right"].map(v=>`<option ${a.textAlign===v?"selected":""}>${v}</option>`).join("")}</select></label><label>Alternative text<input name="alt" maxlength="500" value="${esc(a.alt)}"></label></div><p>Pictures retain their aspect ratio.</p>`,"Apply"); if(d) editor.chain().focus().updateAttributes("image",{...d,width:+d.width,height:null}).run(); },
    removePicture: () => { if(editor.isActive("image")) editor.chain().focus().deleteSelection().run(); },
    async replacePicture() { if(editor.isActive("image")) await actions.image(); },
    async symbols() { const d=await dialog("Insert symbol",'<label>Symbol<select name="symbol">'+["©","®","™","°","±","×","÷","€","£","₹","✓","§","¶","—","–","•","→","α","β","Ω"].map(v=>`<option>${v}</option>`).join("")+'</select></label>',"Insert"); if(d) editor.chain().focus().insertContent({type:"text",text:d.symbol}).run(); },
    async date() { const now=new Date(); const options=[now.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}),now.toLocaleDateString("en-GB"),now.toLocaleString("en-GB")]; const d=await dialog("Insert date & time",'<label>Format<select name="date">'+options.map(v=>`<option>${esc(v)}</option>`).join("")+'</select></label>',"Insert"); if(d) editor.chain().focus().insertContent({type:"text",text:d.date}).run(); },
    async field() { const d=await dialog("Insert reusable field",'<label>Field<select name="field">'+["recipient","address","date","reference","subject","signatory","enclosures"].map(v=>`<option>${v}</option>`).join("")+'</select></label>',"Insert"); if(d) editor.chain().focus().insertContent({type:"text",text:`{{${d.field}}}`}).run(); },
    async count() { const text=documentText(getLetter()), selected=selectedText(); await dialog("Document statistics",`<dl class="word-statistics"><dt>Words</dt><dd>${text.trim().split(/\s+/).filter(Boolean).length}</dd><dt>Characters including spaces</dt><dd>${text.length}</dd><dt>Characters without spaces</dt><dd>${text.replace(/\s/g,"").length}</dd><dt>Selected words</dt><dd>${selected.trim().split(/\s+/).filter(Boolean).length}</dd></dl>`,"Done"); },
    spelling() { const enabled=editor.view.dom.getAttribute("spellcheck")!=="true"; editor.view.dom.setAttribute("spellcheck",String(enabled)); notice(enabled?"Browser spelling suggestions enabled. Right-click underlined words; language dictionaries depend on your browser.":"Browser spelling suggestions disabled."); sync(); },
    marks() { document.querySelector(".center").classList.toggle("show-formatting"); sync(); },
    keepNext() { formatBlock({keepNext:!editor.getAttributes(editor.isActive("heading")?"heading":"paragraph").keepNext}); },
    ruler() { const r=document.querySelector(".ruler"); r.hidden=!r.hidden; sync(); },
    navigation() { actions.library(); sync(); }, assistant() { actions.assistant(); sync(); },
    fit() { const width=document.querySelector(".canvas").clientWidth-48; zoom(Math.min(150,Math.max(50,Math.floor(width/document.querySelector("#paper").offsetWidth*100)))); }, actual() { zoom(100); },
    async margins() { const d=await dialog("Page margins",'<label>Margins<select name="margin"><option value="12">Narrow — 12 mm</option><option value="22">Normal — 22 mm</option><option value="25.4">Standard — 25.4 mm</option><option value="32">Wide — 32 mm</option><option value="40">Extra wide — 40 mm</option></select></label><p>For a custom value, use Paper & orientation.</p>',"Apply"); if(d) { await actions.pageMargin(+d.margin); } },
  };
  tools.capturePainter = tools.painter;
  function resizeFont(direction) { const sizes=[8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72], current=parseFloat(editor.getAttributes("textStyle").fontSize)||getLetter().page.fontSize; const target=direction>0?sizes.find(n=>n>current):[...sizes].reverse().find(n=>n<current); if(target) editor.chain().focus().setFontSize(target+"pt").run(); }
  function zoom(value) { document.querySelector("#paper").style.zoom=value/100; document.querySelector("#printPreview").style.zoom=value/100; ribbon.querySelector("#zoom").value=String(value); editor.commands.refreshLetterPages(); notice(`View zoom ${value}% — exports are unchanged.`); }
  ribbon.querySelector("#zoom").onchange=event=>zoom(+event.target.value);
  ribbon.querySelector("#highlight").oninput=event=>editor.chain().focus().setMark("textStyle",{backgroundColor:event.target.value}).run();
  ribbon.addEventListener("click", async event => {
    const b=event.target.closest("button"); if(!b) return;
    if(b.dataset.tab) { openTab(b.dataset.tab); return; }
    if(b.dataset.stylequick !== undefined) { const level=+b.dataset.stylequick; level ? editor.chain().focus().setHeading({level}).run() : editor.chain().focus().setParagraph().run(); }
    if(b.dataset.word) { event.stopPropagation(); try { await tools[b.dataset.word](); sync(); } catch(err) { notice(err.message); } }
  });
  function sync() {
    const table=editor.isActive("table"), picture=editor.isActive("image");
    ribbon.querySelector('[data-tab="Table"]').hidden=!table;
    ribbon.querySelector('[data-tab="Picture"]').hidden=!picture;
    if((tab==="Table"&&!table)||(tab==="Picture"&&!picture)) openTab("Home");
    const attrs=editor.getAttributes("textStyle");
    if(document.activeElement!==ribbon.querySelector("#font")) ribbon.querySelector("#font").value=attrs.fontFamily||getLetter().page.font;
    const size=String(parseFloat(attrs.fontSize)||getLetter().page.fontSize), sizeSelect=ribbon.querySelector("#fontSize");
    if (![...sizeSelect.options].some(o=>o.value===size)) sizeSelect.add(new Option(size,size));
    if(document.activeElement!==sizeSelect) sizeSelect.value=size;
    ribbon.querySelector("#style").value=editor.isActive("heading")?String(editor.getAttributes("heading").level):"0";
    ribbon.querySelectorAll("[data-stylequick]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.stylequick===ribbon.querySelector("#style").value)));
    if(/^#[0-9a-f]{6}$/i.test(attrs.color||"")) ribbon.querySelector("#color").value=attrs.color;
    for(const b of ribbon.querySelectorAll("[data-command]")) {
      const c=b.dataset.command, type=c.replace("toggle","").replace(/^./,s=>s.toLowerCase());
      if(c.startsWith("toggle")) b.setAttribute("aria-pressed",String(editor.isActive(type)));
      b.disabled=!editor.can()[c]();
    }
    ribbon.querySelectorAll("[data-align]").forEach(b=>b.setAttribute("aria-pressed",String(editor.isActive({textAlign:b.dataset.align}))));
    ribbon.querySelector('[data-word="painter"]').setAttribute("aria-pressed",String(!!painter));
    for(const [name,state] of [["subscript",editor.isActive("subscript")],["superscript",editor.isActive("superscript")],["keepNext",!!editor.getAttributes(editor.isActive("heading")?"heading":"paragraph").keepNext],["marks",document.querySelector(".center").classList.contains("show-formatting")],["ruler",!document.querySelector(".ruler").hidden],["spelling",editor.view.dom.getAttribute("spellcheck")==="true"]]) ribbon.querySelectorAll(`[data-word="${name}"]`).forEach(b=>b.setAttribute("aria-pressed",String(state)));
  }
  editor.on("selectionUpdate",sync); editor.on("transaction",sync);
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape" && painter) { painter=null; tools.painter=tools.capturePainter; sync(); notice("Format painter cancelled."); }
    if(event.altKey && event.key.toLowerCase()==="q" && !event.target.closest("dialog") && !ribbon.inert) { event.preventDefault(); tools.commands(); }
    if((event.ctrlKey||event.metaKey)&&["f","h"].includes(event.key.toLowerCase())&&!(event.target.closest("dialog"))) { event.preventDefault(); actions.find(); }
    if(event.key==="Escape"&&!findPane.hidden) { findPane.hidden=true; editor.commands.focus(); }
  });
  editor.view.dom.setAttribute("spellcheck","true");
  sync();
}
