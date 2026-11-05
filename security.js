// Security helpers shared by popup, options and background (load before runner.js).
//  - Passphrase lock: profiles encrypted at rest with AES-GCM; key from PBKDF2-SHA256 (random salt, random IV per write).
//    The derived key is kept only in chrome.storage.session (cleared when the browser closes).
//    There is NO recovery: a forgotten passphrase means the encrypted data cannot be read.
//  - Site allowlist: optional "only fill on these sites" setting, matched on the tab's hostname.
//  - Backup: one JSON file with ALL profiles, encrypted when a passphrase is set; merge-import; periodic reminder.
// Nothing here sends data anywhere.
(function (root) {
  const ITER = 600000; // PBKDF2-SHA256 iterations for new vaults (never below 310000)
  const MIN_ITER = 310000;
  const MIN_PASSPHRASE = 8;
  const SESSION_KEY = 'vaultKey';

  const err = (code, message) => Object.assign(new Error(message), { code });
  const webcrypto = () => root.crypto || globalThis.crypto;
  const subtle = () => webcrypto().subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rand = (n) => webcrypto().getRandomValues(new Uint8Array(n));

  // ---- crypto primitives (pure: no chrome.* here) -------------------------------------------------
  async function deriveKey(passphrase, salt, iter) {
    if (!(iter >= MIN_ITER)) throw err('BAD_VAULT', 'Unsupported key derivation settings');
    const base = await subtle().importKey('raw', enc.encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  const exportKey = async (key) => b64(await subtle().exportKey('raw', key));
  const importKey = (s) => subtle().importKey('raw', unb64(s), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

  async function encryptWith(key, obj) {
    const iv = rand(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function decryptWith(key, box) {
    try {
      const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
      return JSON.parse(dec.decode(pt));
    } catch { throw err('BAD_PASSPHRASE', 'Wrong passphrase, or the data was changed.'); }
  }
  // Envelope = { v, kdf, iter, salt, iv, ct }. New passphrase => new random salt.
  async function createEnvelope(passphrase, obj, iter) {
    const salt = rand(16), it = iter || ITER;
    const key = await deriveKey(passphrase, salt, it);
    return { env: Object.assign({ v: 1, kdf: 'PBKDF2-SHA256', iter: it, salt: b64(salt) }, await encryptWith(key, obj)), key };
  }
  async function openEnvelope(passphrase, env) {
    const key = await deriveKey(passphrase, unb64(env.salt), env.iter);
    return { data: await decryptWith(key, env), key };
  }
  // Re-encrypt with an already derived key: same salt/iter, fresh IV.
  async function sealWithKey(key, env, obj) {
    return Object.assign({ v: env.v, kdf: env.kdf, iter: env.iter, salt: env.salt }, await encryptWith(key, obj));
  }
  function checkPassphrase(p) {
    if (typeof p !== 'string' || p.length < MIN_PASSPHRASE) throw err('WEAK', 'Use at least ' + MIN_PASSPHRASE + ' characters.');
  }

  // ---- vault state (chrome.storage) ----------------------------------------------------------------
  const getVault = async () => (await chrome.storage.local.get({ vault: null })).vault;
  const sessionStore = () => { if (!chrome.storage.session) throw err('NO_SESSION', 'This browser version cannot keep the unlock key for the session.'); return chrome.storage.session; };
  async function sessionKey() {
    if (!chrome.storage.session) return null;
    const k = (await chrome.storage.session.get({ [SESSION_KEY]: null }))[SESSION_KEY];
    return k ? importKey(k) : null;
  }
  const setSessionKey = async (key) => sessionStore().set({ [SESSION_KEY]: await exportKey(key) });

  const isEnabled = async () => !!(await getVault());
  async function isLocked() { return !!(await getVault()) && !(await sessionKey()); }
  async function lock() { if (chrome.storage.session) await chrome.storage.session.remove(SESSION_KEY); }

  // Decrypt the stored profiles; throws {code:'LOCKED'} when there is no (valid) session key.
  async function openVault(vault) {
    const key = await sessionKey();
    if (!key) throw err('LOCKED', 'Profiles are locked. Enter your passphrase.');
    try { return (await decryptWith(key, vault)).profiles; } catch { await lock(); throw err('LOCKED', 'Profiles are locked. Enter your passphrase.'); }
  }
  async function sealProfiles(vault, profiles) {
    const key = await sessionKey();
    if (!key) throw err('LOCKED', 'Profiles are locked. Enter your passphrase.');
    return sealWithKey(key, vault, { profiles });
  }
  async function unlock(passphrase) {
    const vault = await getVault();
    if (!vault) return;
    const { key } = await openEnvelope(passphrase, vault);
    await setSessionKey(key);
  }
  async function enable(passphrase, profiles) {
    checkPassphrase(passphrase);
    const { env, key } = await createEnvelope(passphrase, { profiles });
    await setSessionKey(key);
    await chrome.storage.local.set({ vault: env });
    await chrome.storage.local.remove(['profiles', 'profile']); // no plain-text copy left behind
  }
  async function change(oldPassphrase, newPassphrase) {
    checkPassphrase(newPassphrase);
    const vault = await getVault();
    const { data } = await openEnvelope(oldPassphrase, vault);
    const { env, key } = await createEnvelope(newPassphrase, data);
    await setSessionKey(key);
    await chrome.storage.local.set({ vault: env });
  }
  async function disable(passphrase) {
    const vault = await getVault();
    const { data } = await openEnvelope(passphrase, vault);
    await chrome.storage.local.set({ profiles: data.profiles });
    await chrome.storage.local.remove('vault');
    await lock();
  }

  // ---- settings (plain text; nothing secret) ---------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    overwrite: false, allowlistEnabled: false, allowedSites: [],
    backupEveryDays: 14, lastBackupAt: null, backupBaselineAt: null, backupSnoozeUntil: 0
  };
  async function updateSettings(fn) { // read-modify-write so independent features never clobber each other's keys
    const cur = Object.assign({}, DEFAULT_SETTINGS, (await chrome.storage.local.get({ settings: null })).settings);
    const next = fn(cur) || cur;
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  // ---- site allowlist ---------------------------------------------------------------------------------------
  // Accepts "example.com", "*.example.com", or a pasted URL. Returns a normalised pattern or null if unusable.
  // "example.com" matches only that host. "*.example.com" matches example.com and every subdomain.
  function normalizePattern(input) {
    let s = String(input == null ? '' : input).trim().toLowerCase();
    if (!s) return null;
    s = s.replace(/^[a-z][a-z0-9+.\-]*:\/\//, '').split(/[\/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
    const wild = s.startsWith('*.');
    if (wild) s = s.slice(2);
    if (!s || s.includes('*') || !/^[^\s!"#$%&'()+,/:;<=>?@[\\\]^`{|}~]+$/.test(s)) return null;
    let host;
    try { host = new URL('http://' + s).hostname; } catch { return null; }
    if (host !== 'localhost' && !/\./.test(host)) return null;
    if (wild && host.split('.').length < 2) return null;
    return (wild ? '*.' : '') + host;
  }
  function hostMatches(host, pattern) {
    host = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!host || !pattern) return false;
    return pattern.startsWith('*.') ? host === pattern.slice(2) || host.endsWith(pattern.slice(1)) : host === pattern;
  }
  // { allowed, host }. Allowed unless the allowlist is on and the tab's host is not on it.
  function checkSite(url, settings) {
    let host = '';
    try { host = new URL(url).hostname; } catch { /* not a URL */ }
    if (!settings || !settings.allowlistEnabled) return { allowed: true, host };
    const list = (settings.allowedSites || []).map(normalizePattern).filter(Boolean);
    return { allowed: !!host && list.some((p) => hostMatches(host, p)), host };
  }
  const siteRefusal = (host) => 'Not filled: ' + (host || 'this site') + ' is not on your "Only fill on these sites" list.';
  async function allowHost(host) { // popup: "Always allow this site"
    const p = normalizePattern(host);
    if (!p) throw err('BAD_SITE', 'Cannot allow this site.');
    return updateSettings((s) => { if (!s.allowedSites.some((x) => normalizePattern(x) === p)) s.allowedSites = [...s.allowedSites, p]; return s; });
  }

  // ---- backup ---------------------------------------------------------------------------------------------------
  const DAY = 86400000;
  const BACKUP_APP = 'one-click-form-filler';
  const hasData = (p) => !!(p && ((p.data && Object.keys(p.data).length) || (p.custom && p.custom.length) || (p.experience && p.experience.length) || (p.education && p.education.length)));

  // Build the backup object for all profiles. Encrypted with the vault key when a passphrase is set
  // (same salt/iterations, fresh IV, so the same passphrase opens it); otherwise plain text.
  async function buildBackup(profiles, activeId, now) {
    const head = { app: BACKUP_APP, kind: 'backup', version: 1, exportedAt: new Date(now || Date.now()).toISOString() };
    const payload = { profiles, activeId };
    const vault = await getVault();
    if (!vault) return { file: Object.assign(head, { encrypted: false }, payload), encrypted: false };
    const key = await sessionKey();
    if (!key) throw err('LOCKED', 'Profiles are locked. Enter your passphrase.');
    return { file: Object.assign(head, { encrypted: true }, await sealWithKey(key, vault, payload)), encrypted: true };
  }

  const safeKey = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
  function cleanProfile(p, i) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const data = {};
    for (const [k, v] of Object.entries(p.data && typeof p.data === 'object' ? p.data : {})) if (safeKey(k) && ['string', 'number'].includes(typeof v)) data[k] = String(v);
    const rows = (a) => (Array.isArray(a) ? a : []).filter((e) => e && typeof e === 'object').map((e) => {
      const o = {}; for (const [k, v] of Object.entries(e)) if (safeKey(k) && ['string', 'number'].includes(typeof v)) o[k] = String(v); return o;
    });
    const custom = (Array.isArray(p.custom) ? p.custom : []).filter((r) => r && typeof r.match === 'string' && typeof r.value === 'string').map((r) => ({ match: r.match, value: r.value }));
    return { id: typeof p.id === 'string' && p.id ? p.id : 'imp' + Date.now() + '-' + i, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Imported',
      data, custom, experience: rows(p.experience), education: rows(p.education) };
  }
  // Accepts a backup file (plain or encrypted) or a single exported profile. Returns clean profiles.
  async function parseBackup(text, passphrase) {
    let obj;
    try { obj = JSON.parse(text); } catch { throw err('BAD_FILE', 'This is not a JSON file.'); }
    if (!obj || typeof obj !== 'object') throw err('BAD_FILE', 'This is not a backup file.');
    if (obj.app === BACKUP_APP && obj.kind === 'backup' && obj.encrypted) {
      if (!passphrase) throw err('NEED_PASSPHRASE', 'This backup is encrypted. Enter its passphrase first.');
      obj = (await openEnvelope(passphrase, obj)).data;
    }
    const list = Array.isArray(obj.profiles) ? obj.profiles : obj.data && typeof obj.data === 'object' ? [obj] : null;
    if (!list) throw err('BAD_FILE', 'No profiles found in this file.');
    const profiles = list.map(cleanProfile).filter(Boolean);
    if (!profiles.length) throw err('BAD_FILE', 'No profiles found in this file.');
    return profiles;
  }
  // Merge incoming into existing without losing or overwriting anything.
  function mergeProfiles(existing, incoming) {
    const out = existing.slice(), ids = new Set(existing.map((p) => p.id));
    const body = (p) => JSON.stringify([p.name, p.data, p.custom || [], p.experience || [], p.education || []]);
    let added = 0, skipped = 0;
    incoming.forEach((p, i) => {
      if (out.some((e) => body(e) === body(p))) { skipped++; return; } // already here
      let q = p;
      if (ids.has(p.id)) q = Object.assign({}, p, { id: 'imp' + Date.now() + '-' + i, name: p.name + ' (imported)' });
      ids.add(q.id); out.push(q); added++;
    });
    return { profiles: out, added, skipped };
  }

  // Reminder: due every `backupEveryDays` (0 = never) once there is something worth saving.
  // The clock starts the first time this runs, so a new install is not nagged at once.
  async function backupReminder(profiles, now) {
    now = now || Date.now();
    let s = Object.assign({}, DEFAULT_SETTINGS, (await chrome.storage.local.get({ settings: null })).settings);
    if (s.backupBaselineAt == null) s = await updateSettings((x) => { x.backupBaselineAt = now; return x; });
    const days = Number(s.backupEveryDays);
    if (!(days > 0) || !profiles.some(hasData) || now < (s.backupSnoozeUntil || 0)) return { due: false };
    const since = now - (s.lastBackupAt != null ? s.lastBackupAt : s.backupBaselineAt);
    return { due: since >= days * DAY, days: Math.floor(since / DAY) };
  }
  const backupDone = (now) => updateSettings((s) => { s.lastBackupAt = now || Date.now(); s.backupSnoozeUntil = 0; return s; });
  const backupSnooze = (now) => updateSettings((s) => { s.backupSnoozeUntil = (now || Date.now()) + DAY; return s; });

  // Download from an extension page with <a download> (no `downloads` permission needed).
  function downloadJson(obj, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  async function downloadBackup(profiles, activeId) { // returns { encrypted }
    const { file, encrypted } = await buildBackup(profiles, activeId);
    downloadJson(file, 'form-filler-backup-' + file.exportedAt.slice(0, 10) + (encrypted ? '-encrypted' : '') + '.json');
    await backupDone();
    return { encrypted };
  }

  const api = {
    buildBackup, parseBackup, mergeProfiles, backupReminder, backupDone, backupSnooze, downloadBackup, hasData,
    DEFAULT_SETTINGS, updateSettings, normalizePattern, hostMatches, checkSite, siteRefusal, allowHost,
    ITER, MIN_ITER, MIN_PASSPHRASE,
    deriveKey, createEnvelope, openEnvelope, sealWithKey, encryptWith, decryptWith,
    isEnabled, isLocked, lock, unlock, enable, change, disable, openVault, sealProfiles
  };
  root.FormFillSecurity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
