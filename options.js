const $ = (id) => document.getElementById(id);
const flashMsg = (text) => { $('msg').textContent = text; setTimeout(() => { $('msg').textContent = ''; }, 2500); };

function render(profile) {
  const form = $('form'); form.textContent = '';
  const groups = [...new Set(window.FORMFILL_FIELDS.map((f) => f.group))];
  for (const g of groups) {
    const fs = document.createElement('fieldset');
    fs.innerHTML = '<legend></legend><div class="grid"></div>'; fs.firstChild.textContent = t('fieldGroup.' + g);
    for (const f of window.FORMFILL_FIELDS.filter((x) => x.group === g)) {
      const l = document.createElement('label'); l.textContent = t('field.' + f.key);
      const i = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type !== 'textarea') i.type = f.type;
      // addresses and numbers stay left-to-right
      i.name = f.key; i.dir = ['email', 'tel', 'url'].includes(f.type) ? 'ltr' : 'auto'; i.value = (profile.data || {})[f.key] || '';
      l.appendChild(i); fs.lastChild.appendChild(l);
      if (f.type === 'textarea') l.style.gridColumn = '1 / -1';
    }
    form.appendChild(fs);
  }
  $('rules').textContent = '';
  (profile.custom || []).forEach(addRule);
  renderAnswers(profile);
}

function addRule(r) {
  const row = document.createElement('div'); row.className = 'rule';
  row.innerHTML = '<input dir="auto"><input dir="auto"><button type="button" class="sec">✕</button>';
  row.children[0].setAttribute('aria-label', t('options.rules.labelContains')); row.children[0].placeholder = t('options.rules.labelContainsPh');
  row.children[1].setAttribute('aria-label', t('common.answer')); row.children[1].placeholder = t('options.rules.answerPh');
  row.children[2].setAttribute('aria-label', t('options.rules.remove'));
  row.children[0].value = (r && r.match) || ''; row.children[1].value = (r && r.value) || '';
  row.children[2].onclick = () => row.remove();
  $('rules').appendChild(row);
}

function collect() {
  const data = {};
  for (const el of $('form').querySelectorAll('input,textarea')) if (el.value.trim()) data[el.name] = el.value.trim();
  const custom = [...$('rules').children].map((r) => ({ match: r.children[0].value.trim(), value: r.children[1].value.trim() })).filter((r) => r.match && r.value);
  return { data, custom };
}

let state; // { profiles, activeId }
const current = () => state.profiles.find((p) => p.id === state.activeId);

function syncCurrent() { // copy what is on screen into the active profile
  const p = current(); const c = collect();
  p.data = c.data; p.custom = c.custom; p.answers = collectAnswers(); Object.assign(p, collectEntries()); p.name = $('pname').value.trim() || p.name;
}

function showProfile() {
  const sel = $('psel'); sel.textContent = '';
  for (const p of state.profiles) sel.add(new Option(p.name, p.id, false, p.id === state.activeId));
  $('pname').value = current().name;
  $('pdel').disabled = state.profiles.length < 2;
  render(current());
  if (window.refreshDocuments) window.refreshDocuments(current().id, state.profiles.map((p) => p.id));
  renderEntries(current());
}

function switchTo(id) { syncCurrent(); state.activeId = id; showProfile(); }

(async () => {
  let s, locked = false;
  try { s = await loadState(); } catch (e) { if (e.code === 'LOCKED') locked = true; else throw e; }
  await FORMFILL_I18N.ready; // normally already settled by now
  FORMFILL_I18N.applyDom(document);
  FORMFILL_I18N.onChange(() => { // re-draw in place, keeping what has been typed but not saved yet
    if (!state) { location.reload(); return; }
    syncCurrent(); showProfile(); initSecurityOptions();
  });
  if (locked) { showOptionsUnlock(); return; } // the lock screen has its own language switcher
  FORMFILL_I18N.mountSwitcher($('langBox'));
  state = { profiles: s.profiles, activeId: s.activeId };
  showProfile();
  initSecurityOptions();
  $('psel').onchange = (e) => switchTo(e.target.value);
  $('pnew').onclick = () => {
    syncCurrent();
    const p = { id: 'p' + Date.now(), name: t('options.newProfileName'), data: {}, custom: [], experience: [], education: [] };
    state.profiles.push(p); state.activeId = p.id; showProfile(); $('pname').focus(); $('pname').select();
  };
  $('pdup').onclick = () => {
    syncCurrent();
    const c = current();
    const p = { id: 'p' + Date.now(), name: t('options.copyName', { name: c.name }), data: { ...c.data }, custom: c.custom.map((r) => ({ ...r })), answers: { ...c.answers }, ...cloneEntries(c) };
    state.profiles.push(p); state.activeId = p.id; showProfile(); $('pname').focus(); $('pname').select();
  };
  $('pdel').onclick = () => {
    if (state.profiles.length < 2 || !confirm(t('options.confirmDelete', { name: current().name }))) return;
    state.profiles = state.profiles.filter((p) => p.id !== state.activeId);
    state.activeId = state.profiles[0].id; showProfile();
  };
  $('addRule').onclick = () => addRule();
  $('save').onclick = async () => {
    syncCurrent();
    await saveState({ profiles: state.profiles, activeId: state.activeId });
    await chrome.storage.local.remove('profile'); // old single-profile key
    showProfile(); flashMsg(t('options.saved'));
  };
  $('export').onclick = () => {
    syncCurrent();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(current(), null, 2)], { type: 'application/json' }));
    a.download = 'form-filler-' + current().name.replace(/[^\w\u0600-\u06FF-]+/g, '_') + '.json'; a.click();
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => {
    try {
      const p = JSON.parse(await e.target.files[0].text());
      syncCurrent();
      const n = { id: 'p' + Date.now(), name: p.name || t('profile.imported'), data: p.data || {}, custom: p.custom || [], answers: p.answers || {}, experience: p.experience || [], education: p.education || [] };
      state.profiles.push(n); state.activeId = n.id; showProfile(); flashMsg(t('options.importedFlash'));
    } catch { flashMsg(t('options.invalidFile')); }
  };
})();

// --- Application tracker setting (self-contained: saves immediately, independent of the Save button) ---
(async () => {
  await FORMFILL_I18N.ready;
  const box = $('trackApps');
  const { settings } = await chrome.storage.local.get({ settings: {} });
  box.checked = !(settings && settings.trackApplications === false); // default ON
  box.onchange = async () => {
    const cur = (await chrome.storage.local.get({ settings: {} })).settings || {};
    await chrome.storage.local.set({ settings: { ...cur, trackApplications: box.checked } });
    flashMsg(t('options.saved'));
  };
})();
