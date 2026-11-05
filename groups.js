// Repeating sections (work experience, education): which profile entry goes into which block of a page.
// Pure logic, no DOM access: filler.js feeds it descriptions of the fields, options.js reads SECTIONS.
// Conservative by design: anything ambiguous is left alone (returns null / drops the field).
(function (root) {
  // Profile side: what a user can store per entry. Single source of truth for options UI and the filler.
  const SECTIONS = {
    experience: {
      title: 'Work experience', itemLabel: 'Experience', addLabel: 'Add experience',
      fields: [
        { key: 'company', label: 'Company' }, { key: 'title', label: 'Job title' },
        { key: 'start', label: 'Start (e.g. 2021-05)' }, { key: 'end', label: 'End (e.g. 2023-08, or Present)' },
        { key: 'description', label: 'Description', type: 'textarea' }
      ]
    },
    education: {
      title: 'Education history', itemLabel: 'Education', addLabel: 'Add education',
      fields: [
        { key: 'school', label: 'School / university' }, { key: 'degree', label: 'Degree' },
        { key: 'major', label: 'Major / field of study' }, { key: 'year', label: 'Graduation year' },
        { key: 'gpa', label: 'GPA' }
      ]
    }
  };

  // Page side: field "kinds" recognised from a normalised signature (see filler.js signature()).
  // anchor = identifies which section a block belongs to. section = section the kind belongs to (null = neutral).
  // tier: when several kinds match one signature, the more specific tier wins ("employer start date" is a start).
  const K = (section, anchor, tier, re, not) => ({ section, anchor, tier, re: new RegExp(re), not: not ? new RegExp(not) : null });
  const NOT_DATE = 'available|availability|notice|earliest|expected|desired|salary|visa|expir|birth|deadline';
  const KINDS = {
    description: K('experience', false, 3, '\\b(description|responsibilit\\w+|duties|achievements?|accomplishments?|what did you do)\\b|الوصف|المهام|المسؤوليات'),
    gpa: K('education', false, 3, '\\b(gpa|cgpa)\\b|grade point|المعدل'),
    gradyear: K('education', false, 3, '\\b(graduat\\w*|grad year|completion)\\b|سنة التخرج|تاريخ التخرج'),
    start: K('experience', false, 2, '\\b(start|started|starting|from|begin|began|since)\\b|تاريخ البدء', NOT_DATE),
    end: K(null, false, 2, '\\b(end|ended|ending|until|through|finish\\w*)\\b|تاريخ الانتهاء', NOT_DATE),
    company: K('experience', true, 1, '\\b(company|employer|organi[sz]ation)\\b|الشركة|جهة العمل|صاحب العمل',
      'website|url|phone|address|email|size|industry|referee|reference|supervisor|manager|school|universit'),
    title: K('experience', true, 1, '\\b((job|position|role|work) title|position|role|designation)\\b|المسمى الوظيفي|المنصب',
      'appl(y|ied|ying)|desired|preferred|expected|interested|target|looking'),
    school: K('education', true, 1, '\\b(school|university|college|institution|institute|alma mater)\\b|الجامعة|الكلية|المعهد|المدرسة',
      'preferred|appl(y|ying)|interested'),
    degree: K('education', true, 1, '\\b(degree|qualification|diploma)\\b|الدرجة العلمية|المؤهل'),
    major: K('education', true, 1, '\\b(major|field of study|discipline|specialization|specialisation|concentration|area of study)\\b|التخصص')
  };
  // How a kind lands in each section's entry. "end" is neutral: end date for jobs, graduation year for education.
  const FIELD_FOR = {
    experience: { company: 'company', title: 'title', start: 'start', end: 'end', description: 'description' },
    education: { school: 'school', degree: 'degree', major: 'major', gradyear: 'year', end: 'year', gpa: 'gpa' }
  };

  // sig: normalised signature string. Returns a kind name, or null when nothing / more than one thing matches.
  function classify(sig) {
    const hits = Object.keys(KINDS).filter((k) => KINDS[k].re.test(sig) && !(KINDS[k].not && KINDS[k].not.test(sig)));
    if (!hits.length) return null;
    const best = Math.max(...hits.map((k) => KINDS[k].tier));
    const top = hits.filter((k) => KINDS[k].tier === best);
    return top.length === 1 ? top[0] : null;
  }

  // parts: raw name, id, then visible label text. Finds "[0]", "_1", "-2-", "company2", "Employer 2".
  function extractIndex(parts) {
    for (let i = 0; i < parts.length; i++) {
      const s = String(parts[i] || '');
      const m = i < 2
        ? (s.match(/\[(\d{1,2})\]/) || s.match(/(?:^|[._\-:])(\d{1,2})(?=$|[._\-:\]])/) || s.match(/[a-z](\d{1,2})$/i))
        : s.trim().match(/(?:^|\s)#?(\d{1,2})\s*$/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  // items (DOM order): [{ kind, idx: number|null, box: string|null }].
  // Returns groups in DOM order: [{ section, members: [{ pos, field }] }]. Groups without an anchor are dropped.
  function groupFields(items) {
    const list = items.map((it, pos) => ({ kind: it.kind, idx: it.idx, box: it.box, pos })).filter((it) => KINDS[it.kind]);
    if (!list.length) return [];
    const boxCount = {};
    list.forEach((it) => { if (it.box != null) boxCount[it.box] = (boxCount[it.box] || 0) + 1; });
    const strategy = list.every((i) => i.idx != null) ? 'index'
      : list.every((i) => i.box != null) && Object.values(boxCount).every((n) => n >= 2) ? 'box' : 'seq';
    const buckets = new Map();
    for (const it of list) {
      const t = strategy === 'index' ? 'i' + it.idx : strategy === 'box' ? 'b' + it.box : 's';
      if (!buckets.has(t)) buckets.set(t, []);
      buckets.get(t).push(it);
    }
    const groups = [];
    for (const bucket of buckets.values()) {
      let cur = null;
      for (const it of bucket) {
        const k = KINDS[it.kind];
        const anchorSection = k.anchor ? k.section : null;
        if (cur && ((anchorSection && cur.section && cur.section !== anchorSection) || cur.kinds.has(it.kind))) cur = null;
        if (!cur) { cur = { section: null, kinds: new Set(), items: [] }; groups.push(cur); }
        cur.items.push(it); cur.kinds.add(it.kind);
        if (anchorSection && !cur.section) cur.section = anchorSection;
      }
    }
    return groups.filter((g) => g.section).map((g) => {
      const seen = new Set(), members = [];
      for (const it of g.items) {
        const field = FIELD_FOR[g.section][it.kind];
        if (field && !seen.has(field)) { seen.add(field); members.push({ pos: it.pos, field }); }
      }
      return { section: g.section, members, first: Math.min(...g.items.map((i) => i.pos)) };
    }).sort((a, b) => a.first - b.first);
  }

  // Map the N-th block of a section to the N-th entry. Returns [{ pos, section, field, value|null, handled }]:
  // value null = deliberately skipped. With one block, entry 0 (the most recent) is used.
  function assign(groups, profile) {
    const out = [], counters = {};
    for (const g of groups) {
      const entries = (profile && profile[g.section]) || [];
      if (!entries.length) continue; // no entries stored: leave the fields to the generic matching
      const n = groups.filter((x) => x.section === g.section).length;
      const i = (counters[g.section] = (counters[g.section] == null ? 0 : counters[g.section] + 1));
      const entry = entries[i];
      for (const m of g.members) {
        const v = entry && entry[m.field] != null ? String(entry[m.field]).trim() : '';
        if (v) out.push({ pos: m.pos, section: g.section, field: m.field, value: v });
        else if (n > 1 || !entry) out.push({ pos: m.pos, section: g.section, field: m.field, value: null });
      }
    }
    return out;
  }

  // Convert an entry value for a specific <input type>. null = cannot be written safely, so skip.
  function inputValue(type, v) {
    type = String(type || '').toLowerCase();
    if (type === 'month') { const m = /^(\d{4})-(\d{2})/.exec(v); return m ? m[1] + '-' + m[2] : null; }
    if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    if (type === 'number') return /^\d+(\.\d+)?$/.test(v) ? v : null;
    return v;
  }

  const api = { SECTIONS, KINDS, classify, extractIndex, groupFields, assign, inputValue };
  root.FORMFILL_GROUPS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
