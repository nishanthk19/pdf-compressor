import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { pageDimensions, stationeryHtml } from "../public/js/letter-model.js";

const key = new PluginKey("vibifyLivePages"),
  PX = 96 / 25.4;
// Layout-only widgets never enter the saved JSON or undo history. The same body
// geometry is used by print pagination. Oversized table rows remain a preview
// validation error rather than being silently clipped.
export const LivePages = Extension.create({
  name: "vibifyLivePages",
  addOptions() {
    return { getLetter: () => null, onPages: () => {} };
  },
  addCommands() {
    return {
      refreshLetterPages:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(key, { refresh: true }));
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const update = tr.getMeta(key);
            if (update?.decorations)
              return DecorationSet.create(tr.doc, update.decorations);
          if(update?.refresh)return DecorationSet.create(tr.doc,decorations.find());
            return decorations.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => key.getState(state) },
        view(view) {
          let frame,
            disposed = false,
            lastSignature = "",
            lastDocument = null;
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
          };
          const measure = () => {
            if (disposed || !view.dom.isConnected) return;
            // Chromium can defer parsing a native edit until after a layout
            // frame. Commit those DOM mutations before dispatching pagination
            // decorations, otherwise the older state can replace fresh input.
            if (view.composing) return;
            view.domObserver.flush();
            const letter = options.getLetter();
            if (!letter) return;
            const [width, height] = pageDimensions(letter.page),
              margin = letter.page.margin;
            const usable = (height - margin * 2 - 46) * PX,
              gap = (margin * 2 + 46) * PX + 24;
            // CSS zoom is a view preference, never a change to pagination geometry.
            const zoom = Number.parseFloat(getComputedStyle(view.dom.closest("#paper")).zoom) || 1;
            const old = [...view.dom.querySelectorAll("[data-live-gap]")].map(
              (n) => ({
                pos: +n.dataset.liveGap,
                height: n.getBoundingClientRect().height / zoom,
              }),
            );
            const before = (pos) =>
              old.filter((g) => g.pos <= pos).reduce((n, g) => n + g.height, 0);
            const top = view.dom.getBoundingClientRect().top;
            const yAt = (pos) => {
              try {
                return (view.coordsAtPos(pos).top - top) / zoom - before(pos);
              } catch {
                return 0;
              }
            };
            const targets = [];
            view.state.doc.descendants((node, pos, parent) => {
              if (
                node.type.name === "tableRow" ||
                node.type.name === "listItem"
              ) {
                targets.push({ node, pos });
                return false;
              }
              if (
                parent === view.state.doc &&
                !["table", "bulletList", "orderedList"].includes(node.type.name)
              ) {
                targets.push({ node, pos });
                return false;
              }
            });
            const decorations = [],
              identity = [];
            let page = 1,
              added = 0,
              boundary = usable;
            const stationery = (first, footer = false) =>
              stationeryHtml(letter, first ? 1 : Math.max(2, page), footer);
            const addGap = (pos, remaining, row = false, cols = 1) => {
              const size = Math.max(0, remaining) + gap,
                footer = stationery(page === 1, true);
              page++;
              const header = stationery(false),
                pageNumber = page;
              identity.push([pos, Math.round(size * 10) / 10, page]);
              decorations.push(
                Decoration.widget(
                  pos,
                  () => {
                    const node = document.createElement(row ? "tr" : "span");
                    node.dataset.liveGap = String(pos);
                    node.contentEditable = "false";
                    node.setAttribute("aria-hidden", "true");
                    node.className = "live-page-gap";
                    const content = row ? document.createElement("td") : node;
                    if (row) {
                      content.colSpan = cols;
                      content.style.cssText = "border:0;padding:0;";
                      node.append(content);
                    }
                    content.innerHTML = `<span class="live-page-gap-content" style="height:${size}px"><span style="height:${Math.max(0, remaining)}px"></span><span class="stationery live-footer" style="height:${(margin + 16) * PX}px;padding-bottom:${margin * PX}px">${footer}</span><span class="live-page-divider" style="height:24px"></span><span class="stationery live-header" style="height:${(margin + 30) * PX}px;padding-top:${margin * PX}px">${header}<small class="live-page-label">Page ${pageNumber}</small></span></span>`;
                    return node;
                  },
                  {
                    side: -1,
                    key:
                      "page-" +
                      page +
                      "-" +
                      pos +
                      "-" +
                      Math.round(size) +
                      "-" +
                      JSON.stringify(letter.stationery),
                  },
                ),
              );
              added += size;
              boundary += usable + gap;
            };
            for (const [targetIndex, { node, pos }] of targets.entries()) {
              const dom = view.nodeDOM(pos);
              if (!(dom instanceof HTMLElement)) continue;
              const rect = dom.getBoundingClientRect(),
                start = (rect.top - top) / zoom - before(pos),
                inside = old
                  .filter((g) => g.pos > pos && g.pos < pos + node.nodeSize)
                  .reduce((n, g) => n + g.height, 0);
              const blockHeight = rect.height / zoom - inside,
                end = start + blockHeight + added;
              if (node.type.name === "pageBreak") {
                addGap(pos, Math.max(0, boundary - start - added));
                continue;
              }
              if (node.attrs.keepNext || node.type.name === "heading") {
                const nextTarget = targets[targetIndex + 1], nextDom = nextTarget && view.nodeDOM(nextTarget.pos);
                const nextLine = nextDom instanceof HTMLElement ? Number.parseFloat(getComputedStyle(nextDom).lineHeight) || 22 : 0;
                if (nextLine && blockHeight + nextLine <= usable && end + nextLine > boundary + 1 && start + added > boundary - usable + 1) {
                  addGap(pos, boundary - start - added);
                  continue;
                }
              }
              if (end <= boundary + 1) continue;
              if (blockHeight <= usable) {
                addGap(
                  pos,
                  boundary - start - added,
                  node.type.name === "tableRow",
                  node.childCount,
                );
                continue;
              }
              if (node.isTextblock) {
                let from = pos + 1,
                  limit = pos + node.nodeSize - 1;
                while (from < limit && yAt(limit - 1) + added >= boundary - 1) {
                  let lo = from + 1,
                    hi = limit - 1,
                    found = limit;
                  while (lo <= hi) {
                    const mid = Math.floor((lo + hi) / 2);
                    if (yAt(mid) + added >= boundary - 1) {
                      found = mid;
                      hi = mid - 1;
                    } else lo = mid + 1;
                  }
                  if (found >= limit) break;
                  addGap(found, Math.max(0, boundary - yAt(found) - added));
                  from = found + 1;
                }
              }
            }
            const rect = view.dom.getBoundingClientRect(),
              naturalHeight =
                rect.height / zoom - old.reduce((n, g) => n + g.height, 0);
            const reserve = letter.stationery.signature ? 20 * PX : 0;
            const tail = Math.max(
              0,
              boundary - naturalHeight - added - reserve,
            );
            identity.push(["tail", Math.round(tail)]);
            if (tail > 1)
              decorations.push(
                Decoration.widget(
                  view.state.doc.content.size,
                  () => {
                    const n = document.createElement("span");
                    n.dataset.liveGap = String(view.state.doc.content.size);
                    n.className = "live-page-tail";
                    n.style.height = tail + "px";
                    n.contentEditable = "false";
                    return n;
                  },
                  { side: 1, key: "tail-" + Math.round(tail) },
                ),
              );
            const signature = JSON.stringify([
              identity,
              letter.stationery,
              letter.fields,
              width,
              height,
              margin,
            ]);
            if (
              signature !== lastSignature ||
              lastDocument !== view.state.doc
            ) {
              lastSignature = signature;
              lastDocument = view.state.doc;
              view.dispatch(
                view.state.tr
                  .setMeta(key, { decorations })
                  .setMeta("addToHistory", false),
              );
            }
            view.dom
              .querySelectorAll("[data-total-pages]")
              .forEach((n) => (n.textContent = String(page)));
            options.onPages(page);
          };
          const observer = new ResizeObserver(schedule);
          observer.observe(view.dom);
          schedule();
          return {
            update(next, previous) {
              if (
                !next.state.doc.eq(previous.doc) ||
                key.getState(next.state)!==key.getState(previous)
              )
                schedule();
            },
            destroy() {
              disposed = true;
              cancelAnimationFrame(frame);
              observer.disconnect();
            },
          };
        },
      }),
    ];
  },
});
