// Ctrl+Shift+F handler: badge when locked / refused / filled.  Run: node tests/security.background.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { loadExtension } = require('./helpers/load.js');

const profiles = [{ id: 'default', name: 'English', data: { firstName: 'Aya' }, custom: [] }];

function boot({ local, url = 'https://example.com/apply' }) {
  const badge = { text: [], color: [], title: [] };
  let handler;
  const ctx = loadExtension(['i18n.js', 'security.js', 'runner.js'], {
    local,
    tabs: { query: async () => [{ id: 1, url }] },
    scripting: { executeScript: async (o) => (o.files ? [] : [{ result: { filled: 3, fields: ['x'] } }]) }
  });
  Object.assign(ctx.chrome, {
    commands: { onCommand: { addListener: (f) => { handler = f; } } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} }, getURL: (x) => x },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    action: {
      setBadgeText: ({ text }) => badge.text.push(text), setBadgeBackgroundColor: ({ color }) => badge.color.push(color), setTitle: ({ title }) => badge.title.push(title)
    }
  });
  ctx.importScripts = () => {};
  ctx.setTimeout = () => 0; // do not clear the badge during the test
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  return { ctx, badge, press: () => handler('fill-page') };
}

(async () => {
  let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

  await t('unlocked: badge shows the number of filled fields', async () => {
    const b = boot({ local: { profiles, settings: { overwrite: false } } });
    await b.press(); assert.equal(b.badge.text[0], '3');
  });
  await t('locked: badge shows the lock icon and the tooltip says why', async () => {
    const b = boot({ local: { profiles, settings: { overwrite: false } } });
    await b.ctx.FormFillSecurity.enable('long enough pass', profiles);
    await b.ctx.FormFillSecurity.lock();
    await b.press();
    assert.equal(b.badge.text[0], '\u{1F512}'); assert.match(b.badge.title[0], /Locked/);
  });
  await t('site not on the allowlist: "!" badge and tooltip naming the site', async () => {
    const b = boot({ local: { profiles, settings: { overwrite: false, allowlistEnabled: true, allowedSites: ['careers.acme.com'] } }, url: 'https://other.com/apply' });
    await b.press();
    assert.equal(b.badge.text[0], '!'); assert.match(b.badge.title[0], /other\.com is not on your/);
  });
  console.log(`\n${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
