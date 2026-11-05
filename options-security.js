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
const secErrText = (x) => x.code === 'BAD_PASSPHRASE' ? t('lock.wrongShort') : x.message;

// ---- Lock screen for the options page ----------------------------------------------------------------
function showOptionsUnlock() {
  document.body.textContent = '';
  FORMFILL_I18N.mountSwitcher(document.body);
  const form = secEl('form', {},
    secEl('h1', { textContent: t('lock.title') }),
    secEl('p', { textContent: t('lock.optionsIntro') }),
    secField(t('lock.passphrase'), 'unlockPass', 'password', { autocomplete: 'current-password', required: true }),
    secEl('p', {}, secEl('button', { type: 'submit', textContent: t('lock.unlock') })));
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
  const panel = secPanel('sec-pass', t('optsec.passLegend'));
  const min = FormFillSecurity.MIN_PASSPHRASE;
  panel.append(secEl('p', { textContent: enabled ? t('optsec.passOn') : t('optsec.passOff') }));
  panel.append(secEl('p', { textContent: t('optsec.passWarn') }));
  panel.lastChild.style.fontWeight = '600';
  const mk = (txt, fn, cls) => secEl('button', { type: 'button', className: cls || '', textContent: txt, onclick: fn });
  const run = (fn, okText) => async () => {
    try { await fn(); await renderPassphrasePanel(); if (typeof renderBackupPanel === 'function') await renderBackupPanel(); secMessage($('sec-pass'), okText); }
    catch (x) { secMessage(panel, secErrText(x), true); }
  };
  const newPair = () => {
    const a = $('pp-new').value, b = $('pp-new2').value;
    if (a !== b) throw Object.assign(new Error(t('optsec.mismatch')), { code: 'MISMATCH' });
    return a;
  };
  const grid = secEl('div', { className: 'grid' });
  panel.append(grid);
  if (!enabled) {
    grid.append(secField(t('optsec.newPass', { n: min }), 'pp-new', 'password', { autocomplete: 'new-password' }),
      secField(t('optsec.repeatPass'), 'pp-new2', 'password', { autocomplete: 'new-password' }));
    panel.append(secEl('p', {}, mk(t('optsec.turnOn'), run(async () => {
      const pass = newPair();
      syncCurrent(); await saveState({ profiles: state.profiles, activeId: state.activeId }); // include unsaved edits
      await FormFillSecurity.enable(pass, state.profiles);
    }, t('optsec.turnedOn')))));
  } else {
    grid.append(secField(t('optsec.currentPass'), 'pp-old', 'password', { autocomplete: 'current-password' }),
      secField(t('optsec.newPass', { n: min }), 'pp-new', 'password', { autocomplete: 'new-password' }),
      secField(t('optsec.repeatPass'), 'pp-new2', 'password', { autocomplete: 'new-password' }));
    panel.append(secEl('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      mk(t('optsec.change'), run(async () => { const pass = newPair(); await FormFillSecurity.change($('pp-old').value, pass); },
        t('optsec.changed'))),
      mk(t('optsec.remove'), run(async () => {
        if (!confirm(t('optsec.confirmRemove'))) return;
        await FormFillSecurity.disable($('pp-old').value);
      }, t('optsec.removed')), 'sec'),
      mk(t('lock.now'), async () => { await FormFillSecurity.lock(); location.reload(); }, 'sec')));
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
  const panel = secPanel('sec-sites', t('optsec.sitesLegend'));
  panel.append(
    secEl('p', { textContent: t('optsec.sitesHelp') }),
    secEl('label', { htmlFor: 'sites-on', style: 'display:flex;gap:8px;align-items:center;min-height:44px' },
      secEl('input', { type: 'checkbox', id: 'sites-on', checked: !!settings.allowlistEnabled, style: 'width:24px;min-height:24px;margin:0' }), t('optsec.sitesOn')),
    secField(t('optsec.sitesList'), 'sites-list', 'text'));
  const ta = secEl('textarea', { id: 'sites-list', dir: 'ltr', value: (settings.allowedSites || []).join('\n'), placeholder: 'careers.example.com\n*.greenhouse.io' });
  panel.querySelector('label[for=sites-list]').replaceChildren(t('optsec.sitesList'), ta);
  panel.append(secEl('p', {}, secEl('button', { type: 'button', textContent: t('optsec.sitesSave'), onclick: async () => {
    const lines = ta.value.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const good = [], bad = [];
    for (const l of lines) { const p = FormFillSecurity.normalizePattern(l); if (p) { if (!good.includes(p)) good.push(p); } else bad.push(l); }
    if (bad.length) return secMessage(panel, t('optsec.sitesInvalid', { sites: bad.join(', ') }), true);
    const on = $('sites-on').checked;
    if (on && !good.length && !confirm(t('optsec.sitesEmpty'))) return;
    await FormFillSecurity.updateSettings((s) => { s.allowlistEnabled = on; s.allowedSites = good; return s; });
    ta.value = good.join('\n');
    secMessage(panel, on ? t('optsec.sitesSaved', { n: good.length }) : t('optsec.sitesOff'));
  } })));
}

// ---- Backup panel + reminder banner ---------------------------------------------------------------------------
async function renderBackupPanel() {
  const { settings } = await loadState();
  const encrypted = await FormFillSecurity.isEnabled();
  const panel = secPanel('sec-backup', t('optsec.backupLegend'));
  const warn = secEl('p', { id: 'backup-note', textContent: encrypted ? t('optsec.backupEncrypted') : t('optsec.backupPlain') });
  warn.style.fontWeight = '600';
  const days = secField(t('optsec.backupDays'), 'backup-days', 'number', { min: 0, max: 365, step: 1, value: String(settings.backupEveryDays) });
  const filePass = secField(t('optsec.backupFilePass'), 'backup-filepass', 'password', { autocomplete: 'off' });
  const file = secEl('input', { type: 'file', id: 'backup-file', accept: 'application/json,.json', hidden: true });
  panel.append(
    secEl('p', { textContent: t('optsec.backupIntro') }), warn,
    secEl('div', { className: 'grid' }, days, filePass),
    secEl('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      secEl('button', { type: 'button', textContent: t('optsec.backupDownload'), onclick: doBackupDownload }),
      secEl('button', { type: 'button', className: 'sec', textContent: t('optsec.backupImport'), onclick: () => file.click() }),
      secEl('button', { type: 'button', className: 'sec', textContent: t('optsec.backupSaveInterval'), onclick: async () => {
        const n = Math.max(0, Math.min(365, Math.floor(Number($('backup-days').value) || 0)));
        await FormFillSecurity.updateSettings((s) => { s.backupEveryDays = n; return s; });
        $('backup-days').value = n; secMessage(panel, n ? t('optsec.reminderEvery', { n }) : t('optsec.remindersOff'));
      } })), file);
  file.onchange = async () => {
    try {
      const incoming = await FormFillSecurity.parseBackup(await file.files[0].text(), $('backup-filepass').value);
      syncCurrent();
      const m = FormFillSecurity.mergeProfiles(state.profiles, incoming);
      state.profiles = m.profiles;
      await saveState({ profiles: state.profiles, activeId: state.activeId });
      showProfile();
      secMessage(panel, t(m.skipped ? 'optsec.mergedSkipped' : 'optsec.merged', { n: m.added, skipped: m.skipped }));
    } catch (x) { secMessage(panel, secErrText(x), true); }
    file.value = '';
  };
}

async function doBackupDownload() {
  const panel = $('sec-backup');
  try {
    syncCurrent(); // include what is on screen
    const r = await FormFillSecurity.downloadBackup(state.profiles, state.activeId);
    secMessage(panel, r.encrypted ? t('optsec.backupDownloadedEncrypted') : t('optsec.backupDownloadedPlain'));
    const b = $('backup-banner'); if (b) b.remove();
  } catch (x) { secMessage(panel, secErrText(x), true); }
}

async function renderBackupBanner() {
  const r = await FormFillSecurity.backupReminder(state.profiles);
  if (!r.due) return;
  const encrypted = await FormFillSecurity.isEnabled();
  const box = secEl('div', { id: 'backup-banner', style: 'border:1px solid #f5a623;background:#fff8e6;border-radius:10px;padding:12px 16px;margin-bottom:16px' },
    secEl('strong', { textContent: t('backup.title') }),
    secEl('p', { textContent: [r.days ? t('backup.lastOptions', { n: r.days }) : '', encrypted ? t('backup.willEncrypt') : t('backup.willPlain')].filter(Boolean).join(' ') }),
    secEl('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      secEl('button', { type: 'button', textContent: t('backup.download'), onclick: doBackupDownload }),
      secEl('button', { type: 'button', className: 'sec', textContent: t('backup.later'), onclick: async () => { await FormFillSecurity.backupSnooze(); box.remove(); } })));
  box.setAttribute('role', 'region'); box.setAttribute('aria-label', t('backup.region'));
  document.querySelector('h1').after(box);
}
