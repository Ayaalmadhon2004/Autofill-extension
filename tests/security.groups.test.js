// Pure logic: classification, index extraction, grouping, entry assignment.  Run: node tests/security.groups.test.js
const assert = require('node:assert/strict');
const G = require('../groups.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('classify recognises anchors and leaves ambiguity alone', () => {
  assert.equal(G.classify('experience 0 company company name'), 'company');
  assert.equal(G.classify('job title'), 'title');
  assert.equal(G.classify('position applied for'), null);
  assert.equal(G.classify('university'), 'school');
  assert.equal(G.classify('field of study'), 'major');
  assert.equal(G.classify('employer start date'), 'start'); // specific tier beats the anchor word
  assert.equal(G.classify('available start date'), null);
  assert.equal(G.classify('job description'), 'description');
  assert.equal(G.classify('company website'), null);
  assert.equal(G.classify('city'), null);
  assert.equal(G.classify('الجامعة'), 'school');
});

t('extractIndex handles [0], _1, -2-, trailing digits and labels', () => {
  assert.equal(G.extractIndex(['experience[0][company]', '', '']), 0);
  assert.equal(G.extractIndex(['company_1', '', '']), 1);
  assert.equal(G.extractIndex(['', 'workExperience-2--jobTitle', '']), 2);
  assert.equal(G.extractIndex(['employer3', '', '']), 3);
  assert.equal(G.extractIndex(['employer', '', 'Employer 2']), 2);
  assert.equal(G.extractIndex(['question_1234567', '', 'Company']), null);
  assert.equal(G.extractIndex(['company', 'company', 'Company']), null);
});

const mk = (kinds, extra) => kinds.map((kind, i) => ({ kind, idx: null, box: null, ...(extra ? extra(i) : {}) }));

t('sequential grouping splits when a kind repeats', () => {
  const g = G.groupFields(mk(['company', 'title', 'start', 'end', 'company', 'title', 'start', 'end', 'company', 'title']));
  assert.deepEqual(g.map((x) => x.section), ['experience', 'experience', 'experience']);
  assert.deepEqual(g.map((x) => x.members.length), [4, 4, 2]);
});

t('experience then education blocks split on section change', () => {
  const g = G.groupFields(mk(['company', 'title', 'school', 'degree', 'gradyear', 'gpa']));
  assert.deepEqual(g.map((x) => x.section), ['experience', 'education']);
  assert.deepEqual(g[1].members.map((m) => m.field), ['school', 'degree', 'year', 'gpa']);
});

t('education "end" maps to graduation year; stray start is dropped there', () => {
  const g = G.groupFields(mk(['school', 'start', 'end']));
  assert.deepEqual(g[0].members.map((m) => m.field), ['school', 'year']);
});

t('index strategy groups interleaved fields', () => {
  const g = G.groupFields([
    { kind: 'company', idx: 0 }, { kind: 'company', idx: 1 }, { kind: 'title', idx: 0 }, { kind: 'title', idx: 1 },
    { kind: 'school', idx: 0 }
  ]);
  // idx 0 has company + school: split into experience and education, never merged
  assert.equal(g.filter((x) => x.section === 'experience').length, 2);
  assert.equal(g.filter((x) => x.section === 'education').length, 1);
});

t('groups without an anchor are dropped', () => {
  assert.deepEqual(G.groupFields(mk(['start', 'end', 'description'])), []);
});

t('box strategy ignored when every field has its own wrapper', () => {
  const g = G.groupFields(mk(['company', 'title', 'company', 'title'], (i) => ({ box: 'b' + i })));
  assert.equal(g.length, 2); // fell back to sequential, still split correctly
});

const profile = { experience: [{ company: 'A', title: 'T1', start: '2022-01' }, { company: 'B', title: 'T2' }], education: [{ school: 'S', degree: 'BSc', year: '2020' }] };

t('assign maps N-th block to N-th entry, extra blocks skipped', () => {
  const groups = G.groupFields(mk(['company', 'title', 'company', 'title', 'company', 'title']));
  const a = G.assign(groups, profile);
  assert.deepEqual(a.map((x) => x.value), ['A', 'T1', 'B', 'T2', null, null]);
});

t('assign: single block uses first entry; empty field in single block is left to generic matching', () => {
  const a = G.assign(G.groupFields(mk(['company', 'title', 'end'])), profile);
  assert.deepEqual(a.map((x) => x.value), ['A', 'T1']);
});

t('assign: no stored entries means nothing is handled', () => {
  assert.deepEqual(G.assign(G.groupFields(mk(['company', 'title'])), { experience: [] }), []);
});

t('inputValue refuses formats a date/month input cannot take', () => {
  assert.equal(G.inputValue('month', '2022-05'), '2022-05');
  assert.equal(G.inputValue('month', 'Present'), null);
  assert.equal(G.inputValue('date', '2022-05'), null);
  assert.equal(G.inputValue('text', 'May 2022'), 'May 2022');
});

console.log(`\n${n} tests passed`);
