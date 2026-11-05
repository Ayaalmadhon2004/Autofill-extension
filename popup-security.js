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

// ---- Site allowlist ("Only fill on these sites") ---------------------------------------------------------
function offerAllow(host) { // show the one-click "Always allow this site" button
  const b = $('allowSite'); if (!host) return;
  b.hidden = false; b.textContent = 'Always allow ' + host;
  b.onclick = async () => {
    try {
      await FormFillSecurity.allowHost(host);
      b.hidden = true; $('status').className = 'ok';
      $('status').textContent = '\u2713 ' + host + ' is now allowed. Press Fill.';
    } catch (x) { $('status').className = 'err'; $('status').textContent = 'Error: ' + x.message; }
  };
}
async function initAllowlist(settings) { // tell the user up front when this site would be refused
  if (!settings.allowlistEnabled) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) return;
  const site = FormFillSecurity.checkSite(tab.url, settings);
  if (site.allowed) return;
  $('status').className = 'err'; $('status').textContent = '\u26A0 ' + FormFillSecurity.siteRefusal(site.host);
  offerAllow(site.host);
}
