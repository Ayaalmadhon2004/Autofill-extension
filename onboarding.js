// First-run welcome page. All user-facing strings live in this one object (for translation later).
const T = {
  title: 'Welcome to One-Click Form Filler',
  stepOf: (n, total) => `Step ${n} of ${total}`,
  s1h: 'What it does', 
  s1a: 'It fills job, internship and application forms in one click, using a profile you write once. You can keep several profiles, for example English and Arabic.',
  s1b: 'Privacy promise: your data stays in this browser. Nothing is sent anywhere, and the extension never submits a form for you.',
  s2h: 'Create your first profile',
  s2a: 'Just the basics for now. You can add everything else later in Options. Leave a field empty to skip it.',
  lName: 'Full name', lEmail: 'Email', lPhone: 'Phone', lLinkedin: 'LinkedIn URL',
  saveError: 'Could not save. Please try again.',
  s3h: 'How to fill a form',
  s3: [
    'Open an application form, click the extension icon, then press "Fill this page".',
    'Or press Ctrl+Shift+F (Command+Shift+F on Mac) on the form page. The icon shows how many fields were filled.',
    'Review everything, then submit yourself.',
    'Updates: the extension updates itself from the Chrome Web Store. If you installed it from a folder, replace the files, then open chrome://extensions and press the reload button on this extension.'
  ],
  back: 'Back', next: 'Next', saveNext: 'Save and continue', finish: 'Finish and open my profile'
};
const $ = (id) => document.getElementById(id);
const TOTAL = 3;
let step = 1;

function show(n, moveFocus) {
  step = n;
  for (let i = 1; i <= TOTAL; i++) $('s' + i).hidden = i !== n;
  $('count').textContent = T.stepOf(n, TOTAL);
  $('back').hidden = n === 1;
  $('next').textContent = n === 2 ? T.saveNext : n === TOTAL ? T.finish : T.next;
  if (moveFocus) $('h' + n + 'a').focus(); // announce the new step to screen readers
}

// Save the typed details into the active profile. Never overwrites a stored value with an empty one.
async function saveProfile() {
  const v = Object.fromEntries(new FormData($('form')));
  const st = await loadState();
  const data = { ...st.profile.data };
  for (const [k, val] of Object.entries(v)) if (String(val).trim()) data[k] = String(val).trim();
  if (v.fullName && v.fullName.trim() && !st.profile.data.firstName && !st.profile.data.lastName) {
    const parts = v.fullName.trim().split(/\s+/); // so first/last-name fields on forms are filled too
    if (parts.length > 1) { data.firstName = parts[0]; data.lastName = parts.slice(1).join(' '); }
  }
  const profiles = st.profiles.map((p) => p.id === st.activeId ? { ...p, data } : p);
  await saveState({ profiles, activeId: st.activeId });
}

(async () => {
  document.title = T.title;
  $('t').textContent = T.title;
  $('h1a').textContent = T.s1h; $('s1a').textContent = T.s1a; $('s1b').textContent = T.s1b;
  $('h2a').textContent = T.s2h; $('s2a').textContent = T.s2a;
  $('lName').textContent = T.lName; $('lEmail').textContent = T.lEmail; $('lPhone').textContent = T.lPhone; $('lLinkedin').textContent = T.lLinkedin;
  $('h3a').textContent = T.s3h;
  for (const t of T.s3) { const li = document.createElement('li'); li.textContent = t; $('s3list').appendChild(li); }
  $('back').textContent = T.back;
  // prefill from the current profile so reopening the page never loses anything
  const { profile } = await loadState();
  for (const el of $('form').elements) if (el.name && profile.data[el.name]) el.value = profile.data[el.name];
  $('form').onsubmit = (e) => { e.preventDefault(); $('next').click(); };
  $('back').onclick = () => show(step - 1, true);
  $('next').onclick = async () => {
    if (step === 2) {
      if (!$('form').reportValidity()) return;
      try { await saveProfile(); } catch { $('msg').textContent = T.saveError; return; }
    }
    if (step === TOTAL) { chrome.runtime.openOptionsPage(); return; }
    show(step + 1, true);
  };
  show(1, false);
})();
