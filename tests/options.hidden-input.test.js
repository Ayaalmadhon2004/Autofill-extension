// Regression: the hidden import <input type=file> must not be visible (page CSS used to override [hidden]).
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
const { installChrome } = require('./helpers/chromeMock.js');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 900, height: 800 } });
  const h = await installChrome(ctx, { local: { profiles: [{ id: 'default', name: 'English', data: {}, custom: [] }], activeId: 'default' } });
  const p = await ctx.newPage(); await p.goto(h.url('options.html')); await p.waitForTimeout(400);
  const vis = await p.$eval('#importFile', (e) => !!(e.offsetWidth || e.offsetHeight));
  assert.strictEqual(vis, false, 'import file input must be hidden');
  console.log('PASS import file input is hidden'); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
