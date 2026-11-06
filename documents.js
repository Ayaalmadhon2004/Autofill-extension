// Options page "Documents" section: per-profile CV stored in chrome.storage.local under `cv_<profileId>`
// as { name, type, size, b64 }. options.js calls window.refreshDocuments(profileId, allProfileIds).
(function () {
  const MAX = 5 * 1024 * 1024;
  const TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const $ = (id) => document.getElementById(id);
  let pid = null;
  const say = (t) => { $('cvMsg').textContent = t; };

  function toB64(buf) {
    let s = ''; const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function show() {
    const key = 'cv_' + pid;
    const cv = (await chrome.storage.local.get(key))[key];
    $('cvCurrent').textContent = cv ? t('options.docs.current', { name: cv.name, kb: Math.max(1, Math.round(cv.size / 1024)) }) : t('options.docs.none');
    $('cvRemove').disabled = !cv;
  }

  window.refreshDocuments = async (id, allIds) => {
    pid = id; say('');
    if (allIds) { // drop CVs of deleted profiles
      const all = await chrome.storage.local.get(null);
      const stale = Object.keys(all).filter((k) => k.startsWith('cv_') && !allIds.includes(k.slice(3)));
      if (stale.length) await chrome.storage.local.remove(stale);
    }
    show();
  };

  // options.js may have rendered a profile before this script ran
  if (typeof state !== 'undefined' && state) window.refreshDocuments(state.activeId, state.profiles.map((p) => p.id));

  $('cvFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!TYPES[ext]) return say(t('options.docs.badType'));
    if (f.size > MAX) return say(t('options.docs.tooBig'));
    try {
      await chrome.storage.local.set({ ['cv_' + pid]: { name: f.name, type: TYPES[ext], size: f.size, b64: toB64(await f.arrayBuffer()) } });
      say(t('options.docs.saved')); show();
    } catch { say(t('options.docs.full')); }
  };
  $('cvRemove').onclick = async () => { await chrome.storage.local.remove('cv_' + pid); say(t('options.docs.removed')); show(); };
  FORMFILL_I18N.onChange(() => { say(''); if (pid) show(); }); // language changed: redraw the status line
})();
