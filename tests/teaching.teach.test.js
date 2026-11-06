// Teach-this-field: shared signature, injected prompt (chrome.* mocked), background/runner save logic + dedupe.
const vm = require('vm'), fs = require('fs'), path = require('path');
const { launch, inject, check, done, root } = require('./teaching.helpers');

(async () => {
  const { browser, page } = await launch();
  const FORM = `<form>
    <label for=t>Preferred pronouns *</label><input id=t>
    <input id=p placeholder="Why this role?" name=whyRole>
    <label for=s>Visa status</label><select id=s><option value="">-</option><option>Citizen</option><option>Work visa</option></select>
    <fieldset><legend>Are you a veteran?</legend><label><input type=radio name=vet value=y> Yes</label><label><input type=radio name=vet value=n> No</label></fieldset>
    <label for=ta>Anything else?</label><textarea id=ta></textarea>
    <label for=ar>اللغات التي تتحدثها</label><input id=ar></form>`;
  await page.setContent(FORM);
  await page.addInitScript(() => {}); // (mocks are installed below, after load)
  await page.evaluate(() => {
    window.__sent = []; window.__reply = { value: '', profileName: 'English' };
    window.chrome = { runtime: { lastError: null, sendMessage: (m, cb) => { window.__sent.push(m); cb(m.type === 'formfill-teach-get' ? window.__reply : { ok: true }); } } };
  });
  await inject(page, ['i18n.js', 'signature.js', 'fields.js', 'questions.js', 'filler.js', 'teach.js']);

  // shared signature: describe().match is always found by signature() (the filler's own matcher)
  const consistent = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')].map((e) => {
    const d = window.FORMFILL_SIG.describe(e); return [e.id || e.name, d.match, window.FORMFILL_SIG.signature(e).includes(d.match)];
  }));
  check('describe().match is contained in signature() for every field', consistent.every((c) => c[1] && c[2]), consistent);
  const d = await page.evaluate(() => ({ t: window.FORMFILL_SIG.describe(document.getElementById('t')), r: window.FORMFILL_SIG.describe(document.querySelector('[name=vet]')), s: window.FORMFILL_SIG.describe(document.getElementById('s')) }));
  check('describe text: label, trailing * stripped', d.t.match === 'preferred pronouns' && d.t.type === 'text', d.t);
  check('describe radio: legend question + options', d.r.match === 'are you a veteran?' && JSON.stringify(d.r.options) === '["Yes","No"]', d.r);
  check('describe select: options', JSON.stringify(d.s.options) === '["Citizen","Work visa"]', d.s);

  // right-click a text field, then "menu click" -> start()
  const start = () => page.evaluate(() => window.__formFillTeach.start().then((i) => i && i.match));
  const shadow = (fn, arg) => page.evaluate(([f, a]) => { const root = document.querySelector('[data-formfill-teach]').shadowRoot; return new Function('root', 'a', 'return (' + f + ')(root,a)')(root, a); }, [fn.toString(), arg]);
  await page.click('#t', { button: 'right' });
  await page.evaluate(() => document.activeElement.blur());       // prove the contextmenu listener (not focus) finds it
  await page.click('#t', { button: 'right' });
  const m1 = await start();
  check('start() finds right-clicked text field', m1 === 'preferred pronouns', m1);
  check('prompt is a labelled modal dialog', await shadow((r) => { const b = r.querySelector('[role=dialog]'); return b.getAttribute('aria-modal') === 'true' && !!r.getElementById(b.getAttribute('aria-labelledby')); }));
  check('answer has a real <label for>', await shadow((r) => { const l = r.querySelector('label'); return l.htmlFor === 'ff-answer' && !!r.getElementById('ff-answer'); }));
  check('focus moved to answer input', await shadow((r) => r.activeElement && r.activeElement.id === 'ff-answer'));
  const sizes = await shadow((r) => [...r.querySelectorAll('button,input,select')].map((e) => e.getBoundingClientRect().height));
  check('all controls >= 44px tall', sizes.every((h) => h >= 44), sizes);
  check('get-lookup was sent first', (await page.evaluate(() => window.__sent[0])).type === 'formfill-teach-get');
  // empty -> validation, no save
  await page.keyboard.press('Enter');
  check('empty answer is rejected (no save sent)', (await page.evaluate(() => window.__sent.filter((m) => m.type === 'formfill-teach-save').length)) === 0);
  await page.keyboard.type('she/her');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); // wraps inside dialog
  check('Tab stays inside dialog', await page.evaluate(() => !!document.querySelector('[data-formfill-teach]')));
  await page.focus('#t'); // focus outside is irrelevant; refocus input via shadow then submit
  await page.evaluate(() => document.querySelector('[data-formfill-teach]').shadowRoot.getElementById('ff-answer').focus());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sent.some((m) => m.type === 'formfill-teach-save'));
  const save = await page.evaluate(() => window.__sent.find((m) => m.type === 'formfill-teach-save'));
  check('save message has match + value', save.match === 'preferred pronouns' && save.value === 'she/her', save);
  check('status announced', await shadow((r) => /Saved/.test(r.querySelector('[role=status]').textContent)));
  await page.waitForFunction(() => !document.querySelector('[data-formfill-teach]'), null, { timeout: 4000 });
  check('prompt closed after save, focus returned to field', await page.evaluate(() => document.activeElement.id === 't'));

  // Esc closes
  await page.click('#ta', { button: 'right' }); await start();
  check('textarea gets a textarea input', await shadow((r) => r.getElementById('ff-answer').tagName === 'TEXTAREA'));
  await page.keyboard.press('Escape');
  check('Esc closes and restores focus', await page.evaluate(() => !document.querySelector('[data-formfill-teach]') && document.activeElement.id === 'ta'));

  // radio -> select of option labels, prefilled from existing rule
  await page.evaluate(() => { window.__reply = { value: 'No', profileName: 'Arabic' }; });
  await page.click('[name=vet][value=y]', { button: 'right' }); await start();
  const rad = await shadow((r) => { const s = r.getElementById('ff-answer'); return [s.tagName, [...s.options].map((o) => o.value), s.value, r.querySelector('p').textContent]; });
  check('radio: select with Yes/No, prefilled, profile named', rad[0] === 'SELECT' && rad[1].join() === ',Yes,No' && rad[2] === 'No' && /Arabic/.test(rad[3]), rad);
  await page.keyboard.press('Escape');

  // select + label click + Arabic
  await page.evaluate(() => { window.__reply = { value: '', profileName: 'English' }; });
  await page.click('#s', { button: 'right' }); const ms = await start();
  check('select field', ms === 'visa status', ms);
  const so = await shadow((r) => [...r.getElementById('ff-answer').options].map((o) => o.value).join()); check('select answer choices', so === ',Citizen,Work visa', so);
  await page.keyboard.press('Escape');
  await page.click('label[for=ar]', { button: 'right' }); const ma = await start();
  check('Arabic label / label click -> field', ma === 'اللغات التي تتحدثها', ma);
  await page.keyboard.press('Escape');

  // no field right-clicked
  await page.evaluate(() => { document.activeElement.blur(); }); await page.mouse.click(5, 5, { button: 'right' });
  await page.evaluate(() => window.__formFillTeach.start());
  check('no field -> helpful message + Close button', await shadow((r) => /Right-click a form field/.test(r.textContent) && !!r.querySelector('button')));
  await page.keyboard.press('Escape');

  // fill uses a taught rule end-to-end
  const filled = await page.evaluate(() => { document.getElementById('t').value = ''; return window.__formFill.fill({ data: {}, custom: [{ match: 'preferred pronouns', value: 'she/her' }] }); });
  check('taught rule is used by filler', filled.filled === 1 && (await page.$eval('#t', (e) => e.value)) === 'she/her', filled);

  // --- background/runner logic (service-worker side) in a vm with a mock chrome.storage
  const store = { profiles: [{ id: 'a', name: 'English', data: {}, custom: [{ match: 'Preferred Pronouns', value: 'old' }] }, { id: 'b', name: 'Arabic', data: {}, custom: [] }], activeId: 'b' };
  const ctx = { self: null, chrome: { storage: { local: { get: async () => JSON.parse(JSON.stringify(store)), set: async (o) => Object.assign(store, JSON.parse(JSON.stringify(o))), remove: async () => {} }, session: { get: async () => ({}), set: async () => {}, remove: async () => {} } } }, console, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto, atob, btoa };
  ctx.self = ctx; vm.createContext(ctx);
  for (const f of ['i18n.js', 'security.js', 'signature.js', 'runner.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  // signature.js uses `window` only if defined; in the worker root is self
  await vm.runInContext("saveTaughtRule('Preferred pronouns', 'she/her')", ctx);
  check('saves to ACTIVE profile only', store.profiles[1].custom.length === 1 && store.profiles[1].custom[0].value === 'she/her' && store.profiles[0].custom[0].value === 'old', store);
  await vm.runInContext("saveTaughtRule('  preferred  PRONOUNS ', 'they/them')", ctx);
  check('dedupe: same match updates, no duplicate', store.profiles[1].custom.length === 1 && store.profiles[1].custom[0].value === 'they/them', store.profiles[1].custom);
  await vm.runInContext("saveTaughtRule('are you a veteran?', 'No')", ctx);
  check('different match adds a rule', store.profiles[1].custom.length === 2);
  const got = await vm.runInContext("getTaughtRule('Preferred Pronouns')", ctx);
  check('getTaughtRule returns existing value + profile name', got.value === 'they/them' && got.profileName === 'Arabic', got);

  // manifest sanity
  const mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  check('permissions: only storage/activeTab/scripting/contextMenus, no hosts', mf.permissions.sort().join() === 'activeTab,contextMenus,scripting,storage' && !mf.host_permissions && !mf.content_scripts, mf.permissions);

  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
