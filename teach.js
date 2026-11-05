// Injected on demand when the user picks "Teach Form Filler this field…" from the right-click menu.
// Finds the field that was right-clicked, shows a small accessible prompt for the answer, and asks the
// background worker to save it as a custom rule. It never submits anything and sends nothing off device.
(function () {
  if (window.__formFillTeach) return;
  const S = window.FORMFILL_SIG;
  const FIELD = 'input, textarea, select';
  const SKIP = new Set(['hidden', 'submit', 'button', 'file', 'password', 'image', 'reset']);
  let lastTarget = null;
  let open = null; // { host, close }

  // The right-click happened before this script was injected, so also track later ones
  // (and fall back to the focused field, which a right-click normally focuses).
  document.addEventListener('contextmenu', (e) => { lastTarget = e.target; }, true);

  function fieldFrom(node) {
    if (!node || node.nodeType !== 1) return null;
    let el = node.closest && node.closest(FIELD);
    if (!el) { // clicked a <label> or something inside one
      const lab = node.closest && node.closest('label');
      el = lab && (lab.control || lab.querySelector(FIELD));
    }
    return el && !SKIP.has((el.type || '').toLowerCase()) ? el : null;
  }
  const target = () => fieldFrom(lastTarget) || fieldFrom(document.activeElement);

  const send = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r || null); }); } catch { resolve(null); }
  });

  const CSS = `
    :host{all:initial}
    .wrap{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(20,20,30,.45);font:15px/1.5 system-ui,sans-serif}
    .box{box-sizing:border-box;width:min(420px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1b1b1f;border:1px solid #6b7080;border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.3)}
    h2{margin:0 0 6px;font-size:16px}
    p{margin:0 0 10px;font-size:13px;color:#3d4050}
    code{background:#eef0f5;padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
    label{display:block;font-weight:600;font-size:13px}
    input,textarea,select{display:block;width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;margin:4px 0 12px;font:inherit;color:#1b1b1f;background:#fff;border:1px solid #6b7080;border-radius:6px}
    textarea{min-height:90px}
    .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    button{min-height:44px;min-width:44px;padding:0 18px;font:inherit;font-weight:600;border-radius:8px;cursor:pointer;background:#1a56db;color:#fff;border:1px solid #1a56db}
    button.sec{background:#fff;color:#1a56db}
    :focus-visible{outline:3px solid #f5a623;outline-offset:2px}
    .ok{font-weight:600;color:#17663a}`;

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    n.append(...kids);
    return n;
  }

  function closePrompt(restore) {
    if (!open) return;
    const { host, back } = open; open = null;
    host.remove();
    if (restore && back && back.focus) back.focus();
  }

  function show(info, field, existing, profileName) {
    closePrompt(false);
    const host = document.createElement('div');
    host.setAttribute('data-formfill-teach', '');
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style', { textContent: CSS });
    const wrap = el('div', { className: 'wrap' });
    const box = el('div', { className: 'box', role: 'dialog' });
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'ff-title');
    wrap.appendChild(box); root.append(style, wrap);

    const title = el('h2', { id: 'ff-title', textContent: 'Teach Form Filler this field' });
    const done = el('p', { role: 'status' });
    box.append(title);

    if (!field) {
      box.append(el('p', { textContent: 'Right-click a form field (a text box, dropdown, radio button or checkbox) and choose this option again.' }));
      const ok = el('button', { type: 'button', textContent: 'Close' });
      ok.onclick = () => closePrompt(true);
      box.append(el('div', { className: 'row' }, ok));
    } else {
      const form = el('form');
      form.append(el('p', {}, 'When a field’s label contains ', el('code', { textContent: info.match || '(unnamed field)' }),
        ', fill it with your answer' + (profileName ? ' (saved to profile “' + profileName + '”).' : '.')));
      let input;
      if (info.options.length) {
        input = el('select', { id: 'ff-answer' });
        input.add(new Option('Choose an answer…', ''));
        const opts = info.options.slice();
        if (existing && !opts.some((o) => o === existing)) opts.push(existing);
        for (const o of opts) input.add(new Option(o, o));
      } else if (info.type === 'textarea') input = el('textarea', { id: 'ff-answer' });
      else input = el('input', { id: 'ff-answer', type: 'text' });
      input.dir = 'auto';
      if (existing) input.value = existing;
      const lab = el('label', { htmlFor: 'ff-answer', textContent: 'Answer' });
      const cancel = el('button', { type: 'button', className: 'sec', textContent: 'Cancel' });
      const save = el('button', { type: 'submit', textContent: 'Save answer' });
      cancel.onclick = () => closePrompt(true);
      form.append(lab, input, el('div', { className: 'row' }, cancel, save), done);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const value = input.value.trim();
        if (!info.match || !value) { done.textContent = !info.match ? 'This field has no label to match on.' : 'Type or choose an answer first.'; input.focus(); return; }
        const r = await send({ type: 'formfill-teach-save', match: info.match, value });
        if (!r || !r.ok) { done.textContent = 'Could not save. Try again.'; return; }
        done.className = 'ok'; done.textContent = 'Saved ✓ It will be used next time you fill.';
        save.disabled = true;
        setTimeout(() => closePrompt(true), 1200);
      };
      box.append(form);
      requestAnimationFrame(() => input.focus());
    }

    // Keyboard: Esc closes; Tab stays inside the dialog.
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePrompt(true); return; }
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll('input,textarea,select,button:not([disabled])')];
      if (!f.length) return;
      const act = root.activeElement;
      if (e.shiftKey && act === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && act === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closePrompt(true); });
    document.documentElement.appendChild(host);
    open = { host, back: field || document.activeElement };
    const first = box.querySelector('input,textarea,select,button');
    if (first) first.focus();
  }

  async function start() {
    const field = target();
    const info = field ? S.describe(field) : null;
    let existing = '', profileName = '';
    if (info) {
      const r = await send({ type: 'formfill-teach-get', match: info.match });
      if (r) { existing = r.value || ''; profileName = r.profileName || ''; }
    }
    show(info, field, existing, profileName);
    return info;
  }

  window.__formFillTeach = { start };
})();
