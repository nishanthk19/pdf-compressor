import { tools, icon, shell, footer } from "./catalog.js";
const id = location.pathname
  .split("/")
  .filter(Boolean)
  .pop()
  .replace(/\.html$/, "");
const tool = tools.find((t) => t.id === id && !t.href);
if (!tool) throw new Error("Unknown PDF tool");
document.title = `${tool.title} · Vibify`;
document.querySelector('meta[name="description"]').content = tool.description;
const canonical = document.createElement("link");
canonical.rel = "canonical";
canonical.href = `https://vibify.tech/tools/${id}`;
document.head.append(canonical);
const field = (label, name, markup, hint = "") =>
  `<label class="field">${label}${markup || `<input name="${name}" required>`}${hint ? `<small>${hint}</small>` : ""}</label>`;
const settings = {
  merge:
    '<p class="setting-note">Files are merged from top to bottom. Drag to arrange, or use the up and down buttons.</p>',
  compress: field(
    "Target file size",
    "targetSize",
    '<input name="targetSize" type="number" min="0.1" max="50" step="0.1" value="2" required>',
    "Megabytes (MB), from 0.1 to 50. Smaller targets can reduce image quality.",
  ),
  extract:
    field(
      "First page",
      "startPage",
      '<input name="startPage" type="number" min="1" value="1" required>',
    ) +
    field(
      "Last page",
      "endPage",
      '<input name="endPage" type="number" min="1" value="1" required>',
    ),
  rotate: field(
    "Rotation",
    "angle",
    '<select name="angle"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counterclockwise</option></select>',
    "Applied to all pages.",
  ),
  delete: field(
    "Pages to remove",
    "pages",
    '<input name="pages" placeholder="e.g. 2, 4-6" pattern="[0-9, \\-]+" required>',
    "Separate pages with commas. Use a hyphen for a range.",
  ),
  protect: field(
    "New PDF password",
    "password",
    '<input name="password" type="password" autocomplete="new-password" required maxlength="127">',
    "Save this password somewhere safe. You will need it to open the output.",
  ),
  unlock: field(
    "Current PDF password",
    "password",
    '<input name="password" type="password" autocomplete="off" maxlength="127">',
    "Enter the password if the document requires one to open.",
  ),
  paginate:
    field(
      "Position",
      "position",
      '<select name="position"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-center">Top center</option></select>',
    ) +
    field(
      "Start numbering at",
      "startPage",
      '<input name="startPage" type="number" min="1" value="1" required>',
    ),
};
document.querySelector("#app").innerHTML =
  `${shell()}<main id="main" class="container"><section class="tool-top"><div class="breadcrumb"><a href="/#tools">All PDF tools</a><span>/</span><span>${tool.title}</span></div><div class="tool-title-row"><span class="tool-symbol ${tool.color}">${icon(tool.icon)}</span><div><h1>${tool.title}</h1><p>${tool.description}</p></div></div><div class="steps" aria-label="Workflow"><span class="current" id="step1"><b>1</b> Add files</span><span id="step2"><b>2</b> Customize</span><span id="step3"><b>3</b> Download</span></div></section><div class="status-message" id="error" role="alert" hidden></div><div class="tool-layout"><section class="upload-area" aria-label="Document selection"><input id="files" type="file" accept="application/pdf,.pdf" ${id === "merge" ? "multiple" : ""} hidden><div id="selection"><div class="drop-target" id="drop"><span class="tool-symbol ${tool.color}">${icon("add")}</span><h2>${id === "merge" ? "Bring your PDFs together" : "Your PDF goes here"}</h2><p>Drag and drop ${id === "merge" ? "your files" : "a file"}, or choose from your device.</p><button class="button" type="button" id="choose">Choose ${id === "merge" ? "PDF files" : "PDF file"} ↑</button><small>PDF only · Up to 100 MB per file${id === "merge" ? " · Maximum 20 files" : ""}</small></div><div id="selected" hidden><div class="file-toolbar"><strong id="fileCount"></strong><button class="button secondary small" id="addFiles" type="button">${id === "merge" ? "+ Add more files" : "Change file"}</button></div><div id="fileList"></div><p class="selection-hint">${id === "merge" ? "Drag files to change the order. You can also use the arrow buttons." : "Ready when you are. Check the settings, then process your PDF."}</p></div></div><div id="processing" class="progress-panel" hidden role="status" aria-live="polite"><div class="spinner"></div><h2 id="progressTitle">Uploading your PDF…</h2><p id="progressText">Keep this page open while we work.</p><progress id="progress" max="100" value="0" aria-label="Upload progress"></progress></div><div class="result-panel" id="result" hidden><div class="result-check" aria-hidden="true">✓</div><h2>Your document is ready.</h2><p id="resultSize"></p><div class="result-actions"><a id="download" class="button">Download ${id === "word" ? "Word document" : "PDF"} ↓</a><button class="button secondary" type="button" id="restart">Start again</button></div><p>Your download is ready in this tab until you leave or start again.</p></div></section><form class="settings-panel" id="settings"><h2>${id === "merge" ? "Merge settings" : "Make it yours"}</h2>${settings[id] || '<p class="setting-note">Add your PDF and we’ll handle the conversion.</p>'}${tool.note ? `<p class="setting-note">${tool.note}</p>` : ""}<button class="button wide" type="submit" id="submit" disabled>${tool.action} →</button><p class="privacy-note">Temporary uploads are removed after processing. Your original files stay on your device.</p></form></div><section class="tool-help"><div><h2>How to ${tool.title.toLowerCase()}</h2><p>Choose ${id === "merge" ? "two or more PDFs" : "your PDF"}, adjust the settings and select “${tool.action}”. When processing finishes, download your new document.</p></div><div><h2>Keep your work moving.</h2><p>Need another step? <a href="/#tools">Explore all tools</a> to organize, annotate or protect the result. For a scanned PDF, use OCR before converting it to Word.</p></div></section></main>${footer()}`;
const $ = (s) => document.querySelector(s);
let files = [],
  dragIndex = null,
  resultUrl = null,
  busy = false;
const bytes = (n) =>
  n < 1024 * 1024
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / 1024 / 1024).toFixed(2)} MB`;
function error(message) {
  $("#error").textContent = message;
  $("#error").hidden = !message;
}
function render() {
  $("#drop").hidden = files.length > 0;
  $("#selected").hidden = !files.length;
  $("#fileCount").textContent =
    `${files.length} ${files.length === 1 ? "file" : "files"} · ${bytes(files.reduce((n, f) => n + f.size, 0))}`;
  $("#submit").disabled = busy || files.length < (id === "merge" ? 2 : 1);
  $("#step2").classList.toggle("current", files.length > 0);
  $("#fileList").replaceChildren();
  files.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.draggable = id === "merge";
    row.innerHTML = `<span class="tool-symbol ${tool.color}">${icon("word")}</span><div class="file-info"><strong></strong><small></small></div><div class="file-actions"></div>`;
    row.querySelector("strong").textContent = file.name;
    row.querySelector("small").textContent =
      `${String(index + 1).padStart(2, "0")} · ${bytes(file.size)}`;
    const action = (label, text, disabled, callback) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.title = label;
      b.setAttribute("aria-label", `${label}: ${file.name}`);
      b.disabled = disabled;
      b.addEventListener("click", callback);
      row.querySelector(".file-actions").append(b);
    };
    if (id === "merge") {
      action("Move up", "↑", index === 0, () => move(index, index - 1));
      action("Move down", "↓", index === files.length - 1, () =>
        move(index, index + 1),
      );
    }
    action("Remove file", "×", false, () => {
      files.splice(index, 1);
      render();
    });
    row.addEventListener("dragstart", (e) => {
      dragIndex = index;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    });
    row.addEventListener("dragover", (e) => {
      if (dragIndex !== null) {
        e.preventDefault();
        row.classList.add("drag-over");
      }
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      if (dragIndex !== null) {
        e.preventDefault();
        e.stopPropagation();
        move(dragIndex, index);
        dragIndex = null;
      }
    });
    row.addEventListener("dragend", () => {
      dragIndex = null;
      document
        .querySelectorAll(".drag-over")
        .forEach((r) => r.classList.remove("drag-over"));
    });
    $("#fileList").append(row);
  });
}
function move(from, to) {
  const [file] = files.splice(from, 1);
  files.splice(to, 0, file);
  render();
}
function add(incoming) {
  if (busy) return;
  error("");
  const items = Array.from(incoming);
  if (!items.length) return;
  if (items.some((f) => !f.name.toLowerCase().endsWith(".pdf"))) {
    error("Please choose PDF files only.");
    return;
  }
  if (items.some((f) => f.size > 100 * 1024 * 1024)) {
    error("Each PDF must be 100 MB or smaller.");
    return;
  }
  if (id !== "merge" && items.length > 1) {
    error(
      "This tool accepts one PDF at a time. Use Merge PDF to combine files.",
    );
    return;
  }
  if (id === "merge" && files.length + items.length > 20) {
    error("You can merge up to 20 PDFs at once.");
    return;
  }
  files = id === "merge" ? [...files, ...items] : items;
  render();
}
$("#choose").onclick = $("#addFiles").onclick = () => $("#files").click();
$("#files").onchange = (e) => {
  add(e.target.files);
  e.target.value = "";
};
$(".upload-area").addEventListener("dragover", (e) => {
  e.preventDefault();
  if (dragIndex === null) $("#drop").classList.add("dragging");
});
$(".upload-area").addEventListener("dragleave", () =>
  $("#drop").classList.remove("dragging"),
);
$(".upload-area").addEventListener("drop", (e) => {
  e.preventDefault();
  $("#drop").classList.remove("dragging");
  if (dragIndex === null) add(e.dataTransfer.files);
});
$("#restart").onclick = () => {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  files = [];
  $("#result").hidden = true;
  $("#selection").hidden = false;
  $("#settings").hidden = false;
  $("#step3").classList.remove("current");
  render();
};
$("#settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || !files.length) return;
  error("");
  busy = true;
  render();
  $("#selection").hidden = true;
  $("#processing").hidden = false;
  $("#progressTitle").textContent = "Uploading your PDF…";
  $("#progress").value = 0;
  const body = new FormData(e.target);
  files.forEach((f) => body.append(id === "merge" ? "pdfs" : "pdf", f));
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/${id}`);
  xhr.responseType = "blob";
  xhr.timeout = 12 * 60 * 1000;
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable)
      $("#progress").value = Math.round((e.loaded / e.total) * 100);
  };
  xhr.upload.onload = () => {
    $("#progress").removeAttribute("value");
    $("#progressTitle").textContent = "Processing your document…";
    $("#progressText").textContent =
      "Large files and scanned pages can take a few minutes.";
  };
  const fail = (message) => {
    busy = false;
    $("#processing").hidden = true;
    $("#selection").hidden = false;
    error(message);
    render();
  };
  xhr.onerror = () =>
    fail("Connection interrupted. Check your connection and try again.");
  xhr.ontimeout = () =>
    fail("Processing took too long. Try a smaller file or try again later.");
  xhr.onload = async () => {
    if (xhr.status < 200 || xhr.status >= 300) {
      let message = "We couldn’t process this PDF. Please try again.";
      try {
        message = JSON.parse(await xhr.response.text()).error || message;
      } catch {}
      fail(message);
      return;
    }
    busy = false;
    resultUrl = URL.createObjectURL(xhr.response);
    $("#download").href = resultUrl;
    $("#download").download = `vibify-${id}.${id === "word" ? "docx" : "pdf"}`;
    $("#resultSize").textContent =
      `${bytes(xhr.response.size)} · ${id === "word" ? "Word document" : "PDF document"}`;
    $("#processing").hidden = true;
    $("#result").hidden = false;
    $("#settings").hidden = true;
    $("#step3").classList.add("current");
  };
  xhr.send(body);
});
window.addEventListener("beforeunload", (e) => {
  if (busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.dispatchEvent(new Event("vibify:nav-ready"));
