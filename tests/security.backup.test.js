// Backup: build (plain/encrypted), parse, merge, reminder schedule.  Run: node tests/security.backup.test.js
const assert = require('node:assert/strict');
const { loadExtension } = require('./helpers/load.js');

const P1 = { id: 'a', name: 'English', data: { firstName: 'Aya' }, custom: [{ match: 'q', value: 'v' }], experience: [{ company: 'Acme' }], education: [] };
const P2 = { id: 'b', name: 'Arabic', data: { firstName: 'آية' }, custom: [], experience: [], education: [{ school: 'MIT' }] };
const PASS = 'a long enough passphrase';
const DAY = 86400000;
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b)); // vm objects have another realm's prototypes
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const rejects = async (p, code) => { try { await p; } catch (e) { assert.equal(e.code, code, e.message); return; } assert.fail('expected ' + code); };
const mk = (local) => loadExtension(['security.js', 'runner.js'], { local });

(async () => {
  await t('plain backup holds ALL profiles', async () => {
    const S = mk({ profiles: [P1, P2] }).FormFillSecurity;
    const { file, encrypted } = await S.buildBackup([P1, P2], 'a', Date.UTC(2026, 0, 2));
    assert.equal(encrypted, false); assert.equal(file.encrypted, false); assert.equal(file.profiles.length, 2);
    assert.equal(file.exportedAt, '2026-01-02T00:00:00.000Z');
  });

  await t('with a passphrase the backup is encrypted: no plain text, opens with the passphrase only', async () => {
    const ctx = mk({ profiles: [P1, P2] }); const S = ctx.FormFillSecurity;
    await S.enable(PASS, [P1, P2]);
    const { file, encrypted } = await S.buildBackup([P1, P2], 'a');
    assert.equal(encrypted, true); assert.equal(file.encrypted, true);
    const text = JSON.stringify(file);
    for (const secret of ['Aya', 'Acme', 'MIT', 'آية']) assert.ok(!text.includes(secret), secret);
    assert.ok(file.iter >= 310000);
    const back = await S.parseBackup(text, PASS);
    assert.equal(back.length, 2); assert.equal(back[1].education[0].school, 'MIT');
    await rejects(S.parseBackup(text, 'wrong wrong wrong'), 'BAD_PASSPHRASE');
    await rejects(S.parseBackup(text, ''), 'NEED_PASSPHRASE');
    // a fresh install (other salt) can still read it with the passphrase, since salt/iter travel in the file
    const other = mk({}).FormFillSecurity;
    assert.equal((await other.parseBackup(text, PASS)).length, 2);
  });

  await t('locked + passphrase set: cannot build a backup', async () => {
    const ctx = mk({ profiles: [P1] }); await ctx.FormFillSecurity.enable(PASS, [P1]); await ctx.FormFillSecurity.lock();
    await rejects(ctx.FormFillSecurity.buildBackup([P1], 'a'), 'LOCKED');
  });

  await t('parseBackup accepts single exported profile, rejects junk, sanitises', async () => {
    const S = mk({}).FormFillSecurity;
    assert.equal((await S.parseBackup(JSON.stringify(P1), '')).length, 1);
    await rejects(S.parseBackup('not json', ''), 'BAD_FILE');
    await rejects(S.parseBackup('{"hello":1}', ''), 'BAD_FILE');
    await rejects(S.parseBackup('{"profiles":[]}', ''), 'BAD_FILE');
    const evil = '{"profiles":[{"id":"x","name":"E","data":{"__proto__":"p","ok":"1","obj":{"a":1}},"custom":[1,{"match":"m","value":"v"}],"experience":"nope"}]}';
    const [p] = await S.parseBackup(evil, '');
    same(p.data, { ok: '1' }); same(p.custom, [{ match: 'm', value: 'v' }]); same(p.experience, []);
    assert.equal(({}).p, undefined);
  });

  await t('mergeProfiles: adds new, skips identical, never overwrites a same-id profile', async () => {
    const S = mk({}).FormFillSecurity;
    const changed = { ...P1, data: { firstName: 'Changed' } };
    const r = S.mergeProfiles([P1], [P1, P2, changed]);
    assert.equal(r.added, 2); assert.equal(r.skipped, 1); assert.equal(r.profiles.length, 3);
    assert.equal(r.profiles[0].data.firstName, 'Aya'); // original untouched
    const ids = r.profiles.map((p) => p.id); assert.equal(new Set(ids).size, 3);
    assert.ok(r.profiles.some((p) => p.name === 'English (imported)' && p.data.firstName === 'Changed'));
  });

  await t('reminder: clock starts at first use, due after N days, snooze and done reset it', async () => {
    const ctx = mk({ profiles: [P1], settings: { overwrite: false } }); const S = ctx.FormFillSecurity;
    const t0 = Date.UTC(2026, 0, 1);
    assert.equal((await S.backupReminder([P1], t0)).due, false);               // first run: baseline only
    assert.equal((await S.backupReminder([P1], t0 + 13 * DAY)).due, false);
    const r = await S.backupReminder([P1], t0 + 14 * DAY); assert.equal(r.due, true); assert.equal(r.days, 14);
    await S.backupSnooze(t0 + 14 * DAY);
    assert.equal((await S.backupReminder([P1], t0 + 14.5 * DAY)).due, false);
    assert.equal((await S.backupReminder([P1], t0 + 15.1 * DAY)).due, true);
    await S.backupDone(t0 + 15.1 * DAY);
    assert.equal((await S.backupReminder([P1], t0 + 20 * DAY)).due, false);
    assert.equal((await S.backupReminder([P1], t0 + 29.2 * DAY)).due, true);
  });

  await t('reminder: setting is respected; 0 = never; empty profiles never nag', async () => {
    const S = mk({ settings: { backupEveryDays: 3, backupBaselineAt: 0 } }).FormFillSecurity;
    assert.equal((await S.backupReminder([P1], 3 * DAY)).due, true);
    assert.equal((await S.backupReminder([{ id: 'x', name: 'E', data: {}, custom: [] }], 99 * DAY)).due, false);
    const off = mk({ settings: { backupEveryDays: 0, backupBaselineAt: 0 } }).FormFillSecurity;
    assert.equal((await off.backupReminder([P1], 999 * DAY)).due, false);
  });

  await t('default interval is 14 days and old settings objects still load', async () => {
    const ctx = mk({ profiles: [P1], settings: { overwrite: true } });
    const s = (await ctx.loadState()).settings;
    assert.equal(s.backupEveryDays, 14); assert.equal(s.overwrite, true);
  });
  console.log(`\n${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
