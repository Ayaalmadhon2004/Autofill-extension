const $ = (id) => document.getElementById(id);
(async () => {
  const { settings, profiles, activeId } = await loadState();
  const sel = $('profile');
  for (const p of profiles) sel.add(new Option(p.name, p.id, false, p.id === activeId));
  sel.onchange = () => saveState({ profiles, activeId: sel.value });
  $('overwrite').checked = !!settings.overwrite;
  $('opts').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  $('fill').onclick = async () => {
    const st = $('status'); st.className = ''; st.textContent = 'Filling…';
    const r = await fillActiveTab($('overwrite').checked).catch((e) => ({ error: e.message }));
    if (r.error) { st.className = 'err'; st.textContent = 'Error: ' + r.error; return; }
    st.className = r.filled ? 'ok' : '';
    st.textContent = r.filled ? `✓ Filled ${r.filled} field${r.filled > 1 ? 's' : ''}. Review, then submit yourself.` : 'No matching fields found. Add a profile or a custom rule.';
    const miss = r.missing || [];
    const box = $('missing'); box.textContent = '';
    if (miss.length) {
      const h = document.createElement('p'); h.className = 'warn';
      h.textContent = `\u26A0 Filled ${r.filled}. ${miss.length} required field${miss.length > 1 ? 's' : ''} need${miss.length > 1 ? '' : 's'} you:`;
      const ul = document.createElement('ul');
      for (const m of miss) { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); }
      box.append(h, ul);
      st.textContent = '';
    }
  };
})();
