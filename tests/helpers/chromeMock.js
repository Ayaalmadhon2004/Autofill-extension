// Playwright helper: gives extension pages (file://) a chrome.* mock backed by Node-side storage that survives reloads.
const path = require('node:path');
const root = path.join(__dirname, '..', '..');

async function installChrome(context, { local = {}, session = {}, tabUrl = 'https://example.com/apply' } = {}) {
  const stores = { local: { ...local }, session: { ...session } };
  const calls = { opened: 0, executed: [] };
  await context.exposeFunction('__store', (area, op, arg) => {
    const d = stores[area];
    const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
    if (op === 'get') {
      if (arg == null) return copy(d);
      const keys = typeof arg === 'string' ? [arg] : arg;
      const out = {};
      if (Array.isArray(keys)) { for (const k of keys) if (k in d) out[k] = copy(d[k]); return out; }
      for (const [k, def] of Object.entries(keys)) out[k] = k in d ? copy(d[k]) : copy(def);
      return out;
    }
    if (op === 'set') { for (const [k, v] of Object.entries(arg)) d[k] = copy(v); return; }
    if (op === 'remove') { for (const k of [].concat(arg)) delete d[k]; }
  });
  await context.exposeFunction('__calls', (what, arg) => { if (what === 'opened') calls.opened++; if (what === 'exec') calls.executed.push(arg); });
  await context.addInitScript((tabUrl) => {
    const area = (name) => ({
      get: (k) => window.__store(name, 'get', k), set: (o) => window.__store(name, 'set', o), remove: (k) => window.__store(name, 'remove', k)
    });
    window.chrome = {
      storage: { local: area('local'), session: area('session') },
      runtime: { openOptionsPage: () => window.__calls('opened') },
      tabs: { query: async () => [{ id: 7, url: tabUrl }] },
      scripting: {
        executeScript: async (o) => { window.__calls('exec', o.files ? o.files.join(',') : 'func'); return o.files ? [] : [{ result: { filled: 2, fields: ['a', 'b'] } }]; }
      }
    };
  }, tabUrl);
  return { stores, calls, url: (f) => 'file://' + path.join(root, f) };
}
module.exports = { installChrome };
