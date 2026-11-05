// Security helpers shared by popup, options and background (load before runner.js).
//  - Passphrase lock: profiles encrypted at rest with AES-GCM; key from PBKDF2-SHA256 (random salt, random IV per write).
//    The derived key is kept only in chrome.storage.session (cleared when the browser closes).
//    There is NO recovery: a forgotten passphrase means the encrypted data cannot be read.
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

  const api = {
    ITER, MIN_ITER, MIN_PASSPHRASE,
    deriveKey, createEnvelope, openEnvelope, sealWithKey, encryptWith, decryptWith,
    isEnabled, isLocked, lock, unlock, enable, change, disable, openVault, sealProfiles
  };
  root.FormFillSecurity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
