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
      i.name = f.key; i.value = (profile.data || {})[f.key] || '';
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
  row.innerHTML = '<input aria-label="Label contains" placeholder="Label contains…"><input aria-label="Answer" placeholder="Answer"><button type="button" class="sec" aria-label="Remove rule">✕</button>';
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

(async () => {
  const { profile } = await chrome.storage.local.get({ profile: { data: {}, custom: [] } });
  render(profile);
  $('addRule').onclick = () => addRule();
  $('save').onclick = async () => { await chrome.storage.local.set({ profile: collect() }); flashMsg('Saved ✓'); };
  $('export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(collect(), null, 2)], { type: 'application/json' }));
    a.download = 'form-filler-profile.json'; a.click();
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => {
    try { const p = JSON.parse(await e.target.files[0].text()); render({ data: p.data || {}, custom: p.custom || [] }); flashMsg('Imported — press Save'); }
    catch { flashMsg('Invalid file'); }
  };
})();
