// Options UI for security features. Self-contained: each feature is one render function appended to #security.
// options.js calls showOptionsUnlock() when locked and initSecurityOptions() once state is loaded.
// Uses $, state, current, syncCurrent, flashMsg from options.js.

function secEl(tag, props, ...kids) {
  const e = Object.assign(document.createElement(tag), props || {});
  for (const k of kids) e.append(k);
  return e;
}
function secField(label, id, type, extra) { // real <label> for every control
  const input = secEl('input', Object.assign({ id, type: type || 'text' }, extra || {}));
  return secEl('label', { htmlFor: id }, label, input);
}
function secPanel(id, title) {
  const fs = secEl('fieldset', { id }, secEl('legend', { textContent: title }));
  const old = $(id);
  if (old) old.replaceWith(fs); else $('security').appendChild(fs); // re-render keeps its place
  return fs;
}
function secMessage(panel, text, bad) {
  let m = panel.querySelector('.sec-msg');
  if (!m) { m = secEl('p', { className: 'sec-msg' }); m.setAttribute('role', bad ? 'alert' : 'status'); panel.appendChild(m); }
  m.setAttribute('role', bad ? 'alert' : 'status');
  m.style.color = bad ? '#b3261e' : '#17663a';
  m.textContent = (bad ? '⚠ ' : '✓ ') + text; // icon + word + colour
}
const secErrText = (x) => x.code === 'BAD_PASSPHRASE' ? 'Wrong passphrase.' : x.message;

// ---- Lock screen for the options page ----------------------------------------------------------------
function showOptionsUnlock() {
  document.body.textContent = '';
  const form = secEl('form', {},
    secEl('h1', { textContent: 'Profiles are locked' }),
    secEl('p', { textContent: 'Enter your passphrase to view and edit your profiles. There is no way to recover a forgotten passphrase.' }),
    secField('Passphrase', 'unlockPass', 'password', { autocomplete: 'current-password', required: true }),
    secEl('p', {}, secEl('button', { type: 'submit', textContent: 'Unlock' })));
  document.body.appendChild(form);
  const msg = secEl('p', {}); msg.setAttribute('role', 'alert'); msg.style.color = '#b3261e'; form.appendChild(msg);
  $('unlockPass').focus();
  form.onsubmit = async (e) => {
    e.preventDefault(); msg.textContent = '';
    try { await FormFillSecurity.unlock($('unlockPass').value); location.reload(); }
    catch (x) { msg.textContent = '⚠ ' + secErrText(x); $('unlockPass').select(); }
  };
}

// ---- Passphrase lock panel -----------------------------------------------------------------------------
async function renderPassphrasePanel() {
  const enabled = await FormFillSecurity.isEnabled();
  const panel = secPanel('sec-pass', 'Passphrase lock');
  const min = FormFillSecurity.MIN_PASSPHRASE;
  panel.append(secEl('p', { textContent: enabled
    ? '🔒 Passphrase lock is ON. Your profiles are encrypted on this device and you unlock them once per browser session.'
    : 'Optional. Encrypt your profiles on this device (AES-GCM, key derived from your passphrase). You enter it once per browser session.' }));
  panel.append(secEl('p', { textContent: 'There is no passphrase recovery. If you forget it, your profiles and encrypted backups cannot be read by anyone, including us. Keep an unencrypted copy somewhere safe if that worries you.' }));
  panel.lastChild.style.fontWeight = '600';
  const mk = (txt, fn, cls) => secEl('button', { type: 'button', className: cls || '', textContent: txt, onclick: fn });
  const run = (fn, okText) => async () => {
    try { await fn(); await renderPassphrasePanel(); if (typeof renderBackupPanel === 'function') await renderBackupPanel(); secMessage($('sec-pass'), okText); }
    catch (x) { secMessage(panel, secErrText(x), true); }
  };
  const newPair = () => {
    const a = $('pp-new').value, b = $('pp-new2').value;
    if (a !== b) throw Object.assign(new Error('The two new passphrases do not match.'), { code: 'MISMATCH' });
    return a;
  };
  const grid = secEl('div', { className: 'grid' });
  panel.append(grid);
  if (!enabled) {
    grid.append(secField('New passphrase (min ' + min + ' characters)', 'pp-new', 'password', { autocomplete: 'new-password' }),
      secField('Repeat new passphrase', 'pp-new2', 'password', { autocomplete: 'new-password' }));
    panel.append(secEl('p', {}, mk('Turn on passphrase lock', run(async () => {
      const pass = newPair();
      syncCurrent(); await saveState({ profiles: state.profiles, activeId: state.activeId }); // include unsaved edits
      await FormFillSecurity.enable(pass, state.profiles);
    }, 'Passphrase lock is on. Your profiles are now stored encrypted.'))));
  } else {
    grid.append(secField('Current passphrase', 'pp-old', 'password', { autocomplete: 'current-password' }),
      secField('New passphrase (min ' + min + ' characters)', 'pp-new', 'password', { autocomplete: 'new-password' }),
      secField('Repeat new passphrase', 'pp-new2', 'password', { autocomplete: 'new-password' }));
    panel.append(secEl('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      mk('Change passphrase', run(async () => { const pass = newPair(); await FormFillSecurity.change($('pp-old').value, pass); },
        'Passphrase changed. Older encrypted backups still need the old passphrase.')),
      mk('Remove passphrase', run(async () => {
        if (!confirm('Remove the passphrase? Your profiles will be stored unencrypted on this device.')) return;
        await FormFillSecurity.disable($('pp-old').value);
      }, 'Passphrase removed. Profiles are stored unencrypted.'), 'sec'),
      mk('Lock now', async () => { await FormFillSecurity.lock(); location.reload(); }, 'sec')));
  }
}

async function initSecurityOptions() {
  if (!$('security')) return;
  $('security').textContent = '';
  await renderPassphrasePanel();
  await renderAllowlistPanel();
  await renderBackupPanel();
  await renderBackupBanner();
}

// ---- Site allowlist panel ----------------------------------------------------------------------------------
async function renderAllowlistPanel() {
  const { settings } = await loadState();
  const panel = secPanel('sec-sites', 'Only fill on these sites');
  panel.append(
    secEl('p', { textContent: 'Optional. When on, Fill (button and Ctrl+Shift+F) is refused on any site not listed here. One site per line. "example.com" matches only that host; "*.example.com" matches example.com and all its subdomains. You can also add the current site from the popup.' }),
    secEl('label', { htmlFor: 'sites-on', style: 'display:flex;gap:8px;align-items:center;min-height:44px' },
      secEl('input', { type: 'checkbox', id: 'sites-on', checked: !!settings.allowlistEnabled, style: 'width:24px;min-height:24px;margin:0' }), 'Only fill on the sites listed below'),
    secField('Allowed sites', 'sites-list', 'text'));
  const ta = secEl('textarea', { id: 'sites-list', dir: 'ltr', value: (settings.allowedSites || []).join('\n'), placeholder: 'careers.example.com\n*.greenhouse.io' });
  panel.querySelector('label[for=sites-list]').replaceChildren('Allowed sites', ta);
  panel.append(secEl('p', {}, secEl('button', { type: 'button', textContent: 'Save site list', onclick: async () => {
    const lines = ta.value.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const good = [], bad = [];
    for (const l of lines) { const p = FormFillSecurity.normalizePattern(l); if (p) { if (!good.includes(p)) good.push(p); } else bad.push(l); }
    if (bad.length) return secMessage(panel, 'Not a valid site: ' + bad.join(', '), true);
    const on = $('sites-on').checked;
    if (on && !good.length && !confirm('The list is empty, so Fill will be refused everywhere. Continue?')) return;
    await FormFillSecurity.updateSettings((s) => { s.allowlistEnabled = on; s.allowedSites = good; return s; });
    ta.value = good.join('\n');
    secMessage(panel, on ? 'Saved. Fill is limited to ' + good.length + ' site' + (good.length === 1 ? '' : 's') + '.' : 'Saved. The list is off, Fill works on every site.');
  } })));
}

// ---- Backup panel + reminder banner ---------------------------------------------------------------------------
async function renderBackupPanel() {
  const { settings } = await loadState();
  const encrypted = await FormFillSecurity.isEnabled();
  const panel = secPanel('sec-backup', 'Backup');
  const warn = secEl('p', { id: 'backup-note', textContent: encrypted
    ? '\uD83D\uDD12 Backups are encrypted with your passphrase (needed again to import them).'
    : '\u26A0 Without a passphrase the backup file contains your details as plain text. Keep it somewhere safe, or set a passphrase above to encrypt it.' });
  warn.style.fontWeight = '600';
  const days = secField('Remind me to back up every (days, 0 = never)', 'backup-days', 'number', { min: 0, max: 365, step: 1, value: String(settings.backupEveryDays) });
  const filePass = secField('Passphrase of the backup file (only if it is encrypted)', 'backup-filepass', 'password', { autocomplete: 'off' });
  const file = secEl('input', { type: 'file', id: 'backup-file', accept: 'application/json,.json', hidden: true });
  panel.append(
    secEl('p', { textContent: 'One file with ALL your profiles. Import merges them into what you have; nothing is overwritten or deleted.' }), warn,
    secEl('div', { className: 'grid' }, days, filePass),
    secEl('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      secEl('button', { type: 'button', textContent: 'Download backup of all profiles', onclick: doBackupDownload }),
      secEl('button', { type: 'button', className: 'sec', textContent: 'Import backup (merge)', onclick: () => file.click() }),
      secEl('button', { type: 'button', className: 'sec', textContent: 'Save reminder interval', onclick: async () => {
        const n = Math.max(0, Math.min(365, Math.floor(Number($('backup-days').value) || 0)));
        await FormFillSecurity.updateSettings((s) => { s.backupEveryDays = n; return s; });
        $('backup-days').value = n; secMessage(panel, n ? 'Reminder every ' + n + ' days.' : 'Reminders are off.');
      } })), file);
  file.onchange = async () => {
    try {
      const incoming = await FormFillSecurity.parseBackup(await file.files[0].text(), $('backup-filepass').value);
      syncCurrent();
      const m = FormFillSecurity.mergeProfiles(state.profiles, incoming);
      state.profiles = m.profiles;
      await saveState({ profiles: state.profiles, activeId: state.activeId });
      showProfile();
      secMessage(panel, 'Merged ' + m.added + ' new profile' + (m.added === 1 ? '' : 's') + (m.skipped ? ', ' + m.skipped + ' already present' : '') + '. Saved.');
    } catch (x) { secMessage(panel, secErrText(x), true); }
    file.value = '';
  };
}

async function doBackupDownload() {
  const panel = $('sec-backup');
  try {
    syncCurrent(); // include what is on screen
    const r = await FormFillSecurity.downloadBackup(state.profiles, state.activeId);
    secMessage(panel, r.encrypted ? 'Encrypted backup downloaded.' : 'Backup downloaded. It contains plain text: keep it safe.');
    const b = $('backup-banner'); if (b) b.remove();
  } catch (x) { secMessage(panel, secErrText(x), true); }
}

async function renderBackupBanner() {
  const r = await FormFillSecurity.backupReminder(state.profiles);
  if (!r.due) return;
  const encrypted = await FormFillSecurity.isEnabled();
  const box = secEl('div', { id: 'backup-banner', style: 'border:1px solid #f5a623;background:#fff8e6;border-radius:10px;padding:12px 16px;margin-bottom:16px' },
    secEl('strong', { textContent: 'Back up your profiles' }),
    secEl('p', { textContent: (r.days ? 'Your last backup was ' + r.days + ' days ago. ' : '') + (encrypted ? '\uD83D\uDD12 The file will be encrypted with your passphrase.' : '\u26A0 The file will contain your details as plain text.') }),
    secEl('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      secEl('button', { type: 'button', textContent: 'Download backup', onclick: doBackupDownload }),
      secEl('button', { type: 'button', className: 'sec', textContent: 'Remind me tomorrow', onclick: async () => { await FormFillSecurity.backupSnooze(); box.remove(); } })));
  box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Backup reminder');
  document.querySelector('h1').after(box);
}
