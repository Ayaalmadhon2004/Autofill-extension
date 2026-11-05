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
    if (by) by.split(/\s+/).forEach((id) => { const root = el.getRootNode(); const n = (root.getElementById ? root : document).getElementById(id); if (n) parts.push(n.textContent); });
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

  // querySelectorAll that also descends into open shadow roots (nested, recursive).
  function deepQuery(root, selector, out) {
    out = out || [];
    out.push(...root.querySelectorAll(selector));
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) deepQuery(host.shadowRoot, selector, out);
    return out;
  }

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

  // ---- CV / resume upload ----
  const CV_RE = /resume|\bcv\b|curriculum|السيرة الذاتية|سيرة ذاتية|السيره الذاتيه/;
  const NOT_CV_RE = /cover|letter|photo|picture|avatar|portrait|headshot|transcript|certificate|صورة|رسالة|خطاب/;

  function acceptsFile(el, file) {
    const acc = (el.getAttribute('accept') || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    if (!acc.length) return true;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return acc.some((t) => t === ext || t === file.type.toLowerCase() || (t.endsWith('/*') && file.type.toLowerCase().startsWith(t.slice(0, -1))));
  }

  function attachCv(el, cv, overwrite) {
    if (!cv || !cv.b64 || el.disabled) return false;
    if (el.files && el.files.length && !overwrite) return false;
    const near = el.parentElement && el.parentElement.textContent.length < 80 ? norm(el.parentElement.textContent) : '';
    const sig = signature(el) + ' ' + near;
    if (!CV_RE.test(sig) || (NOT_CV_RE.test(sig) && !CV_RE.test(signature(el)))) return false;
    const bin = atob(cv.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], cv.name, { type: cv.type || 'application/octet-stream' });
    if (!acceptsFile(el, file)) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ---- fill report: required fields that are still empty ----
  const MARK_ATTR = 'data-formfill-marker';

  function isRequired(el) {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    return /\*/.test(labelText(el) + ' ' + groupQuestion(el));
  }

  function isEmpty(el) {
    const type = (el.type || '').toLowerCase();
    if (type === 'checkbox') return !el.checked;
    if (type === 'radio') {
      const group = el.name ? deepQuery(el.getRootNode(), 'input[type=radio]').filter((r) => r.name === el.name && r.form === el.form) : [el];
      return !group.some((r) => r.checked);
    }
    if (type === 'file') return !(el.files && el.files.length);
    return !String(el.value || '').trim();
  }

  function fieldName(el) {
    let t = groupQuestion(el).trim() || labelText(el).trim() || el.getAttribute('aria-label') || el.placeholder || el.name || el.id || el.type;
    return String(t).replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function clearMarkers() {
    for (const m of deepQuery(document, '[' + MARK_ATTR + ']')) {
      if (m.tagName === 'SPAN') m.remove(); else { m.style.outline = m.__ffPrevOutline || ''; m.style.outlineOffset = ''; m.removeAttribute(MARK_ATTR); }
    }
  }

  function markMissing(el) {
    el.setAttribute(MARK_ATTR, '1');
    el.__ffPrevOutline = el.style.outline;
    el.style.outline = '3px dashed #b3261e';
    el.style.outlineOffset = '2px';
    const tag = document.createElement('span');
    tag.setAttribute(MARK_ATTR, 'text');
    tag.setAttribute('role', 'note');
    tag.textContent = '\u26A0 Required \u2013 fill this in yourself';
    tag.style.cssText = 'display:inline-block;margin:4px 0 0 4px;padding:2px 8px;font:600 12px/1.4 system-ui,sans-serif;color:#7a1710;background:#fff;border:1px solid #b3261e;border-radius:4px;';
    el.insertAdjacentElement('afterend', tag);
    const clear = () => { if (!isEmpty(el)) { tag.remove(); el.style.outline = el.__ffPrevOutline || ''; el.style.outlineOffset = ''; el.removeAttribute(MARK_ATTR); } };
    el.addEventListener('input', clear); el.addEventListener('change', clear);
  }

  function reportMissing() {
    clearMarkers();
    const missing = [];
    const seen = new Set();
    for (const el of deepQuery(document, 'input, textarea, select')) {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'password', 'image', 'reset'].includes(type) || el.disabled || !visible(el)) continue;
      if (!isRequired(el) || !isEmpty(el)) continue;
      const name = fieldName(el);
      if (type === 'radio') { const k = el.name || name; if (seen.has(k)) continue; seen.add(k); }
      markMissing(el);
      missing.push(name);
    }
    return missing;
  }

  function fill(profile, settings, cv) {
    settings = settings || {};
    const p = Object.assign({}, profile.data || {});
    if (!p.fullName) p.fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const custom = profile.custom || [];
    const done = [];
    const seenGroups = new Set();
    for (const el of deepQuery(document, 'input, textarea, select')) {
      const type = (el.type || '').toLowerCase();
      if (type === 'file') {
        if (visible(el) && attachCv(el, cv, settings.overwrite)) { flash(el); done.push('Resume / CV'); }
        continue;
      }
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
    return { filled: done.length, fields: done, missing: reportMissing() };
  }

  window.__formFill = { fill };
})();
