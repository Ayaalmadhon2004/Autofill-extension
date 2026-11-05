// Options section "AI suggestions (optional)". Self-contained: renders into #ai, saves with its own button
// (independent of the page's Save button). Needs ai.js (FormFillAI) and security.js loaded first.
(function () {
  const partLabel = (k) => (window.FORMFILL_I18N.en['field.' + k] ? t('field.' + k) : t('aiopt.part.' + k)); // bio, title, years reuse the profile field labels
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

  async function init() {
    await FORMFILL_I18N.ready;
    if (await FormFillSecurity.isLocked()) return;
    const fs = el('fieldset', { id: 'aiSection' }, el('legend', { textContent: t('aiopt.legend') }));
    const warn = el('div', { id: 'aiWarn' }, el('strong', { textContent: t('aiopt.warnTitle') }), el('p', { textContent: t('aiopt.warnIntro') }),
      el('ul', {}, ...['warnItem1', 'warnItem2', 'warnItem3'].map((k) => el('li', { textContent: t('aiopt.' + k) }))), el('p', { textContent: t('aiopt.warnNever') }), el('p', { textContent: t('aiopt.warnBilling') }));
    warn.setAttribute('role', 'note');
    warn.style.cssText = 'border:2px solid #b45309;background:#fff8e6;border-radius:8px;padding:10px 14px;margin:0 0 14px';
    const parts = el('fieldset', {}, el('legend', { textContent: t('aiopt.partsLegend') }));
    const partBoxes = {};
    for (const k of AI.PARTS) { partBoxes[k] = box('ai-part-' + k, partLabel(k)); partBoxes[k].input.name = k; parts.append(partBoxes[k].label); }
    parts.append(el('p', { textContent: t('aiopt.partsHint', { marker: AI.NEEDS_INPUT }), style: 'margin:6px 0 0;font-size:13px' }));
    const key = el('input', { id: 'aiKey', type: 'password', autocomplete: 'off', spellcheck: false, dir: 'ltr' });
    key.setAttribute('autocapitalize', 'off');
    const keyStatus = el('p', { id: 'aiKeyStatus', role: 'status', style: 'margin:4px 0 0;font-size:13px' });
    const model = el('input', { id: 'aiModel', type: 'text', autocomplete: 'off', spellcheck: false, dir: 'ltr' });
    const consent = box('aiConsent', t('aiopt.consent')), enable = box('aiEnable', t('aiopt.enable'));
    const enableNote = el('span', { style: 'font-size:13px;margin-inline-start:34px' });
    const save = el('button', { type: 'button', id: 'aiSave', textContent: t('aiopt.save') });
    const test = el('button', { type: 'button', id: 'aiTest', className: 'sec', textContent: t('aiopt.test') });
    const rm = el('button', { type: 'button', id: 'aiRemove', className: 'sec', textContent: t('aiopt.removeKey') });
    const msg = el('p', { id: 'aiMsg', role: 'status', style: 'font-weight:600;margin:10px 0 0' });
    fs.append(el('p', { textContent: t('aiopt.intro') }), warn, parts,
      el('p', {}, el('label', { htmlFor: 'aiKey' }, t('aiopt.keyLabel'), key), keyStatus, el('span', { textContent: t('aiopt.keyHint'), style: 'font-size:13px' })),
      el('p', {}, el('label', { htmlFor: 'aiModel' }, t('aiopt.modelLabel'), model), el('span', { textContent: t('aiopt.modelHint', { model: AI.DEFAULT_MODEL }), style: 'font-size:13px' })),
      consent.label, enable.label, enableNote,
      el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0' }, save, test, rm), msg);
    mount.replaceChildren(fs);

    const say = (text, bad) => { msg.setAttribute('role', bad ? 'alert' : 'status'); msg.style.color = bad ? '#b3261e' : '#17663a'; msg.textContent = (bad ? '⚠ ' : '✓ ') + text; };
    const plain = (text) => { msg.setAttribute('role', 'status'); msg.style.color = '#1b1b1f'; msg.textContent = text; };
    const syncEnable = () => {
      enable.input.disabled = !consent.input.checked;
      if (!consent.input.checked) enable.input.checked = false;
      enableNote.textContent = consent.input.checked ? '' : t('aiopt.enableNeedsConsent');
    };
    consent.input.onchange = syncEnable;
    async function refresh() {
      const s = await AI.getSettings(), k = await AI.keyStatus();
      for (const p of AI.PARTS) partBoxes[p].input.checked = s.include[p];
      model.value = s.model; consent.input.checked = s.consent; enable.input.checked = s.enabled; syncEnable();
      const prot = await FormFillSecurity.isEnabled();
      key.value = ''; key.placeholder = k.saved ? t('aiopt.keyPlaceholderSaved') : '';
      keyStatus.textContent = (k.saved ? (k.protected ? t('aiopt.keySavedProtected') : t('aiopt.keySavedPlain')) : t('aiopt.keyNone')) + ' ' + (prot ? t('aiopt.keyStorageNoteProtected') : t('aiopt.keyStorageNotePlain'));
      rm.disabled = !k.saved;
    }
    const readForm = () => ({
      enabled: enable.input.checked, consent: consent.input.checked, model: model.value,
      include: Object.fromEntries(AI.PARTS.map((p) => [p, partBoxes[p].input.checked]))
    });
    async function storeTypedKey() { // returns false (and says why) when the typed key cannot be stored
      const typed = key.value.trim();
      if (!typed) return true;
      try { await AI.saveKey(typed); return true; } catch (e) { say(e.code === 'LOCKED' ? t('aiopt.cannotProtect') : t('ai.badKeyFormat'), true); return false; }
    }
    const removePermission = () => chrome.permissions.remove({ origins: [AI.ORIGIN] }).catch(() => {});

    save.onclick = async () => {
      const f = readForm();
      if (f.enabled && !f.consent) { say(t('aiopt.needConsent'), true); return; }
      const on = f.enabled && f.consent;
      if (on) { // chrome.permissions.request must run straight from this click
        let granted = false;
        try { granted = await chrome.permissions.request({ origins: [AI.ORIGIN] }); } catch { granted = false; }
        if (!granted) { await AI.saveSettings({ ...f, enabled: false }); await refresh(); say(t('aiopt.permDenied'), true); return; }
      }
      if (!(await storeTypedKey())) return;
      if (on && !(await AI.keyStatus()).saved) { await AI.saveSettings({ ...f, enabled: false }); await refresh(); say(t('aiopt.needKey'), true); await removePermission(); return; }
      await AI.saveSettings({ ...f, enabled: on });
      if (!on) await removePermission();
      await refresh();
      if (on) say(t('aiopt.saved')); else say(t('aiopt.savedOff'));
    };
    test.onclick = async () => {
      let granted = false, requested = false;
      try { granted = await chrome.permissions.contains({ origins: [AI.ORIGIN] }); if (!granted) { requested = true; granted = await chrome.permissions.request({ origins: [AI.ORIGIN] }); } } catch { granted = false; }
      if (!granted) { say(t('aiopt.permDenied'), true); return; }
      if (!(await storeTypedKey())) return;
      const cur = await AI.getSettings(); // only the model is saved here; on/off and consent stay as last saved
      await AI.saveSettings({ ...cur, model: model.value });
      if (!(await AI.keyStatus()).saved) { say(t('aiopt.needKey'), true); if (requested && !cur.enabled) await removePermission(); return; }
      plain(t('aiopt.testing'));
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
      say(t('aiopt.keyRemoved'));
    };
    await refresh();
  }
  init();
  FORMFILL_I18N.onChange(init); // re-draw in the new language (unsaved ticks are reset; saved settings are re-read)
})();
