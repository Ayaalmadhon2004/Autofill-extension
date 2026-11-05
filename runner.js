// Shared by popup, options and background.
// Storage shape: { profiles: [{id, name, data, custom}], activeId, settings }.
// Older installs stored a single `profile`; it is migrated on first read.
async function loadState() {
  const s = await chrome.storage.local.get({ profiles: null, activeId: null, profile: null, settings: { overwrite: false } });
  let profiles = s.profiles;
  if (!profiles || !profiles.length) {
    const old = s.profile || {};
    profiles = [{ id: 'default', name: 'English', data: old.data || {}, custom: old.custom || [] }];
  }
  const activeId = profiles.some((p) => p.id === s.activeId) ? s.activeId : profiles[0].id;
  return { profiles, activeId, profile: profiles.find((p) => p.id === activeId), settings: s.settings };
}
async function saveState(patch) {
  await chrome.storage.local.set(patch);
}
// Teach-a-field support. Pure: returns a new custom-rule list with `match` set to `value`
// (an existing rule with the same trigger is updated, not duplicated).
function addCustomRule(custom, match, value) {
  const key = self.FORMFILL_SIG.norm(match);
  const rules = (custom || []).map((r) => ({ ...r }));
  const hit = rules.find((r) => self.FORMFILL_SIG.norm(r.match) === key);
  if (hit) hit.value = value; else rules.push({ match: String(match).trim(), value });
  return rules;
}
async function getTaughtRule(match) {
  const { profile } = await loadState();
  const key = self.FORMFILL_SIG.norm(match);
  const hit = (profile.custom || []).find((r) => self.FORMFILL_SIG.norm(r.match) === key);
  return { value: hit ? hit.value : '', profileName: profile.name };
}
async function saveTaughtRule(match, value) {
  const { profiles, activeId } = await loadState();
  const p = profiles.find((x) => x.id === activeId);
  p.custom = addCustomRule(p.custom, match, value);
  await saveState({ profiles, activeId });
}
async function fillActiveTab(overwriteOverride) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) return { error: 'This page cannot be filled.' };
  const { profile, settings } = await loadState();
  if (typeof overwriteOverride === 'boolean') settings.overwrite = overwriteOverride;
  const cvKey = 'cv_' + profile.id; // CV file stored per profile by options.js (Documents section)
  const cv = (await chrome.storage.local.get(cvKey))[cvKey] || null;
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['fields.js', 'questions.js', 'signature.js', 'filler.js'] });
  const results = await chrome.scripting.executeScript({
    target, args: [profile, settings, cv], func: (p, s, c) => window.__formFill.fill(p, s, c)
  });
  const all = results.map((r) => r.result).filter(Boolean);
  const filled = all.reduce((n, r) => n + r.filled, 0);
  await recordApplication(tab, profile.id, filled, settings); // tracker (see history.html)
  return { filled, fields: all.flatMap((r) => r.fields), missing: all.flatMap((r) => r.missing || []) };
}

// --- Application tracker -----------------------------------------------------
// Stores one entry per page per day in chrome.storage.local `applications`. Local only.
// Never throws: tracking must not break filling. Off when settings.trackApplications === false.
const APPLICATIONS_CAP = 1000;
async function recordApplication(tab, profileId, filledCount, settings) {
  try {
    if (!filledCount || (settings && settings.trackApplications === false)) return;
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return;
    const url = u.origin + u.pathname; // no query string or #hash: they can hold tokens
    const now = new Date();
    const day = (d) => new Date(d).toDateString();
    const { applications } = await chrome.storage.local.get({ applications: [] });
    const list = Array.isArray(applications) ? applications : [];
    const same = list.find((a) => a.url === url && day(a.date) === day(now));
    if (same) { // same page, same day: update, keep the user's status and notes
      Object.assign(same, { title: tab.title || same.title, profileId, filledCount, date: now.toISOString() });
    } else {
      list.push({
        id: 'a' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 7),
        url, title: tab.title || u.host, host: u.host, profileId, filledCount,
        date: now.toISOString(), status: 'applied', notes: ''
      });
    }
    list.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    await chrome.storage.local.set({ applications: list.slice(0, APPLICATIONS_CAP) });
  } catch (e) { /* ignore */ }
}
