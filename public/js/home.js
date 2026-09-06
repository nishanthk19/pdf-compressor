import { tools, icon, shell, footer } from "./catalog.js";
document.querySelector("#app").innerHTML =
  `${shell()}<main id="main"><section class="hero-new"><div class="eyebrow-new">Your everyday document toolkit</div><h1>Big ideas.<br>Less <span>PDF busywork.</span></h1><p>Merge, compress, edit and convert. Everything you need to get your documents ready for what’s next.</p><div class="hero-quick"><a class="button" href="/tools/compress">Compress a PDF ↗</a><a class="button secondary" href="/editor">Open PDF editor</a></div><div class="assurance"><span>Free to use</span><span>No watermarks</span><span>No installation</span></div></section><section class="container directory" id="tools"><div class="directory-heading"><div><h2>A tool for every to-do.</h2><p>Choose your task. We’ll take it from here.</p></div><label class="search"><span class="sr-only">Search PDF tools</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input type="search" id="search" placeholder="What do you need to do?" autocomplete="off"></label></div><div class="category-list" aria-label="Filter tools">${["All tools", "Organize", "Optimize", "Convert", "Edit & create", "Security"].map((g, i) => `<button class="category" type="button" aria-pressed="${i === 0}" data-category="${g}">${g}</button>`).join("")}</div><div class="tool-cards" id="cards"></div><p id="empty" class="empty-results" hidden>No tools match your search. Try “merge”, “text” or “pages”.</p><p class="sr-only" role="status" id="resultCount"></p></section><div class="container"><section class="editor-promo"><div><span class="label">Meet your PDF workspace</span><h2>A finishing touch.<br>Or a fresh start.</h2><p>Highlight the important parts, add your signature, or build a new document. Your next draft starts right here.</p><a class="button" href="/editor">Explore the editor ↗</a></div><div class="document-art" aria-hidden="true"><div class="sheet"><small>PROJECT / 001</small><h3>Good things<br>start on a page.</h3><i class="line"></i><i class="highlight"></i><i class="line"></i><i class="line" style="width:60%"></i><div class="signature">Make it yours.</div></div></div></section><section class="benefits-new"><article><span>01 / SIMPLE BY DESIGN</span><h3>From file to finished.</h3><p>Choose a tool, adjust your settings and download your document. No complicated setup.</p></article><article><span>02 / YOUR FILES, YOUR CONTROL</span><h3>Only here for the task.</h3><p>Server uploads are temporary and removed after processing. The visual editor works in your browser.</p></article><article><span>03 / ROOM FOR REAL WORK</span><h3>Small tasks. Large documents.</h3><p>Upload PDFs up to 100 MB each. Combine up to 20 files, in the order that works for you.</p></article></section></div></main>${footer()}`;
let group = "All tools";
function render() {
  const query = document.querySelector("#search").value.trim().toLowerCase();
  const visible = tools.filter(
    (t) =>
      (group === "All tools" || t.group === group) &&
      `${t.title} ${t.description}`.toLowerCase().includes(query),
  );
  document.querySelector("#cards").innerHTML = visible
    .map(
      (t) =>
        `<a class="tool-card" href="${t.href || "/tools/" + t.id}"><span class="tool-symbol ${t.color}">${icon(t.icon)}</span><span class="card-arrow" aria-hidden="true">↗</span><h3>${t.title}</h3><p>${t.description}</p></a>`,
    )
    .join("");
  document.querySelector("#empty").hidden = visible.length > 0;
  document.querySelector("#resultCount").textContent =
    `${visible.length} tools found`;
}
document.querySelector("#search").addEventListener("input", render);
document.querySelectorAll("[data-category]").forEach((button) =>
  button.addEventListener("click", () => {
    group = button.dataset.category;
    document
      .querySelectorAll("[data-category]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    render();
  }),
);
render();
document.dispatchEvent(new Event("vibify:nav-ready"));
