import { Fragment, Slice } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { closeHistory } from "@tiptap/pm/history";
import { Selection } from "@tiptap/pm/state";

export function draftSlice(schema, text) {
  return new Slice(Fragment.fromArray(text.replace(/\r\n?/g, "\n").split("\n").map(line =>
    schema.nodes.paragraph.create(null, line ? schema.text(line) : null))), 1, 1);
}

export function composeDraft(doc, schema, range, text) {
  return new Transform(doc).replaceRange(range.from, range.to, draftSlice(schema, text)).doc;
}

// Streaming is a temporary preview. Keep the original EditorState (including
// selection and undo history) intact, then commit exactly one undoable edit.
export class DirectDraft {
  constructor(editor, range) {
    this.editor = editor;
    this.originalState = editor.state;
    this.range = range;
    this.editable = editor.isEditable;
    this.closed = false;
    editor.setEditable(false, false);
  }
  preview(text) {
    if (this.closed) return;
    const doc = composeDraft(this.originalState.doc, this.editor.schema, this.range, text);
    const tr = this.editor.state.tr
      .replaceWith(0, this.editor.state.doc.content.size, doc.content)
      .setMeta("addToHistory", false).setMeta("preventUpdate", true);
    const end = this.range.to + doc.content.size - this.originalState.doc.content.size;
    tr.setSelection(Selection.near(tr.doc.resolve(Math.max(0, Math.min(end, tr.doc.content.size)))));
    this.editor.view.dispatch(tr.scrollIntoView());
  }
  finish(text) {
    if (this.closed) return;
    this.restore();
    this.editor.view.dispatch(closeHistory(this.editor.state.tr)
      .replaceRange(this.range.from, this.range.to, draftSlice(this.editor.schema, text)));
    this.editor.view.dispatch(closeHistory(this.editor.state.tr));
  }
  restore() {
    if (this.closed) return;
    this.closed = true;
    this.editor.view.updateState(this.originalState);
    this.editor.setEditable(this.editable, false);
  }
}
