// "Common questions" section of the options page: one answer per question per profile, stored in profile.answers.
// Self-contained: options.js only calls renderAnswers(profile) and collectAnswers().
(function () {
  function renderAnswers(profile) {
    const host = document.getElementById('answers'); host.textContent = '';
    const saved = profile.answers || {};
    window.FORMFILL_QUESTIONS.forEach((q, i) => {
      const lab = document.createElement('label'); lab.textContent = q.label;
      let input;
      if (q.kind === 'yesno') {
        input = document.createElement('select');
        for (const [v, t] of [['', 'No answer (skip)'], ['Yes', 'Yes'], ['No', 'No']]) input.add(new Option(t, v));
      } else {
        input = document.createElement('input'); input.type = 'text'; input.dir = 'auto';
        if (q.suggestions) {
          const dl = document.createElement('datalist'); dl.id = 'qs-' + q.key;
          for (const s of q.suggestions) dl.appendChild(new Option(s));
          input.setAttribute('list', dl.id); lab.appendChild(dl);
        }
      }
      input.name = q.key; input.value = saved[q.key] || '';
      lab.appendChild(input); host.appendChild(lab);
    });
  }
  function collectAnswers() {
    const out = {};
    for (const el of document.querySelectorAll('#answers [name]')) if (el.value.trim()) out[el.name] = el.value.trim();
    return out;
  }
  window.renderAnswers = renderAnswers; window.collectAnswers = collectAnswers;
})();
