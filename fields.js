// Single source of truth: profile fields (shown in Options) + how to recognise them on a page.
// `ac` = HTML autocomplete tokens, `re` = regexes tested against the field's label/name/id/placeholder.
// ORDER MATTERS: more specific fields first (first name before full name).
(function (root) {
  const F = (key, label, group, ac, re, extra) => Object.assign({ key, label, group, ac, re, type: 'text' }, extra);
  root.FORMFILL_FIELDS = [
    F('firstName', 'First name', 'Personal', ['given-name'], ['first name', 'given name', 'forename', 'fname']),
    F('lastName', 'Last name', 'Personal', ['family-name'], ['last name', 'family name', 'surname', 'lname']),
    F('email', 'Email', 'Personal', ['email'], ['e ?mail'], { type: 'email' }),
    F('phone', 'Phone', 'Personal', ['tel', 'tel-national'], ['phone', 'mobile', 'telephone', '\\btel\\b', 'cell'], { type: 'tel' }),
    F('dob', 'Date of birth', 'Personal', ['bday'], ['birth', '\\bdob\\b'], { type: 'date' }),
    F('gender', 'Gender', 'Personal', ['sex'], ['gender', '\\bsex\\b']),
    F('nationality', 'Nationality / citizenship', 'Personal', [], ['nationality', 'citizenship']),
    F('address', 'Street address', 'Location', ['street-address', 'address-line1'], ['address', 'street']),
    F('city', 'City', 'Location', ['address-level2'], ['\\bcity\\b', '\\btown\\b']),
    F('state', 'State / province', 'Location', ['address-level1'], ['\\bstate\\b', 'province', '\\bregion\\b']),
    F('postalCode', 'Postal / ZIP code', 'Location', ['postal-code'], ['\\bzip\\b', 'postal', 'post ?code']),
    F('country', 'Country', 'Location', ['country', 'country-name'], ['country']),
    F('linkedin', 'LinkedIn URL', 'Links', [], ['linkedin'], { type: 'url' }),
    F('github', 'GitHub URL', 'Links', [], ['github'], { type: 'url' }),
    F('website', 'Website / portfolio', 'Links', ['url'], ['website', 'portfolio', 'personal (site|url)', 'homepage'], { type: 'url' }),
    F('currentCompany', 'Current company', 'Work', ['organization'], ['(current|present|recent).*(company|employer)', 'employer', 'company name']),
    F('currentTitle', 'Current job title', 'Work', ['organization-title'], ['(current|job|position) title', 'headline']),
    F('yearsExperience', 'Years of experience', 'Work', [], ['years.*experience', 'experience.*years']),
    F('salary', 'Expected salary', 'Work', [], ['salary', 'compensation', 'expected pay']),
    F('noticePeriod', 'Notice period / availability', 'Work', [], ['notice', 'availab', 'start date']),
    F('university', 'University / school', 'Education', [], ['university', 'school', 'college', 'institution']),
    F('degree', 'Degree', 'Education', [], ['degree', 'qualification']),
    F('major', 'Major / field of study', 'Education', [], ['major', 'field of study', 'discipline']),
    F('gradYear', 'Graduation year', 'Education', [], ['graduation', 'grad year']),
    F('gpa', 'GPA', 'Education', [], ['\\bgpa\\b', 'grade point']),
    F('summary', 'Short bio / summary', 'Text', [], ['summary', 'about (you|yourself|me)', '\\bbio\\b', 'introduce'], { type: 'textarea' }),
    F('coverLetter', 'Cover letter / motivation', 'Text', [], ['cover letter', 'motivation', 'why .*(want|interest|apply)', 'additional information'], { type: 'textarea' }),
    // Last: generic "name" only if nothing more specific matched.
    F('fullName', 'Full name', 'Personal', ['name'], ['full name', 'your name', '^name$', '\\bname\\b'],
      { exclude: ['company', 'user ?name', 'file', 'school', 'university', 'reference', 'employer', 'manager', 'referr'] })
  ];
})(typeof window !== 'undefined' ? window : self);
