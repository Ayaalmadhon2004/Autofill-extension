// Shared by popup and background: inject the filler into the active tab (all frames) and run it.
async function loadState() {
  const s = await chrome.storage.local.get({ profile: { data: {}, custom: [] }, settings: { overwrite: false } });
  return s;
}
async function fillActiveTab(overwriteOverride) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) return { error: 'This page cannot be filled.' };
  const { profile, settings } = await loadState();
  if (typeof overwriteOverride === 'boolean') settings.overwrite = overwriteOverride;
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['fields.js', 'filler.js'] });
  const results = await chrome.scripting.executeScript({
    target, args: [profile, settings], func: (p, s) => window.__formFill.fill(p, s)
  });
  const all = results.map((r) => r.result).filter(Boolean);
  return { filled: all.reduce((n, r) => n + r.filled, 0), fields: all.flatMap((r) => r.fields) };
}
