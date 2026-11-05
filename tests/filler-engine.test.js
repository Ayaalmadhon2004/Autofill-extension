// Run: NODE_PATH=$(npm root -g) node tests/filler-engine.test.js
const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');
const root = path.join(__dirname, '..');
const profile = { data: { firstName: 'Aya', lastName: 'Almadhon', email: 'aya@example.com', phone: '+1555', university: 'Cairo University' }, custom: [] };
const cv = { name: 'cv.pdf', type: 'application/pdf', size: 8, b64: Buffer.from('%PDF-1.4').toString('base64') };
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS', m); };

async function load(page, html, filerSrc) {
  await page.setContent(html);
  await page.evaluate(() => { delete window.__formFill; });
  await page.addScriptTag({ path: path.join(root, 'fields.js') });
  if (!filerSrc) { await page.addScriptTag({ path: path.join(root, 'questions.js') }); await page.addScriptTag({ path: path.join(root, 'signature.js') }); }
  if (filerSrc) await page.addScriptTag({ content: filerSrc }); else await page.addScriptTag({ path: path.join(root, 'filler.js') });
}
const run = (page, withCv) => page.evaluate(([p, c]) => window.__formFill.fill(p, {}, c), [profile, withCv ? cv : null]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Regression: plain English + Arabic form, compare with the pre-change filler.js on main
  const normal = `<form><label>First name <input name=a></label><label for=e>Email</label><input id=e>
    <label>Last name<input></label><label>الجامعة <input></label><label>Phone <input type=tel></label><select aria-label="Country"><option value="">-</option><option>Egypt</option></select></form>`;
  const dump = () => page.evaluate(() => [...document.querySelectorAll('input,select')].map((e) => e.value));
  const oldSrc = execSync('git show origin/main:filler.js', { cwd: root }).toString();
  await load(page, normal, oldSrc);
  const rOld = await page.evaluate((p) => window.__formFill.fill(p, {}), profile); const vOld = await dump();
  await load(page, normal);
  const rNew = await run(page); const vNew = await dump();
  ok(JSON.stringify(vOld) === JSON.stringify(vNew) && rOld.filled === rNew.filled && JSON.stringify(rOld.fields) === JSON.stringify(rNew.fields), `no regression on normal form (${rNew.filled} filled: ${vNew.join('|')})`);
  await load(page, `<div dir=rtl><label>الاسم الأول <input></label><label>البريد الإلكتروني <input></label></div>`);
  const ar = await run(page);
  ok(ar.filled === 2, 'Arabic labels still fill');

  // Shadow DOM + nested
  await load(page, `<div id=h></div>`);
  await page.evaluate(() => {
    const s = document.getElementById('h').attachShadow({ mode: 'open' });
    s.innerHTML = `<label>First name <input id=f></label><div id=inner></div>`;
    const s2 = s.getElementById('inner') ? s.querySelector('#inner').attachShadow({ mode: 'open' }) : null;
    s2.innerHTML = `<label for=em>Email</label><input id=em><label>Last name <input id=ln></label>`;
  });
  const sh = await run(page);
  const vals = await page.evaluate(() => { const s = document.getElementById('h').shadowRoot; const s2 = s.querySelector('#inner').shadowRoot; return [s.getElementById('f').value, s2.getElementById('em').value, s2.getElementById('ln').value]; });
  ok(sh.filled === 3 && vals.join() === 'Aya,aya@example.com,Almadhon', 'shadow + nested shadow filled (label for= resolved inside root): ' + vals);

  // iframes: same-origin srcdoc, filled when the filler runs in every frame (as allFrames injection does)
  await load(page, `<iframe id=fr srcdoc="<label>Email <input id=x></label>"></iframe>`);
  await page.waitForSelector('#fr');
  const frame = page.frames().find((f) => f !== page.mainFrame());
  for (const f of ['fields.js', 'questions.js', 'signature.js', 'filler.js']) await frame.addScriptTag({ path: path.join(root, f) });
  const fr = await frame.evaluate((p) => window.__formFill.fill(p, {}), profile);
  ok(fr.filled === 1 && await frame.$eval('#x', (e) => e.value) === 'aya@example.com', 'iframe filled by per-frame injection');

  // Report
  await load(page, `<form><label>Email <input></label><label>Nickname* <input id=n></label><label>Pronouns <input id=p required></label>
    <input id=t aria-required=true aria-label="Visa status"><label>Optional <input id=o></label>
    <fieldset><legend>Work auth *</legend><label><input type=radio name=w value=y>Yes</label><label><input type=radio name=w>No</label></fieldset></form>`);
  const rep = await run(page);
  ok(rep.filled === 1 && rep.missing.join('|') === 'Nickname|Pronouns|Visa status|Work auth', 'report lists required empties: ' + rep.missing.join('|'));
  const marks = await page.$$eval('span[data-formfill-marker]', (s) => s.map((x) => x.textContent));
  ok(marks.length === 4 && marks[0].includes('Required'), 'text marker added next to each (not colour alone)');
  ok(await page.$eval('#n', (e) => getComputedStyle(e).outlineStyle) === 'dashed', 'outline applied');
  await page.fill('#n', 'x');
  ok(await page.$$eval('span[data-formfill-marker]', (s) => s.length) === 3, 'marker clears once user fills the field');
  const rep2 = await run(page);
  ok(rep2.missing.length === 3 && await page.$$eval('span[data-formfill-marker]', (s) => s.length) === 3, 're-run does not duplicate markers');

  // CV attach
  await load(page, `<form><label>Resume/CV <input type=file id=r accept=".pdf,.docx"></label><label>Cover letter <input type=file id=c></label>
    <label>Profile photo <input type=file id=ph accept="image/*"></label><label>السيرة الذاتية <input type=file id=ar></label><label>Other file <input type=file id=ot></label></form>`);
  await page.evaluate(() => { window.ev = []; document.getElementById('r').addEventListener('change', () => window.ev.push('change')); document.getElementById('r').addEventListener('input', () => window.ev.push('input')); });
  const cr = await run(page, true);
  const files = await page.evaluate(() => ['r', 'c', 'ph', 'ar', 'ot'].map((i) => { const f = document.getElementById(i).files; return f.length ? f[0].name + ':' + f[0].size : '-'; }));
  ok(files.join() === 'cv.pdf:8,-,-,cv.pdf:8,-', 'CV attached to resume + Arabic only: ' + files);
  ok((await page.evaluate(() => window.ev)).join() === 'input,change', 'input/change dispatched');
  ok(cr.fields.filter((f) => f === 'Resume / CV').length === 2, 'reported as filled');
  await load(page, `<label>Resume <input type=file accept="image/*"></label>`);
  await run(page, true);
  ok(await page.$eval('input', (e) => e.files.length) === 0, 'accept mismatch skipped');

  await browser.close();
  console.log(`\n${pass} checks passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
