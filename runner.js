// Shared by popup, options and background.
// Storage shape: { profiles: [{id, name, data, custom}], activeId, settings }.
// Older installs stored a single `profile`; it is migrated on first read.
async function loadState() {
  const s = await chrome.storage.local.get({ profiles: null, activeId: null, profile: null, settings: { overwrite: false }, vault: null });
  let profiles = s.profiles;
  // Passphrase lock: profiles live encrypted in `vault`. Throws an Error with code 'LOCKED' until unlocked,
  // so nothing can mistake "locked" for "no profiles" and overwrite real data.
  if (s.vault) profiles = await FormFillSecurity.openVault(s.vault);
  if (!profiles || !profiles.length) {
    const old = s.profile || {};
    profiles = [{ id: 'default', name: 'English', data: old.data || {}, custom: old.custom || [] }];
  }
  const activeId = profiles.some((p) => p.id === s.activeId) ? s.activeId : profiles[0].id;
  return { profiles, activeId, profile: profiles.find((p) => p.id === activeId), settings: s.settings };
}
async function saveState(patch) {
  patch = Object.assign({}, patch);
  if ('profiles' in patch) { // when a passphrase is set, profiles are only ever written encrypted
    const vault = (await chrome.storage.local.get({ vault: null })).vault;
    if (vault) { patch.vault = await FormFillSecurity.sealProfiles(vault, patch.profiles); delete patch.profiles; }
  }
  await chrome.storage.local.set(patch);
}
async function fillActiveTab(overwriteOverride) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) return { error: 'This page cannot be filled.' };
  let state;
  try { state = await loadState(); } catch (e) {
    if (e.code === 'LOCKED') return { error: 'Locked. Open the extension popup and enter your passphrase.', locked: true };
    throw e;
  }
  const { profile, settings } = state;
  if (typeof overwriteOverride === 'boolean') settings.overwrite = overwriteOverride;
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['fields.js', 'groups.js', 'filler.js'] });
  const results = await chrome.scripting.executeScript({
    target, args: [profile, settings], func: (p, s) => window.__formFill.fill(p, s)
  });
  const all = results.map((r) => r.result).filter(Boolean);
  return { filled: all.reduce((n, r) => n + r.filled, 0), fields: all.flatMap((r) => r.fields) };
}
