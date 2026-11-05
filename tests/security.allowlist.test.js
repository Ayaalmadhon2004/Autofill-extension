// Site allowlist: pattern normalisation + matching + fill refusal.  Run: node tests/security.allowlist.test.js
const assert = require('node:assert/strict');
const { loadExtension } = require('./helpers/load.js');

const ctx = loadExtension(['i18n.js', 'security.js', 'runner.js'], {});
const S = ctx.FormFillSecurity;
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

(async () => {
  await t('normalizePattern accepts hosts, wildcards and pasted URLs', () => {
    assert.equal(S.normalizePattern('Example.COM'), 'example.com');
    assert.equal(S.normalizePattern('  *.Example.com  '), '*.example.com');
    assert.equal(S.normalizePattern('https://boards.greenhouse.io/acme/jobs/123?x=1#y'), 'boards.greenhouse.io');
    assert.equal(S.normalizePattern('http://user:pw@jobs.example.com:8080/a'), 'jobs.example.com');
    assert.equal(S.normalizePattern('localhost'), 'localhost');
    assert.equal(S.normalizePattern('example.com.'), 'example.com');
  });
  await t('normalizePattern rejects junk, bare TLDs and over-broad wildcards', () => {
    for (const bad of ['', '   ', '*', '*.', '*.com', 'com', 'exa*mple.com', 'a b.com', 'foo.*.com', '*example.com', '//', 'ex ample']) assert.equal(S.normalizePattern(bad), null, JSON.stringify(bad));
  });
  await t('hostMatches: exact vs wildcard', () => {
    assert.equal(S.hostMatches('example.com', 'example.com'), true);
    assert.equal(S.hostMatches('www.example.com', 'example.com'), false);
    assert.equal(S.hostMatches('www.example.com', '*.example.com'), true);
    assert.equal(S.hostMatches('a.b.example.com', '*.example.com'), true);
    assert.equal(S.hostMatches('example.com', '*.example.com'), true);
    assert.equal(S.hostMatches('badexample.com', '*.example.com'), false);
    assert.equal(S.hostMatches('example.com.evil.io', '*.example.com'), false);
    assert.equal(S.hostMatches('EXAMPLE.com', 'example.com'), true);
  });
  await t('checkSite: off means allowed; on means listed hosts only', () => {
    assert.equal(S.checkSite('https://anything.io/x', { allowlistEnabled: false, allowedSites: [] }).allowed, true);
    const on = { allowlistEnabled: true, allowedSites: ['careers.acme.com', '*.greenhouse.io', 'not a host'] };
    assert.equal(S.checkSite('https://careers.acme.com/apply', on).allowed, true);
    assert.equal(S.checkSite('https://boards.greenhouse.io/x', on).allowed, true);
    assert.equal(S.checkSite('https://evil.com/careers.acme.com', on).allowed, false);
    assert.equal(S.checkSite('https://acme.com/', on).allowed, false);
    assert.equal(S.checkSite('https://x.com/', { allowlistEnabled: true, allowedSites: [] }).allowed, false);
    assert.equal(S.checkSite('https://careers.acme.com:8443/', on).allowed, true);
  });

  const profiles = [{ id: 'default', name: 'English', data: { firstName: 'Aya' }, custom: [] }];
  const run = (settings, url) => {
    const executed = [];
    const c = loadExtension(['i18n.js', 'security.js', 'runner.js'], {
      local: { profiles, settings },
      tabs: { query: async () => [{ id: 1, url }] },
      scripting: { executeScript: async (o) => { executed.push(o); return o.files ? [] : [{ result: { filled: 1, fields: ['x'] } }]; } }
    });
    return c.fillActiveTab().then((r) => ({ r, executed, c }));
  };
  await t('fillActiveTab refuses other sites without injecting anything', async () => {
    const { r, executed } = await run({ overwrite: false, allowlistEnabled: true, allowedSites: ['careers.acme.com'] }, 'https://other.com/apply');
    assert.equal(r.blocked, true); assert.equal(r.host, 'other.com'); assert.match(r.error, /other\.com.*Only fill on these sites/);
    assert.equal(executed.length, 0);
  });
  await t('fillActiveTab fills allowed sites and everything when the list is off', async () => {
    assert.equal((await run({ overwrite: false, allowlistEnabled: true, allowedSites: ['*.acme.com'] }, 'https://careers.acme.com/a')).r.filled, 1);
    assert.equal((await run({ overwrite: false }, 'https://anywhere.org/a')).r.filled, 1); // old installs: no new keys at all
  });
  await t('allowHost adds once, normalised, and keeps other settings', async () => {
    const { c } = await run({ overwrite: true, allowlistEnabled: true, allowedSites: ['a.com'] }, 'https://a.com/');
    await c.FormFillSecurity.allowHost('Careers.Acme.com');
    await c.FormFillSecurity.allowHost('careers.acme.com');
    const s = (await c.loadState()).settings;
    assert.deepEqual(s.allowedSites, ['a.com', 'careers.acme.com']); assert.equal(s.overwrite, true); assert.equal(s.allowlistEnabled, true);
  });
  console.log(`\n${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
