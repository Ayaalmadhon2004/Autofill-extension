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
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['fields.js', 'questions.js', 'signature.js', 'filler.js'] });
  const results = await chrome.scripting.executeScript({
    target, args: [profile, settings], func: (p, s) => window.__formFill.fill(p, s)
  });
  const all = results.map((r) => r.result).filter(Boolean);
  return { filled: all.reduce((n, r) => n + r.filled, 0), fields: all.flatMap((r) => r.fields) };
}
