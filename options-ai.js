// Options section "AI suggestions (optional)". Self-contained: renders into #ai, saves with its own button
// (independent of the page's Save button). Needs ai.js (FormFillAI) and security.js loaded first.
(function () {
  const T = { // all user-visible strings of this file (for localisation)
    legend: 'AI suggestions (optional)',
    intro: 'Off by default. When you turn this on, you can ask an AI to draft an answer to an open question the filler cannot answer (for example “Why do you want to work here?”). Nothing is ever inserted or submitted for you.',
    warnTitle: '⚠ This is the only feature that sends data out of your browser',
    warnIntro: 'Only when you click “Suggest an answer with AI…”, this extension sends the following to Anthropic (api.anthropic.com):',
    warnItems: [
      'the text of the question you are answering;',
      'the job title and company text shown on the page, if the page has them;',
      'ONLY the profile parts you tick below.'
    ],
    warnNever: 'Never sent: your email, phone, address, CV, ID numbers or any other profile field. Nothing is sent in the background, and there is no analytics.',
    warnBilling: 'Requests use your own Anthropic API key, so usage is billed to your own Anthropic API account. Anthropic’s terms and privacy policy apply to what you send.',
    partsLegend: 'Profile parts the AI may use',
    parts: {
      summary: 'Short bio / summary',
      currentTitle: 'Current job title',
      yearsExperience: 'Years of experience',
      education: 'Education (school, degree, field, year)',
      experience: 'Work experience entries (title, company, dates, description)'
    },
    partsHint: 'Tick nothing and the AI only sees the question, and will mostly answer “[needs your input]”.',
    keyLabel: 'Your Anthropic API key',
    keyHint: 'Create one in your Anthropic console. It is stored only in this browser and sent only to api.anthropic.com.',
    keySavedPlain: 'A key is saved. It is stored UNENCRYPTED in this browser (turn on the passphrase lock, then enter the key again, to protect it).',
    keySavedProtected: 'A key is saved and protected by your passphrase lock.',
    keyNone: 'No key saved yet.',
    keyPlaceholderSaved: 'Saved (hidden). Type a new key to replace it.',
    keyStorageNotePlain: 'You have no passphrase lock, so the key is stored unencrypted in this browser. Anyone with access to your browser profile could read it.',
    keyStorageNoteProtected: 'Your passphrase lock is on, so the key is encrypted with it. If you change or remove the passphrase you must enter the key again.',
    modelLabel: 'Model name',
    modelHint: 'A small, fast model is recommended. Default: ',
    consent: 'I understand what is sent, to whom, and that usage is billed to my own Anthropic account.',
    enable: 'Turn on AI suggestions',
    enableNeedsConsent: 'Tick the consent box first.',
    save: 'Save AI settings',
    test: 'Test connection',
    removeKey: 'Remove key',
    saved: 'Saved. AI suggestions are on.',
    savedOff: 'Saved. AI suggestions are off.',
    needConsent: 'Tick the consent box before turning AI suggestions on.',
    needKey: 'Enter your API key first.',
    badKey: 'That does not look like an API key.',
    permDenied: 'Permission for api.anthropic.com was not granted, so AI suggestions stay off.',
    testing: 'Testing…',
    keyRemoved: 'Key removed. AI suggestions are off.',
    cannotProtect: 'Could not store the key: unlock your profiles first.'
  };
  const mount = document.getElementById('ai');
  if (!mount) return;
  const AI = window.FormFillAI;
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); n.append(...kids); return n; };
  const box = (id, text) => { // 44px tap target checkbox with a real <label>
    const i = el('input', { type: 'checkbox', id }); i.style.cssText = 'width:24px;height:24px;margin:0;flex:none';
    const l = el('label', { htmlFor: id }, i, el('span', { textContent: text }));
    l.style.cssText = 'display:flex;gap:10px;align-items:center;min-height:44px;font-weight:400;font-size:15px';
    return { input: i, label: l };
  };

  (async function init() {
    if (await FormFillSecurity.isLocked()) return;
    const fs = el('fieldset', { id: 'aiSection' }, el('legend', { textContent: T.legend }));
    const warn = el('div', { id: 'aiWarn' }, el('strong', { textContent: T.warnTitle }), el('p', { textContent: T.warnIntro }),
      el('ul', {}, ...T.warnItems.map((t) => el('li', { textContent: t }))), el('p', { textContent: T.warnNever }), el('p', { textContent: T.warnBilling }));
    warn.setAttribute('role', 'note');
    warn.style.cssText = 'border:2px solid #b45309;background:#fff8e6;border-radius:8px;padding:10px 14px;margin:0 0 14px';
    const parts = el('fieldset', {}, el('legend', { textContent: T.partsLegend }));
    const partBoxes = {};
    for (const k of AI.PARTS) { partBoxes[k] = box('ai-part-' + k, T.parts[k]); partBoxes[k].input.name = k; parts.append(partBoxes[k].label); }
    parts.append(el('p', { textContent: T.partsHint, style: 'margin:6px 0 0;font-size:13px' }));
    const key = el('input', { id: 'aiKey', type: 'password', autocomplete: 'off', spellcheck: false });
    key.setAttribute('autocapitalize', 'off');
    const keyStatus = el('p', { id: 'aiKeyStatus', role: 'status', style: 'margin:4px 0 0;font-size:13px' });
    const model = el('input', { id: 'aiModel', type: 'text', autocomplete: 'off', spellcheck: false });
    const consent = box('aiConsent', T.consent), enable = box('aiEnable', T.enable);
    const enableNote = el('span', { style: 'font-size:13px;margin-left:34px' });
    const save = el('button', { type: 'button', id: 'aiSave', textContent: T.save });
    const test = el('button', { type: 'button', id: 'aiTest', className: 'sec', textContent: T.test });
    const rm = el('button', { type: 'button', id: 'aiRemove', className: 'sec', textContent: T.removeKey });
    const msg = el('p', { id: 'aiMsg', role: 'status', style: 'font-weight:600;margin:10px 0 0' });
    fs.append(el('p', { textContent: T.intro }), warn, parts,
      el('p', {}, el('label', { htmlFor: 'aiKey' }, T.keyLabel, key), keyStatus, el('span', { textContent: T.keyHint, style: 'font-size:13px' })),
      el('p', {}, el('label', { htmlFor: 'aiModel' }, T.modelLabel, model), el('span', { textContent: T.modelHint + AI.DEFAULT_MODEL, style: 'font-size:13px' })),
      consent.label, enable.label, enableNote,
      el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0' }, save, test, rm), msg);
    mount.replaceChildren(fs);

    const say = (text, bad) => { msg.setAttribute('role', bad ? 'alert' : 'status'); msg.style.color = bad ? '#b3261e' : '#17663a'; msg.textContent = (bad ? '⚠ ' : '✓ ') + text; };
    const plain = (text) => { msg.setAttribute('role', 'status'); msg.style.color = '#1b1b1f'; msg.textContent = text; };
    const syncEnable = () => {
      enable.input.disabled = !consent.input.checked;
      if (!consent.input.checked) enable.input.checked = false;
      enableNote.textContent = consent.input.checked ? '' : T.enableNeedsConsent;
    };
    consent.input.onchange = syncEnable;
    async function refresh() {
      const s = await AI.getSettings(), k = await AI.keyStatus();
      for (const p of AI.PARTS) partBoxes[p].input.checked = s.include[p];
      model.value = s.model; consent.input.checked = s.consent; enable.input.checked = s.enabled; syncEnable();
      const prot = await FormFillSecurity.isEnabled();
      key.value = ''; key.placeholder = k.saved ? T.keyPlaceholderSaved : '';
      keyStatus.textContent = (k.saved ? (k.protected ? T.keySavedProtected : T.keySavedPlain) : T.keyNone) + ' ' + (prot ? T.keyStorageNoteProtected : T.keyStorageNotePlain);
      rm.disabled = !k.saved;
    }
    const readForm = () => ({
      enabled: enable.input.checked, consent: consent.input.checked, model: model.value,
      include: Object.fromEntries(AI.PARTS.map((p) => [p, partBoxes[p].input.checked]))
    });
    async function storeTypedKey() { // returns false (and says why) when the typed key cannot be stored
      const typed = key.value.trim();
      if (!typed) return true;
      try { await AI.saveKey(typed); return true; } catch (e) { say(e.code === 'LOCKED' ? T.cannotProtect : T.badKey, true); return false; }
    }
    const removePermission = () => chrome.permissions.remove({ origins: [AI.ORIGIN] }).catch(() => {});

    save.onclick = async () => {
      const f = readForm();
      if (f.enabled && !f.consent) { say(T.needConsent, true); return; }
      const on = f.enabled && f.consent;
      if (on) { // chrome.permissions.request must run straight from this click
        let granted = false;
        try { granted = await chrome.permissions.request({ origins: [AI.ORIGIN] }); } catch { granted = false; }
        if (!granted) { await AI.saveSettings({ ...f, enabled: false }); await refresh(); say(T.permDenied, true); return; }
      }
      if (!(await storeTypedKey())) return;
      if (on && !(await AI.keyStatus()).saved) { await AI.saveSettings({ ...f, enabled: false }); await refresh(); say(T.needKey, true); await removePermission(); return; }
      await AI.saveSettings({ ...f, enabled: on });
      if (!on) await removePermission();
      await refresh();
      if (on) say(T.saved); else say(T.savedOff);
    };
    test.onclick = async () => {
      let granted = false, requested = false;
      try { granted = await chrome.permissions.contains({ origins: [AI.ORIGIN] }); if (!granted) { requested = true; granted = await chrome.permissions.request({ origins: [AI.ORIGIN] }); } } catch { granted = false; }
      if (!granted) { say(T.permDenied, true); return; }
      if (!(await storeTypedKey())) return;
      const cur = await AI.getSettings(); // only the model is saved here; on/off and consent stay as last saved
      await AI.saveSettings({ ...cur, model: model.value });
      if (!(await AI.keyStatus()).saved) { say(T.needKey, true); if (requested && !cur.enabled) await removePermission(); return; }
      plain(T.testing);
      const r = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'formfill-ai-test' }, (x) => { void chrome.runtime.lastError; resolve(x); }));
      if (requested && !cur.enabled) await removePermission();
      await refresh();
      if (r && r.ok) say(r.text); else say((r && r.error) || AI.TEXT.network, true);
    };
    rm.onclick = async () => {
      await AI.removeKey();
      await AI.saveSettings({ ...(await AI.getSettings()), enabled: false });
      await removePermission();
      await refresh();
      say(T.keyRemoved);
    };
    await refresh();
  })();
})();
