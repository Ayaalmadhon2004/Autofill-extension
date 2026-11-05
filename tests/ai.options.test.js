// AI suggest, Options section + background wiring: consent gating, permission request/removal, key handling, menu, message routing.
// chrome.* mocked, no network.   Run: NODE_PATH=$(npm root -g) node tests/ai.options.test.js
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { chromium } = require('playwright');
const { installChrome } = require('./helpers/chromeMock.js');
const { loadExtension } = require('./helpers/load.js');
const { check, done, root } = require('./teaching.helpers');
const KEY = 'sk-ant-FAKE-options-key-1';
const profile = { id: 'default', name: 'English', data: { firstName: 'Aya' }, custom: [], experience: [], education: [] };

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  check('manifest: NO required host permissions', !manifest.host_permissions && manifest.permissions.join() === 'storage,activeTab,scripting,contextMenus', manifest.permissions);
  check('manifest: optional host permission is api.anthropic.com only', JSON.stringify(manifest.optional_host_permissions) === '["https://api.anthropic.com/*"]', manifest.optional_host_permissions);

  const browser = await chromium.launch();
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const h = await installChrome(ctx, { local: { profiles: [profile], activeId: 'default', settings: { overwrite: false } } });
  await ctx.addInitScript(() => {
    window.__perm = { granted: false, requests: 0, removed: 0, grantNext: true }; window.__msgs = [];
    window.__testReply = { ok: true, text: 'Connection works.' };
    chrome.permissions = {
      contains: async () => window.__perm.granted,
      request: async () => { window.__perm.requests++; window.__perm.granted = window.__perm.grantNext; return window.__perm.grantNext; },
      remove: async () => { window.__perm.removed++; window.__perm.granted = false; return true; }
    };
    chrome.runtime.sendMessage = (m, cb) => { window.__msgs.push(m); setTimeout(() => cb(window.__testReply), 0); };
  });
  await page.goto(h.url('options.html'));
  await page.waitForSelector('#aiSection');
  const stored = () => h.stores.local.aiSettings;
  const say = () => page.textContent('#aiMsg');

  check('section visible with title, clear warning and billing note', await page.evaluate(() => {
    const s = document.getElementById('aiSection'); const t = s.textContent;
    return /AI suggestions \(optional\)/.test(s.querySelector('legend').textContent) && /only feature that sends data out of your browser/.test(t) && /question you are answering/.test(t) && /job title and company text/.test(t) && /ONLY the profile parts you tick/.test(t) && /Never sent: your email, phone, address, CV, ID numbers/.test(t) && /billed to your own Anthropic API account/.test(t);
  }));
  check('OFF by default: nothing stored, enable disabled until consent', !stored() && await page.$eval('#aiEnable', (e) => e.disabled && !e.checked) && await page.$eval('#aiConsent', (e) => !e.checked));
  check('all 5 profile parts present and unticked; email/phone/address/CV are not offered', await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#aiSection input[id^=ai-part-]')]; const t = document.getElementById('aiSection').querySelector('fieldset').textContent;
    return ids.length === 5 && ids.every((i) => !i.checked) && !/Email|Phone|Street|CV/.test(t);
  }));
  check('model defaults to claude-haiku-5-5; key field is a password input', (await page.inputValue('#aiModel')) === 'claude-haiku-5-5' && (await page.getAttribute('#aiKey', 'type')) === 'password');
  check('says clearly the key is stored unencrypted (no passphrase lock)', /UNENCRYPTED|unencrypted/.test(await page.textContent('#aiKeyStatus')));
  check('every control has a real label; 44px targets', await page.evaluate(() => [...document.querySelectorAll('#aiSection input, #aiSection button')].every((e) => (e.tagName === 'BUTTON' || (e.labels && e.labels.length)) && e.getBoundingClientRect().height >= 44)));

  // enabling without consent / without key
  await page.check('#aiConsent'); await page.check('#aiEnable'); await page.uncheck('#aiConsent');
  check('un-ticking consent switches enable off and disables it', await page.$eval('#aiEnable', (e) => e.disabled && !e.checked));
  await page.check('#aiConsent'); await page.check('#aiEnable');
  await page.click('#aiSave');
  await page.waitForFunction(() => /API key/.test(document.getElementById('aiMsg').textContent));
  check('enable without key: refused with message, stays OFF', /Enter your API key first/.test(await say()) && stored().enabled === false);
  check('permission was asked from the Save click (user gesture), then removed again', await page.evaluate(() => window.__perm.requests === 1 && !window.__perm.granted));

  // permission denied
  await page.evaluate(() => { window.__perm.grantNext = false; });
  await page.fill('#aiKey', KEY); await page.check('#aiConsent'); await page.check('#aiEnable'); await page.click('#aiSave');
  await page.waitForFunction(() => /not granted/.test(document.getElementById('aiMsg').textContent));
  check('permission denied: stays OFF with a clear message; key NOT saved', stored().enabled === false && !h.stores.local.aiKey, [stored(), h.stores.local.aiKey]);

  // success
  await page.evaluate(() => { window.__perm.grantNext = true; });
  await page.check('#ai-part-summary'); await page.check('#ai-part-currentTitle'); await page.check('#aiConsent'); await page.check('#aiEnable');
  await page.fill('#aiKey', KEY); await page.fill('#aiModel', 'claude-haiku-5-5');
  await page.click('#aiSave');
  await page.waitForFunction(() => /AI suggestions are on/.test(document.getElementById('aiMsg').textContent));
  const s = stored();
  check('saved: enabled + consent + only the ticked parts', s.enabled && s.consent && s.include.summary && s.include.currentTitle && !s.include.education && !s.include.experience && !s.include.yearsExperience, s);
  check('key stored locally (plain, because no lock) and never in settings / profiles', h.stores.local.aiKey.plain === KEY && !JSON.stringify(s).includes(KEY) && !JSON.stringify(h.stores.local.profiles).includes(KEY));
  check('key field cleared and key not displayed anywhere on the page', await page.evaluate((k) => !document.body.innerText.includes(k) && document.getElementById('aiKey').value === '' && !document.documentElement.outerHTML.includes(k), KEY));
  check('optional host permission granted at runtime', await page.evaluate(() => window.__perm.granted));

  // test connection
  await page.click('#aiTest'); await page.waitForFunction(() => /Connection works/.test(document.getElementById('aiMsg').textContent));
  check('Test connection asks the background worker (no fetch from the page)', await page.evaluate(() => window.__msgs.at(-1).type === 'formfill-ai-test' && Object.keys(window.__msgs.at(-1)).length === 1));
  await page.evaluate(() => { window.__testReply = { ok: false, error: 'Anthropic rejected the API key (401). Check the key in the extension options.' }; });
  await page.click('#aiTest'); await page.waitForFunction(() => /rejected/.test(document.getElementById('aiMsg').textContent));
  check('test failure is shown as an alert with warning icon', (await page.getAttribute('#aiMsg', 'role')) === 'alert' && /^⚠/.test(await say()));

  // turning it off removes the permission
  await page.uncheck('#aiEnable'); await page.click('#aiSave');
  await page.waitForFunction(() => /AI suggestions are off/.test(document.getElementById('aiMsg').textContent));
  check('disabling removes the host permission; key kept', await page.evaluate(() => !window.__perm.granted) && stored().enabled === false && !!h.stores.local.aiKey);

  // remove key
  await page.check('#aiEnable'); await page.click('#aiSave'); await page.waitForFunction(() => /are on/.test(document.getElementById('aiMsg').textContent));
  await page.click('#aiRemove'); await page.waitForFunction(() => /Key removed/.test(document.getElementById('aiMsg').textContent));
  check('Remove key: key gone, feature off, permission removed', !h.stores.local.aiKey && stored().enabled === false && (await page.evaluate(() => !window.__perm.granted)));
  check('no horizontal scroll at 390px', await (async () => { await page.setViewportSize({ width: 390, height: 800 }); return !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)); })());
  await browser.close();

  // ---- background wiring (vm) ---------------------------------------------------------------------------
  const ev = { menus: [], clicks: [], msg: [], installed: [], scripts: [], fetches: 0 };
  const t = loadExtension(['i18n.js', 'security.js', 'signature.js', 'runner.js', 'ai.js'], {
    local: { profiles: [profile], activeId: 'default', aiSettings: { enabled: true, consent: true, model: 'claude-haiku-5-5', include: { summary: true } }, aiKey: { plain: KEY } },
    tabs: { query: async () => [{ id: 3, url: 'https://example.com/apply' }] },
    scripting: { executeScript: async (o) => { ev.scripts.push(o); return o.files ? [] : [{ result: true }]; } }
  });
  Object.assign(t.chrome, {
    commands: { onCommand: { addListener() {} } }, action: {},
    runtime: { id: 'me', onInstalled: { addListener: (f) => ev.installed.push(f) }, onMessage: { addListener: (f) => ev.msg.push(f) }, getURL: (x) => x },
    contextMenus: { create: (o) => ev.menus.push(o), onClicked: { addListener: (f) => ev.clicks.push(f) } },
    permissions: { contains: async () => true }
  });
  t.importScripts = () => {}; t.fetch = async () => { ev.fetches++; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }; };
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), t, { filename: 'background.js' });
  ev.installed.forEach((f) => f({ reason: 'update' }));
  const ai = ev.menus.find((m) => m.id === 'formfill-ai-suggest');
  check('context menu item "Suggest an answer with AI…" for editable fields (the Teach item is untouched)', ai && ai.title === 'Suggest an answer with AI…' && ai.contexts.join() === 'editable' && ev.menus.some((m) => m.id === 'formfill-teach'), ev.menus);
  await Promise.all(ev.clicks.map((f) => f({ menuItemId: 'formfill-ai-suggest', frameId: 2 }, { id: 3, url: 'https://example.com/apply' })));
  check('menu click injects the prompt script into the clicked frame only; sends nothing itself', ev.scripts[0].files.join() === 'i18n.js,signature.js,ai-suggest.js' && ev.scripts[0].target.frameIds[0] === 2 && ev.fetches === 0, ev.scripts[0]);
  const call = (m, sender) => new Promise((res) => { let used = false; for (const f of ev.msg) { if (f(m, sender, res)) used = true; } if (!used) res('IGNORED'); });
  check('a draft request from a web page tab is served', (await call({ type: 'formfill-ai-draft', question: 'Why us?', page: {} }, { id: 'me', tab: { id: 3 } })).ok === true && ev.fetches === 1);
  check('draft request from an extension page (no tab) is ignored', (await call({ type: 'formfill-ai-draft', question: 'Why us?' }, { id: 'me' })) === 'IGNORED' && ev.fetches === 1);
  check('draft request from another extension is ignored', (await call({ type: 'formfill-ai-draft', question: 'x' }, { id: 'evil', tab: { id: 1 } })) === 'IGNORED' && ev.fetches === 1);
  check('test request from a web page tab is ignored', (await call({ type: 'formfill-ai-test' }, { id: 'me', tab: { id: 3 } })) === 'IGNORED' && ev.fetches === 1);
  check('test request from Options is served', (await call({ type: 'formfill-ai-test' }, { id: 'me' })).ok === true && ev.fetches === 2);
  const st = await call({ type: 'formfill-ai-start' }, { id: 'me' });
  check('popup start injects the prompt into all frames with onlyIfField', st.ok && ev.scripts.at(-1).args[0] === true && ev.scripts.at(-2).target.allFrames === true, ev.scripts.at(-1));
  done();
})().catch((e) => { console.error(e); process.exit(1); });
