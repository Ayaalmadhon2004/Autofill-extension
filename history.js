// Application history page. Reads/writes chrome.storage.local `applications` only; nothing leaves the browser.
// All user-facing strings are in this one object (for translation later).
const S = {
  backToProfile: 'My profile', title: 'My applications',
  privacy: 'A record of the pages you filled. Stored only in this browser. Turn it off in Options.',
  search: 'Search (title, site, notes)', filter: 'Show status', all: 'All statuses',
  exportCsv: 'Export CSV', status: 'Status', notes: 'Notes', delete: 'Delete', filled: 'fields filled',
  emptyNone: 'No applications yet. Fill an application form with the extension and it will be listed here.',
  emptyFilter: 'No applications match your search or filter.',
  listLabel: 'Applications', saved: 'Saved', deleted: 'Entry deleted', confirmDelete: 'Delete this entry?',
  exported: 'CSV exported',
  statuses: { applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', saved: 'Saved' },
  csvHead: ['Date', 'Title', 'Site', 'URL', 'Status', 'Fields filled', 'Notes'],
  sumMonth: (n) => `${n} application${n === 1 ? '' : 's'} this month`,
  sumTotal: (n) => `${n} in total`,
  openPage: (t) => `Open page: ${t}`, notesFor: (t) => `Notes for ${t}`, statusFor: (t) => `Status for ${t}`,
  deleteFor: (t) => `Delete entry: ${t}`
};
const $ = (id) => document.getElementById(id);
const STATUS_KEYS = Object.keys(S.statuses);
let apps = [];

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const say = (t) => { $('msg').textContent = t; setTimeout(() => { if ($('msg').textContent === t) $('msg').textContent = ''; }, 2500); };

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
  $('summary').textContent = S.sumMonth(m) + ' · ' + S.sumTotal(apps.length);
}

function item(a) {
  const li = document.createElement('li'); li.className = 'app'; li.dataset.id = a.id;
  const title = a.title || a.host;
  const h = document.createElement('h2');
  const link = document.createElement('a'); link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = title; link.dir = 'auto'; link.setAttribute('aria-label', S.openPage(title));
  h.appendChild(link);
  const meta = document.createElement('p'); meta.className = 'meta muted';
  meta.textContent = `${a.host} · ${fmtDate(a.date)} · ${a.filledCount} ${S.filled}`;
  const sl = document.createElement('label'); sl.className = 'status';
  const st = document.createElement('select'); st.setAttribute('aria-label', S.statusFor(title));
  for (const k of STATUS_KEYS) st.add(new Option(S.statuses[k], k, false, k === a.status));
  sl.append(S.status, st);
  st.onchange = async () => { await mutate((l) => l.map((x) => x.id === a.id ? { ...x, status: st.value } : x)); a.status = st.value; summary(); say(S.saved); };
  const nl = document.createElement('label'); nl.className = 'notes';
  const nt = document.createElement('textarea'); nt.dir = 'auto'; nt.value = a.notes || ''; nt.setAttribute('aria-label', S.notesFor(title));
  nl.append(S.notes, nt);
  nt.onchange = async () => { await mutate((l) => l.map((x) => x.id === a.id ? { ...x, notes: nt.value } : x)); a.notes = nt.value; say(S.saved); };
  const del = document.createElement('button'); del.type = 'button'; del.className = 'del';
  del.textContent = S.delete; del.setAttribute('aria-label', S.deleteFor(title));
  del.onclick = async () => {
    if (!confirm(S.confirmDelete)) return;
    await mutate((l) => l.filter((x) => x.id !== a.id));
    render(); say(S.deleted); $('q').focus();
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
  $('empty').textContent = apps.length ? S.emptyFilter : S.emptyNone;
  $('csv').disabled = !rows.length;
}

const csvCell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function toCsv(rows) {
  const lines = [S.csvHead, ...rows.map((a) => [a.date.slice(0, 10), a.title, a.host, a.url, S.statuses[a.status] || a.status, a.filledCount, a.notes])];
  return lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

(async () => {
  document.querySelectorAll('[data-s]').forEach((el) => { el.textContent = S[el.dataset.s]; });
  $('list').setAttribute('aria-label', S.listLabel);
  $('f').add(new Option(S.all, ''));
  for (const k of STATUS_KEYS) $('f').add(new Option(S.statuses[k], k));
  const { applications } = await chrome.storage.local.get({ applications: [] });
  apps = Array.isArray(applications) ? applications : [];
  $('q').oninput = render; $('f').onchange = render;
  $('csv').onclick = () => {
    const blob = new Blob(['﻿' + toCsv(visible())], { type: 'text/csv;charset=utf-8' }); // BOM keeps Arabic readable in Excel
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'applications.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(S.exported);
  };
  render();
})();
