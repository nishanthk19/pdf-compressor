import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { composeDraft, DirectDraft } from "../frontend/letter-direct-draft.js";

const schema = new Schema({ nodes: {
  doc: { content: "paragraph+" }, paragraph: { content: "text*", group: "block" }, text: { group: "inline" },
}, marks: { strong: {} } });
const doc = text => schema.node("doc", null, [schema.node("paragraph", null, text ? schema.text(text) : null)]);
function fixture(text) {
  let state = EditorState.create({ schema, doc:doc(text), plugins:[history()] }), editable = true;
  const view = { dispatch(tr) { state = state.apply(tr); }, updateState(next) { state = next; } };
  return { schema, view, get state() {return state;}, get isEditable() {return editable;}, setEditable(value) {editable=value;} };
}
test("direct draft previews do not destroy original undo history; completion is one edit", () => {
  const editor = fixture("Original");
  editor.view.dispatch(editor.state.tr.insertText(" body",9));
  const original = editor.state;
  const session = new DirectDraft(editor,{from:0,to:editor.state.doc.content.size});
  assert.equal(editor.isEditable,false);
  session.preview("New"); session.preview("New letter\nSecond line — धन्यवाद");
  assert.equal(original.doc.textContent,"Original body");
  assert.match(editor.state.doc.textContent,/Second line/);
  session.finish("New letter\nSecond line — धन्यवाद");
  assert.equal(editor.isEditable,true);
  assert.equal(editor.state.doc.childCount,2);
  assert.ok(undo(editor.state,editor.view.dispatch));
  assert.equal(editor.state.doc.textContent,"Original body");
  assert.ok(undo(editor.state,editor.view.dispatch));
  assert.equal(editor.state.doc.textContent,"Original");
  assert.ok(redo(editor.state,editor.view.dispatch));
  assert.equal(editor.state.doc.textContent,"Original body");
});
test("stopping restores the exact original state and selection without an undo entry", () => {
  const editor=fixture("Keep my letter"), original=editor.state;
  const session=new DirectDraft(editor,{from:1,to:1});
  session.preview("Partial draft"); session.restore(); session.preview("ignored");
  assert.equal(editor.state,original);
  assert.equal(editor.isEditable,true);
  assert.equal(undo(editor.state,editor.view.dispatch),false);
});
test("cursor and selection drafting preserve surrounding content and treat HTML as text", () => {
  const original=doc("Alpha Beta");
  const inserted=composeDraft(original,schema,{from:7,to:7},"<script>literal</script>\n\nNew");
  assert.match(inserted.textContent,/Alpha <script>literal<\/script>/);
  assert.match(inserted.textContent,/Beta$/);
  assert.equal(inserted.childCount,3);
  const replaced=composeDraft(original,schema,{from:7,to:11},"Gamma");
  assert.equal(replaced.textContent,"Alpha Gamma");
});
