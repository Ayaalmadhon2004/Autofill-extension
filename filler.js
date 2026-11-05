// Injected into the page on demand. Reads the profile it is given and fills matching fields.
// It never submits anything and never sends data anywhere.
(function () {
  if (window.__formFill) return;
  const FIELDS = window.FORMFILL_FIELDS;
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'file', 'password', 'image', 'reset']);

  const { norm, labelText, signature } = window.FORMFILL_SIG; // shared with teach.js, see signature.js

  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function match(el, customRules) {
    const sig = signature(el);
    for (const r of customRules) {
      const m = String(r.match || '').trim().toLowerCase();
      if (m && sig.includes(norm(m))) return { value: r.value, label: 'custom: ' + r.match };
    }
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

  function fill(profile, settings) {
    settings = settings || {};
    const p = Object.assign({}, profile.data || {});
    if (!p.fullName) p.fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const custom = profile.custom || [];
    const done = [];
    const seenGroups = new Set();
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const type = (el.type || '').toLowerCase();
      if (SKIP_TYPES.has(type) || el.disabled || el.readOnly || !visible(el)) continue;
      const isChoice = type === 'radio' || type === 'checkbox';
      if (!isChoice && el.value && !settings.overwrite && el.tagName !== 'SELECT') continue;
      const m = match(el, custom);
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
