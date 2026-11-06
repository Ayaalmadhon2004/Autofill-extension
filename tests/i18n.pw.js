// Playwright: Arabic (RTL) rendering of popup, Options, history and the welcome page, language switching, and the
// in-page prompts.  Run: NODE_PATH=$(npm root -g) node tests/i18n.pw.js     (screenshots: $SHOTS or <tmp>/i18n-shots)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installChrome } = require('./helpers/chromeMock.js');

const root = path.join(__dirname, '..');
const shots = process.env.SHOTS || path.join(os.tmpdir(), 'i18n-shots');
fs.mkdirSync(shots, { recursive: true });
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

const now = new Date();
const iso = (d) => new Date(now.getTime() - d * 3600e3).toISOString();
const profile = {
  id: 'default', name: 'English', data: { firstName: 'Aya', email: 'aya@example.com', phone: '+1555', fullName: 'Aya Almadhon' },
  custom: [{ match: 'pronouns', value: 'she/her' }], answers: { needsSponsorship: 'No' },
  experience: [{ company: 'Acme', title: 'Engineer', start: '2021-05', end: '2023-08', description: 'Built things' }], education: [{ school: 'MIT', degree: 'BSc' }]
};
const apps = [
  { id: 'a1', url: 'https://jobs.example.com/apply', title: 'Backend Engineer', host: 'jobs.example.com', profileId: 'default', filledCount: 5, date: iso(1), status: 'applied', notes: '' },
  { id: 'a2', url: 'https://careers.acme.com/x', title: 'مهندس برمجيات', host: 'careers.acme.com', profileId: 'default', filledCount: 1, date: iso(2), status: 'interviewing', notes: 'مقابلة يوم الأحد' },
  { id: 'a3', url: 'https://x.example.org/job', title: 'Data Analyst', host: 'x.example.org', profileId: 'default', filledCount: 12, date: iso(3), status: 'offer', notes: '' }
];
const seed = (uiLang, extra) => Object.assign({ profiles: [profile], activeId: 'default', settings: { overwrite: false }, applications: apps, uiLang }, extra || {});

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
const smallTargets = (page) => page.$$eval('button, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])', (els) =>
  els.filter((e) => e.offsetParent !== null && !e.hidden && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43.5).map((e) => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height)));

async function open(browser, file, local, vp, opts) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  const h = await installChrome(ctx, Object.assign({ local }, opts || {}));
  await page.goto(h.url(file));
  return { ctx, page, h };
}
async function layoutChecks(browser, label, file, local, waitFor, extra) {
  for (const w of [390, 1440]) {
    const { ctx, page } = await open(browser, file, local, { width: w, height: 900 });
    await page.waitForSelector('html[dir=rtl]'); await page.waitForSelector(waitFor);
    if (extra) await extra(page, w);
    assert.equal(await page.getAttribute('html', 'lang'), 'ar');
    assert.equal(await noHScroll(page), true, `${label}: horizontal scroll at ${w}px`);
    assert.deepEqual(await smallTargets(page), [], `${label}: targets under 44px at ${w}px`);
    await page.screenshot({ path: path.join(shots, `${label}-ar-${w}.png`), fullPage: true });
    await ctx.close();
  }
  ok(`${label}: Arabic, html[dir=rtl], no horizontal scroll and 44px targets at 390px and 1440px (screenshots in ${shots})`);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------- popup ----------------
  {
    const { ctx, page, h } = await open(browser, 'popup.html', seed('ar'), { width: 390, height: 700 });
    await page.waitForSelector('html[dir=rtl]');
    assert.equal((await page.textContent('#fill')).trim(), 'تعبئة هذه الصفحة');
    assert.equal(await page.getAttribute('html', 'lang'), 'ar');
    assert.match(await page.textContent('label[for=profile]'), /الملف الشخصي/);
    assert.match(await page.textContent('#opts'), /تعديل ملفي الشخصي/);
    assert.match(await page.textContent('body'), /الاختصار:/);
    assert.match(await page.title(), /تعبئة/); ok('popup texts are Arabic, <html lang=ar dir=rtl>, title translated');
    assert.equal(await page.textContent('.ff-lang span'), 'Language / اللغة'); ok('popup has a "Language / اللغة" switcher');
    await page.click('#fill');
    await page.waitForFunction(() => /تمت تعبئة حقلين/.test(document.getElementById('status').textContent));
    ok('fill status uses the Arabic dual form for 2 fields');
    await ctx.close();
  }
  await layoutChecks(browser, 'popup', 'popup.html', seed('ar'), '#fill');
  {
    const { ctx, page, h } = await open(browser, 'popup.html', seed('ar'));
    await page.waitForSelector('html[dir=rtl]');
    await Promise.all([page.waitForNavigation(), page.selectOption('#uiLang', 'en')]);
    await page.waitForSelector('html[dir=ltr]');
    assert.equal((await page.textContent('#fill')).trim(), 'Fill this page'); assert.equal(h.stores.local.uiLang, 'en');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'uiLang'); ok('popup switcher: English after reload, choice stored in chrome.storage.local.uiLang, focus returns to the switcher');
    await ctx.close();
  }
  { // locked popup, Arabic
    const { ctx, page } = await open(browser, 'popup.html', { vault: { v: 1 }, uiLang: 'ar' });
    await page.waitForSelector('#unlock:not([hidden])');
    assert.match(await page.textContent('#unlock'), /الملفات الشخصية مقفلة/); assert.equal((await page.textContent('#unlock button')).trim(), 'فتح القفل'); ok('locked popup is Arabic');
    await ctx.close();
  }

  // ---------------- options ----------------
  await layoutChecks(browser, 'options', 'options.html', seed('ar'), '#aiSection');
  {
    const { ctx, page, h } = await open(browser, 'options.html', seed('ar'), { width: 1440, height: 900 });
    await page.waitForSelector('#aiSection'); await page.waitForSelector('#sec-backup');
    const legends = await page.$$eval('legend', (l) => l.map((x) => x.textContent));
    for (const want of ['الملفات الشخصية', 'البيانات الشخصية', 'الأسئلة الشائعة', 'القواعد المخصصة', 'المستندات', 'متتبّع الطلبات', 'اقتراحات الذكاء الاصطناعي (اختياري)', 'قفل عبارة المرور', 'التعبئة في هذه المواقع فقط', 'النسخ الاحتياطي', 'الخبرة العملية', 'المؤهلات الدراسية'])
      assert.ok(legends.includes(want), 'missing legend ' + want + ' in ' + legends.join('|'));
    assert.equal(await page.textContent('h1'), 'ملفي الشخصي');
    assert.equal(await page.textContent('label:has([name=firstName])') .then((s) => s.trim()), 'الاسم الأول');
    assert.equal(await page.getAttribute('[name=email]', 'dir'), 'ltr'); assert.equal(await page.getAttribute('[name=phone]', 'dir'), 'ltr'); assert.equal(await page.getAttribute('[name=firstName]', 'dir'), 'auto');
    assert.equal(await page.getAttribute('#pname', 'dir'), 'auto'); assert.equal(await page.getAttribute('#aiKey', 'dir'), 'ltr'); assert.equal(await page.getAttribute('#sites-list', 'dir'), 'ltr');
    assert.equal(await page.getAttribute('#form + fieldset [name=needsSponsorship], [name=needsSponsorship]', 'name'), 'needsSponsorship');
    assert.deepEqual(await page.$$eval('[name=is18Plus] option', (o) => o.map((x) => x.textContent + '=' + x.value)), ['بلا إجابة (تخطي)=', 'نعم=Yes', 'لا=No']); ok('Options: Arabic legends and labels; email/phone/URL/key inputs are dir=ltr, user text dir=auto; Yes/No stay Yes/No as stored values');
    assert.equal(await page.getAttribute('.entry-section[data-section=experience] .entry-bar button', 'aria-label'), 'نقل الخبرة 1 لأعلى');
    assert.equal(await page.textContent('#cvCurrent'), 'لم يتم رفع سيرة ذاتية لهذا الملف الشخصي.');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).insetInlineStart), '0px'); ok('Options: entry buttons, CV status and the fixed bar are localised/logical');

    // switch without reloading, keeping unsaved edits
    await page.evaluate(() => { window.__still_here = 1; });
    await page.fill('#pname', 'مسودة'); await page.fill('[name=lastName]', 'Almadhon');
    await page.selectOption('#uiLang', 'en');
    await page.waitForSelector('html[dir=ltr]');
    assert.equal(await page.textContent('h1'), 'My profile'); assert.equal(await page.evaluate(() => window.__still_here), 1);
    assert.equal(await page.inputValue('#pname'), 'مسودة'); assert.equal(await page.inputValue('[name=lastName]'), 'Almadhon');
    assert.equal(await page.textContent('#aiSection legend'), 'AI suggestions (optional)'); assert.equal(await page.textContent('#sec-pass legend'), 'Passphrase lock');
    assert.equal(h.stores.local.uiLang, 'en');
    assert.equal(await page.getAttribute('html', 'lang'), 'en'); assert.equal(await page.title(), 'My profile · One-Click Form Filler'); ok('Options: switching language re-renders in place (no reload), unsaved edits kept, choice stored');
    await page.selectOption('#uiLang', 'auto'); await page.waitForFunction(() => document.querySelector('h1').textContent === 'My profile');
    assert.equal(h.stores.local.uiLang, 'auto'); ok("Options: 'auto' follows the browser (English here)");
    await page.selectOption('#uiLang', 'ar'); await page.waitForSelector('html[dir=rtl]');
    await page.click('text=إضافة خبرة'); assert.equal(await page.locator('.entry-section[data-section=experience] .entry').count(), 2);
    assert.match(await page.textContent('#msg'), /^$/); ok('Options: back in Arabic, Arabic buttons work');
    // sites panel plural + Arabic messages
    await page.fill('#sites-list', 'a.example.com\nb.example.com'); await page.check('#sites-on'); await page.click('#sec-sites button');
    await page.waitForFunction(() => /موقعين/.test(document.querySelector('#sec-sites .sec-msg').textContent));
    ok('Options: allowlist message uses the Arabic dual form');
    await ctx.close();
  }
  { // locked options in Arabic
    const { ctx, page } = await open(browser, 'options.html', { vault: { v: 1 }, uiLang: 'ar' });
    await page.waitForSelector('#unlockPass'); assert.equal(await page.textContent('h1'), 'الملفات الشخصية مقفلة'); assert.equal(await page.isVisible('#uiLang'), true);
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl'); ok('locked Options is Arabic and still offers the language switcher'); await ctx.close();
  }

  // ---------------- history ----------------
  await layoutChecks(browser, 'history', 'history.html', seed('ar'), 'li.app');
  {
    const { ctx, page } = await open(browser, 'history.html', seed('ar'), { width: 1440, height: 900 }, {});
    await page.waitForSelector('li.app');
    assert.equal(await page.textContent('#summary'), '3 طلبات هذا الشهر · الإجمالي: 3');
    assert.match(await page.textContent('li.app .meta'), /5 حقول معبّأة/); assert.match(await page.textContent('li.app:nth-child(2) .meta'), /حقل واحد معبّأ/);
    assert.deepEqual(await page.$$eval('#f option', (o) => o.map((x) => x.textContent)), ['كل الحالات', 'تم التقديم', 'قيد المقابلات', 'عرض وظيفي', 'مرفوض', 'محفوظ']);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.arrow')).transform), 'none'); ok('history: Arabic plural summary, status names, arrow mirrored in RTL');
    assert.equal(await page.evaluate(() => /[٠-٩]/.test(document.body.textContent)), false); ok('history: Western digits (dates included)');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(csv.includes('التاريخ,العنوان,الموقع,الرابط,الحالة,الحقول المعبّأة,ملاحظات') && csv.includes('قيد المقابلات')); ok('history: CSV header and statuses follow the language');
    await page.selectOption('#f', 'offer'); await page.evaluate(() => { document.getElementById('q').value = 'zzz'; document.getElementById('q').dispatchEvent(new Event('input')); });
    assert.match(await page.textContent('#empty'), /لا توجد طلبات تطابق/); ok('history: empty-filter message');
    await ctx.close();
  }

  // ---------------- onboarding ----------------
  await layoutChecks(browser, 'onboarding', 'onboarding.html', seed('ar'), '#s1:not([hidden])');
  {
    const { ctx, page } = await open(browser, 'onboarding.html', seed('ar'), { width: 390, height: 800 });
    await page.waitForSelector('#count:not(:empty)');
    assert.equal(await page.textContent('#count'), 'الخطوة 1 من 3'); assert.equal(await page.textContent('#h1a'), 'ماذا تفعل الإضافة'); assert.equal((await page.textContent('#next')).trim(), 'التالي');
    await page.click('#next'); assert.equal((await page.textContent('#next')).trim(), 'حفظ ومتابعة'); assert.equal(await page.getAttribute('[name=email]', 'dir'), 'ltr'); assert.equal(await page.getAttribute('[name=fullName]', 'dir'), 'auto');
    assert.equal((await page.textContent('#lName')).trim(), 'الاسم الكامل');
    await page.click('#next'); await page.click('#next');
    assert.equal(await page.locator('#s3list li').count(), 4); assert.match(await page.textContent('#s3list li:nth-child(2)'), /Ctrl\+Shift\+F/); assert.equal((await page.textContent('#next')).trim(), 'إنهاء وفتح ملفي الشخصي');
    await page.screenshot({ path: path.join(shots, 'onboarding-step3-ar-390.png'), fullPage: true });
    await page.selectOption('#uiLang', 'en'); await page.waitForFunction(() => document.getElementById('count').textContent === 'Step 3 of 3');
    assert.equal(await page.getAttribute('html', 'dir'), 'ltr'); ok('onboarding: Arabic steps and buttons, switcher re-renders in place and keeps the step');
    await ctx.close();
  }

  // ---------------- in-page prompts and the required marker (content scripts) ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.setContent(`<form><label>Pronouns <input id=p></label><label>Full name * <input id=n required></label><label>Why us? <textarea id=w></textarea></label></form>`);
    await page.evaluate(() => { window.__sent = []; window.chrome = { runtime: { sendMessage: (m, cb) => { window.__sent.push(m); cb && cb(m.type === 'formfill-teach-get' ? { value: '', profileName: 'Arabic' } : { ok: true, text: 'مسودة' }); } } }; });
    for (const f of ['i18n.js', 'signature.js', 'fields.js', 'questions.js', 'filler.js', 'teach.js', 'ai-suggest.js']) await page.addScriptTag({ path: path.join(root, f) });
    const box = (sel) => page.evaluate((s) => { const h = document.querySelector(s); const b = h.shadowRoot.querySelector('.box'); return { dir: b.dir, lang: b.lang, title: b.querySelector('h2').textContent, text: b.textContent, buttons: [...b.querySelectorAll('button')].map((x) => x.textContent) }; }, sel);
    // without a language passed in (no chrome.storage here): English
    await page.focus('#p'); await page.evaluate(() => window.__formFillTeach.start());
    let b = await box('[data-formfill-teach]');
    assert.equal(b.title, 'Teach Form Filler this field'); assert.equal(b.dir, 'ltr'); ok('teach prompt: English when no language is passed and chrome.storage is not available');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('dir')), null); ok('content scripts never touch the page <html lang/dir>');
    await page.evaluate(() => document.querySelector('[data-formfill-teach]').remove());
    await page.focus('#p'); await page.evaluate(() => window.__formFillTeach.start('ar'));
    b = await box('[data-formfill-teach]');
    assert.equal(b.dir, 'rtl'); assert.equal(b.lang, 'ar'); assert.equal(b.title, 'علّم Form Filler هذا الحقل');
    assert.ok(b.text.includes('عندما يحتوي عنوان الحقل على') && b.text.includes('«Arabic»') && b.buttons.join() === 'إلغاء,حفظ الإجابة', JSON.stringify(b));
    assert.equal(await page.evaluate(() => document.querySelector('[data-formfill-teach]').shadowRoot.querySelector('code').textContent), 'pronouns');
    await page.screenshot({ path: path.join(shots, 'teach-prompt-ar-390.png') });
    await page.evaluate(() => { const r = document.querySelector('[data-formfill-teach]').shadowRoot; r.querySelector('form').requestSubmit(); });
    await page.waitForFunction(() => /اكتب إجابة/.test(document.querySelector('[data-formfill-teach]').shadowRoot.querySelector('[role=status]').textContent));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); ok('teach prompt: Arabic, RTL, translated validation message, no horizontal scroll at 390px');
    await page.evaluate(() => document.querySelector('[data-formfill-teach]').remove());

    await page.focus('#w'); await page.evaluate(() => window.__formFillAI.start({ onlyIfField: true, lang: 'ar' }));
    b = await box('[data-formfill-ai]');
    assert.equal(b.dir, 'rtl'); assert.equal(b.title, 'اقتراح إجابة بالذكاء الاصطناعي'); assert.ok(b.buttons.includes('إلغاء') && b.buttons.includes('إدراج في الحقل') && b.buttons.includes('إعادة التوليد'), JSON.stringify(b));
    await page.waitForFunction(() => /المسودة جاهزة/.test(document.querySelector('[data-formfill-ai]').shadowRoot.textContent));
    await page.screenshot({ path: path.join(shots, 'ai-prompt-ar-390.png') });
    ok('AI prompt: Arabic, RTL, buttons and status translated');
    await page.evaluate(() => document.querySelector('[data-formfill-ai]').remove());

    // the "Required" marker follows the language passed to fill()
    const marker = (lang) => page.evaluate((l) => { document.querySelectorAll('[data-formfill-marker]').forEach((m) => m.tagName === 'SPAN' && m.remove()); const r = window.__formFill.fill({ data: { fullName: '' }, custom: [] }, {}, null, l); const s = document.querySelector('span[data-formfill-marker]'); return { text: s && s.textContent, dir: s && s.dir, missing: r.missing }; }, lang);
    let m = await marker('ar');
    assert.equal(m.text, '⚠ مطلوب – عبّئ هذا الحقل بنفسك'); assert.equal(m.dir, 'rtl');
    m = await marker('en');
    assert.equal(m.text, '⚠ Required – fill this in yourself'); assert.equal(m.dir, 'ltr'); ok('required-field marker: Arabic/RTL when asked, English otherwise');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
