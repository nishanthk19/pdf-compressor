// Deterministic pagination used by print preview and the Chromium export worker.
export function paginate(
  root,
  { width, height, margin, stationery, headerHtml, footerHtml },
) {
  const blocks = [...root.children].map((n) => n.cloneNode(true));
  root.replaceChildren();
  let body,
    page,
    index = 0;
  const next = () => {
    index++;
    page = document.createElement("section");
    page.className = "printed-page";
    page.style.cssText = `width:${width}mm;height:${height}mm;padding:${margin}mm;position:relative;background:white;overflow:hidden;`;
    const header = document.createElement("header");
    header.className = "stationery";
    header.innerHTML = headerHtml(index);
    header.style.cssText = "height:24mm;overflow:hidden;margin-bottom:6mm";
    body = document.createElement("div");
    body.className = "printed-body";
    body.style.cssText = `height:${height - margin * 2 - 46}mm;overflow:hidden;`;
    const footer = document.createElement("footer");
    footer.className = "stationery";
    footer.innerHTML = footerHtml(index);
    footer.style.cssText = "height:14mm;overflow:hidden;margin-top:2mm";
    page.append(header, body, footer);
    root.append(page);
    if (
      header.scrollHeight > header.clientHeight + 1 ||
      footer.scrollHeight > footer.clientHeight + 1
    )
      throw new Error(
        "Letterhead or footer is too tall. Shorten the stationery text.",
      );
  };
  next();
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  const textLength = (n) => n.textContent.length;
  function fragment(block, start, end) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n,
      offset = 0,
      range = document.createRange(),
      set = false;
    while ((n = walker.nextNode())) {
      const length = n.textContent.length;
      if (!set && start <= offset + length) {
        range.setStart(n, Math.max(0, start - offset));
        set = true;
      }
      if (set && end <= offset + length) {
        range.setEnd(n, Math.max(0, end - offset));
        break;
      }
      offset += length;
    }
    const clone = block.cloneNode(false);
    clone.append(range.cloneContents());
    return clone;
  }
  for (let block of blocks) {
    if (block.classList.contains("page-break")) {
      next();
      continue;
    }
    if (block.tagName === "IMG") {
      block.style.maxHeight = `${height - margin * 2 - 48}mm`;
      block.style.objectFit = "contain";
    }
    body.append(block);
    if (fits()) continue;
    block.remove();
    if (body.childNodes.length) {
      next();
      body.append(block);
      if (fits()) continue;
      block.remove();
    }
    // Tables split between rows with the first header row repeated.
    if (block.tagName === "TABLE") {
      const rows = [...block.querySelectorAll("tr")];
      const first = rows[0]?.querySelector("th") ? rows.shift() : null;
      let table;
      const start = () => {
        table = block.cloneNode(false);
        if (first) table.append(first.cloneNode(true));
        body.append(table);
      };
      start();
      for (const row of rows) {
        table.append(row.cloneNode(true));
        if (!fits()) {
          table.lastChild.remove();
          if (table.querySelectorAll("tr").length <= (first ? 1 : 0))
            throw new Error(
              "A table row is taller than a page. Split that row or reduce its content.",
            );
          next();
          start();
          table.append(row.cloneNode(true));
          if (!fits()) throw new Error("A table row is taller than a page.");
        }
      }
      continue;
    }
    if (["UL", "OL"].includes(block.tagName)) {
      let list = block.cloneNode(false),
        count = 0;
      body.append(list);
      for (const child of [...block.children]) {
        list.append(child.cloneNode(true));
        if (!fits()) {
          list.lastChild.remove();
          if (!list.children.length)
            throw new Error(
              "A list item is taller than a page. Split the item.",
            );
          next();
          list = block.cloneNode(false);
          if (block.tagName === "OL") list.start = count + 1;
          body.append(list);
          list.append(child.cloneNode(true));
          if (!fits()) throw new Error("A list item is taller than a page.");
        }
        count++;
      }
      continue;
    }
    if (["P", "BLOCKQUOTE"].includes(block.tagName) && textLength(block)) {
      let start = 0;
      const length = textLength(block);
      while (start < length) {
        let low = start + 1,
          high = length,
          best = start;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2),
            part = fragment(block, start, mid);
          body.append(part);
          const fit = fits();
          part.remove();
          if (fit) {
            best = mid;
            low = mid + 1;
          } else high = mid - 1;
        }
        if (best === start)
          throw new Error("Content cannot fit within the page margins.");
        if (best < length) {
          const boundary = block.textContent.lastIndexOf(" ", best);
          if (boundary > start && boundary + 1 <= best) best = boundary + 1;
        }
        body.append(fragment(block, start, best));
        start = best;
        if (start < length) next();
      }
      continue;
    }
    throw new Error(
      "An element is taller than a page. Resize it or insert a page break.",
    );
  }
  root
    .querySelectorAll("[data-total-pages]")
    .forEach((n) => (n.textContent = String(index)));
  return index;
}
