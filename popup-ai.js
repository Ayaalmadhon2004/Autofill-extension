// Popup button "Suggest an answer with AI…". Shown only when the user turned the feature on (and consented) in Options.
// Clicking it asks the background to open the prompt in the page; nothing is sent from here.
(async function () {
  const T = { // all user-visible strings of this file (for localisation)
    button: 'Suggest an answer with AI…',
    failed: 'Could not open the AI prompt on this page.'
  };
  const btn = document.getElementById('aiSuggest');
  if (!btn || !window.FormFillAI) return;
  try {
    const s = await FormFillAI.getSettings();
    if (!(s.enabled && s.consent)) return;
  } catch { return; }
  btn.textContent = T.button; btn.hidden = false;
  btn.onclick = async () => {
    const r = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'formfill-ai-start' }, (x) => { void chrome.runtime.lastError; resolve(x); }));
    if (r && r.ok) window.close(); else document.getElementById('aiMsg').textContent = T.failed;
  };
})();
