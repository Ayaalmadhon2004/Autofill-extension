// Options UI for repeating sections (work experience, education). Self-contained.
// Hooks used by options.js: renderEntries(profile), collectEntries(), cloneEntries(profile).
// Needs: groups.js (SECTIONS), and $ / flashMsg from options.js.

function renderEntries(profile) {
  const root = $('entries'); root.textContent = '';
  for (const [name, sec] of Object.entries(window.FORMFILL_GROUPS.SECTIONS)) {
    const fs = document.createElement('fieldset');
    fs.className = 'entry-section'; fs.dataset.section = name;
    const lg = document.createElement('legend'); lg.textContent = t('section.' + name + '.title'); fs.appendChild(lg);
    const hint = document.createElement('p');
    hint.textContent = t('entries.hint');
    fs.appendChild(hint);
    const list = document.createElement('div'); list.className = 'entry-list'; fs.appendChild(list);
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'sec'; add.textContent = t('section.' + name + '.add');
    add.onclick = () => { const card = addEntry(name, {}); card.querySelector('input,textarea').focus(); };
    fs.appendChild(add);
    root.appendChild(fs);
    (profile[name] || []).forEach((e) => addEntry(name, e));
  }
}

function addEntry(name, entry) {
  const sec = window.FORMFILL_GROUPS.SECTIONS[name];
  const list = document.querySelector(`.entry-section[data-section="${name}"] .entry-list`);
  const card = document.createElement('fieldset'); card.className = 'entry';
  card.appendChild(document.createElement('legend'));
  const grid = document.createElement('div'); grid.className = 'grid';
  for (const f of sec.fields) {
    const l = document.createElement('label'); l.textContent = t(f.labelKey);
    const i = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
    i.dataset.key = f.key; i.dir = 'auto'; i.value = (entry && entry[f.key]) || '';
    l.appendChild(i); grid.appendChild(l);
    if (f.type === 'textarea') l.style.gridColumn = '1 / -1';
  }
  card.appendChild(grid);
  const bar = document.createElement('div'); bar.className = 'entry-bar';
  const mk = (txt, fn) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sec'; b.textContent = txt;
    b.onclick = () => fn(b); bar.appendChild(b); return b;
  };
  mk(t('entries.up'), (b) => moveEntry(card, -1, b));
  mk(t('entries.down'), (b) => moveEntry(card, 1, b));
  mk(t('entries.remove'), () => {
    const nextFocus = card.nextElementSibling || card.previousElementSibling || list.parentElement.querySelector('.entry-section > button');
    card.remove(); refreshEntryLabels(list); flashMsg(t('entries.removed', { item: t('section.' + name + '.item') }));
    (nextFocus && nextFocus.querySelector ? nextFocus.querySelector('input,textarea') || nextFocus : nextFocus).focus();
  });
  card.appendChild(bar);
  list.appendChild(card);
  refreshEntryLabels(list);
  return card;
}

function moveEntry(card, dir, btn) {
  const list = card.parentElement;
  const other = dir < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!other) { flashMsg(dir < 0 ? t('entries.alreadyFirst') : t('entries.alreadyLast')); return; }
  if (dir < 0) list.insertBefore(card, other); else list.insertBefore(other, card);
  refreshEntryLabels(list);
  btn.focus();
  flashMsg(t('entries.moved', { n: [...list.children].indexOf(card) + 1 }));
}

// Renumber legends and give every button an unambiguous accessible name ("Move up Experience 2").
function refreshEntryLabels(list) {
  const name = list.parentElement.dataset.section;
  [...list.children].forEach((card, n) => {
    const title = t('entries.itemTitle', { item: t('section.' + name + '.item'), n: n + 1 });
    card.firstChild.textContent = title;
    const [up, down, rm] = card.querySelectorAll('.entry-bar button');
    up.setAttribute('aria-label', t('entries.upFor', { title }));
    down.setAttribute('aria-label', t('entries.downFor', { title }));
    rm.setAttribute('aria-label', t('entries.removeFor', { title }));
  });
}

// { experience: [...], education: [...] }, blank rows dropped.
function collectEntries() {
  const out = {};
  for (const name of Object.keys(window.FORMFILL_GROUPS.SECTIONS)) {
    out[name] = [...document.querySelectorAll(`.entry-section[data-section="${name}"] .entry`)].map((card) => {
      const e = {};
      for (const i of card.querySelectorAll('[data-key]')) if (i.value.trim()) e[i.dataset.key] = i.value.trim();
      return e;
    }).filter((e) => Object.keys(e).length);
  }
  return out;
}

function cloneEntries(p) {
  return { experience: (p.experience || []).map((e) => ({ ...e })), education: (p.education || []).map((e) => ({ ...e })) };
}
