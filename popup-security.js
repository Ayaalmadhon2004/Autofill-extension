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
      err.textContent = x.code === 'BAD_PASSPHRASE' ? t('lock.wrongPopup') : t('lock.failed', { message: x.message });
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
  b.hidden = false; b.textContent = t('popup.allowSite', { host });
  b.onclick = async () => {
    try {
      await FormFillSecurity.allowHost(host);
      b.hidden = true; $('status').className = 'ok';
      $('status').textContent = t('popup.nowAllowed', { host });
    } catch (x) { $('status').className = 'err'; $('status').textContent = t('popup.error', { message: x.message }); }
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

// ---- Backup reminder ---------------------------------------------------------------------------------------
async function initBackupBanner(profiles, activeId) {
  const r = await FormFillSecurity.backupReminder(profiles);
  if (!r.due) return;
  const box = $('backup'), encrypted = await FormFillSecurity.isEnabled();
  box.textContent = ''; box.hidden = false;
  const h = document.createElement('p'); h.innerHTML = '<strong></strong>'; h.firstChild.textContent = t('backup.title');
  const msg = document.createElement('p');
  msg.textContent = [r.days ? t('backup.lastPopup', { n: r.days }) : '', encrypted ? t('backup.willEncrypt') : t('backup.willPlainHint')].filter(Boolean).join(' ');
  const go = document.createElement('button'); go.type = 'button'; go.textContent = t('backup.download');
  const later = document.createElement('button'); later.type = 'button'; later.className = 'later'; later.textContent = t('backup.later');
  box.append(h, msg, go, later);
  go.onclick = async () => {
    try { await FormFillSecurity.downloadBackup(profiles, activeId); box.textContent = t('backup.done'); setTimeout(() => { box.hidden = true; }, 2500); }
    catch (x) { msg.textContent = '\u26A0 ' + x.message; }
  };
  later.onclick = async () => { await FormFillSecurity.backupSnooze(); box.hidden = true; };
}
