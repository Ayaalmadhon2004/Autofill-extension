// Playwright: filler behaviour on repeated blocks.  Run: NODE_PATH=$(npm root -g) node tests/security.filler.pw.js
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');

const profile = {
  data: { firstName: 'Aya', lastName: 'Almadhon', email: 'aya@example.com', currentCompany: 'LegacyCo', university: 'LegacyU' },
  custom: [],
  experience: [
    { company: 'Acme', title: 'Engineer', start: '2022-01', end: 'Present', description: 'Built things' },
    { company: 'Globex', title: 'Intern', start: '2021-06', end: '2021-09', description: 'Helped' }
  ],
  education: [{ school: 'MIT', degree: 'BSc', major: 'CS', year: '2020', gpa: '3.9' }]
};

const pages = {
  fieldsets: `<form>
    <label>First name <input name="fn"></label>
    ${[1, 2, 3].map((n) => `<fieldset><legend>Position ${n}</legend>
      <label>Company <input class="c"></label><label>Job title <input class="t"></label>
      <label>Start date <input class="s"></label><label>End date <input class="e"></label>
      <label>Description <textarea class="d"></textarea></label></fieldset>`).join('')}
    <fieldset><legend>School</legend><label>University <input id="uni"></label><label>Degree <input id="deg"></label>
      <label>Major <input id="maj"></label><label>Graduation year <input id="yr"></label><label>GPA <input id="gpa"></label></fieldset>
  </form>`,
  indexed: `<form>
    <input name="experience[0][company]" placeholder="x"><input name="experience[1][company]" placeholder="y">
    <input name="experience[0][title]" aria-label="Job title"><input name="experience[1][title]" aria-label="Job title">
    <input name="education[0][school]" aria-label="School">
  </form>`,
  flat: `<form>
    <label>Company <input id="c1"></label><label>Job title <input id="t1"></label>
    <label>Company <input id="c2"></label><label>Job title <input id="t2"></label>
  </form>`,
  single: `<form><label>Employer <input id="c"></label><label>Position title <input id="t"></label>
    <label>Start date <input type="month" id="s"></label><label>End date <input type="month" id="e"></label></form>`,
  legacy: `<form><label>Current company <input id="cc"></label><label>University <input id="u"></label>
    <label>Email <input id="em"></label><label>الاسم الأول <input id="ar"></label></form>`
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const load = async (html) => {
    await page.setContent(html);
    for (const f of ['fields.js', 'questions.js', 'groups.js', 'signature.js', 'filler.js']) await page.addScriptTag({ path: path.join(root, f) });
  };
  const fill = (p, s) => page.evaluate(([p, s]) => window.__formFill.fill(p, s), [p, s || {}]);
  const vals = (sel) => page.$$eval(sel, (els) => els.map((e) => e.value));
  let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

  await load(pages.fieldsets);
  await fill(profile);
  assert.deepEqual(await vals('.c'), ['Acme', 'Globex', ''], 'third block has no entry: untouched'); ok('3 fieldset blocks: 2 entries fill blocks 1-2, block 3 skipped');
  assert.deepEqual(await vals('.t'), ['Engineer', 'Intern', '']);
  assert.deepEqual(await vals('.s'), ['2022-01', '2021-06', '']);
  assert.deepEqual(await vals('.d'), ['Built things', 'Helped', '']); ok('textarea + dates mapped per block');
  assert.deepEqual(await vals('#uni, #deg, #maj, #yr, #gpa'), ['MIT', 'BSc', 'CS', '2020', '3.9']); ok('education block filled from education[0]');
  assert.equal((await vals('[name=fn]'))[0], 'Aya'); ok('non-repeating fields still filled');

  await load(pages.indexed);
  await fill(profile);
  assert.deepEqual(await vals('input'), ['Acme', 'Globex', 'Engineer', 'Intern', 'MIT']);
  ok('index-named fields (experience[0], experience[1]) map by index even when interleaved');

  await load(pages.flat);
  await fill(profile);
  assert.deepEqual(await vals('input'), ['Acme', 'Engineer', 'Globex', 'Intern']); ok('flat form, repetition detected by DOM order');

  await load(pages.single);
  await fill(profile);
  assert.deepEqual(await vals('input'), ['Acme', 'Engineer', '2022-01', '']); ok('single block uses first entry; month input takes ISO only ("Present" skipped)');

  await load(pages.fieldsets);
  await page.fill('.c >> nth=0', 'Typed');
  await fill(profile);
  assert.equal((await vals('.c'))[0], 'Typed'); ok('existing text not overwritten');
  await fill(profile, { overwrite: true });
  assert.equal((await vals('.c'))[0], 'Acme'); ok('overwrite setting respected');

  await load(pages.legacy);
  await fill(profile);
  assert.deepEqual(await vals('input'), ['Acme', 'MIT', 'aya@example.com', 'Aya']);
  ok('regression: English + Arabic generic fields still filled; single company/university field uses entry 0');
  await load(pages.legacy);
  await fill({ data: profile.data, custom: [] });
  assert.deepEqual(await vals('input'), ['LegacyCo', 'LegacyU', 'aya@example.com', 'Aya']);
  ok('regression: profile without entries uses legacy Current company / University values');

  const noEntries = { data: profile.data, custom: [] };
  await load(pages.fieldsets);
  await fill(noEntries);
  assert.deepEqual(await vals('.c'), ['', '', '']); ok('profile without entries: repeated blocks untouched, as before (generic matcher does not know a bare Company label)');

  await browser.close();
  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
