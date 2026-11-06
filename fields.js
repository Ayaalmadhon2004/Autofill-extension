// Single source of truth: profile fields (shown in Options) + how to recognise them on a page.
// `group` is a key; the visible label of a field is t('field.<key>') and of a group t('fieldGroup.<group>') (see i18n.js).
// `ac` = HTML autocomplete tokens, `re` = regexes tested against the field's label/name/id/placeholder.
// ORDER MATTERS: more specific fields first (first name before full name).
(function (root) {
  // `label` is the English name used in the fill report (kept stable for tests); the UI shows t('field.<key>').
  const reportLabel = (key) => (root.FORMFILL_I18N ? root.FORMFILL_I18N.t('field.' + key, null, 'en') : key);
  const F = (key, group, ac, re, extra) => {
    const f = Object.assign({ key, group, ac, re, type: 'text' }, extra);
    Object.defineProperty(f, 'label', { enumerable: true, get: () => reportLabel(key) });
    return f;
  };
  root.FORMFILL_FIELDS = [
    F('firstName', 'personal', ['given-name'], ['first name', 'given name', 'forename', 'fname', 'الاسم ال[أا]ول', 'الاسم الشخصي']),
    F('lastName', 'personal', ['family-name'], ['last name', 'family name', 'surname', 'lname', 'اسم العائلة', 'الكنية', 'الاسم ال[أا]خير']),
    F('email', 'personal', ['email'], ['e ?mail', 'البريد', '[إا]يميل'], { type: 'email' }),
    F('phone', 'personal', ['tel', 'tel-national'], ['phone', 'mobile', 'telephone', '\\btel\\b', 'cell', 'الهاتف', 'الجوال', 'الموبايل', 'رقم التواصل'], { type: 'tel' }),
    F('dob', 'personal', ['bday'], ['birth', '\\bdob\\b', 'تاريخ الميلاد'], { type: 'date' }),
    F('gender', 'personal', ['sex'], ['gender', '\\bsex\\b', '(^|\\s)الجنس($|\\s)']),
    F('nationality', 'personal', [], ['nationality', 'citizenship', 'الجنسية']),
    F('address', 'location', ['street-address', 'address-line1'], ['address', 'street', 'العنوان']),
    F('city', 'location', ['address-level2'], ['\\bcity\\b', '\\btown\\b', 'المدينة']),
    F('state', 'location', ['address-level1'], ['\\bstate\\b', 'province', '\\bregion\\b', 'المحافظة', 'الولاية']),
    F('postalCode', 'location', ['postal-code'], ['\\bzip\\b', 'postal', 'post ?code', 'الرمز البريدي']),
    F('country', 'location', ['country', 'country-name'], ['country', 'الدولة', 'البلد']),
    F('linkedin', 'links', [], ['linked ?in', 'لينكد'], { type: 'url' }),
    F('github', 'links', [], ['git ?hub'], { type: 'url' }),
    F('website', 'links', ['url'], ['website', 'portfolio', 'personal (site|url)', 'homepage', 'الموقع ال[إا]لكتروني', 'الموقع الشخصي'], { type: 'url' }),
    F('currentCompany', 'work', ['organization'], ['(current|present|recent).*(company|employer)', 'employer', 'company name', 'الشركة', 'جهة العمل']),
    F('currentTitle', 'work', ['organization-title'], ['(current|job|position) title', 'headline', 'المسمى الوظيفي']),
    F('yearsExperience', 'work', [], ['years.*experience', 'experience.*years', 'سنوات الخبرة']),
    F('salary', 'work', [], ['salary', 'compensation', 'expected pay', 'الراتب']),
    F('noticePeriod', 'work', [], ['notice', 'availab', 'start date', 'فترة الإشعار', 'تاريخ البدء', 'موعد الالتحاق']),
    F('university', 'education', [], ['university', 'school', 'college', 'institution', 'الجامعة', 'الكلية', 'المعهد']),
    F('degree', 'education', [], ['degree', 'qualification', 'الدرجة العلمية', 'المؤهل']),
    F('major', 'education', [], ['major', 'field of study', 'discipline', 'التخصص']),
    F('gradYear', 'education', [], ['graduation', 'grad year', 'سنة التخرج']),
    F('gpa', 'education', [], ['\\bgpa\\b', 'grade point', 'المعدل']),
    F('summary', 'text', [], ['summary', 'about (you|yourself|me)', '\\bbio\\b', 'introduce', 'نبذة', 'عن نفسك'], { type: 'textarea' }),
    F('coverLetter', 'text', [], ['cover letter', 'motivation', 'why .*(want|interest|apply)', 'additional information', 'رسالة التغطية', 'الرسالة التحفيزية', 'خطاب التقديم', 'دوافع'], { type: 'textarea' }),
    // Last: generic "name" only if nothing more specific matched.
    F('fullName', 'personal', ['name'], ['full name', 'your name', '^name$', '\\bname\\b', 'الاسم الكامل', '^الاسم$', 'اسمك'],
      { exclude: ['company', 'user ?name', 'file', 'school', 'university', 'reference', 'employer', 'manager', 'referr', 'الشركة', 'المستخدم', 'الجامعة'] })
  ];
})(typeof window !== 'undefined' ? window : self);
