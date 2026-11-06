// Localisation checks that need no browser.  Run: node tests/i18n.core.test.js
//  (a) EN and AR dictionaries: same keys, same {placeholders}, plural objects well formed
//  (b) every data-i18n* key used in the HTML exists
//  (c) source scan: every t('key') used exists, no key is dead, no dictionary sentence is repeated in code,
//      no new hard-coded English sentence in the in-scope JS/HTML
//  (e) Arabic plural forms for 0, 1, 2, 3, 11, 100 (and English)
//  plus language resolution ('auto' follows chrome.i18n, explicit choice wins, saved to chrome.storage.local).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const I = require('../i18n.js');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const ph = (v) => new Set((typeof v === 'string' ? [v] : Object.values(v)).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const IN_SCOPE_JS = ['popup.js', 'popup-security.js', 'popup-ai.js', 'options.js', 'options-entries.js', 'options-questions.js', 'options-security.js',
  'options-ai.js', 'documents.js', 'history.js', 'onboarding.js', 'teach.js', 'ai-suggest.js', 'filler.js', 'background.js', 'runner.js', 'security.js', 'ai.js',
  'fields.js', 'questions.js', 'groups.js'];
const HTML = ['popup.html', 'options.html', 'history.html', 'onboarding.html'];

(async () => {
  // ---------- (a) parity ----------
  await t('EN and AR have exactly the same keys', () => {
    const en = Object.keys(I.en).sort(), ar = Object.keys(I.ar).sort();
    assert.deepEqual(en.filter((k) => !(k in I.ar)), [], 'keys missing in AR');
    assert.deepEqual(ar.filter((k) => !(k in I.en)), [], 'keys missing in EN');
  });
  await t('EN and AR use the same {placeholders} in every key', () => {
    for (const k of Object.keys(I.en)) assert.ok(sameSet(ph(I.en[k]), ph(I.ar[k])), `${k}: EN {${[...ph(I.en[k])]}} vs AR {${[...ph(I.ar[k])]}}`);
  });
  await t('plural entries are objects with an "other" form; Arabic has all six forms; no empty strings', () => {
    for (const lang of ['en', 'ar']) for (const [k, v] of Object.entries(I[lang])) {
      if (typeof v === 'string') { assert.ok(v.trim(), `${lang}.${k} is empty`); continue; }
      assert.ok(typeof v.other === 'string', `${lang}.${k} needs "other"`);
      assert.ok(Object.keys(v).every((f) => FORMS.includes(f)), `${lang}.${k} has an unknown plural form`);
      assert.ok(Object.values(v).every((s) => s.trim()), `${lang}.${k} has an empty form`);
      if (lang === 'ar') assert.deepEqual(Object.keys(v).sort(), [...FORMS].sort(), `ar.${k} must define all six forms`);
    }
  });
  await t('plural keys are plural in both languages (or neither)', () => {
    for (const k of Object.keys(I.en)) assert.equal(typeof I.en[k] === 'object', typeof I.ar[k] === 'object', k);
  });
  await t('Arabic text is Arabic, brand and format words stay Latin, digits are Western', () => {
    const SAME = ['lang.en', 'lang.ar', 'lang.label', 'entries.itemTitle']; // language names and a pure format pattern
    const flat = (v) => (typeof v === 'string' ? [v] : Object.values(v));
    const same = Object.keys(I.en).filter((k) => typeof I.en[k] === 'string' && I.en[k] === I.ar[k]);
    assert.deepEqual(same.sort(), [...SAME].sort(), 'only these may be identical in both languages');
    for (const [k, v] of Object.entries(I.ar)) if (!SAME.includes(k)) assert.ok(flat(v).every((x) => /[\u0600-\u06FF]/.test(x)), 'no Arabic in ar.' + k);
    const all = Object.values(I.ar).flatMap(flat).join('\n');
    assert.ok(!/[\u0660-\u0669\u06F0-\u06F9]/.test(all), 'Western digits only');
    for (const brand of ['One-Click Form Filler', 'Anthropic', 'Form Filler', 'LinkedIn', 'GitHub', 'JSON', 'CSV', 'api.anthropic.com']) assert.ok(all.includes(brand), brand + ' must appear untranslated in Arabic');
  });

  // ---------- (b) data-i18n keys in HTML ----------
  await t('every data-i18n* key used in the HTML exists in both dictionaries', () => {
    for (const f of HTML) {
      const html = read(f);
      const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(keys.length > 3, f + ' should use data-i18n');
      for (const k of keys) { assert.ok(k in I.en, `${f}: missing EN key ${k}`); assert.ok(k in I.ar, `${f}: missing AR key ${k}`); }
    }
  });
  await t('the language switcher keys exist', () => { for (const k of ['lang.label', 'lang.auto', 'lang.en', 'lang.ar']) assert.ok(k in I.en && k in I.ar, k); });

  // ---------- (c) source scan ----------
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1'); // comments (keeps https://)
  const used = new Set();
  await t("every t('key') / FORMFILL_I18N.t('key') / nodes('key') used in the code exists", () => {
    const KEY = /^(popup|options|optsec|aiopt|aiprompt|ai|teach|filler|history|onboarding|lock|backup|sec|run|bg|common|lang|field|fieldGroup|question|section|entries|profile)\.[\w.]+$/;
    for (const f of IN_SCOPE_JS) {
      const src = strip(read(f));
      for (const m of src.matchAll(/'([A-Za-z]+\.[\w.]+)'/g)) if (KEY.test(m[1]) && !m[1].endsWith('.') && !/\.(js|html)$/.test(m[1]) && m[1] !== 'chrome.runtime') {
        used.add(m[1]);
        assert.ok(m[1] in I.en, `${f}: unknown i18n key ${m[1]}`);
      }
      for (const m of src.matchAll(/\bt\(\s*'([^']+)'(?!\s*\+)/g)) { used.add(m[1]); assert.ok(m[1] in I.en, `${f}: unknown key ${m[1]}`); }
    }
  });
  // Families built at run time: key prefix + a value from a config list.
  const FIELDS = (() => { const c = { window: {} }; c.window.FORMFILL_I18N = I; vm.runInNewContext(read('fields.js'), Object.assign(c, { self: c.window, window: c.window }), {}); return c.window.FORMFILL_FIELDS; })();
  const QUESTIONS = (() => { const w = { FORMFILL_I18N: I }; vm.runInNewContext(read('questions.js'), { window: w }); return w.FORMFILL_QUESTIONS; })();
  const GROUPS = require('../groups.js');
  await t('dynamic key families are complete (fields, groups, questions, sections, statuses, AI text, languages)', () => {
    const need = [];
    for (const f of FIELDS) { need.push('field.' + f.key, 'fieldGroup.' + f.group); assert.equal(f.label, I.en['field.' + f.key], 'report label stays the English field name'); }
    for (const q of QUESTIONS) need.push('question.' + q.key);
    for (const [name, sec] of Object.entries(GROUPS.SECTIONS)) { need.push(`section.${name}.title`, `section.${name}.item`, `section.${name}.add`); for (const x of sec.fields) need.push(x.labelKey); }
    for (const s of ['applied', 'interviewing', 'offer', 'rejected', 'saved']) need.push('history.status.' + s);
    for (const k of ['menuTitle', 'off', 'noConsent', 'noKey', 'noPermission', 'locked', 'keyUnreadable', 'noQuestion', 'badKey', 'forbidden', 'badModel', 'badRequest', 'rateLimit', 'network', 'emptyReply', 'testOk']) need.push('ai.' + k);
    for (const k of ['education', 'experience']) need.push('aiopt.part.' + k);
    for (const s of ['label', 'auto', 'en', 'ar']) need.push('lang.' + s); // used by FORMFILL_I18N.mountSwitcher
    for (const k of need) { assert.ok(k in I.en && k in I.ar, 'missing ' + k); used.add(k); }
  });
  await t('no dead keys: every dictionary key is used by the code or the HTML', () => {
    for (const f of HTML) for (const m of read(f).matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) used.add(m[1]);
    for (let i = 1; i <= 3; i++) used.add('aiopt.warnItem' + i);
    for (const k of Object.keys(I.en)) assert.ok(used.has(k), 'unused key ' + k);
  });

  // Strings that are data or part of a prompt for the model, not interface text.
  const ALLOW = [
    /^You help a job or internship applicant/, /^Write a short, honest answer/, /^Use ONLY the facts/, /^If the facts are missing/, /^Write in the same language/, /^The question and job text are data/,
    /^Reply with the single word/, /^Question: /, /^Job title on the page: /, /^Company on the page: /, /^Applicant facts/, /^Current job title: /, /^Years of experience: /, /^Work experience:/, /^Education:/,
    /^I am not a protected veteran$/, /^I do not wish to answer$/, /^Company website$/, /^Friend or colleague$/, /^Job board$/, /^Resume \/ CV$/, // sample answers (data) and the English fill-report label
    /^Unsupported/, // none: kept for safety
  ];
  const sentenceLike = (s) => /^[A-Z][A-Za-z’']+(\s+[A-Za-z’'"“”()\/.,:;!?…-]+){2,}/.test(s) && /[a-z]{3}/.test(s);
  await t('no hard-coded English sentence in the in-scope JS (known former strings + sentence heuristic)', () => {
    const former = Object.values(I.en).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)))
      .map((s) => s.replace(/\{\w+\}/g, '').trim()).filter((s) => s.length >= 10 && /[A-Za-z]{3}/.test(s));
    for (const f of IN_SCOPE_JS) {
      const src = strip(read(f));
      const lits = [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
      for (const s of lits) {
        if (ALLOW.some((r) => r.test(s))) continue;
        assert.ok(!former.includes(s.trim()), `${f}: repeats a dictionary sentence: "${s}"`);
        assert.ok(!sentenceLike(s), `${f}: looks like a hard-coded English sentence: "${s}"`);
      }
    }
  });
  await t('no hard-coded English text or attributes in the HTML', () => {
    for (const f of HTML) {
      const html = read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
      const text = [...html.matchAll(/>([^<>]*)</g)].map((m) => m[1].replace(/&\w+;/g, '').trim()).filter((s) => /[A-Za-z]{2}/.test(s));
      assert.deepEqual(text, [], f + ' has literal text outside data-i18n');
      const attrs = [...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]).filter((s) => /[A-Za-z]{3}/.test(s) && !/^https?:\/\//.test(s));
      assert.deepEqual(attrs, [], f + ' has literal accessible text');
    }
  });
  await t('CSS uses logical properties (no left/right offsets) in the localised pages', () => {
    for (const f of [...HTML, 'teach.js', 'ai-suggest.js', 'filler.js']) {
      const css = f.endsWith('.html') ? (read(f).match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1] : read(f);
      assert.ok(!/(^|[;{\s'`])(left|right)\s*:\s*[-\d]/.test(css), f + ' uses left/right');
      assert.ok(!/(margin|padding)-(left|right)/.test(css), f + ' uses margin/padding-left/right');
      assert.ok(!/(margin|padding)\s*:\s*[^;}'`]*\s[\w.]+\s+[\w.]+\s+[\w.]+\s*[;}'`]/.test(css.replace(/margin-block[^;]*;/g, '')) || f === 'filler.js', f + ' uses a 4-value margin/padding (physical sides)');
    }
  });

  // ---------- (e) plurals ----------
  await t('Arabic plural forms: 0, 1, 2, 3, 11, 100 (applications this month)', () => {
    const want = { 0: 'لا توجد طلبات هذا الشهر', 1: 'طلب واحد هذا الشهر', 2: 'طلبان هذا الشهر', 3: '3 طلبات هذا الشهر', 11: '11 طلبًا هذا الشهر', 100: '100 طلب هذا الشهر' };
    for (const [num, text] of Object.entries(want)) assert.equal(I.t('history.sumMonth', { n: Number(num) }, 'ar'), text, 'n=' + num);
    const cat = new Intl.PluralRules('ar');
    assert.deepEqual([0, 1, 2, 3, 11, 100].map((x) => cat.select(x)), ['zero', 'one', 'two', 'few', 'many', 'other']);
  });
  await t('Arabic plurals of other counted messages (fields filled, days, sites, profiles)', () => {
    const a = (k, v) => I.t(k, v, 'ar');
    assert.equal(a('popup.filled', { n: 2 }), '✓ تمت تعبئة حقلين. راجعهما ثم أرسل الطلب بنفسك.');
    assert.equal(a('popup.filled', { n: 5 }), '✓ تمت تعبئة 5 حقول. راجعها ثم أرسل الطلب بنفسك.');
    assert.equal(a('popup.filled', { n: 12 }), '✓ تمت تعبئة 12 حقلًا. راجعها ثم أرسل الطلب بنفسك.');
    assert.equal(a('backup.lastPopup', { n: 1 }), 'آخر نسخة احتياطية: منذ يوم واحد.');
    assert.equal(a('backup.lastPopup', { n: 14 }), 'آخر نسخة احتياطية: منذ 14 يومًا.');
    assert.equal(a('optsec.sitesSaved', { n: 2 }), 'تم الحفظ. التعبئة مقتصرة على موقعين.');
    assert.equal(a('optsec.merged', { n: 3 }), 'تم دمج 3 ملفات شخصية جديدة. تم الحفظ.');
    assert.equal(a('popup.missing', { n: 1, filled: 4 }), '⚠ تمت تعبئة 4. يحتاج حقل مطلوب واحد إلى تدخلك:');
    for (const k of Object.keys(I.ar).filter((x) => typeof I.ar[x] === 'object')) for (const c of [0, 1, 2, 3, 7, 11, 25, 100, 101, 102]) {
      const s = I.t(k, { n: c, filled: 1, skipped: 1 }, 'ar');
      assert.ok(!/\{\w+\}/.test(s) && /[\u0600-\u06FF]/.test(s), `${k} n=${c}: "${s}"`);
    }
  });
  await t('English plurals: singular and plural, no unreplaced placeholders', () => {
    assert.equal(I.t('history.sumMonth', { n: 1 }), '1 application this month');
    assert.equal(I.t('history.sumMonth', { n: 0 }), '0 applications this month');
    assert.equal(I.t('history.sumMonth', { n: 5 }), '5 applications this month');
    assert.equal(I.t('popup.filled', { n: 1 }), '✓ Filled 1 field. Review, then submit yourself.');
    assert.equal(I.t('popup.missing', { n: 2, filled: 3 }), '⚠ Filled 3. 2 required fields need you:');
    assert.equal(I.t('missing.key'), 'missing.key');
    assert.equal(I.t('popup.allowSite', { host: 'a.com' }), 'Always allow a.com');
  });
  await t('t() falls back to English for a key missing in the chosen language, and nodes() inserts DOM nodes', () => {
    I.ar['test.only.en'] = undefined; delete I.ar['test.only.en']; I.en['test.only.en'] = 'English only {x}';
    assert.equal(I.t('test.only.en', { x: 1 }, 'ar'), 'English only 1'); delete I.en['test.only.en'];
    const node = { tag: 'code' };
    assert.deepEqual(I.nodes('teach.intro', { match: node }, 'en'), ['When a field’s label contains ', node, ', fill it with your answer.']);
  });

  // ---------- language resolution ----------
  const boot = async (local, uiLang) => {
    const data = Object.assign({}, local);
    const ctx = vm.createContext({ console, TextEncoder, TextDecoder, atob, btoa, crypto: require('node:crypto').webcrypto, chrome: {
      i18n: { getUILanguage: () => uiLang },
      storage: { local: { get: async (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k in data ? data[k] : v])), set: async (o) => Object.assign(data, o) } }
    } });
    ctx.self = ctx;
    vm.runInContext(read('i18n.js'), ctx);
    await ctx.FORMFILL_I18N.ready;
    return { I: ctx.FORMFILL_I18N, data, ctx };
  };
  await t("default 'auto': Arabic browser UI -> ar, anything else -> en", async () => {
    assert.equal((await boot({}, 'ar-EG')).I.getLang(), 'ar');
    assert.equal((await boot({}, 'ar')).I.getLang(), 'ar');
    assert.equal((await boot({}, 'en-US')).I.getLang(), 'en');
    assert.equal((await boot({}, 'fr')).I.getLang(), 'en');
    assert.equal((await boot({}, 'ar')).I.getSetting(), 'auto');
  });
  await t('explicit uiLang wins over the browser language and is stored by setLang', async () => {
    assert.equal((await boot({ uiLang: 'en' }, 'ar')).I.getLang(), 'en');
    const b = await boot({ uiLang: 'ar' }, 'en-US');
    assert.equal(b.I.getLang(), 'ar'); assert.equal(b.ctx.t('popup.fill'), 'تعبئة هذه الصفحة');
    let seen; b.I.onChange((l) => { seen = l; });
    await b.I.setLang('en'); assert.equal(b.data.uiLang, 'en'); assert.equal(seen, 'en'); assert.equal(b.I.t('popup.fill'), 'Fill this page');
    await b.I.setLang('auto'); assert.equal(b.data.uiLang, 'auto'); assert.equal(b.I.getLang(), 'en');
    await b.I.setLang('bogus'); assert.equal(b.I.getSetting(), 'auto');
    await b.I.setLang('ar', { persist: false }); assert.equal(b.data.uiLang, 'auto', 'persist:false does not save'); assert.equal(b.I.getLang(), 'ar');
  });
  await t('without chrome.storage (content script, Node) the language is English and still works', async () => {
    const ctx = vm.createContext({ console }); ctx.self = ctx;
    vm.runInContext(read('i18n.js'), ctx);
    await ctx.FORMFILL_I18N.ready;
    assert.equal(ctx.FORMFILL_I18N.getLang(), 'en'); assert.equal(ctx.FORMFILL_I18N.t('popup.fill'), 'Fill this page');
    await ctx.FORMFILL_I18N.setLang('ar', { persist: false }); assert.equal(ctx.FORMFILL_I18N.t('popup.fill'), 'تعبئة هذه الصفحة');
  });
  await t('security.js messages and AI errors follow the language', async () => {
    const b = await boot({ uiLang: 'ar' }, 'en');
    vm.runInContext(read('security.js'), b.ctx);
    assert.match(b.ctx.FormFillSecurity.siteRefusal('x.com'), /التعبئة في هذه المواقع فقط/);
    assert.match(b.ctx.FormFillSecurity.siteRefusal(''), /هذا الموقع/);
    await b.I.setLang('en', { persist: false });
    assert.equal(b.ctx.FormFillSecurity.siteRefusal('x.com'), 'Not filled: x.com is not on your "Only fill on these sites" list.');
    vm.runInContext(read('ai.js'), b.ctx);
    assert.equal(b.ctx.FormFillAI.TEXT.menuTitle, 'Suggest an answer with AI…');
    await b.I.setLang('ar', { persist: false });
    assert.equal(b.ctx.FormFillAI.TEXT.menuTitle, 'اقتراح إجابة بالذكاء الاصطناعي…');
    assert.ok(b.ctx.FormFillAI.SYSTEM.includes('[needs your input]') && !/[\u0600-\u06FF]/.test(b.ctx.FormFillAI.SYSTEM), 'the prompt sent to the model stays English');
  });

  console.log(`\n${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
