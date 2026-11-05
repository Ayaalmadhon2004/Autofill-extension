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


  // ---- site allowlist: options + popup ---------------------------------------------------------------------
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const h = await installChrome(ctx, { local: { profiles: [profile], activeId: 'default', settings: { overwrite: false } }, tabUrl: 'https://jobs.other.com/apply' });
    await page.goto(h.url('options.html'));
    await page.check('#sites-on'); await page.fill('#sites-list', 'careers.acme.com\nnot a site');
    await page.click('text=Save site list');
    assert.match(await page.textContent('#sec-sites .sec-msg'), /Not a valid site: not a site/); ok('invalid entries are reported, nothing saved');
    await page.fill('#sites-list', 'https://careers.acme.com/jobs\n*.greenhouse.io');
    await page.click('text=Save site list');
    await page.waitForSelector('#sec-sites .sec-msg:has-text("limited to 2 sites")');
    assert.deepEqual(h.stores.local.settings.allowedSites, ['careers.acme.com', '*.greenhouse.io']); assert.equal(h.stores.local.settings.allowlistEnabled, true); ok('allowlist saved, URLs normalised');

    const popup = await ctx.newPage(); await popup.goto(h.url('popup.html'));
    await popup.waitForSelector('#allowSite', { state: 'visible' });
    assert.match(await popup.textContent('#status'), /jobs\.other\.com is not on your/); ok('popup warns up front about a refused site');
    await popup.click('#fill');
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Error: Not filled'));
    assert.equal(h.calls.executed.length, 0); ok('Fill refused with a clear message, nothing injected');
    await popup.click('#allowSite');
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('is now allowed'));
    assert.ok(h.stores.local.settings.allowedSites.includes('jobs.other.com')); ok('one-click "Always allow this site"');
    await popup.click('#fill');
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Filled'));
    ok('Fill works after allowing the site');
    await ctx.close();
  }


  // ---- backup: banner, download, import ------------------------------------------------------------------------
  {
    const fs = require('node:fs');
    const full = { id: 'default', name: 'English', data: { firstName: 'Aya' }, custom: [], experience: [{ company: 'Acme' }], education: [] };
    const arabic = { id: 'ar', name: 'Arabic', data: { firstName: 'آية' }, custom: [], experience: [], education: [] };
    const old = Date.now() - 20 * 86400000;
    const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
    const h = await installChrome(ctx, { local: { profiles: [full, arabic], activeId: 'default', settings: { overwrite: false, backupBaselineAt: old } } });
    const popup = await ctx.newPage(); await popup.goto(h.url('popup.html'));
    await popup.waitForSelector('#backup:not([hidden])');
    assert.match(await popup.textContent('#backup'), /Back up your profiles[\s\S]*plain text/); ok('popup shows the reminder banner after 14 days, warning about plain text');
    const [dl] = await Promise.all([popup.waitForEvent('download'), popup.click('#backup >> text=Download backup')]);
    const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    assert.equal(file.profiles.length, 2); assert.equal(file.encrypted, false); assert.match(dl.suggestedFilename(), /^form-filler-backup-\d{4}-\d{2}-\d{2}\.json$/);
    ok('popup download contains ALL profiles (no downloads permission: plain <a download>)');
    await popup.waitForFunction(() => document.getElementById('backup').hidden);
    assert.ok(h.stores.local.settings.lastBackupAt > Date.now() - 60000); ok('lastBackupAt recorded, banner goes away');
    await popup.reload(); assert.equal(await popup.isVisible('#backup'), false); ok('no banner right after a backup');

    // options: panel + import merge
    await page.goto(h.url('options.html'));
    assert.equal(await page.isVisible('#backup-banner'), false);
    assert.match(await page.textContent('#backup-note'), /plain text/); ok('options panel warns the backup is plain text without a passphrase');
    const extra = { id: 'x', name: 'Work', data: { firstName: 'W' }, custom: [], experience: [], education: [] };
    const tmp = require('node:os').tmpdir() + '/ff-import-' + process.pid + '.json';
    fs.writeFileSync(tmp, JSON.stringify({ app: 'one-click-form-filler', kind: 'backup', version: 1, encrypted: false, profiles: [full, extra] }));
    await page.setInputFiles('#backup-file', tmp);
    await page.waitForSelector('#sec-backup .sec-msg:has-text("Merged 1 new profile, 1 already present")');
    assert.deepEqual(h.stores.local.profiles.map((p) => p.id), ['default', 'ar', 'x']); ok('import merges all profiles, skips duplicates, saves');

    // encrypted flow
    await page.fill('#pp-new', 'backup-passphrase'); await page.fill('#pp-new2', 'backup-passphrase');
    await page.click('text=Turn on passphrase lock');
    await page.waitForSelector('#backup-note:has-text("encrypted with your passphrase")'); ok('backup note updates when a passphrase is set');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('text=Download backup of all profiles')]);
    const enc = fs.readFileSync(await dl2.path(), 'utf8');
    assert.ok(JSON.parse(enc).encrypted === true && !enc.includes('Acme') && !enc.includes('Aya')); assert.match(dl2.suggestedFilename(), /-encrypted\.json$/);
    ok('encrypted backup when a passphrase is set (no plain text in the file)');
    fs.writeFileSync(tmp, enc);
    await page.setInputFiles('#backup-file', tmp);
    await page.waitForSelector('#sec-backup .sec-msg:has-text("encrypted. Enter its passphrase")'); ok('encrypted import asks for the file passphrase');
    await page.fill('#backup-filepass', 'backup-passphrase'); await page.setInputFiles('#backup-file', tmp);
    await page.waitForSelector('#sec-backup .sec-msg:has-text("Merged 0 new profiles, 3 already present")'); ok('encrypted import round trip');
    fs.unlinkSync(tmp);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const h = await installChrome(ctx, { local: { profiles: [{ ...profile, data: { firstName: 'Aya' } }], activeId: 'default', settings: { overwrite: false, backupBaselineAt: Date.now() - 30 * 86400000 } } });
    await page.goto(h.url('options.html'));
    await page.waitForSelector('#backup-banner');
    assert.match(await page.textContent('#backup-banner'), /Back up your profiles/); ok('options shows the banner when a backup is due');
    await page.click('#backup-banner >> text=Remind me tomorrow');
    assert.ok(h.stores.local.settings.backupSnoozeUntil > Date.now()); ok('snooze works');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
