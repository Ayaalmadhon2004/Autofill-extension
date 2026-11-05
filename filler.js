// Injected into the page on demand. Reads the profile it is given and fills matching fields.
// It never submits anything and never sends data anywhere.
(function () {
  if (window.__formFill) return;
  const FIELDS = window.FORMFILL_FIELDS;
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'file', 'password', 'image', 'reset']);

  const norm = (s) => String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.\[\]]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  function labelText(el) {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(l.textContent);
    const by = el.getAttribute('aria-labelledby');
    if (by) by.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    if (!parts.length) { const l = el.closest('label'); if (l) parts.push(l.textContent); }
    return parts.join(' ');
  }

  function groupQuestion(el) { // radio/checkbox: the question lives in the fieldset legend, not the option's label
    if (el.type !== 'radio' && el.type !== 'checkbox') return '';
    const fs = el.closest('fieldset, [role=radiogroup], [role=group]');
    if (!fs) return '';
    const lg = fs.querySelector('legend');
    return (lg ? lg.textContent : '') + ' ' + (fs.getAttribute('aria-label') || '');
  }

  function signature(el) {
    return norm([groupQuestion(el), el.name, el.id, el.placeholder,
      el.getAttribute('aria-label'), el.getAttribute('data-automation-id'), labelText(el)].join(' '));
  }

  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function matchCustom(el, customRules, sig) {
    for (const r of customRules) {
      const m = String(r.match || '').trim().toLowerCase();
      if (m && sig.includes(norm(m))) return { value: r.value, label: 'custom: ' + r.match };
    }
    return null;
  }

  function match(el, customRules) {
    const sig = signature(el);
    const c = matchCustom(el, customRules, sig);
    if (c) return c;
    const acTokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
    for (const f of FIELDS) {
      if (f.exclude && f.exclude.some((x) => new RegExp(x).test(sig))) continue;
      if (f.ac.some((t) => acTokens.includes(t)) || f.re.some((x) => new RegExp(x).test(sig))) return { key: f.key, label: f.label };
    }
    return null;
  }

  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); // works with React/Vue controlled inputs
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setSelect(el, value) {
    const v = norm(value);
    const opts = [...el.options].filter((o) => o.value !== '' || o.text.trim() !== '');
    const hit = opts.find((o) => norm(o.text) === v || norm(o.value) === v) || opts.find((o) => v && (norm(o.text).includes(v) || v.includes(norm(o.text)) && norm(o.text).length > 2));
    if (!hit) return false;
    el.value = hit.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setChoice(el, value) { // radio / checkbox
    const v = norm(value);
    if (el.type === 'checkbox') {
      const want = ['yes', 'true', 'checked', '1'].includes(v);
      if (el.checked !== want) el.click();
      return true;
    }
    const lab = norm(labelText(el) || el.value);
    if (lab === v || lab.includes(v)) { if (!el.checked) el.click(); return true; }
    return false;
  }

  function flash(el) {
    const prev = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 3px rgba(34,160,90,.55)';
    setTimeout(() => { el.style.boxShadow = prev; }, 1800);
  }

  // --- Repeating sections (work experience / education) -------------------------------------------
  const ENTRY_TYPES = new Set(['', 'text', 'search', 'date', 'month', 'number']);
  const BOX_HINT = /experience|education|employment|work-?history|\bjob|school|repeat|entry/i;
  const boxIds = new WeakMap();
  let boxSeq = 0;

  function boxOf(el) { // nearest repeated-block container: fieldset, role=group, or a wrapper that names itself
    for (let n = el.parentElement, depth = 0; n && depth < 8; n = n.parentElement, depth++) {
      if (n === document.body || n.tagName === 'FORM') return null;
      if (n.tagName === 'FIELDSET' || n.getAttribute('role') === 'group' || BOX_HINT.test(n.className + ' ' + n.id)) {
        if (!boxIds.has(n)) boxIds.set(n, 'b' + (boxSeq++));
        return boxIds.get(n);
      }
    }
    return null;
  }

  // Returns Map<element, {value|null, label}>: elements that belong to an experience/education block.
  // value null = a block with no matching entry, leave the field empty rather than guess.
  function planEntries(profile, custom) {
    const G = window.FORMFILL_GROUPS, plan = new Map();
    if (!G || !((profile.experience || []).length || (profile.education || []).length)) return plan;
    const els = [], items = [];
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const type = (el.type || '').toLowerCase();
      const ok = el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || ENTRY_TYPES.has(type);
      if (!ok || el.disabled || el.readOnly || !visible(el)) continue;
      const sig = signature(el);
      if (matchCustom(el, custom, sig)) continue; // the user's own rules win
      const kind = G.classify(sig);
      if (!kind) continue;
      const lab = labelText(el) || el.getAttribute('aria-label') || el.placeholder || '';
      els.push(el);
      items.push({ kind, idx: G.extractIndex([el.name, el.id, lab]), box: boxOf(el) });
    }
    for (const a of G.assign(G.groupFields(items), profile)) {
      const el = els[a.pos];
      const value = a.value == null ? null : el.tagName === 'SELECT' ? a.value : G.inputValue(el.type, a.value);
      plan.set(el, { value, label: a.section + ': ' + a.field });
    }
    return plan;
  }

  function fill(profile, settings) {
    settings = settings || {};
    const p = Object.assign({}, profile.data || {});
    if (!p.fullName) p.fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const custom = profile.custom || [];
    const done = [];
    const plan = planEntries(profile, custom);
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const type = (el.type || '').toLowerCase();
      if (SKIP_TYPES.has(type) || el.disabled || el.readOnly || !visible(el)) continue;
      const isChoice = type === 'radio' || type === 'checkbox';
      if (!isChoice && el.value && !settings.overwrite && el.tagName !== 'SELECT') continue;
      const planned = plan.get(el);
      if (planned && planned.value == null) continue;
      const m = planned ? { value: planned.value, label: planned.label } : match(el, custom);
      if (!m) continue;
      const value = m.value !== undefined ? m.value : p[m.key];
      if (value === undefined || value === null || String(value).trim() === '') continue;
      let ok = false;
      if (el.tagName === 'SELECT') ok = setSelect(el, value);
      else if (isChoice) ok = setChoice(el, value);
      else { setNative(el, String(value)); ok = true; }
      if (ok) { flash(el); done.push(m.label); }
    }
    return { filled: done.length, fields: done };
  }

  window.__formFill = { fill };
})();
