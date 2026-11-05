importScripts('security.js', 'signature.js', 'runner.js');
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'fill-page') return;
  const r = await fillActiveTab().catch((e) => ({ error: e.message }));
  // Badge text must be tiny: lock icon when locked, "!" for other refusals (the tooltip carries the full message).
  const text = r.locked ? '\u{1F512}' : r.error ? '!' : String(r.filled);
  chrome.action.setBadgeBackgroundColor({ color: r.locked ? '#444444' : r.error ? '#b3261e' : '#1e8e4e' });
  chrome.action.setBadgeText({ text });
  if (r.error) chrome.action.setTitle({ title: r.error });
  setTimeout(() => { chrome.action.setBadgeText({ text: '' }); chrome.action.setTitle({ title: 'Fill this page' }); }, 3000);
});
// First install only: open the welcome page (not on updates or browser start).
chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

// Right-click a field -> "Teach Form Filler this field…"
const TEACH_MENU = 'formfill-teach';
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: TEACH_MENU, title: 'Teach Form Filler this field…', contexts: ['all'] });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== TEACH_MENU || !tab || !/^https?:/.test(tab.url || '')) return;
  const target = { tabId: tab.id, frameIds: [info.frameId || 0] };
  try {
    await chrome.scripting.executeScript({ target, files: ['signature.js', 'teach.js'] });
    await chrome.scripting.executeScript({ target, func: () => window.__formFillTeach.start() });
  } catch (e) { /* page not scriptable */ }
});
// The prompt in the page asks the worker to look up / save the rule in the ACTIVE profile.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || (msg.type !== 'formfill-teach-get' && msg.type !== 'formfill-teach-save')) return;
  if (typeof msg.match !== 'string' || (msg.type === 'formfill-teach-save' && typeof msg.value !== 'string')) return;
  const job = msg.type === 'formfill-teach-get'
    ? getTaughtRule(msg.match)
    : saveTaughtRule(msg.match, msg.value).then(() => ({ ok: true }));
  job.then(reply, () => reply({ ok: false }));
  return true; // async reply
});
