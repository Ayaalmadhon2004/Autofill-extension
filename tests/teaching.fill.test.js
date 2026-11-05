// Filler behaviour: yes/no robustness, common-question answers, priority order, EN + AR, regression on built-ins.
const { launch, inject, check, done } = require('./teaching.helpers');
const FILES = ['fields.js', 'questions.js', 'signature.js', 'filler.js'];
(async () => {
  const { browser, page } = await launch();
  const fill = async (html, profile, settings) => {
    await page.setContent(html); await inject(page, FILES);
    return page.evaluate(([p, s]) => window.__formFill.fill(p, s), [profile, settings || {}]);
  };
  const val = (sel) => page.$eval(sel, (e) => e.value);
  const chk = (sel) => page.$eval(sel, (e) => e.checked);

  // --- yesNo unit
  await page.setContent('<p></p>'); await inject(page, FILES);
  const yn = await page.evaluate(() => { const y = window.FORMFILL_SIG.yesNo; return ['Yes', 'no', 'No, I do not', 'نعم', 'لا', 'لا، لا أحتاج', 'Not applicable', 'know', 'None', 'No preference', 'N/A', 'Y', 'nope', 'لا ينطبق', 'I am not a veteran', 'Yes - I am', 'Notice'].map(y); });
  check('yesNo classification', JSON.stringify(yn) === JSON.stringify(['yes', 'no', 'no', 'yes', 'no', 'no', null, null, null, null, null, 'yes', 'no', null, null, 'yes', null]), yn);

  // --- radios: English, "no" must not hit "Not applicable"
  const radios = `<fieldset><legend>Do you require visa sponsorship?</legend>
    <label><input type=radio name=v value=na> Not applicable</label>
    <label><input type=radio name=v value=y> Yes</label>
    <label><input type=radio name=v value=n> No</label></fieldset>`;
  let r = await fill(radios, { data: {}, answers: { needsSponsorship: 'No' } });
  check('EN radio No -> "No" (not "Not applicable")', await chk('[value=n]') && !(await chk('[value=na]')) && !(await chk('[value=y]')), r);
  r = await fill(radios, { data: {}, answers: { needsSponsorship: 'Yes' } });
  check('EN radio Yes', await chk('[value=y]') && !(await chk('[value=n]')), r);

  // --- radios Arabic labels, answer in English and Arabic
  const arRadios = `<fieldset><legend>هل تحتاج إلى كفالة تأشيرة؟</legend>
    <label><input type=radio name=v value=1> نعم</label><label><input type=radio name=v value=0> لا</label></fieldset>`;
  r = await fill(arRadios, { data: {}, answers: { needsSponsorship: 'No' } });
  check('AR radio, answer "No" -> لا', await chk('[value="0"]') && !(await chk('[value="1"]')), r);
  r = await fill(arRadios, { data: {}, custom: [{ match: 'كفالة', value: 'نعم' }] });
  check('AR radio, custom rule answer نعم -> نعم', await chk('[value="1"]'), r);

  // --- select with yes/no incl. tricky options
  const sel = `<label for=s>Are you legally authorized to work in the US?</label><select id=s>
    <option value="">Select…</option><option>Not applicable</option><option>Yes</option><option>No</option></select>`;
  await fill(sel, { data: {}, answers: { authorizedToWork: 'No' } });
  check('select "No" picks No', (await val('#s')) === 'No', await val('#s'));
  const selAr = `<label for=s>هل أنت مصرح لك بالعمل قانونيا؟</label><select id=s><option value="">اختر</option><option value=y>نعم</option><option value=n>لا</option></select>`;
  await fill(selAr, { data: {}, answers: { authorizedToWork: 'Yes' } });
  check('AR select Yes -> نعم', (await val('#s')) === 'y', await val('#s'));
  const selKnow = `<label for=s>Are you 18 or older?</label><select id=s><option value="">-</option><option>I know</option><option>Not sure</option><option>Yes</option></select>`;
  await fill(selKnow, { data: {}, answers: { is18Plus: 'Yes' } });
  check('select Yes ignores "I know"', (await val('#s')) === 'Yes', await val('#s'));
  const selNoKnow = `<label for=s>Do you have a criminal record?</label><select id=s><option value="">-</option><option>I know</option><option>Not applicable</option></select>`;
  await fill(selNoKnow, { data: {}, answers: { criminalRecord: 'No' } });
  check('select No does not match know/not applicable', (await val('#s')) === '', await val('#s'));

  // --- checkboxes labelled Yes / No, English and Arabic
  const cbs = `<fieldset><legend>Are you willing to relocate?</legend><label><input type=checkbox id=cy> Yes</label><label><input type=checkbox id=cn> No</label></fieldset>`;
  await fill(cbs, { data: {}, answers: { willingToRelocate: 'No' } });
  check('checkbox pair: No checked, Yes not', (await chk('#cn')) && !(await chk('#cy')));
  await fill(cbs.replace('Yes', 'نعم').replace('No<', 'لا<'), { data: {}, answers: { willingToRelocate: 'Yes' } });
  check('AR checkbox pair: نعم checked', (await chk('#cy')) && !(await chk('#cn')));
  await fill('<label><input type=checkbox id=a> I agree to relocation terms</label>', { data: {}, custom: [{ match: 'relocation', value: 'Yes' }] });
  check('single checkbox + Yes', await chk('#a'));

  // --- common questions: EN/AR triggers on text inputs
  const text = (label, id) => `<label for=${id}>${label}</label><input id=${id}>`;
  const cases = [
    ['How did you hear about us?', 'howHeard', 'LinkedIn'], ['كيف سمعت عنا؟', 'howHeard', 'LinkedIn'],
    ['Veteran status', 'veteranStatus', 'No'], ['الخدمة العسكرية', 'veteranStatus', 'No'],
    ['Do you have a disability?', 'disabilityStatus', 'No'], ['هل لديك إعاقة', 'disabilityStatus', 'No'],
    ['Earliest start date', 'earliestStart', 'Immediately'], ['متى يمكنك البدء', 'earliestStart', 'Immediately'],
    ['Salary expectations', 'salaryExpectations', '50k'], ['الراتب المتوقع', 'salaryExpectations', '50k'],
    ['Remote or on-site preference', 'workPreference', 'Hybrid'], ['نمط العمل المفضل', 'workPreference', 'Hybrid'],
    ['Languages spoken', 'languagesSpoken', 'English, Arabic'], ['اللغات التي تتحدثها', 'languagesSpoken', 'English, Arabic'],
    ['Are you 18 years or older?', 'is18Plus', 'Yes'], ['هل عمرك فوق 18 سنة', 'is18Plus', 'Yes'],
    ['Have you ever been convicted of a crime / criminal record?', 'criminalRecord', 'No'], ['هل لديك سوابق جنائية', 'criminalRecord', 'No'],
    ['Are you willing to relocate?', 'willingToRelocate', 'Yes'], ['هل أنت مستعد للانتقال', 'willingToRelocate', 'Yes'],
    ['Legally authorized to work in the UK', 'authorizedToWork', 'Yes'], ['Will you require visa sponsorship?', 'needsSponsorship', 'No']
  ];
  for (const [label, key, ans] of cases) {
    await fill(text(label, 'q'), { data: {}, answers: { [key]: ans } });
    check(`question ${key} <- "${label}"`, (await val('#q')) === ans, await val('#q'));
  }
  await fill(text('Programming languages', 'q'), { data: {}, answers: { languagesSpoken: 'English' } });
  check('languages trigger excludes programming', (await val('#q')) === '');

  // --- priority: custom rule > common answer > built-in field
  const sal = text('Expected salary expectations', 'q');
  await fill(sal, { data: { salary: 'BUILTIN' }, answers: { salaryExpectations: 'ANSWER' }, custom: [{ match: 'salary', value: 'CUSTOM' }] });
  check('priority: custom wins', (await val('#q')) === 'CUSTOM', await val('#q'));
  await fill(sal, { data: { salary: 'BUILTIN' }, answers: { salaryExpectations: 'ANSWER' } });
  check('priority: answer beats built-in', (await val('#q')) === 'ANSWER', await val('#q'));
  await fill(sal, { data: { salary: 'BUILTIN' }, answers: {} });
  check('priority: built-in when no answer', (await val('#q')) === 'BUILTIN', await val('#q'));
  await fill(sal, { data: { salary: 'BUILTIN' }, answers: { salaryExpectations: '  ' } });
  check('blank answer ignored', (await val('#q')) === 'BUILTIN', await val('#q'));

  // --- regression: built-in English + Arabic forms, select/radio text answers
  const en = `<label>First name <input id=a></label><label>Email <input id=b></label><label>University <input id=c></label>
    <label>Gender <select id=d><option value="">-</option><option>Female</option><option>Male</option></select></label>
    <fieldset><legend>Work authorization</legend><label><input type=radio name=w value=a> US citizen</label><label><input type=radio name=w value=b> Visa holder</label></fieldset>`;
  r = await fill(en, { data: { firstName: 'Aya', email: 'a@b.co', university: 'MIT', gender: 'Female' }, custom: [{ match: 'work authorization', value: 'Visa holder' }] });
  check('EN regression', (await val('#a')) === 'Aya' && (await val('#b')) === 'a@b.co' && (await val('#c')) === 'MIT' && (await val('#d')) === 'Female' && (await chk('[value=b]')) && !(await chk('[value=a]')) && r.filled === 5, r);
  const ar = `<label>الاسم الأول <input id=a></label><label>البريد الإلكتروني <input id=b></label><label>الجامعة <input id=c></label><label>رقم الهاتف <input id=d></label>`;
  r = await fill(ar, { data: { firstName: 'آية', email: 'a@b.co', university: 'جامعة', phone: '123' } });
  check('AR regression', (await val('#a')) === 'آية' && (await val('#b')) === 'a@b.co' && (await val('#c')) === 'جامعة' && (await val('#d')) === '123' && r.filled === 4, r);

  await browser.close(); done();
})().catch((e) => { console.error(e); process.exit(1); });
