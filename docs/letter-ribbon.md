# Letter Studio ribbon

The editor exposes common Word-style operations through accessible tabs: File,
Home, Insert, Layout, Review and View. Table and Picture tabs appear when their
content is selected. Buttons preserve the document selection; disabled commands
reflect Tiptap's current selection capabilities. Tab arrows/Home/End navigate the
ribbon, and Ctrl/Cmd+F or H opens non-destructive find/replace.

Formatting includes font family/size/color, highlight, bold/italic/underline/
strike, subscript/superscript, case changes, format painter, styles, alignment,
lists, spacing, indents and keep-with-next. Insert controls cover tables,
pictures, links, symbols, dates, fields, page breaks and stationery. Tables have
row/column operations, merge/split, header toggles, shading and vertical alignment.
Picture properties include width, alignment and alternative text.

Clipboard buttons copy HTML where the browser permits it, with native shortcut
fallbacks. Paste text deliberately strips formatting; native document paste can
retain supported formatting. Spelling suggestions use the browser's dictionary,
not a grammar service. Formatting marks currently show paragraph endings.

View zoom, ruler and workspace panes are view-only. Zoom-normalized live-page
measurements prevent view scaling from changing exported page boundaries.
Structured formatting is validated server-side and retained in shared HTML and
DOCX export paths. This is not full Microsoft Word parity: track changes,
collaborative comments, mail merge, floating image wrapping, section columns and
complex Word-layout import remain outside this release.

## Verification

AI letter drafting opens a dedicated prompt dialog from the top-bar AI draft
button or Review tab. Tone, prompt examples and insertion destination are visible
before starting. External processing still requires explicit consent. Drafts
stream directly into the canvas; the editor is temporarily locked, original
content remains the autosave/cache source, and stop/error/truncated responses
restore the original EditorState including its undo history. Only a complete
response is committed, as one undoable change. References remain linked in the
drafting status strip. Rewrites in the optional assistant pane remain proposals
that require acceptance. No letter is sent automatically.

The default desktop view hides the assistant pane to leave room for the ribbon
and page. Search commands (Alt+Q), a heading style gallery, outline navigation,
custom font sizes, quick line-spacing presets, focus mode and keyboard help
provide shorter paths to common operations.

- `npm run build` and `npm run check`
- `node --test tests/letter-studio.test.js tests/letter-nvidia.test.js`
- `LETTER_BROWSER_TEST=1 node --test tests/letter-browser.test.mjs tests/letter-ribbon.test.mjs`
  (install Playwright Chromium first, or provide `LETTER_CHROMIUM_PATH`).

The Word formatting regression verifies validation, safe HTML styles and DOCX
XML for superscript/subscript, shading, spacing, first-line indentation,
keep-with-next, table alignment and horizontal rules. The ribbon browser test
covers formatting, non-destructive search, undoable replacement, table controls,
zoom, pane visibility and persisted recovery. Manual connected-browser checks
can supplement environments where child-browser execution is restricted.

## Deployment compatibility

Deploy the application **and isolated PDF renderer from the same updated build**.
The renderer validates structured JSON and renders shared HTML, so an old worker
can reject new marks or lose new formatting. Preserve its existing isolation:
no network, no credentials/archive mounts, read-only root and resource limits.
Verify PDF/DOCX visual output on the deployed worker before declaring rollout
complete. No database migration is required for these JSON formatting additions.
