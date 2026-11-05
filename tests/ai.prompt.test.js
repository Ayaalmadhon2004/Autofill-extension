// AI suggest, in-page prompt (ai-suggest.js): accessibility, Insert only on click, Esc / focus return, request contents. chrome.* mocked.
const { launch, inject, check, done } = require('./teaching.helpers');
(async () => {
  const { browser, page } = await launch();
  await page.setContent(`<h1>Backend Developer</h1><script type="application/ld+json">{"@type":"JobPosting","title":"Backend Developer","hiringOrganization":{"name":"Globex"}}</script>
    <form><label for=w>Why do you want to work here? *</label><textarea id=w></textarea>
    <label for=n>Full name</label><input id=n type=text>
    <label for=e>Email</label><input id=e type=email>
    <label for=a>لماذا تريد العمل معنا؟</label><textarea id=a></textarea></form><button id=submit onclick="window.__submitted=true">Submit</button>`);
  await page.evaluate(() => {
    window.__sent = []; window.__reply = { ok: true, text: 'I enjoy building APIs.' }; window.__delay = 0; window.__changes = 0;
    window.chrome = { runtime: { lastError: null, sendMessage: (m, cb) => { window.__sent.push(m); setTimeout(() => cb(window.__reply), window.__delay); } } };
    document.getElementById('w').addEventListener('change', () => window.__changes++);
  });
  await inject(page, ['i18n.js', 'signature.js', 'ai-suggest.js']);
  const shadow = (fn, arg) => page.evaluate(([f, a]) => { const host = document.querySelector('[data-formfill-ai]'); return new Function('root', 'a', 'return (' + f + ')(root,a)')(host && host.shadowRoot, a); }, [fn.toString(), arg]);
  const startAuto = () => page.evaluate(() => window.__formFillAI.start());
  const sentCount = () => page.evaluate(() => window.__sent.length);

  check('nothing sent just by injecting the script', (await sentCount()) === 0);
  await page.focus('#w');
  await startAuto();
  await page.waitForFunction(() => window.__sent.length === 1);
  const m = await page.evaluate(() => window.__sent[0]);
  check('one draft request with question text (label, "*" stripped) and page job title/company only', m.type === 'formfill-ai-draft' && m.question === 'Why do you want to work here?' && m.page.jobTitle === 'Backend Developer' && m.page.company === 'Globex' && Object.keys(m).sort().join() === 'page,question,type', m);
  check('request carries no profile data and no other keys', !JSON.stringify(m).match(/email|phone|@/i));
  await shadow((r) => r.getElementById('ff-ai-draft'));
  await page.waitForFunction(() => document.querySelector('[data-formfill-ai]').shadowRoot.getElementById('ff-ai-draft').value !== '');
  check('draft shown in an editable textarea', await shadow((r) => r.getElementById('ff-ai-draft').value === 'I enjoy building APIs.' && !r.getElementById('ff-ai-draft').readOnly));
  check('field NOT filled automatically', (await page.inputValue('#w')) === '' && (await page.evaluate(() => window.__changes)) === 0);
  check('modal dialog labelled by its title', await shadow((r) => { const b = r.querySelector('[role=dialog]'); return b.getAttribute('aria-modal') === 'true' && r.getElementById(b.getAttribute('aria-labelledby')).textContent.length > 3; }));
  check('draft textarea has a real <label for>', await shadow((r) => { const l = r.querySelector('label'); return l.htmlFor === 'ff-ai-draft' && !!r.getElementById('ff-ai-draft'); }));
  check('visible note: drafted by AI, check it', await shadow((r) => /Drafted by AI from the details you allowed — check it before sending/.test(r.textContent)));
  check('three real buttons: Insert into field / Regenerate / Cancel', await shadow((r) => [...r.querySelectorAll('button')].map((b) => b.textContent).join('|') === 'Cancel|Regenerate|Insert into field'));
  const sizes = await shadow((r) => [...r.querySelectorAll('button,textarea')].map((e) => e.getBoundingClientRect().height));
  check('all controls >= 44px tall', sizes.every((h) => h >= 44), sizes);
  check('status announced politely (role=status)', await shadow((r) => !!r.querySelector('[role=status]') && /Draft ready/.test(r.querySelector('[role=status]').textContent)));

  // Tab stays in the dialog
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  check('Tab stays inside the dialog', await shadow((r) => !!r && !!r.activeElement));
  check('page was not submitted', !(await page.evaluate(() => window.__submitted)));

  // Regenerate sends a second request and replaces the draft; user edits are replaced only then
  await page.evaluate(() => { window.__reply = { ok: true, text: 'Second draft.' }; });
  await shadow((r) => { [...r.querySelectorAll('button')].find((b) => b.textContent === 'Regenerate').click(); });
  await page.waitForFunction(() => document.querySelector('[data-formfill-ai]').shadowRoot.getElementById('ff-ai-draft').value === 'Second draft.');
  check('Regenerate = second request only after the click', (await sentCount()) === 2);

  // user edit, then Insert click
  await shadow((r) => { const a = r.getElementById('ff-ai-draft'); a.value = 'Edited by me.'; a.dispatchEvent(new Event('input')); });
  check('still not inserted before the click', (await page.inputValue('#w')) === '');
  await shadow((r) => { [...r.querySelectorAll('button')].find((b) => b.textContent === 'Insert into field').click(); });
  check('Insert click writes the EDITED text, fires input/change', (await page.inputValue('#w')) === 'Edited by me.' && (await page.evaluate(() => window.__changes)) >= 1);
  check('prompt closed, focus returned to the field, form not submitted', await page.evaluate(() => !document.querySelector('[data-formfill-ai]') && document.activeElement.id === 'w' && !window.__submitted));

  // Esc closes without inserting; focus returns
  await page.fill('#w', ''); await page.focus('#w'); await startAuto();
  await page.waitForFunction(() => document.querySelector('[data-formfill-ai]').shadowRoot.getElementById('ff-ai-draft').value !== '');
  await page.keyboard.press('Escape');
  check('Esc closes, nothing inserted, focus back on the field', await page.evaluate(() => !document.querySelector('[data-formfill-ai]') && document.activeElement.id === 'w' && document.getElementById('w').value === ''));
  // Cancel button
  await startAuto();
  await page.waitForFunction(() => document.querySelector('[data-formfill-ai]'));
  await shadow((r) => { [...r.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click(); });
  check('Cancel closes without inserting', await page.evaluate(() => !document.querySelector('[data-formfill-ai]') && document.getElementById('w').value === ''));

  // Errors are shown readably and nothing can be inserted
  await page.evaluate(() => { window.__reply = { ok: false, error: 'Anthropic rejected the API key (401). Check the key in the extension options.' }; });
  await startAuto();
  await page.waitForFunction(() => /rejected/.test(document.querySelector('[data-formfill-ai]').shadowRoot.querySelector('[role=status]').textContent));
  check('error shown in the status area with a warning icon + words', await shadow((r) => /^⚠ Could not draft an answer: Anthropic rejected the API key/.test(r.querySelector('[role=status]').textContent)));
  check('Insert is disabled when there is no draft', await shadow((r) => [...r.querySelectorAll('button')].find((b) => b.textContent === 'Insert into field').disabled));
  await page.keyboard.press('Escape');

  // text input and Arabic question; Arabic text is passed through unchanged
  await page.evaluate(() => { window.__reply = { ok: true, text: 'أحب العمل هنا' }; });
  await page.focus('#a'); await startAuto();
  await page.waitForFunction(() => window.__sent.at(-1).question === 'لماذا تريد العمل معنا؟');
  check('Arabic question sent as-is; draft textarea dir=auto', await shadow((r) => r.getElementById('ff-ai-draft').dir === 'auto'));
  await page.keyboard.press('Escape');
  await page.focus('#n'); const sendsBefore = await sentCount(); await startAuto();
  check('plain text input is eligible', (await sentCount()) === sendsBefore + 1);
  await page.keyboard.press('Escape');

  // ineligible: email input, nothing focused -> helpful message, no request
  await page.focus('#e'); const b2 = await sentCount();
  const r1 = await page.evaluate(() => window.__formFillAI.start({ onlyIfField: true }));
  check('email input is not eligible; popup path returns false and opens nothing', r1 === false && (await sentCount()) === b2 && (await page.evaluate(() => !document.querySelector('[data-formfill-ai]'))));
  await page.evaluate(() => document.activeElement.blur()); await page.mouse.click(2, 2);
  await startAuto();
  check('no field: explains what to do, offers Close, sends nothing', (await sentCount()) === b2 && await shadow((r) => /Click into a text box/.test(r.textContent) && [...r.querySelectorAll('button')].map((b) => b.textContent).join() === 'Close'));
  await page.keyboard.press('Escape');

  // right-click path finds the field without focus
  await page.evaluate(() => window.__reply = { ok: true, text: 'Right-click draft' });
  await page.click('#w', { button: 'right' }); await page.evaluate(() => document.activeElement.blur());
  await page.click('#w', { button: 'right' }); await startAuto();
  await page.waitForFunction(() => document.querySelector('[data-formfill-ai]').shadowRoot.getElementById('ff-ai-draft').value === 'Right-click draft');
  check('right-clicked field is found', true);
  await page.keyboard.press('Escape');

  // narrow viewport: no horizontal scroll
  await page.setViewportSize({ width: 390, height: 700 }); await page.focus('#w'); await startAuto();
  check('no horizontal scroll at 390px', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
