// Load the extension's plain scripts into a Node vm context with a mocked chrome.storage (local + session).
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

function makeStorage(initial) {
  const data = Object.assign({}, initial);
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    data,
    async get(keys) {
      if (keys == null) return clone(data);
      if (typeof keys === 'string') keys = [keys];
      const out = {};
      if (Array.isArray(keys)) { for (const k of keys) if (k in data) out[k] = clone(data[k]); return out; }
      for (const [k, d] of Object.entries(keys)) out[k] = k in data ? clone(data[k]) : clone(d);
      return out;
    },
    async set(o) { for (const [k, v] of Object.entries(o)) data[k] = clone(v); },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; }
  };
}

function loadExtension(files, { local = {}, session = {}, tabs, scripting } = {}) {
  const chrome = { storage: { local: makeStorage(local), session: makeStorage(session) }, tabs, scripting };
  const ctx = vm.createContext({ chrome, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, console, URL, Date, JSON, setTimeout });
  ctx.self = ctx;
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'), ctx, { filename: f });
  return ctx;
}
module.exports = { loadExtension, makeStorage };
