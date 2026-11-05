// node tests/tracker.record.test.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
function env(initial) {
  const store = JSON.parse(JSON.stringify(initial || {}));
  const chrome = { storage: { local: {
    async get(d) { return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k in store ? store[k] : v])); },
    async set(o) { Object.assign(store, JSON.parse(JSON.stringify(o))); }
  } } };
  const ctx = vm.createContext({ chrome, URL, Date, Math, console });
  vm.runInContext(fs.readFileSync(__dirname + '/../runner.js', 'utf8'), ctx);
  return { store, run: (...a) => vm.runInContext('recordApplication', ctx)(...a) };
}
const tab = { url: 'https://jobs.example.com/apply/123?token=SECRET&x=1#section', title: 'Engineer - Example' };
(async () => {
  let e = env();
  await e.run(tab, 'default', 0, {});
  assert.equal(e.store.applications, undefined, '0 filled: nothing recorded');
  await e.run(tab, 'default', 5, { trackApplications: false });
  assert.equal(e.store.applications, undefined, 'setting off: nothing recorded');
  await e.run({ url: 'chrome://extensions', title: 'x' }, 'default', 5, {});
  assert.equal(e.store.applications, undefined, 'non-http ignored');

  await e.run(tab, 'default', 5, {}); // default ON (setting undefined)
  let a = e.store.applications;
  assert.equal(a.length, 1);
  assert.equal(a[0].url, 'https://jobs.example.com/apply/123', 'query + hash stripped');
  assert.equal(a[0].host, 'jobs.example.com');
  assert.equal(a[0].title, 'Engineer - Example');
  assert.equal(a[0].filledCount, 5);
  assert.equal(a[0].profileId, 'default');
  assert.equal(a[0].status, 'applied');
  assert.ok(a[0].id && a[0].date);

  a[0].status = 'interviewing'; a[0].notes = 'call Monday'; // user edits survive a re-fill
  e.store.applications = a;
  await e.run({ ...tab, url: 'https://jobs.example.com/apply/123?other=2' }, 'p2', 7, {});
  a = e.store.applications;
  assert.equal(a.length, 1, 'same url + same day deduped');
  assert.equal(a[0].filledCount, 7); assert.equal(a[0].profileId, 'p2');
  assert.equal(a[0].status, 'interviewing'); assert.equal(a[0].notes, 'call Monday');

  await e.run({ ...tab, url: 'https://jobs.example.com/apply/999' }, 'default', 2, {});
  assert.equal(e.store.applications.length, 2, 'different path = new entry');

  // same URL on another day = new entry
  e.store.applications.find((x) => x.url.endsWith('/123')).date = new Date(Date.now() - 3 * 864e5).toISOString();
  await e.run(tab, 'default', 3, {});
  assert.equal(e.store.applications.length, 3, 'same url other day = new entry');
  assert.ok(e.store.applications[0].date >= e.store.applications[1].date, 'newest first');

  // cap
  const old = Array.from({ length: 1000 }, (_, i) => ({ id: 'o' + i, url: 'https://x.com/' + i, host: 'x.com', title: 't', filledCount: 1, status: 'applied', notes: '', date: new Date(2020, 0, 1, 0, 0, i).toISOString() }));
  e = env({ applications: old });
  await e.run(tab, 'default', 4, {});
  assert.equal(e.store.applications.length, 1000, 'capped at 1000');
  assert.equal(e.store.applications[0].url, 'https://jobs.example.com/apply/123', 'newest kept');
  assert.ok(!e.store.applications.some((x) => x.id === 'o0'), 'oldest dropped');

  // never throws
  e = env(); e.store.applications = 'garbage';
  await e.run(tab, 'default', 1, {});
  await e.run({ url: 'not a url' }, 'default', 1, {});
  console.log('tracker.record: all assertions passed');
})().catch((err) => { console.error(err); process.exit(1); });
