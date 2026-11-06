const $ = (id) => document.getElementById(id);
(async () => {
  let st, locked = false;
  try { st = await loadState(); } catch (e) { if (e.code === 'LOCKED') locked = true; else throw e; }
  await FORMFILL_I18N.ready; // normally already settled by now
  FORMFILL_I18N.applyDom(document);
  FORMFILL_I18N.mountSwitcher($('langBox'), { reload: true }); // popup state is tiny, so a change reloads it
  if (locked) { showUnlock(); return; }
  const { settings, profiles, activeId } = st;
  initLockLink();
  initAllowlist(settings);
  initBackupBanner(profiles, activeId);
  const sel = $('profile');
  for (const p of profiles) sel.add(new Option(p.name, p.id, false, p.id === activeId));
  sel.dir = 'auto';
  sel.onchange = () => saveState({ profiles, activeId: sel.value });
  $('overwrite').checked = !!settings.overwrite;
  $('opts').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  $('fill').onclick = async () => {
    const st = $('status'); st.className = ''; st.textContent = t('popup.filling');
    const r = await fillActiveTab($('overwrite').checked).catch((e) => ({ error: e.message }));
    if (r.locked) { showUnlock(); return; }
    if (r.blocked) offerAllow(r.host);
    if (r.error) { st.className = 'err'; st.textContent = t('popup.error', { message: r.error }); return; }
    st.className = r.filled ? 'ok' : '';
    st.textContent = r.filled ? t('popup.filled', { n: r.filled }) : t('popup.noMatch');
    const miss = r.missing || [];
    const box = $('missing'); box.textContent = '';
    if (miss.length) {
      const h = document.createElement('p'); h.className = 'warn';
      h.textContent = t('popup.missing', { n: miss.length, filled: r.filled });
      const ul = document.createElement('ul');
      for (const m of miss) { const li = document.createElement('li'); li.dir = 'auto'; li.textContent = m; ul.appendChild(li); }
      box.append(h, ul);
      st.textContent = '';
    }
  };
})();
