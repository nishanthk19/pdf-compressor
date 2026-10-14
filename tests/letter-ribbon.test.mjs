import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createLetterUiFixture } from "./fixtures/letter-ui-app.js";
import { mkdir } from "node:fs/promises";

test("AI popup streams into the page, requires consent, restores on stop/failure and supports one-step undo", {
  skip: process.env.LETTER_BROWSER_TEST !== "1",
}, async () => {
  const app=createLetterUiFixture({streamDelay:250,externalAI:true}), server=app.listen(0,"127.0.0.1");
  await new Promise(r=>server.once("listening",r));
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.LETTER_CHROMIUM_PATH||undefined});
    const page=await browser.newPage({viewport:{width:1536,height:960}}), errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base+"/letter-studio.html");
    await page.locator('#studio[data-ready="true"]').waitFor();
    const doc=page.getByRole("textbox",{name:"Letter document",exact:true});
    await doc.fill("Original body.");
    await page.getByRole("button",{name:"Save document",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Revision'));
    async function prepare(prompt) {
      await page.getByRole("button",{name:"✧ AI draft",exact:true}).click();
      await page.getByRole("textbox",{name:"What should the letter say?",exact:true}).fill(prompt);
      await page.getByRole("combobox",{name:"Write into",exact:true}).selectOption("body");
    }
    await prepare("Write an acknowledgement.");
    await page.getByRole("button",{name:"Start writing",exact:true}).click();
    assert.equal(await page.getByRole("dialog").isVisible(),true);
    assert.equal(await doc.innerText(),"Original body.");
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button",{name:"Start writing",exact:true}).click();
    await page.getByText("Dear Coordinator,",{exact:true}).waitFor();
    assert.equal(await doc.getAttribute("contenteditable"),"false");
    const saved=await (await fetch(base+"/api/letters/documents")).json();
    assert.match(JSON.stringify(saved[0].data.content),/Original body/);
    assert.doesNotMatch(JSON.stringify(saved[0].data.content),/Dear Coordinator/);
    await page.getByRole("button",{name:"Stop & restore",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Letter document"]').textContent==="Original body.");
    assert.equal(await doc.getAttribute("contenteditable"),"true");
    await prepare("[truncate] Write an acknowledgement.");
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button",{name:"Start writing",exact:true}).click();
    await page.getByText("AI did not return a complete draft. Your original document is unchanged.",{exact:true}).waitFor();
    assert.equal(await doc.innerText(),"Original body.");
    await prepare("Write a complete acknowledgement.");
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button",{name:"Start writing",exact:true}).click();
    await page.getByRole("button",{name:"Undo draft",exact:true}).waitFor();
    assert.match(await doc.innerText(),/Please share the remaining enclosures/);
    await page.getByRole("button",{name:"Undo draft",exact:true}).click();
    assert.equal(await doc.innerText(),"Original body.");
    await page.getByRole("button",{name:"Redo",exact:true}).click();
    assert.match(await doc.innerText(),/Please share the remaining enclosures/);
    await page.getByRole("button",{name:"Save document",exact:true}).click();
    await page.waitForTimeout(1500); await page.reload();
    await page.locator('#studio[data-ready="true"]').waitFor();
    assert.match(await doc.innerText(),/Please share the remaining enclosures/);
    assert.deepEqual(errors,[]);
  } finally {await browser?.close(); server.closeAllConnections(); await new Promise(r=>server.close(r));}
});

test("Word ribbon GUI: formatting, find, table controls, zoom, panes and recovery", {
  skip: process.env.LETTER_BROWSER_TEST !== "1",
}, async () => {
  const app = createLetterUiFixture(), server = app.listen(0,"127.0.0.1");
  await new Promise(r=>server.once("listening",r));
  let browser, page;
  try {
    browser = await chromium.launch({ executablePath: process.env.LETTER_CHROMIUM_PATH || undefined });
    page = await browser.newPage({ viewport: { width:1536,height:960 } });
    const errors=[]; page.on("pageerror",e=>errors.push(e.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base+"/letter-studio.html");
    await page.locator('#studio[data-ready="true"]').waitFor();
    const doc=page.getByRole("textbox",{name:"Letter document",exact:true});
    await doc.fill("alpha beta alpha");
    await doc.press("ControlOrMeta+a");
    await page.getByRole("button",{name:"Bold",exact:true}).click();
    await page.getByRole("button",{name:"Superscript",exact:true}).click();
    await page.getByRole("textbox",{name:"Text highlight",exact:true}).fill("#fff176");
    assert.match(await doc.innerHTML(), /<strong>/);
    assert.match(await doc.innerHTML(), /<sup>/);
    assert.match(await doc.innerHTML(), /background-color/);
    await page.getByRole("button",{name:"Find & replace",exact:true}).click();
    await page.getByLabel("Find text",{exact:true}).fill("alpha");
    await page.getByLabel("Replace with",{exact:true}).fill("omega");
    await page.getByRole("button",{name:"Find next",exact:true}).click();
    assert.equal(await doc.innerText(),"alpha beta alpha");
    await page.getByRole("button",{name:"Replace all",exact:true}).click();
    assert.equal(await doc.innerText(),"omega beta omega");
    await page.getByRole("button",{name:"Undo",exact:true}).click();
    assert.equal(await doc.innerText(),"alpha beta alpha");
    await page.getByRole("button",{name:"Close find pane",exact:true}).click();
    await doc.press("ControlOrMeta+End");
    await page.getByRole("tab",{name:"Insert",exact:true}).click();
    await page.getByRole("button",{name:"Insert table",exact:true}).click();
    await page.getByLabel("Rows",{exact:true}).fill("3");
    await page.getByLabel("Columns",{exact:true}).fill("2");
    await page.getByRole("dialog").getByRole("button",{name:"Insert table",exact:true}).click();
    assert.equal(await doc.locator("tr:not([data-live-gap])").count(),3);
    assert.equal(await page.getByRole("tab",{name:"Table",exact:true}).getAttribute("aria-selected"),"true");
    await page.getByRole("button",{name:"Row below",exact:true}).click();
    assert.equal(await doc.locator("tr:not([data-live-gap])").count(),4);
    await page.getByRole("button",{name:"Cell appearance",exact:true}).click();
    await page.getByLabel("Cell shading",{exact:true}).fill("#cfe8ff");
    await page.getByRole("combobox",{name:"Vertical alignment",exact:true}).selectOption("middle");
    await page.getByRole("button",{name:"Apply",exact:true}).click();
    assert.match(await doc.innerHTML(),/background-color: rgb\(207, 232, 255\)/);
    await page.getByRole("tab",{name:"View",exact:true}).click();
    const pages=await page.locator("#pageMetrics").innerText();
    await page.getByRole("combobox",{name:"Zoom",exact:true}).selectOption("75");
    await page.waitForTimeout(250);
    assert.equal(await page.locator("#pageMetrics").innerText(),pages);
    await page.getByRole("button",{name:"Navigation pane",exact:true}).click();
    assert.equal(await page.locator(".left").isVisible(),false);
    await page.getByRole("button",{name:"Navigation pane",exact:true}).click();
    await page.getByRole("button",{name:"Actual size",exact:true}).click();
    await page.getByRole("button",{name:"Save document",exact:true}).click();
    await page.waitForTimeout(1500);
    const documents=await (await fetch(base+"/api/letters/documents")).json();
    assert.ok(documents.some(d=>JSON.stringify(d.data.content).includes("superscript") && JSON.stringify(d.data.content).includes("#cfe8ff")));
    await page.reload();
    await page.locator('#studio[data-ready="true"]').waitFor();
    assert.match(await doc.innerHTML(),/<sup>/);
    assert.equal(await doc.locator("tr:not([data-live-gap])").count(),4);
    await page.getByRole("tab",{name:"Home",exact:true}).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab",{name:"Insert",exact:true}).getAttribute("aria-selected"),"true");
    assert.deepEqual(errors,[]);
  } finally {
    await mkdir(".artifacts/qa",{recursive:true});
    await page?.screenshot({path:".artifacts/qa/word-ribbon.png",fullPage:true}).catch(()=>{});
    await browser?.close(); server.closeAllConnections(); await new Promise(r=>server.close(r));
  }
});
