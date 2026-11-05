// AI suggest, service-worker side (ai.js): gating, exact request contents, errors, cap, key storage. NEVER hits the network:
// global fetch is mocked and the key is fake.   Run: node tests/ai.core.test.js
const vm = require('node:vm');
const { loadExtension } = require('./helpers/load.js');
const { check, done } = require('./teaching.helpers');

const KEY = 'sk-ant-FAKE-test-key-0000';
const EMAIL = 'aya.private@example.org', PHONE = '+44 7700 900123', ADDRESS = '12 Secret Lane';
const profile = {
  id: 'p1', name: 'English', custom: [],
  data: { firstName: 'Aya', email: EMAIL, phone: PHONE, address: ADDRESS, city: 'Cairo', summary: 'Backend engineer who loves tidy APIs. Reach me at ' + EMAIL + ' or ' + PHONE + '.',
    currentTitle: 'Software Engineer', currentCompany: 'SecretCorp', yearsExperience: '4', university: 'Cairo University', degree: 'BSc', major: 'CS', gradYear: '2020', coverLetter: 'COVERLETTER-SENTINEL' },
  education: [{ school: 'Cairo University', degree: 'BSc', major: 'Computer Science', year: '2020', gpa: '3.9-GPA' }],
  experience: [{ company: 'Acme', title: 'Developer', start: '2020-01', end: '2023-06', description: 'Built payment APIs. Phone ' + PHONE }]
};
const ALL = { summary: true, currentTitle: true, yearsExperience: true, education: true, experience: true };
const NONE = { summary: false, currentTitle: false, yearsExperience: false, education: false, experience: false };

function boot({ settings, key, perm = true, extra = {} } = {}) {
  const local = Object.assign({ profiles: [profile], activeId: 'p1' }, extra);
  if (settings) local.aiSettings = settings;
  if (key) local.aiKey = key;
  const ctx = loadExtension(['security.js', 'runner.js', 'ai.js'], { local });
  const log = { fetches: [], permChecks: 0 };
  ctx.chrome.permissions = { contains: async () => { log.permChecks++; return perm; } };
  ctx.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Draft answer.' }] }) });
  ctx.fetch = (url, init) => { log.fetches.push({ url, init }); return ctx.fetchImpl(url, init); };
  return { ctx, log, ai: ctx.FormFillAI, local: ctx.chrome.storage.local.data };
}
const on = (include) => ({ enabled: true, consent: true, model: 'claude-haiku-5-5', include });
const msg = { question: 'Why do you want to work here?', page: { jobTitle: 'Backend Developer', company: 'Globex' } };

(async () => {
  // ---- nothing is sent when off / no consent / no permission / no key
  let t = boot({ key: { plain: KEY } });
  let r = await t.ai.draft(msg);
  check('default (no settings): refused, nothing sent', r.ok === false && /consent/i.test(r.error) && t.log.fetches.length === 0, r);
  t = boot({ settings: { enabled: true, consent: false, include: ALL }, key: { plain: KEY } });
  r = await t.ai.draft(msg);
  check('enabled but no consent: refused, nothing sent', r.ok === false && /consent/i.test(r.error) && t.log.fetches.length === 0, r);
  t = boot({ settings: { enabled: false, consent: true, include: ALL }, key: { plain: KEY } });
  r = await t.ai.draft(msg);
  check('consent but switched off: refused, nothing sent', r.ok === false && /off/i.test(r.error) && t.log.fetches.length === 0, r);
  t = boot({ settings: on(ALL), key: { plain: KEY }, perm: false });
  r = await t.ai.draft(msg);
  check('host permission missing: readable message, nothing sent', r.ok === false && /Permission to contact api\.anthropic\.com is missing/.test(r.error) && t.log.fetches.length === 0, r);
  t = boot({ settings: on(ALL) });
  r = await t.ai.draft(msg);
  check('no key: readable message, nothing sent', r.ok === false && /No API key/.test(r.error) && t.log.fetches.length === 0, r);

  // ---- the request itself
  t = boot({ settings: on(ALL), key: { plain: KEY } });
  r = await t.ai.draft(msg);
  const f = t.log.fetches[0];
  const body = JSON.parse(f.init.body);
  const sent = JSON.stringify(f);
  check('success returns the draft', r.ok === true && r.text === 'Draft answer.', r);
  check('exactly one request, to the Messages endpoint, POST', t.log.fetches.length === 1 && f.url === 'https://api.anthropic.com/v1/messages' && f.init.method === 'POST', f.url);
  check('required headers', f.init.headers['x-api-key'] === KEY && f.init.headers['anthropic-version'] === '2023-06-01' && f.init.headers['content-type'] === 'application/json' && f.init.headers['anthropic-dangerous-direct-browser-access'] === 'true', f.init.headers);
  check('only the 4 expected headers', Object.keys(f.init.headers).length === 4, Object.keys(f.init.headers));
  check('model + max_tokens + system prompt', body.model === 'claude-haiku-5-5' && body.max_tokens === 400 && /ONLY the facts/.test(body.system) && /\[needs your input\]/.test(body.system) && /same language/.test(body.system), body);
  check('credentials omitted (no cookies)', f.init.credentials === 'omit');
  const user = body.messages[0].content;
  check('body has question + page job title/company', /Why do you want to work here\?/.test(user) && /Backend Developer/.test(user) && /Globex/.test(user), user);
  check('body has ticked parts (bio, title, years, education, experience)', /tidy APIs/.test(user) && /Software Engineer/.test(user) && /Years of experience: 4/.test(user) && /Computer Science/.test(user) && /payment APIs/.test(user) && /Acme/.test(user), user);
  check('NO email / phone / address anywhere in the request (even typed into bio / description)', ![EMAIL, '7700 900123', ADDRESS, 'aya.private'].some((x) => sent.includes(x)), user);
  check('other profile fields never sent (cover letter, current company, city, name, gpa)', !/COVERLETTER|SecretCorp|Cairo,|"?firstName|3\.9-GPA/.test(user) && !/Aya\b/.test(user.replace(/aya\./gi, '')), user);
  check('API key only in the x-api-key header, not in the body', !f.init.body.includes(KEY));

  // ---- parts that are not ticked are not sent
  t = boot({ settings: on(NONE), key: { plain: KEY } });
  await t.ai.draft(msg);
  const u0 = JSON.parse(t.log.fetches[0].init.body).messages[0].content;
  check('nothing ticked: only question + page text, "(none shared)"', /none shared/.test(u0) && !/tidy APIs|Software Engineer|Years of|Cairo University|Acme/.test(u0), u0);
  t = boot({ settings: on(Object.assign({}, NONE, { currentTitle: true })), key: { plain: KEY } });
  await t.ai.draft(msg);
  const u1 = JSON.parse(t.log.fetches[0].init.body).messages[0].content;
  check('only "current title" ticked: only the title is sent', /Software Engineer/.test(u1) && !/tidy APIs|Years of|Cairo University|Acme/.test(u1), u1);
  t = boot({ settings: Object.assign(on(ALL), { model: 'claude-custom-9' }), key: { plain: KEY } });
  await t.ai.draft(msg);
  check('model name from settings is used', JSON.parse(t.log.fetches[0].init.body).model === 'claude-custom-9');
  t = boot({ settings: Object.assign(on(ALL), { model: 'bad model;"' }), key: { plain: KEY } });
  await t.ai.draft(msg);
  check('invalid model name falls back to default', JSON.parse(t.log.fetches[0].init.body).model === 'claude-haiku-5-5');

  // ---- errors
  const errCase = async (name, impl, re) => {
    const b = boot({ settings: on(ALL), key: { plain: KEY } });
    b.ctx.fetchImpl = impl;
    const x = await b.ai.draft(msg);
    check(name, x.ok === false && re.test(x.error) && !x.error.includes(KEY), x);
  };
  await errCase('401 -> key rejected message', async () => ({ ok: false, status: 401 }), /rejected the API key/);
  await errCase('429 -> rate limit message', async () => ({ ok: false, status: 429 }), /Rate limit/);
  await errCase('404 -> model message', async () => ({ ok: false, status: 404 }), /model/i);
  await errCase('500 -> temporarily unavailable', async () => ({ ok: false, status: 500 }), /temporarily unavailable \(500\)/);
  await errCase('network failure -> readable', async () => { throw new TypeError('Failed to fetch'); }, /Could not reach api\.anthropic\.com/);
  await errCase('empty reply -> readable', async () => ({ ok: true, status: 200, json: async () => ({ content: [] }) }), /no text/);

  // ---- session cap
  t = boot({ settings: on(ALL), key: { plain: KEY } });
  for (let i = 0; i < 30; i++) await t.ai.draft(msg);
  r = await t.ai.draft(msg);
  check('31st request refused by the in-memory cap; only 30 fetches made', r.ok === false && /Session limit reached \(30/.test(r.error) && t.log.fetches.length === 30, [r, t.log.fetches.length]);
  t.ai._resetSession();
  r = await t.ai.draft(msg);
  check('cap resets with a new session', r.ok === true);

  // ---- test connection: fixed ping, no profile / page data
  t = boot({ settings: { enabled: false, consent: false, model: 'claude-haiku-5-5', include: ALL }, key: { plain: KEY } });
  r = await t.ai.test();
  const tb = JSON.parse(t.log.fetches[0].init.body);
  check('test connection works even before enabling; sends no profile data', r.ok === true && tb.max_tokens === 16 && tb.messages[0].content === 'Reply with the single word: OK' && !JSON.stringify(tb).match(/Aya|Cairo|Acme|example\.org/), tb);
  t = boot({ settings: on(ALL), key: { plain: KEY }, perm: false });
  r = await t.ai.test();
  check('test connection without permission: readable error', r.ok === false && /Permission/.test(r.error) && t.log.fetches.length === 0, r);

  // ---- empty question
  t = boot({ settings: on(ALL), key: { plain: KEY } });
  r = await t.ai.draft({ question: '  ', page: {} });
  check('empty question: no request', r.ok === false && t.log.fetches.length === 0, r);

  // ---- key storage: plain without a lock, sealed with a lock; locked -> readable error
  t = boot({ settings: on(ALL) });
  let st = await t.ai.saveKey(KEY);
  check('no passphrase: key stored plain (and status says so)', st.protected === false && t.local.aiKey.plain === KEY && (await t.ai.keyStatus()).protected === false);
  check('keyStatus never exposes the key', !JSON.stringify(await t.ai.keyStatus()).includes(KEY));
  let bad = null; try { await t.ai.saveKey('has space'); } catch (e) { bad = e; }
  check('invalid key rejected', bad && bad.code === 'BAD_KEY');
  await t.ai.removeKey();
  check('Remove key deletes it', !('aiKey' in t.local) && (await t.ai.keyStatus()).saved === false);

  t = boot({ settings: on(ALL) });
  await vm.runInContext('FormFillSecurity', t.ctx).enable('correct horse battery', [profile]);
  st = await t.ai.saveKey(KEY);
  check('with passphrase lock: key sealed, not readable in storage', st.protected === true && t.local.aiKey.sealed && !JSON.stringify(t.local.aiKey).includes(KEY) && !('plain' in t.local.aiKey), t.local.aiKey);
  r = await t.ai.draft(msg);
  check('sealed key works while unlocked', r.ok === true && t.log.fetches[0].init.headers['x-api-key'] === KEY, r);
  await vm.runInContext('FormFillSecurity', t.ctx).lock();
  const before = t.log.fetches.length;
  r = await t.ai.draft(msg);
  check('locked: readable message, nothing sent', r.ok === false && /Locked/.test(r.error) && t.log.fetches.length === before, r);
  let lockedSave = null; try { await t.ai.saveKey(KEY); } catch (e) { lockedSave = e; }
  check('cannot save a key while locked (no silent plain-text fallback)', lockedSave && lockedSave.code === 'LOCKED');

  // ---- no telemetry: ai.js only ever references api.anthropic.com
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'ai.js'), 'utf8');
  const hosts = [...src.matchAll(/https?:\/\/[^\s'"*/]+/g)].map((m) => m[0]);
  check('ai.js mentions no host other than api.anthropic.com', hosts.length > 0 && hosts.every((h) => h === 'https://api.anthropic.com'), hosts);
  done();
})().catch((e) => { console.error(e); process.exit(1); });
