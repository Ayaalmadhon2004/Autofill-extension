// Application history page. Reads/writes chrome.storage.local `applications` only; nothing leaves the browser.
// All user-facing strings live in i18n.js ('history.*'); static ones are data-i18n attributes in history.html.
const $ = (id) => document.getElementById(id);
const STATUS_KEYS = ['applied', 'interviewing', 'offer', 'rejected', 'saved'];
const statusText = (k) => t('history.status.' + k);
let apps = [];

// Arabic uses Western digits (u-nu-latn) like the rest of the interface.
const fmtDate = (iso) => new Date(iso).toLocaleDateString(FORMFILL_I18N.getLang() === 'ar' ? 'ar-u-nu-latn' : undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const say = (text) => { $('msg').textContent = text; setTimeout(() => { if ($('msg').textContent === text) $('msg').textContent = ''; }, 2500); };

// Re-read storage before every change so a fill happening in another tab is not overwritten.
async function mutate(fn) {
  const { applications } = await chrome.storage.local.get({ applications: [] });
  apps = fn(Array.isArray(applications) ? applications : []);
  await chrome.storage.local.set({ applications: apps });
}

function visible() {
  const q = $('q').value.trim().toLowerCase(), f = $('f').value;
  return apps.filter((a) => (!f || a.status === f) &&
    (!q || [a.title, a.host, a.url, a.notes].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function summary() {
  const now = new Date();
  const m = apps.filter((a) => { const d = new Date(a.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  $('summary').textContent = t('history.sumMonth', { n: m }) + ' · ' + t('history.sumTotal', { n: apps.length });
}

function item(a) {
  const li = document.createElement('li'); li.className = 'app'; li.dataset.id = a.id;
  const title = a.title || a.host;
  const h = document.createElement('h2');
  const link = document.createElement('a'); link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = title; link.dir = 'auto'; link.setAttribute('aria-label', t('history.openPage', { title }));
  h.appendChild(link);
  const meta = document.createElement('p'); meta.className = 'meta muted';
  meta.textContent = `${a.host} · ${fmtDate(a.date)} · ${t('history.fieldsFilled', { n: a.filledCount })}`;
  const sl = document.createElement('label'); sl.className = 'status';
  const st = document.createElement('select'); st.setAttribute('aria-label', t('history.statusFor', { title }));
  for (const k of STATUS_KEYS) st.add(new Option(statusText(k), k, false, k === a.status));
  sl.append(t('history.status'), st);
  st.onchange = async () => { await mutate((l) => l.map((x) => x.id === a.id ? { ...x, status: st.value } : x)); a.status = st.value; summary(); say(t('history.saved')); };
  const nl = document.createElement('label'); nl.className = 'notes';
  const nt = document.createElement('textarea'); nt.dir = 'auto'; nt.value = a.notes || ''; nt.setAttribute('aria-label', t('history.notesFor', { title }));
  nl.append(t('history.notes'), nt);
  nt.onchange = async () => { await mutate((l) => l.map((x) => x.id === a.id ? { ...x, notes: nt.value } : x)); a.notes = nt.value; say(t('history.saved')); };
  const del = document.createElement('button'); del.type = 'button'; del.className = 'del';
  del.textContent = t('history.delete'); del.setAttribute('aria-label', t('history.deleteFor', { title }));
  del.onclick = async () => {
    if (!confirm(t('history.confirmDelete'))) return;
    await mutate((l) => l.filter((x) => x.id !== a.id));
    render(); say(t('history.deleted')); $('q').focus();
  };
  li.append(h, meta, sl, nl, del);
  return li;
}

function render() {
  summary();
  const rows = visible(), list = $('list');
  list.textContent = '';
  rows.forEach((a) => list.appendChild(item(a)));
  $('empty').hidden = rows.length > 0;
  $('empty').textContent = apps.length ? t('history.emptyFilter') : t('history.emptyNone');
  $('csv').disabled = !rows.length;
}

const csvCell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function toCsv(rows) {
  const head = ['history.csv.date', 'history.csv.title', 'history.csv.site', 'history.csv.url', 'history.status', 'history.csv.filled', 'history.notes'].map((k) => t(k));
  const lines = [head, ...rows.map((a) => [a.date.slice(0, 10), a.title, a.host, a.url, STATUS_KEYS.includes(a.status) ? statusText(a.status) : a.status, a.filledCount, a.notes])];
  return lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function fillFilter() { // the status filter, in the current language, keeping the chosen value
  const f = $('f'), keep = f.value;
  f.textContent = '';
  f.add(new Option(t('history.all'), ''));
  for (const k of STATUS_KEYS) f.add(new Option(statusText(k), k));
  f.value = keep;
}

(async () => {
  await FORMFILL_I18N.ready;
  FORMFILL_I18N.applyDom(document);
  fillFilter();
  const { applications } = await chrome.storage.local.get({ applications: [] });
  apps = Array.isArray(applications) ? applications : [];
  $('q').oninput = render; $('f').onchange = render;
  FORMFILL_I18N.onChange(() => { $('msg').textContent = ''; fillFilter(); render(); });
  $('csv').onclick = () => {
    const blob = new Blob(['﻿' + toCsv(visible())], { type: 'text/csv;charset=utf-8' }); // BOM keeps Arabic readable in Excel
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'applications.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(t('history.exported'));
  };
  render();
})();
