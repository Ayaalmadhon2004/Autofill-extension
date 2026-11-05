const $ = (id) => document.getElementById(id);
const flashMsg = (t) => { $('msg').textContent = t; setTimeout(() => { $('msg').textContent = ''; }, 2500); };

function render(profile) {
  const form = $('form'); form.textContent = '';
  const groups = [...new Set(window.FORMFILL_FIELDS.map((f) => f.group))];
  for (const g of groups) {
    const fs = document.createElement('fieldset');
    fs.innerHTML = '<legend></legend><div class="grid"></div>'; fs.firstChild.textContent = g;
    for (const f of window.FORMFILL_FIELDS.filter((x) => x.group === g)) {
      const l = document.createElement('label'); l.textContent = f.label;
      const i = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type !== 'textarea') i.type = f.type;
      i.name = f.key; i.dir = 'auto'; i.value = (profile.data || {})[f.key] || '';
      l.appendChild(i); fs.lastChild.appendChild(l);
      if (f.type === 'textarea') l.style.gridColumn = '1 / -1';
    }
    form.appendChild(fs);
  }
  $('rules').textContent = '';
  (profile.custom || []).forEach(addRule);
}

function addRule(r) {
  const row = document.createElement('div'); row.className = 'rule';
  row.innerHTML = '<input aria-label="Label contains" placeholder="Label contains…" dir="auto"><input aria-label="Answer" placeholder="Answer" dir="auto"><button type="button" class="sec" aria-label="Remove rule">✕</button>';
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
  p.data = c.data; p.custom = c.custom; p.name = $('pname').value.trim() || p.name;
}

function showProfile() {
  const sel = $('psel'); sel.textContent = '';
  for (const p of state.profiles) sel.add(new Option(p.name, p.id, false, p.id === state.activeId));
  $('pname').value = current().name;
  $('pdel').disabled = state.profiles.length < 2;
  render(current());
}

function switchTo(id) { syncCurrent(); state.activeId = id; showProfile(); }

(async () => {
  const s = await loadState();
  state = { profiles: s.profiles, activeId: s.activeId };
  showProfile();
  $('psel').onchange = (e) => switchTo(e.target.value);
  $('pnew').onclick = () => {
    syncCurrent();
    const p = { id: 'p' + Date.now(), name: 'New profile', data: {}, custom: [] };
    state.profiles.push(p); state.activeId = p.id; showProfile(); $('pname').focus(); $('pname').select();
  };
  $('pdup').onclick = () => {
    syncCurrent();
    const c = current();
    const p = { id: 'p' + Date.now(), name: c.name + ' (copy)', data: { ...c.data }, custom: c.custom.map((r) => ({ ...r })) };
    state.profiles.push(p); state.activeId = p.id; showProfile(); $('pname').focus(); $('pname').select();
  };
  $('pdel').onclick = () => {
    if (state.profiles.length < 2 || !confirm('Delete profile "' + current().name + '"?')) return;
    state.profiles = state.profiles.filter((p) => p.id !== state.activeId);
    state.activeId = state.profiles[0].id; showProfile();
  };
  $('addRule').onclick = () => addRule();
  $('save').onclick = async () => {
    syncCurrent();
    await saveState({ profiles: state.profiles, activeId: state.activeId });
    await chrome.storage.local.remove('profile'); // old single-profile key
    showProfile(); flashMsg('Saved ✓');
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
      const n = { id: 'p' + Date.now(), name: p.name || 'Imported', data: p.data || {}, custom: p.custom || [] };
      state.profiles.push(n); state.activeId = n.id; showProfile(); flashMsg('Imported as a new profile — press Save');
    } catch { flashMsg('Invalid file'); }
  };
})();
