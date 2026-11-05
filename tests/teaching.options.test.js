// Options "Common questions": render, save per profile (profile.answers, not data), duplicate/switch keep them.
const { launch, check, done, root } = require('./teaching.helpers');
(async () => {
  const { browser, page } = await launch();
  await page.addInitScript(() => {
    const store = { profiles: [{ id: 'a', name: 'English', data: { firstName: 'Aya' }, custom: [], answers: { needsSponsorship: 'No' } }], activeId: 'a' };
    window.__store = store;
    window.chrome = { storage: { local: { get: async () => JSON.parse(JSON.stringify(store)), set: async (o) => Object.assign(store, JSON.parse(JSON.stringify(o))), remove: async () => {} } }, runtime: {} };
  });
  await page.goto('file://' + root + '/options.html');
  await page.waitForSelector('#answers [name=needsSponsorship]');
  check('section rendered with 12 questions', (await page.locator('#answers [name]').count()) === 12);
  check('saved answer shown', (await page.inputValue('[name=needsSponsorship]')) === 'No');
  check('yes/no questions are real <select> inside <label>', await page.$eval('[name=is18Plus]', (e) => e.tagName === 'SELECT' && !!e.closest('label')));
  await page.selectOption('[name=is18Plus]', 'Yes');
  await page.fill('[name=howHeard]', 'LinkedIn');
  await page.click('#save'); await page.waitForFunction(() => /Saved/.test(document.getElementById('msg').textContent));
  const p = await page.evaluate(() => window.__store.profiles[0]);
  check('answers stored in profile.answers, not data', p.answers.is18Plus === 'Yes' && p.answers.howHeard === 'LinkedIn' && p.answers.needsSponsorship === 'No' && !('is18Plus' in p.data) && p.data.firstName === 'Aya', p);
  await page.click('#pdup');
  check('duplicate copies answers', (await page.inputValue('[name=howHeard]')) === 'LinkedIn');
  await page.fill('[name=howHeard]', 'Friend'); await page.click('#save');
  await page.selectOption('#psel', 'a');
  check('switching back keeps the original profile answers', (await page.inputValue('[name=howHeard]')) === 'LinkedIn');
  const bad = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.setViewportSize({ width: 390, height: 800 });
  check('no horizontal scroll at 390px', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
