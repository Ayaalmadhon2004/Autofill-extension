// Injected on demand ("Suggest an answer with AI…" in the right-click menu or the popup). Opens a small accessible
// prompt for the focused / right-clicked text box. This script never contacts the network itself: it asks the
// background worker for a draft, and only writes into the field when the user clicks "Insert into field".
(function () {
  if (window.__formFillAI) return;
  const I18N = window.FORMFILL_I18N; // all texts live in i18n.js; the language is passed to start() by the background worker
  const t = (key, vars) => I18N.t(key, vars);
  const S = window.FORMFILL_SIG;
  const TEXT_TYPES = new Set(['', 'text', 'search']);
  let lastTarget = null;
  let open = null; // { host, back }

  document.addEventListener('contextmenu', (e) => { lastTarget = e.composedPath ? e.composedPath()[0] : e.target; }, true);

  const eligible = (el) => !!el && el.nodeType === 1 && !el.disabled && !el.readOnly &&
    (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_TYPES.has((el.getAttribute('type') || '').toLowerCase())));
  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  function fieldFrom(node) {
    if (!node || node.nodeType !== 1) return null;
    if (eligible(node)) return node;
    const lab = node.closest && node.closest('label');
    const c = lab && (lab.control || lab.querySelector('input,textarea'));
    return eligible(c) ? c : null;
  }
  const targetField = () => fieldFrom(lastTarget) || fieldFrom(deepActive());

  const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').replace(/[\s*:：]+$/, '').trim().slice(0, n);
  function questionOf(field) {
    for (const c of [S.labelText(field), field.getAttribute('aria-label'), field.placeholder, field.name]) {
      const q = clean(c, 400); if (q.length >= 2) return q;
    }
    return '';
  }
  // Job title / company text, only if the page states them (JSON-LD JobPosting, else the main heading and site name).
  function pageContext() {
    let jobTitle = '', company = '';
    try {
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        const walk = (o) => {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) { o.forEach(walk); return; }
          if (o['@graph']) walk(o['@graph']);
          if (o['@type'] === 'JobPosting' && !jobTitle) {
            jobTitle = clean(o.title, 150);
            const h = o.hiringOrganization; company = clean(typeof h === 'string' ? h : h && h.name, 150);
          }
        };
        walk(JSON.parse(s.textContent));
      }
    } catch { /* ignore malformed JSON-LD */ }
    if (!jobTitle) { const h = document.querySelector('h1'); jobTitle = clean(h && h.textContent, 150); }
    if (!company) { const m = document.querySelector('meta[property="og:site_name"]'); company = clean(m && m.content, 150); }
    return { jobTitle, company };
  }

  const send = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r || null); }); } catch { resolve(null); }
  });

  const CSS = `
    :host{all:initial}
    .wrap{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(20,20,30,.45);font:15px/1.5 system-ui,sans-serif}
    .box{box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1b1b1f;border:1px solid #6b7080;border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.3)}
    h2{margin:0 0 8px;font-size:16px}
    p{margin:0 0 10px;font-size:13px;color:#3d4050}
    .q{background:#eef0f5;padding:6px 10px;border-radius:6px;overflow-wrap:anywhere}
    label{display:block;font-weight:600;font-size:13px}
    textarea{display:block;width:100%;box-sizing:border-box;min-height:140px;padding:8px 10px;margin:4px 0 8px;font:inherit;color:#1b1b1f;background:#fff;border:1px solid #6b7080;border-radius:6px}
    .note{font-weight:600;color:#3d4050}
    .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    button{min-height:44px;min-width:44px;padding:0 18px;font:inherit;font-weight:600;border-radius:8px;cursor:pointer;background:#1a56db;color:#fff;border:1px solid #1a56db}
    button.sec{background:#fff;color:#1a56db}
    button:disabled{opacity:.55;cursor:not-allowed}
    :focus-visible{outline:3px solid #f5a623;outline-offset:2px}
    .ok{font-weight:600;color:#17663a}
    .bad{font-weight:600;color:#b3261e}`;

  function el(tag, props, ...kids) { const n = document.createElement(tag); Object.assign(n, props || {}); n.append(...kids); return n; }

  function closePrompt(restore) {
    if (!open) return;
    const { host, back } = open; open = null;
    host.remove();
    if (restore && back && back.isConnected && back.focus) back.focus();
  }

  function setNative(field, value) {
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, value); // works with React/Vue controlled inputs
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function show(field, question, auto) {
    closePrompt(false);
    const host = document.createElement('div');
    host.setAttribute('data-formfill-ai', '');
    const root = host.attachShadow({ mode: 'open' });
    const wrap = el('div', { className: 'wrap' });
    const box = el('div', { className: 'box', role: 'dialog', dir: I18N.dirOf(), lang: I18N.getLang() });
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'ff-ai-title');
    wrap.appendChild(box); root.append(el('style', { textContent: CSS }), wrap);
    box.append(el('h2', { id: 'ff-ai-title', textContent: t('aiprompt.title') }));
    const status = el('p', { role: 'status' });

    if (!field) {
      const ok = el('button', { type: 'button', textContent: t('common.close') });
      ok.onclick = () => closePrompt(true);
      box.append(el('p', { textContent: t('aiprompt.noField') }), el('div', { className: 'row' }, ok));
    } else {
      const q = el('p', { className: 'q', id: 'ff-ai-q' }); q.append(el('strong', { textContent: t('aiprompt.questionLabel') + ': ' }), el('bdi', { textContent: question }));
      const area = el('textarea', { id: 'ff-ai-draft' }); area.dir = 'auto';
      const lab = el('label', { htmlFor: 'ff-ai-draft', textContent: t('aiprompt.draftLabel') });
      const note = el('p', { className: 'note', textContent: t('aiprompt.note') });
      const insert = el('button', { type: 'button', textContent: t('aiprompt.insert'), disabled: true });
      const regen = el('button', { type: 'button', className: 'sec', textContent: t('aiprompt.regenerate') });
      const cancel = el('button', { type: 'button', className: 'sec', textContent: t('common.cancel') });
      box.append(q, lab, area, note, status, el('div', { className: 'row' }, cancel, regen, insert));
      let seq = 0;
      const generate = async () => { // only ever runs from an explicit user action (menu / popup click, or Regenerate)
        const mine = ++seq;
        insert.disabled = true; regen.disabled = true;
        status.className = ''; status.textContent = t('aiprompt.generating');
        const r = await send({ type: 'formfill-ai-draft', question, page: pageContext() });
        if (mine !== seq || !open) return;
        regen.disabled = false;
        if (r && r.ok) { area.value = r.text; insert.disabled = false; status.className = 'ok'; status.textContent = t('aiprompt.ready'); area.focus(); }
        else { status.className = 'bad'; status.textContent = '⚠ ' + t('aiprompt.error', { error: (r && r.error) || t('aiprompt.unknownError') }); }
      };
      area.addEventListener('input', () => { insert.disabled = !area.value.trim(); });
      regen.onclick = generate;
      cancel.onclick = () => closePrompt(true);
      insert.onclick = () => {
        const v = area.value.trim();
        if (!v) return;
        setNative(field, v);
        closePrompt(true);
      };
      if (auto) generate();
    }

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePrompt(true); return; }
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll('textarea,button:not([disabled])')];
      if (!f.length) return;
      const act = root.activeElement;
      if (e.shiftKey && act === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && act === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closePrompt(true); });
    document.documentElement.appendChild(host);
    open = { host, back: field || deepActive() };
    const first = box.querySelector('textarea,button');
    if (first) first.focus();
  }

  // opts.onlyIfField: popup path runs in every frame; only the frame that holds a suitable field opens the prompt.
  function start(opts) {
    if (opts && opts.lang) I18N.setLang(opts.lang, { persist: false });
    const field = targetField();
    if (!field && opts && opts.onlyIfField) return false;
    show(field, field ? questionOf(field) : '', true);
    return !!field;
  }

  window.__formFillAI = { start, questionOf, pageContext };
})();
