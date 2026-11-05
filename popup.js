const $ = (id) => document.getElementById(id);
(async () => {
  let st;
  try { st = await loadState(); } catch (e) { if (e.code === 'LOCKED') { showUnlock(); return; } throw e; }
  const { settings, profiles, activeId } = st;
  initLockLink();
  initAllowlist(settings);
  initBackupBanner(profiles, activeId);
  const sel = $('profile');
  for (const p of profiles) sel.add(new Option(p.name, p.id, false, p.id === activeId));
  sel.onchange = () => saveState({ profiles, activeId: sel.value });
  $('overwrite').checked = !!settings.overwrite;
  $('opts').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  $('fill').onclick = async () => {
    const st = $('status'); st.className = ''; st.textContent = 'Filling…';
    const r = await fillActiveTab($('overwrite').checked).catch((e) => ({ error: e.message }));
    if (r.locked) { showUnlock(); return; }
    if (r.blocked) offerAllow(r.host);
    if (r.error) { st.className = 'err'; st.textContent = 'Error: ' + r.error; return; }
    st.className = r.filled ? 'ok' : '';
    st.textContent = r.filled ? `✓ Filled ${r.filled} field${r.filled > 1 ? 's' : ''}. Review, then submit yourself.` : 'No matching fields found. Add a profile or a custom rule.';
  };
})();
