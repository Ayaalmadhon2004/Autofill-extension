// First-run welcome page. All user-facing strings live in i18n.js ('onboarding.*'); static ones are data-i18n attributes in the HTML.
const $ = (id) => document.getElementById(id);
const TOTAL = 3;
let step = 1;

function show(n, moveFocus) {
  step = n;
  for (let i = 1; i <= TOTAL; i++) $('s' + i).hidden = i !== n;
  $('count').textContent = t('onboarding.stepOf', { n, total: TOTAL });
  $('back').hidden = n === 1;
  $('next').textContent = t(n === 2 ? 'onboarding.saveNext' : n === TOTAL ? 'onboarding.finish' : 'onboarding.next');
  if (moveFocus) $('h' + n + 'a').focus(); // announce the new step to screen readers
}

// Save the typed details into the active profile. Never overwrites a stored value with an empty one.
async function saveProfile() {
  const v = Object.fromEntries(new FormData($('form')));
  const st = await loadState();
  const data = { ...st.profile.data };
  for (const [k, val] of Object.entries(v)) if (String(val).trim()) data[k] = String(val).trim();
  if (v.fullName && v.fullName.trim() && !st.profile.data.firstName && !st.profile.data.lastName) {
    const parts = v.fullName.trim().split(/\s+/); // so first/last-name fields on forms are filled too
    if (parts.length > 1) { data.firstName = parts[0]; data.lastName = parts.slice(1).join(' '); }
  }
  const profiles = st.profiles.map((p) => p.id === st.activeId ? { ...p, data } : p);
  await saveState({ profiles, activeId: st.activeId });
}

(async () => {
  await FORMFILL_I18N.ready;
  FORMFILL_I18N.applyDom(document);
  FORMFILL_I18N.mountSwitcher($('langBox'));
  FORMFILL_I18N.onChange(() => { show(step, false); $('msg').textContent = ''; }); // texts: applyDom; counters and buttons: show()
  // prefill from the current profile so reopening the page never loses anything
  const { profile } = await loadState();
  for (const el of $('form').elements) if (el.name && profile.data[el.name]) el.value = profile.data[el.name];
  $('form').onsubmit = (e) => { e.preventDefault(); $('next').click(); };
  $('back').onclick = () => show(step - 1, true);
  $('next').onclick = async () => {
    if (step === 2) {
      if (!$('form').reportValidity()) return;
      try { await saveProfile(); } catch { $('msg').textContent = t('onboarding.saveError'); return; }
    }
    if (step === TOTAL) { chrome.runtime.openOptionsPage(); return; }
    show(step + 1, true);
  };
  show(1, false);
})();
