// Passphrase lock: crypto round trip, storage at rest, lock/unlock through runner.js.  Run: node tests/security.vault.test.js
const assert = require('node:assert/strict');
const { loadExtension } = require('./helpers/load.js');

const profiles = [{ id: 'default', name: 'English', data: { firstName: 'Aya', email: 'aya@example.com', fullName: 'ايا السر' }, custom: [{ match: 'secret-question', value: 'hunter2' }] }];
const PASS = 'correct horse battery';
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const rejects = async (p, code) => { try { await p; } catch (e) { assert.equal(e.code, code, e.message); return; } assert.fail('expected rejection ' + code); };

(async () => {
  const mk = (local) => loadExtension(['security.js', 'runner.js'], { local });
  const S = (ctx) => ctx.FormFillSecurity;

  await t('iteration count is at least 310000', () => { assert.ok(S(mk()).ITER >= 310000); assert.ok(S(mk()).MIN_ITER >= 310000); });

  await t('envelope round trip; wrong passphrase and tampering fail', async () => {
    const s = S(mk());
    const { env } = await s.createEnvelope(PASS, { a: 1, ar: 'مرحبا' });
    assert.equal(env.kdf, 'PBKDF2-SHA256'); assert.ok(env.iter >= 310000);
    assert.deepEqual((await s.openEnvelope(PASS, env)).data, { a: 1, ar: 'مرحبا' });
    await rejects(s.openEnvelope('wrong passphrase', env), 'BAD_PASSPHRASE');
    const ct = Buffer.from(env.ct, 'base64'); ct[0] ^= 1;
    await rejects(s.openEnvelope(PASS, { ...env, ct: ct.toString('base64') }), 'BAD_PASSPHRASE');
  });

  await t('fresh salt and IV every time', async () => {
    const s = S(mk());
    const a = (await s.createEnvelope(PASS, { x: 1 })).env, b = (await s.createEnvelope(PASS, { x: 1 })).env;
    assert.notEqual(a.salt, b.salt); assert.notEqual(a.iv, b.iv); assert.notEqual(a.ct, b.ct);
  });

  await t('refuses weak derivation parameters in a stored vault', async () => {
    const s = S(mk());
    const { env } = await s.createEnvelope(PASS, { x: 1 });
    await rejects(s.openEnvelope(PASS, { ...env, iter: 1000 }), 'BAD_VAULT');
  });

  await t('enable: no plain text at rest, session holds only the key', async () => {
    const ctx = mk({ profiles, activeId: 'default', settings: { overwrite: false } });
    await S(ctx).enable(PASS, profiles);
    const local = ctx.chrome.storage.local.data;
    assert.ok(!('profiles' in local) && !('profile' in local));
    const dump = JSON.stringify(local);
    for (const secret of ['Aya', 'aya@example.com', 'hunter2', 'secret-question']) assert.ok(!dump.includes(secret), secret);
    assert.ok(!JSON.stringify(ctx.chrome.storage.session.data).includes(PASS));
    const st = await ctx.loadState();
    assert.deepEqual(st.profiles, profiles); assert.equal(st.profile.id, 'default'); assert.equal(st.activeId, 'default');
  });

  await t('saveState writes encrypted; loadState reads back', async () => {
    const ctx = mk({ profiles, settings: { overwrite: false } });
    await S(ctx).enable(PASS, profiles);
    const edited = [{ ...profiles[0], data: { firstName: 'Zed' } }];
    await ctx.saveState({ profiles: edited, activeId: 'default' });
    assert.ok(!('profiles' in ctx.chrome.storage.local.data));
    assert.ok(!JSON.stringify(ctx.chrome.storage.local.data).includes('Zed'));
    assert.equal((await ctx.loadState()).profile.data.firstName, 'Zed');
  });

  await t('locked: loadState/saveState throw LOCKED, fillActiveTab reports locked, nothing overwritten', async () => {
    const ctx = mk({ profiles, settings: { overwrite: false } });
    ctx.chrome.tabs = { query: async () => [{ id: 1, url: 'https://example.com/apply' }] };
    await S(ctx).enable(PASS, profiles);
    const before = JSON.stringify(ctx.chrome.storage.local.data);
    await S(ctx).lock();
    assert.equal(await S(ctx).isLocked(), true);
    await rejects(ctx.loadState(), 'LOCKED');
    await rejects(ctx.saveState({ profiles: [] }), 'LOCKED');
    const r = await ctx.fillActiveTab();
    assert.equal(r.locked, true); assert.match(r.error, /Locked/);
    assert.equal(JSON.stringify(ctx.chrome.storage.local.data), before);
  });

  await t('unlock: wrong passphrase rejected, right one restores access', async () => {
    const ctx = mk({ profiles, settings: { overwrite: false } });
    await S(ctx).enable(PASS, profiles);
    await S(ctx).lock();
    await rejects(S(ctx).unlock('not the passphrase'), 'BAD_PASSPHRASE');
    assert.equal(await S(ctx).isLocked(), true);
    await S(ctx).unlock(PASS);
    assert.equal(await S(ctx).isLocked(), false);
    assert.deepEqual((await ctx.loadState()).profiles, profiles);
  });

  await t('change passphrase re-encrypts; old one stops working', async () => {
    const ctx = mk({ profiles, settings: { overwrite: false } });
    await S(ctx).enable(PASS, profiles);
    await rejects(S(ctx).change('bad old pass', 'brand new pass'), 'BAD_PASSPHRASE');
    await rejects(S(ctx).change(PASS, 'short'), 'WEAK');
    await S(ctx).change(PASS, 'brand new pass');
    await S(ctx).lock();
    await rejects(S(ctx).unlock(PASS), 'BAD_PASSPHRASE');
    await S(ctx).unlock('brand new pass');
    assert.deepEqual((await ctx.loadState()).profiles, profiles);
  });

  await t('disable restores plain profiles and clears the key', async () => {
    const ctx = mk({ profiles, settings: { overwrite: false } });
    await S(ctx).enable(PASS, profiles);
    await rejects(S(ctx).disable('bad pass word'), 'BAD_PASSPHRASE');
    await S(ctx).disable(PASS);
    assert.ok(!('vault' in ctx.chrome.storage.local.data));
    assert.deepEqual(ctx.chrome.storage.local.data.profiles, profiles);
    assert.deepEqual((await ctx.loadState()).profiles, profiles);
    assert.equal(await S(ctx).isEnabled(), false);
  });

  await t('no passphrase: behaviour unchanged (legacy migration, settings, return shape)', async () => {
    const ctx = mk({ profile: { data: { firstName: 'Old' }, custom: [] } });
    const st = await ctx.loadState();
    assert.deepEqual(Object.keys(st).sort(), ['activeId', 'profile', 'profiles', 'settings']);
    assert.equal(st.profile.data.firstName, 'Old');
    await ctx.saveState({ profiles: st.profiles, activeId: st.activeId });
    assert.equal(ctx.chrome.storage.local.data.profiles[0].data.firstName, 'Old');
  });

  console.log(`\n${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
