// Regression: "LinkedIn"/"GitHub" labels are split by camelCase normalisation ("linked in"); they must still fill.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(`<label>LinkedIn URL<input id=a></label><label>GitHub profile<input id=b></label><input id=c name="linkedinUrl"><input id=d placeholder="Your Github">`);
  for (const f of ['fields.js', 'questions.js', 'groups.js', 'signature.js', 'filler.js']) await p.addScriptTag({ content: fs.readFileSync(path.join(root, f), 'utf8') });
  await p.evaluate(() => window.__formFill.fill({ data: { linkedin: 'https://linkedin.com/in/x', github: 'https://github.com/x' }, custom: [] }, {}));
  const v = await p.evaluate(() => ['a', 'b', 'c', 'd'].map((i) => document.getElementById(i).value));
  assert.deepStrictEqual(v, ['https://linkedin.com/in/x', 'https://github.com/x', 'https://linkedin.com/in/x', 'https://github.com/x']);
  console.log('PASS LinkedIn/GitHub labels fill (camelCase, lower-case and name variants)'); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
