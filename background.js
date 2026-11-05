importScripts('runner.js');
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'fill-page') return;
  const r = await fillActiveTab();
  chrome.action.setBadgeBackgroundColor({ color: r.error ? '#b3261e' : '#1e8e4e' });
  chrome.action.setBadgeText({ text: r.error ? '!' : String(r.filled) });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
});
