// NODE_PATH=$(npm root -g) node tests/tracker.pages.test.js
const { chromium } = require('playwright'), assert = require('assert'), path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), url = (f) => 'file://' + path.join(root, f);
const shots = process.env.SHOTS || path.join(require('os').tmpdir(), 'tracker-shots'); fs.mkdirSync(shots, { recursive: true });

// In-memory chrome mock, injected before page scripts run. `__seed` is set per test.
const mock = () => {
  const store = JSON.parse(window.name || '{}');
  window.__store = store;
  const persist = () => { window.name = JSON.stringify(store); };
  window.chrome = {
    storage: { local: {
      async get(d) { return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k in store ? JSON.parse(JSON.stringify(store[k])) : v])); },
      async set(o) { Object.assign(store, JSON.parse(JSON.stringify(o))); persist(); },
      async remove(k) { delete store[k]; persist(); }
    } },
    runtime: { openOptionsPage() { window.__optionsOpened = true; } }
  };
};
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const seed = [
  { id: 'a1', url: 'https://acme.com/jobs/1', host: 'acme.com', title: 'Backend Intern - Acme', profileId: 'default', filledCount: 8, date: day(0), status: 'applied', notes: '' },
  { id: 'a2', url: 'https://globex.com/careers/2', host: 'globex.com', title: 'مهندس برمجيات - غلوبكس', profileId: 'ar', filledCount: 5, date: day(2), status: 'interviewing', notes: '=SUM(1)' },
  { id: 'a3', url: 'https://initech.com/apply', host: 'initech.com', title: 'Analyst', profileId: 'default', filledCount: 3, date: day(40), status: 'rejected', notes: '' }
];
const noScroll = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(o <= 0, `${label}: horizontal scroll ${o}px`);
};
async function newPage(browser, w, state) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => { if (!window.name) window.name = s; }, JSON.stringify(state || {}));
  await page.addInitScript(mock);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- history.html ----------
    for (const w of [390, 1440]) {
      const { page, errors } = await newPage(browser, w, { applications: seed });
      await page.goto(url('history.html'));
      await page.waitForSelector('li.app');
      const titles = await page.$$eval('li.app h2', (e) => e.map((x) => x.textContent));
      assert.deepEqual(titles, ['Backend Intern - Acme', 'مهندس برمجيات - غلوبكس', 'Analyst'], 'newest first');
      assert.match(await page.textContent('#summary'), /^2 applications this month · 3 in total$/);
      await noScroll(page, 'history ' + w);
      // 44px targets
      const small = await page.$$eval('button, select, input, textarea, li.app h2 a', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 43.5 || (e.tagName !== 'A' && r.width < 43.5); }).map((e) => e.tagName + '#' + e.id));
      assert.deepEqual(small, [], 'small targets ' + small);
      // status is a labelled select with text options
      assert.equal(await page.$eval('li[data-id=a2] select', (s) => s.selectedOptions[0].textContent), 'Interviewing');
      await page.screenshot({ path: path.join(shots, `history-${w}.png`), fullPage: true });

      if (w === 1440) {
        await page.fill('#q', 'globex'); assert.equal(await page.$$eval('li.app', (e) => e.length), 1);
        await page.fill('#q', 'غلوبكس'); assert.equal(await page.$$eval('li.app', (e) => e.length), 1, 'Arabic search');
        await page.fill('#q', 'nomatch'); assert.equal(await page.isVisible('#empty'), true);
        await page.fill('#q', '');
        await page.selectOption('#f', 'rejected'); assert.deepEqual(await page.$$eval('li.app h2', (e) => e.map((x) => x.textContent)), ['Analyst']);
        await page.selectOption('#f', '');
        // edit status + notes persist to storage
        await page.selectOption('li[data-id=a1] select', 'offer');
        await page.fill('li[data-id=a1] textarea', 'Great team'); await page.press('li[data-id=a1] textarea', 'Tab');
        await page.waitForTimeout(100);
        const st = await page.evaluate(() => window.__store.applications.find((a) => a.id === 'a1'));
        assert.equal(st.status, 'offer'); assert.equal(st.notes, 'Great team');
        // keyboard: tab order reaches the delete button, focus ring present
        await page.focus('li[data-id=a3] .del');
        const ol = await page.$eval('li[data-id=a3] .del', (b) => getComputedStyle(b).outlineStyle);
        assert.notEqual(ol, 'none', 'focus ring');
        // CSV
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.equal(dl.suggestedFilename(), 'applications.csv');
        assert.ok(csv.startsWith('﻿Date,Title,Site,URL,Status,Fields filled,Notes'), csv.slice(0, 80));
        assert.ok(csv.includes("'=SUM(1)"), 'formula injection neutralised');
        assert.ok(csv.includes('Offer') && csv.includes('غلوبكس'));
        // delete
        page.once('dialog', (d) => d.accept());
        await page.click('li[data-id=a3] .del');
        assert.equal(await page.$$eval('li.app', (e) => e.length), 2);
        assert.equal(await page.evaluate(() => window.__store.applications.length), 2);
        assert.match(await page.textContent('#summary'), /^2 applications this month · 2 in total$/);
      }
      assert.deepEqual(errors, [], 'page errors');
      await page.context().close();
    }
    { // empty state
      const { page } = await newPage(browser, 390, {});
      await page.goto(url('history.html'));
      assert.match(await page.textContent('#empty'), /No applications yet/);
      assert.match(await page.textContent('#summary'), /^0 applications this month/);
      assert.equal(await page.isDisabled('#csv'), true);
      await noScroll(page, 'history empty');
      await page.context().close();
    }

    // ---------- onboarding.html ----------
    for (const w of [390, 1440]) {
      const { page, errors } = await newPage(browser, w, {});
      await page.goto(url('onboarding.html'));
      assert.equal(await page.textContent('#count'), 'Step 1 of 3');
      assert.match(await page.textContent('#s1b'), /stays in this browser/);
      await noScroll(page, 'onboarding1 ' + w);
      await page.screenshot({ path: path.join(shots, `onboarding1-${w}.png`), fullPage: true });
      await page.click('#next');
      assert.equal(await page.textContent('#count'), 'Step 2 of 3');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'h2a', 'focus moves to step heading');
      await page.fill('[name=fullName]', 'Sara Ahmed'); await page.fill('[name=email]', 'sara@example.com');
      await page.fill('[name=phone]', '+1 555 0100'); await page.fill('[name=linkedin]', 'https://www.linkedin.com/in/sara');
      await noScroll(page, 'onboarding2 ' + w);
      await page.screenshot({ path: path.join(shots, `onboarding2-${w}.png`), fullPage: true });
      await page.click('#next');
      assert.equal(await page.textContent('#count'), 'Step 3 of 3');
      const prof = await page.evaluate(() => window.__store.profiles[0].data);
      assert.deepEqual(prof, { fullName: 'Sara Ahmed', email: 'sara@example.com', phone: '+1 555 0100', linkedin: 'https://www.linkedin.com/in/sara', firstName: 'Sara', lastName: 'Ahmed' });
      assert.match(await page.textContent('#s3list'), /Ctrl\+Shift\+F[\s\S]*chrome:\/\/extensions/);
      await noScroll(page, 'onboarding3 ' + w);
      await page.screenshot({ path: path.join(shots, `onboarding3-${w}.png`), fullPage: true });
      await page.click('#back'); assert.equal(await page.textContent('#count'), 'Step 2 of 3');
      await page.click('#next'); await page.click('#next');
      assert.equal(await page.evaluate(() => window.__optionsOpened), true);
      assert.deepEqual(errors, []);
      await page.context().close();
    }
    { // invalid email blocks step 2; existing data never wiped by empty fields
      const { page } = await newPage(browser, 390, { profiles: [{ id: 'default', name: 'English', data: { email: 'old@x.com', city: 'Cairo' }, custom: [] }] });
      await page.goto(url('onboarding.html'));
      await page.click('#next');
      assert.equal(await page.inputValue('[name=email]'), 'old@x.com', 'prefilled');
      await page.fill('[name=email]', 'bad'); await page.click('#next');
      assert.equal(await page.textContent('#count'), 'Step 2 of 3', 'invalid email blocks');
      await page.fill('[name=email]', ''); await page.fill('[name=phone]', '123'); await page.click('#next');
      const d = await page.evaluate(() => window.__store.profiles[0].data);
      assert.equal(d.city, 'Cairo'); assert.equal(d.phone, '123'); assert.equal(d.email, 'old@x.com');
      await page.context().close();
    }

    // ---------- English / Arabic fill regression + tracker hook through fillActiveTab ----------
    const formHtml = (ar) => ar
      ? `<form><label for="a">الاسم الأول</label><input id="a"><label for="b">اسم العائلة</label><input id="b"><label for="c">البريد الإلكتروني</label><input id="c" type="email"><label for="d">رقم الهاتف</label><input id="d"></form>`
      : `<form><label for="a">First name</label><input id="a"><label for="b">Last name</label><input id="b"><label for="c">Email</label><input id="c" type="email"><label for="d">Phone</label><input id="d"></form>`;
    for (const lang of ['en', 'ar']) {
      const ctx = await browser.newContext(); const page = await ctx.newPage();
      const profile = lang === 'en'
        ? { id: 'default', name: 'English', data: { firstName: 'Sara', lastName: 'Ahmed', email: 's@x.com', phone: '555' }, custom: [] }
        : { id: 'ar', name: 'Arabic', data: { firstName: 'سارة', lastName: 'أحمد', email: 's@x.com', phone: '555' }, custom: [] };
      await page.addInitScript((s) => { if (!window.name) window.name = s; }, JSON.stringify({ profiles: [profile], activeId: profile.id }));
      await page.addInitScript(mock);
      await page.route('https://jobs.example.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><title>Apply ${lang}</title></head><body>${formHtml(lang === 'ar')}</body></html>` }));
      await page.goto('https://jobs.example.com/apply?utm=1#x');
      for (const f of ['fields.js', 'questions.js', 'signature.js', 'filler.js']) await page.addScriptTag({ path: path.join(root, f) });
      await page.addScriptTag({ path: path.join(root, 'security.js') });
      await page.addScriptTag({ path: path.join(root, 'runner.js') });
      const r = await page.evaluate(async () => {
        const u = location.href, t = document.title;
        chrome.tabs = { query: async () => [{ id: 1, url: u, title: t }] };
        chrome.scripting = { executeScript: async ({ func, args }) => func ? [{ result: func(...args) }] : [] };
        const res = await fillActiveTab();
        const vals = ['a', 'b', 'c', 'd'].map((i) => document.getElementById(i).value);
        return { res, vals, apps: window.__store.applications };
      });
      assert.equal(r.res.filled, 4, lang + ' filled');
      assert.deepEqual(r.vals, lang === 'en' ? ['Sara', 'Ahmed', 's@x.com', '555'] : ['سارة', 'أحمد', 's@x.com', '555']);
      assert.equal(r.apps.length, 1); assert.equal(r.apps[0].url, 'https://jobs.example.com/apply'); assert.equal(r.apps[0].filledCount, 4);
      assert.equal(r.apps[0].title, 'Apply ' + lang);
      // tracking off: still fills, nothing new recorded
      const r2 = await page.evaluate(async () => {
        await chrome.storage.local.set({ applications: [], settings: { overwrite: true, trackApplications: false } });
        const res = await fillActiveTab(); return { res, apps: window.__store.applications };
      });
      assert.equal(r2.res.filled, 4); assert.equal(r2.apps.length, 0);
      await ctx.close();
    }
    console.log('tracker.pages: all assertions passed; screenshots in ' + shots);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
