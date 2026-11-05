importScripts('security.js', 'runner.js');
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
