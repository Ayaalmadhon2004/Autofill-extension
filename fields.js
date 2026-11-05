// Single source of truth: profile fields (shown in Options) + how to recognise them on a page.
// `ac` = HTML autocomplete tokens, `re` = regexes tested against the field's label/name/id/placeholder.
// ORDER MATTERS: more specific fields first (first name before full name).
(function (root) {
  const F = (key, label, group, ac, re, extra) => Object.assign({ key, label, group, ac, re, type: 'text' }, extra);
  root.FORMFILL_FIELDS = [
    F('firstName', 'First name', 'Personal', ['given-name'], ['first name', 'given name', 'forename', 'fname', 'الاسم ال[أا]ول', 'الاسم الشخصي']),
    F('lastName', 'Last name', 'Personal', ['family-name'], ['last name', 'family name', 'surname', 'lname', 'اسم العائلة', 'الكنية', 'الاسم ال[أا]خير']),
    F('email', 'Email', 'Personal', ['email'], ['e ?mail', 'البريد', '[إا]يميل'], { type: 'email' }),
    F('phone', 'Phone', 'Personal', ['tel', 'tel-national'], ['phone', 'mobile', 'telephone', '\\btel\\b', 'cell', 'الهاتف', 'الجوال', 'الموبايل', 'رقم التواصل'], { type: 'tel' }),
    F('dob', 'Date of birth', 'Personal', ['bday'], ['birth', '\\bdob\\b', 'تاريخ الميلاد'], { type: 'date' }),
    F('gender', 'Gender', 'Personal', ['sex'], ['gender', '\\bsex\\b', '(^|\\s)الجنس($|\\s)']),
    F('nationality', 'Nationality / citizenship', 'Personal', [], ['nationality', 'citizenship', 'الجنسية']),
    F('address', 'Street address', 'Location', ['street-address', 'address-line1'], ['address', 'street', 'العنوان']),
    F('city', 'City', 'Location', ['address-level2'], ['\\bcity\\b', '\\btown\\b', 'المدينة']),
    F('state', 'State / province', 'Location', ['address-level1'], ['\\bstate\\b', 'province', '\\bregion\\b', 'المحافظة', 'الولاية']),
    F('postalCode', 'Postal / ZIP code', 'Location', ['postal-code'], ['\\bzip\\b', 'postal', 'post ?code', 'الرمز البريدي']),
    F('country', 'Country', 'Location', ['country', 'country-name'], ['country', 'الدولة', 'البلد']),
    F('linkedin', 'LinkedIn URL', 'Links', [], ['linkedin', 'لينكد'], { type: 'url' }),
    F('github', 'GitHub URL', 'Links', [], ['github'], { type: 'url' }),
    F('website', 'Website / portfolio', 'Links', ['url'], ['website', 'portfolio', 'personal (site|url)', 'homepage', 'الموقع ال[إا]لكتروني', 'الموقع الشخصي'], { type: 'url' }),
    F('currentCompany', 'Current company', 'Work', ['organization'], ['(current|present|recent).*(company|employer)', 'employer', 'company name', 'الشركة', 'جهة العمل']),
    F('currentTitle', 'Current job title', 'Work', ['organization-title'], ['(current|job|position) title', 'headline', 'المسمى الوظيفي']),
    F('yearsExperience', 'Years of experience', 'Work', [], ['years.*experience', 'experience.*years', 'سنوات الخبرة']),
    F('salary', 'Expected salary', 'Work', [], ['salary', 'compensation', 'expected pay', 'الراتب']),
    F('noticePeriod', 'Notice period / availability', 'Work', [], ['notice', 'availab', 'start date', 'فترة الإشعار', 'تاريخ البدء', 'موعد الالتحاق']),
    F('university', 'University / school', 'Education', [], ['university', 'school', 'college', 'institution', 'الجامعة', 'الكلية', 'المعهد']),
    F('degree', 'Degree', 'Education', [], ['degree', 'qualification', 'الدرجة العلمية', 'المؤهل']),
    F('major', 'Major / field of study', 'Education', [], ['major', 'field of study', 'discipline', 'التخصص']),
    F('gradYear', 'Graduation year', 'Education', [], ['graduation', 'grad year', 'سنة التخرج']),
    F('gpa', 'GPA', 'Education', [], ['\\bgpa\\b', 'grade point', 'المعدل']),
    F('summary', 'Short bio / summary', 'Text', [], ['summary', 'about (you|yourself|me)', '\\bbio\\b', 'introduce', 'نبذة', 'عن نفسك'], { type: 'textarea' }),
    F('coverLetter', 'Cover letter / motivation', 'Text', [], ['cover letter', 'motivation', 'why .*(want|interest|apply)', 'additional information', 'رسالة التغطية', 'الرسالة التحفيزية', 'خطاب التقديم', 'دوافع'], { type: 'textarea' }),
    // Last: generic "name" only if nothing more specific matched.
    F('fullName', 'Full name', 'Personal', ['name'], ['full name', 'your name', '^name$', '\\bname\\b', 'الاسم الكامل', '^الاسم$', 'اسمك'],
      { exclude: ['company', 'user ?name', 'file', 'school', 'university', 'reference', 'employer', 'manager', 'referr', 'الشركة', 'المستخدم', 'الجامعة'] })
  ];
})(typeof window !== 'undefined' ? window : self);
