// Popup report + options Documents section, with a stubbed chrome.* API.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const os = require('os'); const assert = require('assert');
const root = path.join(__dirname, '..');
const stub = `
  window.__store = { profiles: [{id:'a', name:'English', data:{}, custom:[]}], activeId:'a' };
  window.chrome = {
    storage: { local: {
      get: async (k) => { if (k === null) return {...__store}; if (typeof k === 'string') return {[k]: __store[k]}; const o = {}; for (const x in k) o[x] = x in __store ? __store[x] : k[x]; return o; },
      set: async (o) => Object.assign(__store, o),
      remove: async (k) => [].concat(k).forEach((x) => delete __store[x]) } },
    tabs: { query: async () => [{ id: 1, url: 'https://x.test/' }] },
    scripting: { executeScript: async (o) => o.files ? [] : [{ result: { filled: 2, fields: ['a','b'], missing: ['Nickname', 'Visa status'] } }, { result: { filled: 1, fields: ['c'], missing: [] } }] },
    runtime: { openOptionsPage() {} } };`;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 300, height: 500 } });
  await page.addInitScript(stub);
  await page.goto('file://' + root + '/popup.html');
  await page.click('#fill');
  await page.waitForSelector('#missing li');
  const txt = await page.innerText('#missing');
  assert.ok(/Filled 3\. 2 required fields need you:/.test(txt) && /Nickname/.test(txt) && /Visa status/.test(txt), txt);
  console.log('PASS popup report:', JSON.stringify(txt));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('file://' + root + '/options.html');
  await page.waitForSelector('#cvCurrent');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-'));
  fs.writeFileSync(tmp + '/me.pdf', '%PDF-1.4 hello'); fs.writeFileSync(tmp + '/me.txt', 'x');
  fs.writeFileSync(tmp + '/big.pdf', Buffer.alloc(5 * 1024 * 1024 + 1));
  await page.setInputFiles('#cvFile', tmp + '/me.txt');
  assert.ok((await page.innerText('#cvMsg')).includes('PDF or DOCX')); console.log('PASS rejects .txt');
  await page.setInputFiles('#cvFile', tmp + '/big.pdf');
  assert.ok((await page.innerText('#cvMsg')).includes('5 MB')); console.log('PASS rejects >5MB');
  await page.setInputFiles('#cvFile', tmp + '/me.pdf');
  await page.waitForFunction(() => document.getElementById('cvCurrent').textContent.includes('me.pdf'));
  const st = await page.evaluate(() => __store[Object.keys(__store).find((k) => k.startsWith('cv_'))]); assert.ok(await page.evaluate(() => 'cv_a' in __store));
  assert.ok(Buffer.from(st.b64, 'base64').toString() === '%PDF-1.4 hello' && st.type === 'application/pdf'); console.log('PASS stores base64 per profile');
  await page.click('#cvRemove');
  await page.waitForFunction(() => document.getElementById('cvCurrent').textContent.startsWith('No CV'));
  assert.ok(!(await page.evaluate(() => 'cv_a' in __store))); console.log('PASS remove');
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
