// Shared text helpers: used by filler.js (matching), teach.js (right-click "teach this field") and background.js.
// Pure functions + DOM readers; nothing here touches storage or the network.
(function (root) {
  if (root.FORMFILL_SIG) return;

  const norm = (s) => String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.\[\]]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  function labelText(el) {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(l.textContent);
    const by = el.getAttribute('aria-labelledby');
    if (by) by.split(/\s+/).forEach((id) => { const root = el.getRootNode(); const n = (root.getElementById ? root : el.ownerDocument).getElementById(id); if (n) parts.push(n.textContent); });
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

  // Whole-word containment that also works for Arabic ("no" must not match "know" or "not applicable").
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function hasWord(hay, needle) {
    const n = norm(needle);
    if (!n) return false;
    return new RegExp('(^|[^\\p{L}\\p{N}])' + esc(n) + '($|[^\\p{L}\\p{N}])', 'u').test(norm(hay));
  }

  // 'yes' | 'no' | null for an answer or an option label (English and Arabic).
  const YES = new Set(['yes', 'y', 'yeah', 'yep', 'true', 'نعم', 'ايوه', 'اجل', 'بلي', 'بلى']);
  const NO = new Set(['no', 'n', 'nope', 'false', 'لا', 'كلا']);
  const NOT_AN_ANSWER = /^(n\/a|not applicable|no (preference|answer|response|opinion|comment|data)|none of|لا ينطبق|لا افضل|لا اريد|لا ارغب)/;
  function yesNo(text) {
    const t = String(text == null ? '' : text).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/[ً-ْ]/g, '').trim();
    if (!t || NOT_AN_ANSWER.test(t)) return null;
    const first = t.split(/[^\p{L}\p{N}/]+/u).filter(Boolean)[0];
    if (YES.has(first)) return 'yes';
    if (NO.has(first)) return 'no';
    return null;
  }

  // What the "teach" prompt needs: a rule trigger that is guaranteed to be found by signature(el), the kind of control, its choices.
  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const type = tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : (el.type || 'text').toLowerCase();
    const isChoice = type === 'radio' || type === 'checkbox';
    const clean = (s) => norm(s).replace(/[\s*:：]+$/, '').replace(/\s*\(?required\)?$/, '').trim();
    const cands = isChoice
      ? [groupQuestion(el), el.getAttribute('aria-label'), el.name, el.id]
      : [labelText(el), el.getAttribute('aria-label'), el.placeholder, el.name, el.id];
    let match = '';
    for (const c of cands) { const v = clean(c); if (v.length >= 2) { match = v; break; } }
    if (match.length > 80) match = match.slice(0, 80).replace(/\s+\S*$/, '');
    let options = [];
    if (tag === 'select') options = [...el.options].filter((o) => o.text.trim() && o.value !== '').map((o) => o.text.trim());
    else if (type === 'radio') {
      const scope = el.form || el.ownerDocument;
      const same = el.name ? [...scope.querySelectorAll('input[type=radio]')].filter((r) => r.name === el.name) : [el];
      options = same.map((r) => (labelText(r) || r.value || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    } else if (type === 'checkbox') options = ['Yes', 'No'];
    return { match, type, options, signature: signature(el) };
  }

  root.FORMFILL_SIG = { norm, labelText, groupQuestion, signature, hasWord, yesNo, describe };
})(typeof window !== 'undefined' ? window : self);
