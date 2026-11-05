// Popup: lock screen. Self-contained; popup.js only calls showUnlock() and initLockLink().
// Uses $ from popup.js.

function showUnlock() {
  $('main').hidden = true;
  const f = $('unlock'); f.hidden = false;
  $('pass').focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('unlockErr'); err.textContent = '';
    try {
      await FormFillSecurity.unlock($('pass').value);
      location.reload();
    } catch (x) {
      err.textContent = x.code === 'BAD_PASSPHRASE' ? 'Wrong passphrase. There is no way to recover a forgotten one.' : 'Could not unlock: ' + x.message;
      $('pass').select();
    }
  };
}

async function initLockLink() { // "Lock now" only when a passphrase is set
  if (!(await FormFillSecurity.isEnabled())) return;
  const b = $('lockLink'); b.hidden = false;
  b.onclick = async () => { await FormFillSecurity.lock(); location.reload(); };
}
