const path = require('path');
const root = path.join(__dirname, '..');
exports.root = root;
exports.launch = async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  return { browser, page: await browser.newPage() };
};
exports.inject = async (page, files) => { for (const f of files) await page.addScriptTag({ path: path.join(root, f) }); };
let fails = 0;
exports.check = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + JSON.stringify(extra))); };
exports.done = () => { console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0); };
