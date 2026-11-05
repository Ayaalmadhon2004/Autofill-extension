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
  $('security').appendChild(fs);
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
  const old = $('sec-pass'); if (old) old.remove();
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
    try { await fn(); await renderPassphrasePanel(); secMessage($('sec-pass'), okText); }
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

function initSecurityOptions() {
  if (!$('security')) return;
  $('security').textContent = '';
  renderPassphrasePanel();
}
