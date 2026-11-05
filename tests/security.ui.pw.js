// Playwright: popup + options flows against a mocked chrome.*.  Run: NODE_PATH=$(npm root -g) node tests/security.ui.pw.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { installChrome } = require('./helpers/chromeMock.js');

const profile = { id: 'default', name: 'English', data: { firstName: 'Aya' }, custom: [], experience: [], education: [] };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

(async () => {
  const browser = await chromium.launch();

  // ---- repeating sections editor -------------------------------------------------------------------
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const h = await installChrome(ctx, { local: { profiles: [profile], activeId: 'default', settings: { overwrite: false } } });
    await page.goto(h.url('options.html'));
    await page.click('text=Add experience'); await page.click('text=Add experience');
    const cards = page.locator('.entry-section[data-section=experience] .entry');
    assert.equal(await cards.count(), 2);
    await cards.nth(0).locator('[data-key=company]').fill('First Co');
    await cards.nth(1).locator('[data-key=company]').fill('Second Co');
    await page.click('[aria-label="Move up Experience 2"]');
    assert.equal(await cards.nth(0).locator('[data-key=company]').inputValue(), 'Second Co'); ok('move up reorders and renumbers');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Move up Experience 1'); ok('focus stays on the moved entry\'s button');
    await page.click('text=Add education');
    await page.locator('.entry-section[data-section=education] [data-key=school]').fill('MIT');
    await page.click('[aria-label="Remove Experience 1"]');
    assert.equal(await cards.count(), 1); ok('remove works');
    // 44px targets + labels
    const small = await page.$$eval('.entry button, .entry input, .entry textarea', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
    assert.equal(small, 0); ok('all entry controls are at least 44px tall');
    const unlabeled = await page.$$eval('.entry input, .entry textarea', (els) => els.filter((e) => !e.closest('label')).length);
    assert.equal(unlabeled, 0); ok('every entry input has a label');
    await page.click('#save');
    await page.waitForFunction(() => document.getElementById('msg').textContent.includes('Saved'));
    const saved = h.stores.local.profiles[0];
    assert.deepEqual(saved.experience, [{ company: 'First Co' }]); assert.deepEqual(saved.education, [{ school: 'MIT' }]); ok('saved with experience[] and education[] per profile');
    await ctx.close();
  }

  // ---- passphrase lock: options + popup ---------------------------------------------------------------
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const h = await installChrome(ctx, { local: { profiles: [profile], activeId: 'default', settings: { overwrite: false } } });
    await page.goto(h.url('options.html'));
    await page.fill('#pp-new', 'passphrase-1'); await page.fill('#pp-new2', 'different');
    await page.click('text=Turn on passphrase lock');
    assert.match(await page.textContent('#sec-pass .sec-msg'), /do not match/); ok('mismatched confirmation refused');
    await page.fill('#pp-new', 'short'); await page.fill('#pp-new2', 'short');
    await page.click('text=Turn on passphrase lock');
    assert.match(await page.textContent('#sec-pass .sec-msg'), /at least 8/); ok('weak passphrase refused');
    await page.fill('#pp-new', 'passphrase-1'); await page.fill('#pp-new2', 'passphrase-1');
    await page.click('text=Turn on passphrase lock');
    await page.waitForSelector('#sec-pass .sec-msg:has-text("now stored encrypted")');
    assert.ok(h.stores.local.vault && !h.stores.local.profiles); ok('enabling stores a vault and removes plain profiles');
    assert.match(await page.textContent('#sec-pass'), /no passphrase recovery/i); ok('UI says there is no recovery');

    // popup while unlocked: fill works, no prompt
    const popup = await ctx.newPage(); await popup.goto(h.url('popup.html'));
    await popup.click('#fill'); await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Filled'));
    ok('popup Fill works while unlocked');

    // browser restart: session storage cleared
    for (const k of Object.keys(h.stores.session)) delete h.stores.session[k];
    await popup.reload();
    assert.equal(await popup.isVisible('#fill'), false); assert.equal(await popup.isVisible('#pass'), true); ok('locked popup shows passphrase field instead of Fill');
    await popup.fill('#pass', 'nope-nope-nope'); await popup.click('#unlock button');
    await popup.waitForFunction(() => document.getElementById('unlockErr').textContent.includes('Wrong'));
    await popup.fill('#pass', 'passphrase-1'); await popup.click('#unlock button');
    await popup.waitForSelector('#fill', { state: 'visible' }); ok('wrong passphrase rejected, correct one unlocks the popup');

    // options while locked
    for (const k of Object.keys(h.stores.session)) delete h.stores.session[k];
    await page.reload();
    assert.equal(await page.isVisible('#unlockPass'), true); ok('locked options page shows unlock gate only');
    await page.fill('#unlockPass', 'passphrase-1'); await page.click('button[type=submit]');
    await page.waitForSelector('#pname'); assert.equal(await page.inputValue('#pname'), 'English'); ok('options unlocks and shows profile');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
