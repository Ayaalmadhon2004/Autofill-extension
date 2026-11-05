// Localisation core: English (default) and Arabic. Single source of truth for every user-visible string.
//
//   FORMFILL_I18N.en / .ar    flat dictionaries, stable dotted keys. A value is a string with {name} placeholders,
//                             or an object of plural forms { zero, one, two, few, many, other } chosen by vars.n.
//   FORMFILL_I18N.t(key, vars[, lang])   look up + interpolate (missing key: Arabic falls back to English, then to the key).
//   FORMFILL_I18N.getLang() / .setLang(value)   'en' | 'ar' resolved language / change the 'auto' | 'en' | 'ar' setting.
//   FORMFILL_I18N.applyDom(root)   fills data-i18n, data-i18n-placeholder, data-i18n-aria-label, data-i18n-title and
//                             sets <html lang dir>.
//   FORMFILL_I18N.ready        Promise: the saved setting (chrome.storage.local `uiLang`) has been read.
//
// Works in extension pages, in the service worker (importScripts) and in Node (tests). In a web page (content script)
// it never touches chrome.storage or the page DOM: the injector passes the language in with setLang(lang, { persist: false })
// and, without it, the text stays English.
//
// To add a language: copy the `en` object below, translate the values (keep keys and {placeholders}), register it in
// DICT and LANGS, and add its code to RTL if it is written right to left. tests/i18n.core.test.js checks key parity.
(function (root) {
  'use strict';
  if (root.FORMFILL_I18N) return;

  // Bidi helper for the Arabic strings: keeps Latin tokens (shortcuts, hosts, file names) in their own LTR run.
  const L = (s) => '⁦' + s + '⁩';

  const EN = {
    // ---- language switcher (the label is bilingual on purpose, so it can be found in either language) ----
    'lang.label': 'Language / اللغة',
    'lang.auto': 'Auto (browser language)',
    'lang.en': 'English',
    'lang.ar': 'العربية',

    // ---- shared words ----
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.answer': 'Answer',
    'common.save': 'Save',

    // ---- lock screen (popup and options) ----
    'lock.title': 'Profiles are locked',
    'lock.passphrase': 'Passphrase',
    'lock.unlock': 'Unlock',
    'lock.now': 'Lock now',
    'lock.optionsIntro': 'Enter your passphrase to view and edit your profiles. There is no way to recover a forgotten passphrase.',
    'lock.wrongPopup': 'Wrong passphrase. There is no way to recover a forgotten one.',
    'lock.wrongShort': 'Wrong passphrase.',
    'lock.failed': 'Could not unlock: {message}',

    // ---- backup reminder (popup and options banner) ----
    'backup.region': 'Backup reminder',
    'backup.title': 'Back up your profiles',
    'backup.lastPopup': {
      one: 'Last backup: {n} day ago.', other: 'Last backup: {n} days ago.'
    },
    'backup.lastOptions': {
      one: 'Your last backup was {n} day ago.', other: 'Your last backup was {n} days ago.'
    },
    'backup.willEncrypt': '🔒 The file will be encrypted with your passphrase.',
    'backup.willPlainHint': '⚠ The file will contain your details as plain text. Set a passphrase in Options to encrypt it.',
    'backup.willPlain': '⚠ The file will contain your details as plain text.',
    'backup.download': 'Download backup',
    'backup.later': 'Remind me tomorrow',
    'backup.done': '✓ Backup downloaded.',

    // ---- popup ----
    'popup.docTitle': 'Fill',
    'popup.profile': 'Profile',
    'popup.fill': 'Fill this page',
    'popup.allowSite': 'Always allow {host}',
    'popup.overwrite': 'Overwrite fields that already have text',
    'popup.edit': 'Edit my profile',
    'popup.shortcut': 'Shortcut: Ctrl+Shift+F',
    'popup.history': 'My applications',
    'popup.help': 'Help / How it works',
    'popup.filling': 'Filling…',
    'popup.error': 'Error: {message}',
    'popup.filled': {
      one: '✓ Filled {n} field. Review, then submit yourself.',
      other: '✓ Filled {n} fields. Review, then submit yourself.'
    },
    'popup.noMatch': 'No matching fields found. Add a profile or a custom rule.',
    'popup.missing': {
      one: '⚠ Filled {filled}. {n} required field needs you:',
      other: '⚠ Filled {filled}. {n} required fields need you:'
    },
    'popup.nowAllowed': '✓ {host} is now allowed. Press Fill.',
    'popup.aiFailed': 'Could not open the AI prompt on this page.',

    // ---- background, runner, security (errors and status shown to the user) ----
    'bg.teachMenu': 'Teach Form Filler this field…',
    'run.cannotFill': 'This page cannot be filled.',
    'run.locked': 'Locked. Open the extension popup and enter your passphrase.',
    'sec.badKdf': 'Unsupported key derivation settings',
    'sec.wrongPass': 'Wrong passphrase, or the data was changed.',
    'sec.weak': { one: 'Use at least {n} character.', other: 'Use at least {n} characters.' },
    'sec.noSession': 'This browser version cannot keep the unlock key for the session.',
    'sec.locked': 'Profiles are locked. Enter your passphrase.',
    'sec.unreadableSecret': 'The saved secret can no longer be read.',
    'sec.thisSite': 'this site',
    'sec.siteRefusal': 'Not filled: {host} is not on your "Only fill on these sites" list.',
    'sec.cannotAllow': 'Cannot allow this site.',
    'sec.notJson': 'This is not a JSON file.',
    'sec.notBackup': 'This is not a backup file.',
    'sec.needPass': 'This backup is encrypted. Enter its passphrase first.',
    'sec.noProfiles': 'No profiles found in this file.',
    'profile.imported': 'Imported',
    'profile.importedCopy': '{name} (imported)',

    // ---- profile fields (fields.js keys) and their groups ----
    'fieldGroup.personal': 'Personal',
    'fieldGroup.location': 'Location',
    'fieldGroup.links': 'Links',
    'fieldGroup.work': 'Work',
    'fieldGroup.education': 'Education',
    'fieldGroup.text': 'Text',
    'field.firstName': 'First name',
    'field.lastName': 'Last name',
    'field.email': 'Email',
    'field.phone': 'Phone',
    'field.dob': 'Date of birth',
    'field.gender': 'Gender',
    'field.nationality': 'Nationality / citizenship',
    'field.address': 'Street address',
    'field.city': 'City',
    'field.state': 'State / province',
    'field.postalCode': 'Postal / ZIP code',
    'field.country': 'Country',
    'field.linkedin': 'LinkedIn URL',
    'field.github': 'GitHub URL',
    'field.website': 'Website / portfolio',
    'field.currentCompany': 'Current company',
    'field.currentTitle': 'Current job title',
    'field.yearsExperience': 'Years of experience',
    'field.salary': 'Expected salary',
    'field.noticePeriod': 'Notice period / availability',
    'field.university': 'University / school',
    'field.degree': 'Degree',
    'field.major': 'Major / field of study',
    'field.gradYear': 'Graduation year',
    'field.gpa': 'GPA',
    'field.summary': 'Short bio / summary',
    'field.coverLetter': 'Cover letter / motivation',
    'field.fullName': 'Full name',

    // ---- common questions (questions.js keys) ----
    'question.authorizedToWork': 'Legally authorized to work in the country?',
    'question.needsSponsorship': 'Require visa sponsorship?',
    'question.willingToRelocate': 'Willing to relocate?',
    'question.veteranStatus': 'Veteran / military service status',
    'question.disabilityStatus': 'Disability status',
    'question.howHeard': 'How did you hear about us?',
    'question.is18Plus': 'Are you 18 or older?',
    'question.criminalRecord': 'Criminal record / convictions?',
    'question.earliestStart': 'Earliest start date',
    'question.salaryExpectations': 'Salary expectations',
    'question.workPreference': 'Remote / hybrid / on-site preference',
    'question.languagesSpoken': 'Languages spoken',

    // ---- repeating sections (groups.js keys) ----
    'section.experience.title': 'Work experience',
    'section.experience.item': 'Experience',
    'section.experience.add': 'Add experience',
    'section.experience.company': 'Company',
    'section.experience.jobTitle': 'Job title',
    'section.experience.start': 'Start (e.g. 2021-05)',
    'section.experience.end': 'End (e.g. 2023-08, or Present)',
    'section.experience.description': 'Description',
    'section.education.title': 'Education history',
    'section.education.item': 'Education',
    'section.education.add': 'Add education',
    'section.education.school': 'School / university',
    'section.education.degree': 'Degree',
    'section.education.major': 'Major / field of study',
    'section.education.year': 'Graduation year',
    'section.education.gpa': 'GPA',
    'entries.hint': 'Most recent first. A form with one block gets the first entry; a form with several blocks gets them in order.',
    'entries.itemTitle': '{item} {n}',
    'entries.up': 'Move up',
    'entries.down': 'Move down',
    'entries.remove': 'Remove',
    'entries.upFor': 'Move up {title}',
    'entries.downFor': 'Move down {title}',
    'entries.removeFor': 'Remove {title}',
    'entries.removed': '{item} removed',
    'entries.alreadyFirst': 'Already first',
    'entries.alreadyLast': 'Already last',
    'entries.moved': 'Moved to position {n}',

    // ---- options page ----
    'options.docTitle': 'My profile · One-Click Form Filler',
    'options.h1': 'My profile',
    'options.intro': 'Everything is saved only in this browser. Leave a field empty to skip it.',
    'options.profiles': 'Profiles',
    'options.editing': 'Editing profile',
    'options.profileName': 'Profile name',
    'options.newProfile': 'New empty profile',
    'options.dupProfile': 'Duplicate (e.g. English → Arabic)',
    'options.delProfile': 'Delete',
    'options.newProfileName': 'New profile',
    'options.copyName': '{name} (copy)',
    'options.confirmDelete': 'Delete profile "{name}"?',
    'options.saved': 'Saved ✓',
    'options.importedFlash': 'Imported as a new profile — press Save',
    'options.invalidFile': 'Invalid file',
    'options.export': 'Export JSON',
    'options.import': 'Import JSON',
    'options.questions.legend': 'Common questions',
    'options.questions.help': 'Answer these once and they are filled wherever they appear, in English or Arabic forms. Your own custom rules below take priority; leave an answer empty to skip it.',
    'options.questions.skip': 'No answer (skip)',
    'options.rules.legend': 'Custom rules',
    'options.rules.help': "Teach it a question: if a field's label contains the text on the left, it gets the value on the right (e.g. work authorization → Yes; for radio buttons the value is the answer's text).",
    'options.rules.labelContains': 'Label contains',
    'options.rules.labelContainsPh': 'Label contains…',
    'options.rules.answerPh': 'Answer',
    'options.rules.remove': 'Remove rule',
    'options.rules.add': 'Add rule',
    'options.docs.legend': 'Documents',
    'options.docs.help': 'Your CV is attached to resume / CV upload fields (PDF or DOCX, up to 5 MB). Stored only in this browser, one per profile.',
    'options.docs.none': 'No CV uploaded for this profile.',
    'options.docs.current': 'Current CV: {name} ({kb} KB)',
    'options.docs.upload': 'Upload CV',
    'options.docs.remove': 'Remove CV',
    'options.docs.badType': 'Only PDF or DOCX files are accepted.',
    'options.docs.tooBig': 'File is larger than 5 MB.',
    'options.docs.saved': 'CV saved ✓',
    'options.docs.full': 'Could not save (browser storage is full).',
    'options.docs.removed': 'CV removed',
    'options.tracker.legend': 'Application tracker',
    'options.tracker.label': 'Track my applications',
    'options.tracker.text': 'Remembers the page address (without anything after “?”), title and date each time a fill works. Stored only in this browser.',
    'options.tracker.view': 'View my applications',

    // ---- options: security panels ----
    'optsec.passLegend': 'Passphrase lock',
    'optsec.passOn': '🔒 Passphrase lock is ON. Your profiles are encrypted on this device and you unlock them once per browser session.',
    'optsec.passOff': 'Optional. Encrypt your profiles on this device (AES-GCM, key derived from your passphrase). You enter it once per browser session.',
    'optsec.passWarn': 'There is no passphrase recovery. If you forget it, your profiles and encrypted backups cannot be read by anyone, including us. Keep an unencrypted copy somewhere safe if that worries you.',
    'optsec.mismatch': 'The two new passphrases do not match.',
    'optsec.newPass': { one: 'New passphrase (min {n} character)', other: 'New passphrase (min {n} characters)' },
    'optsec.repeatPass': 'Repeat new passphrase',
    'optsec.currentPass': 'Current passphrase',
    'optsec.turnOn': 'Turn on passphrase lock',
    'optsec.turnedOn': 'Passphrase lock is on. Your profiles are now stored encrypted.',
    'optsec.change': 'Change passphrase',
    'optsec.changed': 'Passphrase changed. Older encrypted backups still need the old passphrase.',
    'optsec.remove': 'Remove passphrase',
    'optsec.confirmRemove': 'Remove the passphrase? Your profiles will be stored unencrypted on this device.',
    'optsec.removed': 'Passphrase removed. Profiles are stored unencrypted.',
    'optsec.sitesLegend': 'Only fill on these sites',
    'optsec.sitesHelp': 'Optional. When on, Fill (button and Ctrl+Shift+F) is refused on any site not listed here. One site per line. "example.com" matches only that host; "*.example.com" matches example.com and all its subdomains. You can also add the current site from the popup.',
    'optsec.sitesOn': 'Only fill on the sites listed below',
    'optsec.sitesList': 'Allowed sites',
    'optsec.sitesSave': 'Save site list',
    'optsec.sitesInvalid': 'Not a valid site: {sites}',
    'optsec.sitesEmpty': 'The list is empty, so Fill will be refused everywhere. Continue?',
    'optsec.sitesSaved': {
      one: 'Saved. Fill is limited to {n} site.', other: 'Saved. Fill is limited to {n} sites.'
    },
    'optsec.sitesOff': 'Saved. The list is off, Fill works on every site.',
    'optsec.backupLegend': 'Backup',
    'optsec.backupEncrypted': '🔒 Backups are encrypted with your passphrase (needed again to import them).',
    'optsec.backupPlain': '⚠ Without a passphrase the backup file contains your details as plain text. Keep it somewhere safe, or set a passphrase above to encrypt it.',
    'optsec.backupIntro': 'One file with ALL your profiles. Import merges them into what you have; nothing is overwritten or deleted.',
    'optsec.backupDays': 'Remind me to back up every (days, 0 = never)',
    'optsec.backupFilePass': 'Passphrase of the backup file (only if it is encrypted)',
    'optsec.backupDownload': 'Download backup of all profiles',
    'optsec.backupImport': 'Import backup (merge)',
    'optsec.backupSaveInterval': 'Save reminder interval',
    'optsec.reminderEvery': { one: 'Reminder every {n} day.', other: 'Reminder every {n} days.' },
    'optsec.remindersOff': 'Reminders are off.',
    'optsec.merged': {
      one: 'Merged {n} new profile. Saved.', other: 'Merged {n} new profiles. Saved.'
    },
    'optsec.mergedSkipped': {
      one: 'Merged {n} new profile, {skipped} already present. Saved.',
      other: 'Merged {n} new profiles, {skipped} already present. Saved.'
    },
    'optsec.backupDownloadedEncrypted': 'Encrypted backup downloaded.',
    'optsec.backupDownloadedPlain': 'Backup downloaded. It contains plain text: keep it safe.',

    // ---- options: optional AI suggestions ----
    'aiopt.legend': 'AI suggestions (optional)',
    'aiopt.intro': 'Off by default. When you turn this on, you can ask an AI to draft an answer to an open question the filler cannot answer (for example “Why do you want to work here?”). Nothing is ever inserted or submitted for you.',
    'aiopt.warnTitle': '⚠ This is the only feature that sends data out of your browser',
    'aiopt.warnIntro': 'Only when you click “Suggest an answer with AI…”, this extension sends the following to Anthropic (api.anthropic.com):',
    'aiopt.warnItem1': 'the text of the question you are answering;',
    'aiopt.warnItem2': 'the job title and company text shown on the page, if the page has them;',
    'aiopt.warnItem3': 'ONLY the profile parts you tick below.',
    'aiopt.warnNever': 'Never sent: your email, phone, address, CV, ID numbers or any other profile field. Nothing is sent in the background, and there is no analytics.',
    'aiopt.warnBilling': 'Requests use your own Anthropic API key, so usage is billed to your own Anthropic API account. Anthropic’s terms and privacy policy apply to what you send.',
    'aiopt.partsLegend': 'Profile parts the AI may use',
    'aiopt.part.education': 'Education (school, degree, field, year)',
    'aiopt.part.experience': 'Work experience entries (title, company, dates, description)',
    'aiopt.partsHint': 'Tick nothing and the AI only sees the question, and will mostly answer “{marker}”.',
    'aiopt.keyLabel': 'Your Anthropic API key',
    'aiopt.keyHint': 'Create one in your Anthropic console. It is stored only in this browser and sent only to api.anthropic.com.',
    'aiopt.keySavedPlain': 'A key is saved. It is stored UNENCRYPTED in this browser (turn on the passphrase lock, then enter the key again, to protect it).',
    'aiopt.keySavedProtected': 'A key is saved and protected by your passphrase lock.',
    'aiopt.keyNone': 'No key saved yet.',
    'aiopt.keyPlaceholderSaved': 'Saved (hidden). Type a new key to replace it.',
    'aiopt.keyStorageNotePlain': 'You have no passphrase lock, so the key is stored unencrypted in this browser. Anyone with access to your browser profile could read it.',
    'aiopt.keyStorageNoteProtected': 'Your passphrase lock is on, so the key is encrypted with it. If you change or remove the passphrase you must enter the key again.',
    'aiopt.modelLabel': 'Model name',
    'aiopt.modelHint': 'A small, fast model is recommended. Default: {model}',
    'aiopt.consent': 'I understand what is sent, to whom, and that usage is billed to my own Anthropic account.',
    'aiopt.enable': 'Turn on AI suggestions',
    'aiopt.enableNeedsConsent': 'Tick the consent box first.',
    'aiopt.save': 'Save AI settings',
    'aiopt.test': 'Test connection',
    'aiopt.removeKey': 'Remove key',
    'aiopt.saved': 'Saved. AI suggestions are on.',
    'aiopt.savedOff': 'Saved. AI suggestions are off.',
    'aiopt.needConsent': 'Tick the consent box before turning AI suggestions on.',
    'aiopt.needKey': 'Enter your API key first.',
    'aiopt.permDenied': 'Permission for api.anthropic.com was not granted, so AI suggestions stay off.',
    'aiopt.testing': 'Testing…',
    'aiopt.keyRemoved': 'Key removed. AI suggestions are off.',
    'aiopt.cannotProtect': 'Could not store the key: unlock your profiles first.',

    // ---- AI worker (ai.js): menu title and user-facing errors ----
    'ai.menuTitle': 'Suggest an answer with AI…',
    'ai.off': 'AI suggestions are off. Turn them on in the extension options (AI suggestions).',
    'ai.noConsent': 'AI suggestions need your consent. Open the extension options and tick the consent box.',
    'ai.noKey': 'No API key saved. Add your Anthropic API key in the extension options.',
    'ai.noPermission': 'Permission to contact api.anthropic.com is missing. Open the extension options and turn AI suggestions on again.',
    'ai.locked': 'Locked. Open the extension popup and enter your passphrase, then try again.',
    'ai.keyUnreadable': 'The saved API key can no longer be read (the passphrase was changed or removed). Enter the key again in the extension options.',
    'ai.noQuestion': 'Could not read the question for this field.',
    'ai.cap': {
      one: 'Session limit reached ({n} AI request). Restart the browser to continue, or write this answer yourself.',
      other: 'Session limit reached ({n} AI requests). Restart the browser to continue, or write this answer yourself.'
    },
    'ai.badKey': 'Anthropic rejected the API key (401). Check the key in the extension options.',
    'ai.forbidden': 'Anthropic refused this request (403). Your key may not have access to this model.',
    'ai.badModel': 'Anthropic does not know this model (404). Check the model name in the extension options.',
    'ai.badRequest': 'Anthropic could not process the request (400).',
    'ai.rateLimit': 'Rate limit or usage limit reached (429). Wait a minute and try again, or check your Anthropic account.',
    'ai.server': 'Anthropic is temporarily unavailable ({status}). Try again in a moment.',
    'ai.network': 'Could not reach api.anthropic.com. Check your internet connection and try again.',
    'ai.emptyReply': 'The model returned no text. Try again.',
    'ai.testOk': 'Connection works.',
    'ai.badKeyFormat': 'That does not look like an API key.',

    // ---- AI prompt shown in the page (ai-suggest.js) ----
    'aiprompt.title': 'Suggest an answer with AI',
    'aiprompt.questionLabel': 'Question',
    'aiprompt.draftLabel': 'Draft answer (you can edit it)',
    'aiprompt.note': 'Drafted by AI from the details you allowed — check it before sending.',
    'aiprompt.generating': 'Drafting an answer…',
    'aiprompt.ready': 'Draft ready. Review and edit it, then insert it.',
    'aiprompt.insert': 'Insert into field',
    'aiprompt.regenerate': 'Regenerate',
    'aiprompt.noField': 'Click into a text box or text area first (or right-click it), then choose this option again.',
    'aiprompt.error': 'Could not draft an answer: {error}',
    'aiprompt.unknownError': 'Something went wrong. Try again.',

    // ---- teach prompt shown in the page (teach.js) and the required-field marker (filler.js) ----
    'teach.title': 'Teach Form Filler this field',
    'teach.noField': 'Right-click a form field (a text box, dropdown, radio button or checkbox) and choose this option again.',
    'teach.intro': 'When a field’s label contains {match}, fill it with your answer.',
    'teach.introProfile': 'When a field’s label contains {match}, fill it with your answer (saved to profile “{profile}”).',
    'teach.unnamed': '(unnamed field)',
    'teach.choose': 'Choose an answer…',
    'teach.save': 'Save answer',
    'teach.noLabel': 'This field has no label to match on.',
    'teach.empty': 'Type or choose an answer first.',
    'teach.saveFail': 'Could not save. Try again.',
    'teach.saved': 'Saved ✓ It will be used next time you fill.',
    'filler.required': '⚠ Required – fill this in yourself',

    // ---- application history page ----
    'history.docTitle': 'My applications · One-Click Form Filler',
    'history.backToProfile': 'My profile',
    'history.title': 'My applications',
    'history.privacy': 'A record of the pages you filled. Stored only in this browser. Turn it off in Options.',
    'history.search': 'Search (title, site, notes)',
    'history.filter': 'Show status',
    'history.all': 'All statuses',
    'history.exportCsv': 'Export CSV',
    'history.status': 'Status',
    'history.notes': 'Notes',
    'history.delete': 'Delete',
    'history.fieldsFilled': { one: '{n} field filled', other: '{n} fields filled' },
    'history.emptyNone': 'No applications yet. Fill an application form with the extension and it will be listed here.',
    'history.emptyFilter': 'No applications match your search or filter.',
    'history.listLabel': 'Applications',
    'history.saved': 'Saved',
    'history.deleted': 'Entry deleted',
    'history.confirmDelete': 'Delete this entry?',
    'history.exported': 'CSV exported',
    'history.status.applied': 'Applied',
    'history.status.interviewing': 'Interviewing',
    'history.status.offer': 'Offer',
    'history.status.rejected': 'Rejected',
    'history.status.saved': 'Saved',
    'history.csv.date': 'Date',
    'history.csv.title': 'Title',
    'history.csv.site': 'Site',
    'history.csv.url': 'URL',
    'history.csv.filled': 'Fields filled',
    'history.sumMonth': { one: '{n} application this month', other: '{n} applications this month' },
    'history.sumTotal': '{n} in total',
    'history.openPage': 'Open page: {title}',
    'history.notesFor': 'Notes for {title}',
    'history.statusFor': 'Status for {title}',
    'history.deleteFor': 'Delete entry: {title}',

    // ---- first-run welcome page ----
    'onboarding.title': 'Welcome to One-Click Form Filler',
    'onboarding.stepOf': 'Step {n} of {total}',
    'onboarding.s1h': 'What it does',
    'onboarding.s1a': 'It fills job, internship and application forms in one click, using a profile you write once. You can keep several profiles, for example English and Arabic.',
    'onboarding.s1b': 'Privacy promise: your data stays in this browser. Nothing is sent anywhere, and the extension never submits a form for you.',
    'onboarding.s2h': 'Create your first profile',
    'onboarding.s2a': 'Just the basics for now. You can add everything else later in Options. Leave a field empty to skip it.',
    'onboarding.saveError': 'Could not save. Please try again.',
    'onboarding.s3h': 'How to fill a form',
    'onboarding.s3.1': 'Open an application form, click the extension icon, then press "Fill this page".',
    'onboarding.s3.2': 'Or press Ctrl+Shift+F (Command+Shift+F on Mac) on the form page. The icon shows how many fields were filled.',
    'onboarding.s3.3': 'Review everything, then submit yourself.',
    'onboarding.s3.4': 'Updates: the extension updates itself from the Chrome Web Store. If you installed it from a folder, replace the files, then open chrome://extensions and press the reload button on this extension.',
    'onboarding.back': 'Back',
    'onboarding.next': 'Next',
    'onboarding.saveNext': 'Save and continue',
    'onboarding.finish': 'Finish and open my profile'
  };

  const AR = {
    'lang.label': 'Language / اللغة',
    'lang.auto': 'تلقائي (لغة المتصفح)',
    'lang.en': 'English',
    'lang.ar': 'العربية',

    'common.cancel': 'إلغاء',
    'common.close': 'إغلاق',
    'common.yes': 'نعم',
    'common.no': 'لا',
    'common.answer': 'الإجابة',
    'common.save': 'حفظ',

    'lock.title': 'الملفات الشخصية مقفلة',
    'lock.passphrase': 'عبارة المرور',
    'lock.unlock': 'فتح القفل',
    'lock.now': 'قفل الآن',
    'lock.optionsIntro': 'أدخل عبارة المرور لعرض ملفاتك الشخصية وتعديلها. لا توجد طريقة لاستعادة عبارة مرور منسية.',
    'lock.wrongPopup': 'عبارة المرور غير صحيحة. لا توجد طريقة لاستعادة عبارة مرور منسية.',
    'lock.wrongShort': 'عبارة المرور غير صحيحة.',
    'lock.failed': 'تعذّر فتح القفل: {message}',

    'backup.region': 'تذكير بالنسخ الاحتياطي',
    'backup.title': 'انسخ ملفاتك الشخصية احتياطيًا',
    'backup.lastPopup': {
      zero: 'آخر نسخة احتياطية: منذ {n} يوم.',
      one: 'آخر نسخة احتياطية: منذ يوم واحد.',
      two: 'آخر نسخة احتياطية: منذ يومين.',
      few: 'آخر نسخة احتياطية: منذ {n} أيام.',
      many: 'آخر نسخة احتياطية: منذ {n} يومًا.',
      other: 'آخر نسخة احتياطية: منذ {n} يوم.'
    },
    'backup.lastOptions': {
      zero: 'كانت آخر نسخة احتياطية لك منذ {n} يوم.',
      one: 'كانت آخر نسخة احتياطية لك منذ يوم واحد.',
      two: 'كانت آخر نسخة احتياطية لك منذ يومين.',
      few: 'كانت آخر نسخة احتياطية لك منذ {n} أيام.',
      many: 'كانت آخر نسخة احتياطية لك منذ {n} يومًا.',
      other: 'كانت آخر نسخة احتياطية لك منذ {n} يوم.'
    },
    'backup.willEncrypt': '🔒 سيتم تشفير الملف بعبارة المرور الخاصة بك.',
    'backup.willPlainHint': '⚠ سيحتوي الملف على بياناتك كنص عادي. عيّن عبارة مرور في الإعدادات لتشفيره.',
    'backup.willPlain': '⚠ سيحتوي الملف على بياناتك كنص عادي.',
    'backup.download': 'تنزيل النسخة الاحتياطية',
    'backup.later': 'ذكّرني غدًا',
    'backup.done': '✓ تم تنزيل النسخة الاحتياطية.',

    'popup.docTitle': 'تعبئة',
    'popup.profile': 'الملف الشخصي',
    'popup.fill': 'تعبئة هذه الصفحة',
    'popup.allowSite': 'السماح دائمًا بالموقع ' + L('{host}'),
    'popup.overwrite': 'استبدال الحقول التي تحتوي على نص',
    'popup.edit': 'تعديل ملفي الشخصي',
    'popup.shortcut': 'الاختصار: ' + L('Ctrl+Shift+F'),
    'popup.history': 'طلباتي',
    'popup.help': 'المساعدة / كيف تعمل الإضافة',
    'popup.filling': 'جارٍ التعبئة…',
    'popup.error': 'خطأ: {message}',
    'popup.filled': {
      zero: '✓ لم تتم تعبئة أي حقل. راجع الصفحة ثم أرسل الطلب بنفسك.',
      one: '✓ تمت تعبئة حقل واحد. راجعه ثم أرسل الطلب بنفسك.',
      two: '✓ تمت تعبئة حقلين. راجعهما ثم أرسل الطلب بنفسك.',
      few: '✓ تمت تعبئة {n} حقول. راجعها ثم أرسل الطلب بنفسك.',
      many: '✓ تمت تعبئة {n} حقلًا. راجعها ثم أرسل الطلب بنفسك.',
      other: '✓ تمت تعبئة {n} حقل. راجعها ثم أرسل الطلب بنفسك.'
    },
    'popup.noMatch': 'لم يتم العثور على حقول مطابقة. أضف ملفًا شخصيًا أو قاعدة مخصصة.',
    'popup.missing': {
      zero: '⚠ تمت تعبئة {filled}. لا توجد حقول مطلوبة بحاجة إليك:',
      one: '⚠ تمت تعبئة {filled}. يحتاج حقل مطلوب واحد إلى تدخلك:',
      two: '⚠ تمت تعبئة {filled}. يحتاج حقلان مطلوبان إلى تدخلك:',
      few: '⚠ تمت تعبئة {filled}. تحتاج {n} حقول مطلوبة إلى تدخلك:',
      many: '⚠ تمت تعبئة {filled}. تحتاج {n} حقلًا مطلوبًا إلى تدخلك:',
      other: '⚠ تمت تعبئة {filled}. تحتاج {n} حقل مطلوب إلى تدخلك:'
    },
    'popup.nowAllowed': '✓ تم السماح بالموقع ' + L('{host}') + '. اضغط «تعبئة هذه الصفحة».',
    'popup.aiFailed': 'تعذّر فتح نافذة الذكاء الاصطناعي في هذه الصفحة.',

    'bg.teachMenu': 'علّم Form Filler هذا الحقل…',
    'run.cannotFill': 'لا يمكن تعبئة هذه الصفحة.',
    'run.locked': 'الملفات مقفلة. افتح نافذة الإضافة وأدخل عبارة المرور.',
    'sec.badKdf': 'إعدادات اشتقاق المفتاح غير مدعومة',
    'sec.wrongPass': 'عبارة المرور غير صحيحة، أو تم تغيير البيانات.',
    'sec.weak': {
      zero: 'استخدم {n} حرف على الأقل.',
      one: 'استخدم حرفًا واحدًا على الأقل.',
      two: 'استخدم حرفين على الأقل.',
      few: 'استخدم {n} أحرف على الأقل.',
      many: 'استخدم {n} حرفًا على الأقل.',
      other: 'استخدم {n} حرف على الأقل.'
    },
    'sec.noSession': 'لا يمكن لهذا الإصدار من المتصفح الاحتفاظ بمفتاح فتح القفل خلال الجلسة.',
    'sec.locked': 'الملفات الشخصية مقفلة. أدخل عبارة المرور.',
    'sec.unreadableSecret': 'لم يعد بالإمكان قراءة السر المحفوظ.',
    'sec.thisSite': 'هذا الموقع',
    'sec.siteRefusal': 'لم تتم التعبئة: ' + L('{host}') + ' غير موجود في قائمة «التعبئة في هذه المواقع فقط».',
    'sec.cannotAllow': 'لا يمكن السماح بهذا الموقع.',
    'sec.notJson': 'هذا ليس ملف JSON.',
    'sec.notBackup': 'هذا ليس ملف نسخة احتياطية.',
    'sec.needPass': 'هذه النسخة الاحتياطية مشفّرة. أدخل عبارة المرور الخاصة بها أولًا.',
    'sec.noProfiles': 'لم يتم العثور على ملفات شخصية في هذا الملف.',
    'profile.imported': 'مستورد',
    'profile.importedCopy': '{name} (مستورد)',

    'fieldGroup.personal': 'البيانات الشخصية',
    'fieldGroup.location': 'الموقع',
    'fieldGroup.links': 'الروابط',
    'fieldGroup.work': 'العمل',
    'fieldGroup.education': 'التعليم',
    'fieldGroup.text': 'النصوص',
    'field.firstName': 'الاسم الأول',
    'field.lastName': 'اسم العائلة',
    'field.email': 'البريد الإلكتروني',
    'field.phone': 'رقم الهاتف',
    'field.dob': 'تاريخ الميلاد',
    'field.gender': 'الجنس',
    'field.nationality': 'الجنسية',
    'field.address': 'عنوان الشارع',
    'field.city': 'المدينة',
    'field.state': 'الولاية / المحافظة',
    'field.postalCode': 'الرمز البريدي',
    'field.country': 'الدولة',
    'field.linkedin': 'رابط LinkedIn',
    'field.github': 'رابط GitHub',
    'field.website': 'الموقع الإلكتروني / معرض الأعمال',
    'field.currentCompany': 'الشركة الحالية',
    'field.currentTitle': 'المسمى الوظيفي الحالي',
    'field.yearsExperience': 'سنوات الخبرة',
    'field.salary': 'الراتب المتوقع',
    'field.noticePeriod': 'فترة الإشعار / موعد الجاهزية للبدء',
    'field.university': 'الجامعة / المدرسة',
    'field.degree': 'الدرجة العلمية',
    'field.major': 'التخصص / مجال الدراسة',
    'field.gradYear': 'سنة التخرج',
    'field.gpa': 'المعدل التراكمي',
    'field.summary': 'نبذة مختصرة',
    'field.coverLetter': 'خطاب التقديم / الدافع',
    'field.fullName': 'الاسم الكامل',

    'question.authorizedToWork': 'هل أنت مصرّح لك قانونيًا بالعمل في هذا البلد؟',
    'question.needsSponsorship': 'هل تحتاج إلى كفالة تأشيرة؟',
    'question.willingToRelocate': 'هل أنت مستعد للانتقال؟',
    'question.veteranStatus': 'حالة المحارب القديم / الخدمة العسكرية',
    'question.disabilityStatus': 'حالة الإعاقة',
    'question.howHeard': 'كيف سمعت عنا؟',
    'question.is18Plus': 'هل عمرك 18 عامًا أو أكثر؟',
    'question.criminalRecord': 'هل لديك سجل جنائي / أحكام؟',
    'question.earliestStart': 'أقرب تاريخ للبدء',
    'question.salaryExpectations': 'توقعات الراتب',
    'question.workPreference': 'تفضيل العمل: عن بُعد / مختلط / حضوري',
    'question.languagesSpoken': 'اللغات التي تتحدثها',

    'section.experience.title': 'الخبرة العملية',
    'section.experience.item': 'الخبرة',
    'section.experience.add': 'إضافة خبرة',
    'section.experience.company': 'الشركة',
    'section.experience.jobTitle': 'المسمى الوظيفي',
    'section.experience.start': 'البداية (مثال: 2021-05)',
    'section.experience.end': 'النهاية (مثال: 2023-08، أو حتى الآن)',
    'section.experience.description': 'الوصف',
    'section.education.title': 'المؤهلات الدراسية',
    'section.education.item': 'المؤهل',
    'section.education.add': 'إضافة مؤهل',
    'section.education.school': 'المدرسة / الجامعة',
    'section.education.degree': 'الدرجة العلمية',
    'section.education.major': 'التخصص / مجال الدراسة',
    'section.education.year': 'سنة التخرج',
    'section.education.gpa': 'المعدل التراكمي',
    'entries.hint': 'الأحدث أولًا. النموذج الذي يحتوي على قسم واحد يأخذ الإدخال الأول، والنموذج الذي يحتوي على عدة أقسام يأخذها بالترتيب.',
    'entries.itemTitle': '{item} {n}',
    'entries.up': 'نقل لأعلى',
    'entries.down': 'نقل لأسفل',
    'entries.remove': 'حذف',
    'entries.upFor': 'نقل {title} لأعلى',
    'entries.downFor': 'نقل {title} لأسفل',
    'entries.removeFor': 'حذف {title}',
    'entries.removed': 'تم حذف: {item}',
    'entries.alreadyFirst': 'هو الأول بالفعل',
    'entries.alreadyLast': 'هو الأخير بالفعل',
    'entries.moved': 'تم النقل إلى الموضع {n}',

    'options.docTitle': 'ملفي الشخصي · One-Click Form Filler',
    'options.h1': 'ملفي الشخصي',
    'options.intro': 'يُحفظ كل شيء في هذا المتصفح فقط. اترك الحقل فارغًا لتخطيه.',
    'options.profiles': 'الملفات الشخصية',
    'options.editing': 'الملف الشخصي الجاري تعديله',
    'options.profileName': 'اسم الملف الشخصي',
    'options.newProfile': 'ملف شخصي فارغ جديد',
    'options.dupProfile': 'نسخ (مثلًا: من الإنجليزية إلى العربية)',
    'options.delProfile': 'حذف',
    'options.newProfileName': 'ملف شخصي جديد',
    'options.copyName': '{name} (نسخة)',
    'options.confirmDelete': 'هل تريد حذف الملف الشخصي «{name}»؟',
    'options.saved': 'تم الحفظ ✓',
    'options.importedFlash': 'تم الاستيراد كملف شخصي جديد — اضغط «حفظ»',
    'options.invalidFile': 'ملف غير صالح',
    'options.export': 'تصدير JSON',
    'options.import': 'استيراد JSON',
    'options.questions.legend': 'الأسئلة الشائعة',
    'options.questions.help': 'أجب عن هذه الأسئلة مرة واحدة وستُعبّأ أينما ظهرت، في النماذج الإنجليزية أو العربية. قواعدك المخصصة أدناه لها الأولوية؛ اترك الإجابة فارغة لتخطيها.',
    'options.questions.skip': 'بلا إجابة (تخطي)',
    'options.rules.legend': 'القواعد المخصصة',
    'options.rules.help': 'علّمها سؤالًا: إذا كان عنوان الحقل يحتوي على النص الموجود في الجهة الأولى، فسيُعبّأ بالقيمة الموجودة في الجهة الثانية (مثال: work authorization ← Yes؛ وفي أزرار الاختيار تكون القيمة نص الإجابة).',
    'options.rules.labelContains': 'عنوان الحقل يحتوي على',
    'options.rules.labelContainsPh': 'عنوان الحقل يحتوي على…',
    'options.rules.answerPh': 'الإجابة',
    'options.rules.remove': 'حذف القاعدة',
    'options.rules.add': 'إضافة قاعدة',
    'options.docs.legend': 'المستندات',
    'options.docs.help': 'تُرفق سيرتك الذاتية بحقول رفع السيرة الذاتية (PDF أو DOCX، حتى 5 ميغابايت). تُحفظ في هذا المتصفح فقط، واحدة لكل ملف شخصي.',
    'options.docs.none': 'لم يتم رفع سيرة ذاتية لهذا الملف الشخصي.',
    'options.docs.current': 'السيرة الذاتية الحالية: ' + L('{name}') + ' (' + L('{kb} KB') + ')',
    'options.docs.upload': 'رفع السيرة الذاتية',
    'options.docs.remove': 'حذف السيرة الذاتية',
    'options.docs.badType': 'يُقبل فقط ملفات PDF أو DOCX.',
    'options.docs.tooBig': 'حجم الملف أكبر من 5 ميغابايت.',
    'options.docs.saved': 'تم حفظ السيرة الذاتية ✓',
    'options.docs.full': 'تعذّر الحفظ (مساحة تخزين المتصفح ممتلئة).',
    'options.docs.removed': 'تم حذف السيرة الذاتية',
    'options.tracker.legend': 'متتبّع الطلبات',
    'options.tracker.label': 'تتبّع طلباتي',
    'options.tracker.text': 'يحفظ عنوان الصفحة (دون أي شيء بعد علامة «؟»)، والعنوان، والتاريخ عند نجاح كل تعبئة. يُحفظ في هذا المتصفح فقط.',
    'options.tracker.view': 'عرض طلباتي',

    'optsec.passLegend': 'قفل عبارة المرور',
    'optsec.passOn': '🔒 قفل عبارة المرور مفعّل. ملفاتك الشخصية مشفّرة على هذا الجهاز وتفتح قفلها مرة واحدة في كل جلسة متصفح.',
    'optsec.passOff': 'اختياري. شفّر ملفاتك الشخصية على هذا الجهاز (' + L('AES-GCM') + '، ويُشتق المفتاح من عبارة المرور). تُدخلها مرة واحدة في كل جلسة متصفح.',
    'optsec.passWarn': 'لا توجد استعادة لعبارة المرور. إذا نسيتها فلن يتمكن أحد من قراءة ملفاتك الشخصية ونسخك الاحتياطية المشفّرة، بمن فيهم نحن. احتفظ بنسخة غير مشفّرة في مكان آمن إذا كان هذا يقلقك.',
    'optsec.mismatch': 'عبارتا المرور الجديدتان غير متطابقتين.',
    'optsec.newPass': {
      zero: 'عبارة مرور جديدة ({n} حرف على الأقل)',
      one: 'عبارة مرور جديدة (حرف واحد على الأقل)',
      two: 'عبارة مرور جديدة (حرفان على الأقل)',
      few: 'عبارة مرور جديدة ({n} أحرف على الأقل)',
      many: 'عبارة مرور جديدة ({n} حرفًا على الأقل)',
      other: 'عبارة مرور جديدة ({n} حرف على الأقل)'
    },
    'optsec.repeatPass': 'أعد كتابة عبارة المرور الجديدة',
    'optsec.currentPass': 'عبارة المرور الحالية',
    'optsec.turnOn': 'تفعيل قفل عبارة المرور',
    'optsec.turnedOn': 'تم تفعيل قفل عبارة المرور. أصبحت ملفاتك الشخصية مخزّنة مشفّرة.',
    'optsec.change': 'تغيير عبارة المرور',
    'optsec.changed': 'تم تغيير عبارة المرور. النسخ الاحتياطية المشفّرة الأقدم ما زالت تحتاج إلى عبارة المرور القديمة.',
    'optsec.remove': 'إزالة عبارة المرور',
    'optsec.confirmRemove': 'هل تريد إزالة عبارة المرور؟ ستُخزَّن ملفاتك الشخصية بدون تشفير على هذا الجهاز.',
    'optsec.removed': 'تمت إزالة عبارة المرور. الملفات الشخصية مخزّنة بدون تشفير.',
    'optsec.sitesLegend': 'التعبئة في هذه المواقع فقط',
    'optsec.sitesHelp': 'اختياري. عند التفعيل، تُرفض التعبئة (بالزر أو بالاختصار ' + L('Ctrl+Shift+F') + ') في أي موقع غير مدرج هنا. موقع واحد في كل سطر. ' + L('example.com') + ' يطابق هذا المضيف فقط؛ و' + L('*.example.com') + ' يطابق ' + L('example.com') + ' وجميع نطاقاته الفرعية. يمكنك أيضًا إضافة الموقع الحالي من نافذة الإضافة.',
    'optsec.sitesOn': 'التعبئة في المواقع المدرجة أدناه فقط',
    'optsec.sitesList': 'المواقع المسموحة',
    'optsec.sitesSave': 'حفظ قائمة المواقع',
    'optsec.sitesInvalid': 'موقع غير صالح: {sites}',
    'optsec.sitesEmpty': 'القائمة فارغة، لذلك ستُرفض التعبئة في كل مكان. هل تريد المتابعة؟',
    'optsec.sitesSaved': {
      zero: 'تم الحفظ. التعبئة غير مسموحة في أي موقع.',
      one: 'تم الحفظ. التعبئة مقتصرة على موقع واحد.',
      two: 'تم الحفظ. التعبئة مقتصرة على موقعين.',
      few: 'تم الحفظ. التعبئة مقتصرة على {n} مواقع.',
      many: 'تم الحفظ. التعبئة مقتصرة على {n} موقعًا.',
      other: 'تم الحفظ. التعبئة مقتصرة على {n} موقع.'
    },
    'optsec.sitesOff': 'تم الحفظ. القائمة متوقفة، والتعبئة تعمل في كل المواقع.',
    'optsec.backupLegend': 'النسخ الاحتياطي',
    'optsec.backupEncrypted': '🔒 النسخ الاحتياطية مشفّرة بعبارة المرور الخاصة بك (وتحتاجها مرة أخرى لاستيرادها).',
    'optsec.backupPlain': '⚠ بدون عبارة مرور يحتوي ملف النسخة الاحتياطية على بياناتك كنص عادي. احتفظ به في مكان آمن، أو عيّن عبارة مرور أعلاه لتشفيره.',
    'optsec.backupIntro': 'ملف واحد يضم جميع ملفاتك الشخصية. يدمج الاستيراد الملفات الجديدة مع ما لديك؛ ولا يُستبدل أو يُحذف أي شيء.',
    'optsec.backupDays': 'ذكّرني بالنسخ الاحتياطي كل (عدد الأيام، 0 = أبدًا)',
    'optsec.backupFilePass': 'عبارة مرور ملف النسخة الاحتياطية (فقط إذا كان مشفّرًا)',
    'optsec.backupDownload': 'تنزيل نسخة احتياطية لجميع الملفات الشخصية',
    'optsec.backupImport': 'استيراد نسخة احتياطية (دمج)',
    'optsec.backupSaveInterval': 'حفظ فترة التذكير',
    'optsec.reminderEvery': {
      zero: 'التذكير كل {n} يوم.',
      one: 'التذكير كل يوم.',
      two: 'التذكير كل يومين.',
      few: 'التذكير كل {n} أيام.',
      many: 'التذكير كل {n} يومًا.',
      other: 'التذكير كل {n} يوم.'
    },
    'optsec.remindersOff': 'التذكيرات متوقفة.',
    'optsec.merged': {
      zero: 'لم يُدمج أي ملف شخصي جديد. تم الحفظ.',
      one: 'تم دمج ملف شخصي جديد واحد. تم الحفظ.',
      two: 'تم دمج ملفين شخصيين جديدين. تم الحفظ.',
      few: 'تم دمج {n} ملفات شخصية جديدة. تم الحفظ.',
      many: 'تم دمج {n} ملفًا شخصيًا جديدًا. تم الحفظ.',
      other: 'تم دمج {n} ملف شخصي جديد. تم الحفظ.'
    },
    'optsec.mergedSkipped': {
      zero: 'لم يُدمج أي ملف شخصي جديد، و{skipped} موجود مسبقًا. تم الحفظ.',
      one: 'تم دمج ملف شخصي جديد واحد، و{skipped} موجود مسبقًا. تم الحفظ.',
      two: 'تم دمج ملفين شخصيين جديدين، و{skipped} موجود مسبقًا. تم الحفظ.',
      few: 'تم دمج {n} ملفات شخصية جديدة، و{skipped} موجود مسبقًا. تم الحفظ.',
      many: 'تم دمج {n} ملفًا شخصيًا جديدًا، و{skipped} موجود مسبقًا. تم الحفظ.',
      other: 'تم دمج {n} ملف شخصي جديد، و{skipped} موجود مسبقًا. تم الحفظ.'
    },
    'optsec.backupDownloadedEncrypted': 'تم تنزيل النسخة الاحتياطية المشفّرة.',
    'optsec.backupDownloadedPlain': 'تم تنزيل النسخة الاحتياطية. وهي تحتوي على نص عادي، فاحتفظ بها في مكان آمن.',

    'aiopt.legend': 'اقتراحات الذكاء الاصطناعي (اختياري)',
    'aiopt.intro': 'متوقفة افتراضيًا. عند تفعيلها يمكنك أن تطلب من الذكاء الاصطناعي صياغة إجابة عن سؤال مفتوح لا تستطيع الإضافة الإجابة عنه (مثل «لماذا تريد العمل لدينا؟»). لا يتم إدراج أي شيء أو إرساله نيابةً عنك أبدًا.',
    'aiopt.warnTitle': '⚠ هذه هي الميزة الوحيدة التي ترسل بيانات خارج متصفحك',
    'aiopt.warnIntro': 'فقط عند النقر على «اقتراح إجابة بالذكاء الاصطناعي…»، ترسل هذه الإضافة ما يلي إلى Anthropic (' + L('api.anthropic.com') + '):',
    'aiopt.warnItem1': 'نص السؤال الذي تجيب عنه؛',
    'aiopt.warnItem2': 'المسمى الوظيفي واسم الشركة الظاهران في الصفحة، إن وُجدا؛',
    'aiopt.warnItem3': 'فقط أجزاء الملف الشخصي التي تحددها أدناه.',
    'aiopt.warnNever': 'لا يُرسل أبدًا: بريدك الإلكتروني أو هاتفك أو عنوانك أو سيرتك الذاتية أو أرقام الهوية أو أي حقل آخر في ملفك الشخصي. لا يُرسل أي شيء في الخلفية، ولا توجد أي أدوات تحليلات.',
    'aiopt.warnBilling': 'تستخدم الطلبات مفتاح Anthropic API الخاص بك، لذا تُحتسب تكلفة الاستخدام على حسابك في Anthropic API. وتسري شروط Anthropic وسياسة الخصوصية الخاصة بها على ما ترسله.',
    'aiopt.partsLegend': 'أجزاء الملف الشخصي التي يمكن للذكاء الاصطناعي استخدامها',
    'aiopt.part.education': 'التعليم (المدرسة، الدرجة، التخصص، السنة)',
    'aiopt.part.experience': 'إدخالات الخبرة العملية (المسمى، الشركة، التواريخ، الوصف)',
    'aiopt.partsHint': 'إذا لم تحدد شيئًا فسيرى الذكاء الاصطناعي السؤال فقط، وغالبًا ما سيجيب بـ «' + L('{marker}') + '».',
    'aiopt.keyLabel': 'مفتاح Anthropic API الخاص بك',
    'aiopt.keyHint': 'أنشئ مفتاحًا من وحدة تحكم Anthropic. يُحفظ في هذا المتصفح فقط ويُرسل إلى ' + L('api.anthropic.com') + ' فقط.',
    'aiopt.keySavedPlain': 'تم حفظ مفتاح. وهو مخزّن بدون تشفير في هذا المتصفح (فعّل قفل عبارة المرور ثم أدخل المفتاح مرة أخرى لحمايته).',
    'aiopt.keySavedProtected': 'تم حفظ مفتاح وهو محمي بقفل عبارة المرور.',
    'aiopt.keyNone': 'لم يتم حفظ مفتاح بعد.',
    'aiopt.keyPlaceholderSaved': 'محفوظ (مخفي). اكتب مفتاحًا جديدًا لاستبداله.',
    'aiopt.keyStorageNotePlain': 'ليس لديك قفل بعبارة مرور، لذا يُخزَّن المفتاح بدون تشفير في هذا المتصفح. يمكن لأي شخص يصل إلى ملف المتصفح قراءته.',
    'aiopt.keyStorageNoteProtected': 'قفل عبارة المرور مفعّل، لذا يُشفَّر المفتاح بها. إذا غيّرت عبارة المرور أو أزلتها فعليك إدخال المفتاح مرة أخرى.',
    'aiopt.modelLabel': 'اسم النموذج',
    'aiopt.modelHint': 'يُنصح باستخدام نموذج صغير وسريع. الافتراضي: ' + L('{model}'),
    'aiopt.consent': 'أفهم ما الذي يُرسل ولمن، وأن تكلفة الاستخدام تُحتسب على حسابي في Anthropic.',
    'aiopt.enable': 'تفعيل اقتراحات الذكاء الاصطناعي',
    'aiopt.enableNeedsConsent': 'ضع علامة في مربع الموافقة أولًا.',
    'aiopt.save': 'حفظ إعدادات الذكاء الاصطناعي',
    'aiopt.test': 'اختبار الاتصال',
    'aiopt.removeKey': 'إزالة المفتاح',
    'aiopt.saved': 'تم الحفظ. اقتراحات الذكاء الاصطناعي مفعّلة.',
    'aiopt.savedOff': 'تم الحفظ. اقتراحات الذكاء الاصطناعي متوقفة.',
    'aiopt.needConsent': 'ضع علامة في مربع الموافقة قبل تفعيل اقتراحات الذكاء الاصطناعي.',
    'aiopt.needKey': 'أدخل مفتاح API أولًا.',
    'aiopt.permDenied': 'لم يتم منح إذن الوصول إلى ' + L('api.anthropic.com') + '، لذا تبقى اقتراحات الذكاء الاصطناعي متوقفة.',
    'aiopt.testing': 'جارٍ الاختبار…',
    'aiopt.keyRemoved': 'تمت إزالة المفتاح. اقتراحات الذكاء الاصطناعي متوقفة.',
    'aiopt.cannotProtect': 'تعذّر تخزين المفتاح: افتح قفل ملفاتك الشخصية أولًا.',

    'ai.menuTitle': 'اقتراح إجابة بالذكاء الاصطناعي…',
    'ai.off': 'اقتراحات الذكاء الاصطناعي متوقفة. فعّلها من خيارات الإضافة (اقتراحات الذكاء الاصطناعي).',
    'ai.noConsent': 'تتطلب اقتراحات الذكاء الاصطناعي موافقتك. افتح خيارات الإضافة وضع علامة في مربع الموافقة.',
    'ai.noKey': 'لم يتم حفظ مفتاح API. أضف مفتاح Anthropic API في خيارات الإضافة.',
    'ai.noPermission': 'إذن الاتصال بـ ' + L('api.anthropic.com') + ' غير متوفر. افتح خيارات الإضافة وفعّل اقتراحات الذكاء الاصطناعي من جديد.',
    'ai.locked': 'الملفات مقفلة. افتح نافذة الإضافة وأدخل عبارة المرور، ثم حاول مرة أخرى.',
    'ai.keyUnreadable': 'لم يعد بالإمكان قراءة مفتاح API المحفوظ (تم تغيير عبارة المرور أو إزالتها). أدخل المفتاح مرة أخرى في خيارات الإضافة.',
    'ai.noQuestion': 'تعذّرت قراءة السؤال الخاص بهذا الحقل.',
    'ai.cap': {
      zero: 'تم بلوغ حد الجلسة ({n} طلب للذكاء الاصطناعي). أعد تشغيل المتصفح للمتابعة، أو اكتب هذه الإجابة بنفسك.',
      one: 'تم بلوغ حد الجلسة (طلب واحد للذكاء الاصطناعي). أعد تشغيل المتصفح للمتابعة، أو اكتب هذه الإجابة بنفسك.',
      two: 'تم بلوغ حد الجلسة (طلبان للذكاء الاصطناعي). أعد تشغيل المتصفح للمتابعة، أو اكتب هذه الإجابة بنفسك.',
      few: 'تم بلوغ حد الجلسة ({n} طلبات للذكاء الاصطناعي). أعد تشغيل المتصفح للمتابعة، أو اكتب هذه الإجابة بنفسك.',
      many: 'تم بلوغ حد الجلسة ({n} طلبًا للذكاء الاصطناعي). أعد تشغيل المتصفح للمتابعة، أو اكتب هذه الإجابة بنفسك.',
      other: 'تم بلوغ حد الجلسة ({n} طلب للذكاء الاصطناعي). أعد تشغيل المتصفح للمتابعة، أو اكتب هذه الإجابة بنفسك.'
    },
    'ai.badKey': 'رفضت Anthropic مفتاح API (401). تحقق من المفتاح في خيارات الإضافة.',
    'ai.forbidden': 'رفضت Anthropic هذا الطلب (403). قد لا يملك مفتاحك صلاحية استخدام هذا النموذج.',
    'ai.badModel': 'لا تتعرف Anthropic على هذا النموذج (404). تحقق من اسم النموذج في خيارات الإضافة.',
    'ai.badRequest': 'تعذّرت على Anthropic معالجة الطلب (400).',
    'ai.rateLimit': 'تم بلوغ حد المعدل أو حد الاستخدام (429). انتظر دقيقة ثم حاول مرة أخرى، أو تحقق من حسابك في Anthropic.',
    'ai.server': 'خدمة Anthropic غير متاحة مؤقتًا ({status}). حاول مرة أخرى بعد قليل.',
    'ai.network': 'تعذّر الوصول إلى ' + L('api.anthropic.com') + '. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    'ai.emptyReply': 'لم يُرجع النموذج أي نص. حاول مرة أخرى.',
    'ai.testOk': 'الاتصال يعمل.',
    'ai.badKeyFormat': 'لا يبدو أن هذا مفتاح API.',

    'aiprompt.title': 'اقتراح إجابة بالذكاء الاصطناعي',
    'aiprompt.questionLabel': 'السؤال',
    'aiprompt.draftLabel': 'المسودة (يمكنك تعديلها)',
    'aiprompt.note': 'صاغها الذكاء الاصطناعي من البيانات التي سمحت بها — راجعها قبل الإرسال.',
    'aiprompt.generating': 'جارٍ إعداد مسودة الإجابة…',
    'aiprompt.ready': 'المسودة جاهزة. راجعها وعدّلها ثم أدرجها.',
    'aiprompt.insert': 'إدراج في الحقل',
    'aiprompt.regenerate': 'إعادة التوليد',
    'aiprompt.noField': 'انقر داخل مربع نص أو منطقة نص أولًا (أو انقر عليه بزر الفأرة الأيمن)، ثم اختر هذا الخيار مرة أخرى.',
    'aiprompt.error': 'تعذّر إعداد مسودة الإجابة: {error}',
    'aiprompt.unknownError': 'حدث خطأ ما. حاول مرة أخرى.',

    'teach.title': 'علّم Form Filler هذا الحقل',
    'teach.noField': 'انقر بزر الفأرة الأيمن على أحد حقول النموذج (مربع نص أو قائمة منسدلة أو زر اختيار أو خانة اختيار) ثم اختر هذا الخيار مرة أخرى.',
    'teach.intro': 'عندما يحتوي عنوان الحقل على {match}، عبّئه بإجابتك.',
    'teach.introProfile': 'عندما يحتوي عنوان الحقل على {match}، عبّئه بإجابتك (تُحفظ في الملف الشخصي «{profile}»).',
    'teach.unnamed': '(حقل بلا اسم)',
    'teach.choose': 'اختر إجابة…',
    'teach.save': 'حفظ الإجابة',
    'teach.noLabel': 'ليس لهذا الحقل عنوان يمكن المطابقة عليه.',
    'teach.empty': 'اكتب إجابة أو اختر واحدة أولًا.',
    'teach.saveFail': 'تعذّر الحفظ. حاول مرة أخرى.',
    'teach.saved': 'تم الحفظ ✓ ستُستخدم في المرة القادمة التي تعبّئ فيها.',
    'filler.required': '⚠ مطلوب – عبّئ هذا الحقل بنفسك',

    'history.docTitle': 'طلباتي · One-Click Form Filler',
    'history.backToProfile': 'ملفي الشخصي',
    'history.title': 'طلباتي',
    'history.privacy': 'سجل بالصفحات التي عبّأتها. يُحفظ في هذا المتصفح فقط. يمكنك إيقافه من الإعدادات.',
    'history.search': 'بحث (العنوان، الموقع، الملاحظات)',
    'history.filter': 'عرض الحالة',
    'history.all': 'كل الحالات',
    'history.exportCsv': 'تصدير CSV',
    'history.status': 'الحالة',
    'history.notes': 'ملاحظات',
    'history.delete': 'حذف',
    'history.fieldsFilled': {
      zero: '{n} حقل معبّأ',
      one: 'حقل واحد معبّأ',
      two: 'حقلان معبّآن',
      few: '{n} حقول معبّأة',
      many: '{n} حقلًا معبّأً',
      other: '{n} حقل معبّأ'
    },
    'history.emptyNone': 'لا توجد طلبات بعد. عبّئ نموذج تقديم باستخدام الإضافة وسيظهر هنا.',
    'history.emptyFilter': 'لا توجد طلبات تطابق بحثك أو التصفية.',
    'history.listLabel': 'الطلبات',
    'history.saved': 'تم الحفظ',
    'history.deleted': 'تم حذف الإدخال',
    'history.confirmDelete': 'هل تريد حذف هذا الإدخال؟',
    'history.exported': 'تم تصدير ملف CSV',
    'history.status.applied': 'تم التقديم',
    'history.status.interviewing': 'قيد المقابلات',
    'history.status.offer': 'عرض وظيفي',
    'history.status.rejected': 'مرفوض',
    'history.status.saved': 'محفوظ',
    'history.csv.date': 'التاريخ',
    'history.csv.title': 'العنوان',
    'history.csv.site': 'الموقع',
    'history.csv.url': 'الرابط',
    'history.csv.filled': 'الحقول المعبّأة',
    'history.sumMonth': {
      zero: 'لا توجد طلبات هذا الشهر',
      one: 'طلب واحد هذا الشهر',
      two: 'طلبان هذا الشهر',
      few: '{n} طلبات هذا الشهر',
      many: '{n} طلبًا هذا الشهر',
      other: '{n} طلب هذا الشهر'
    },
    'history.sumTotal': 'الإجمالي: {n}',
    'history.openPage': 'فتح الصفحة: {title}',
    'history.notesFor': 'ملاحظات على {title}',
    'history.statusFor': 'حالة {title}',
    'history.deleteFor': 'حذف الإدخال: {title}',

    'onboarding.title': 'مرحبًا بك في One-Click Form Filler',
    'onboarding.stepOf': 'الخطوة {n} من {total}',
    'onboarding.s1h': 'ماذا تفعل الإضافة',
    'onboarding.s1a': 'تعبّئ نماذج الوظائف والتدريب والتقديم بنقرة واحدة، اعتمادًا على ملف شخصي تكتبه مرة واحدة. يمكنك الاحتفاظ بعدة ملفات شخصية، مثل ملف بالإنجليزية وآخر بالعربية.',
    'onboarding.s1b': 'وعد الخصوصية: تبقى بياناتك في هذا المتصفح. لا يُرسل أي شيء إلى أي جهة، ولا ترسل الإضافة أي نموذج نيابةً عنك.',
    'onboarding.s2h': 'أنشئ ملفك الشخصي الأول',
    'onboarding.s2a': 'الأساسيات فقط الآن. يمكنك إضافة كل شيء آخر لاحقًا من الإعدادات. اترك الحقل فارغًا لتخطيه.',
    'onboarding.saveError': 'تعذّر الحفظ. يُرجى المحاولة مرة أخرى.',
    'onboarding.s3h': 'كيف تعبّئ نموذجًا',
    'onboarding.s3.1': 'افتح نموذج تقديم، ثم انقر على أيقونة الإضافة، ثم اضغط «تعبئة هذه الصفحة».',
    'onboarding.s3.2': 'أو اضغط ' + L('Ctrl+Shift+F') + ' (و' + L('Command+Shift+F') + ' على ماك) في صفحة النموذج. تعرض الأيقونة عدد الحقول التي تمت تعبئتها.',
    'onboarding.s3.3': 'راجع كل شيء، ثم أرسل الطلب بنفسك.',
    'onboarding.s3.4': 'التحديثات: تُحدّث الإضافة نفسها من Chrome Web Store. إذا ثبّتّها من مجلد، فاستبدل الملفات ثم افتح ' + L('chrome://extensions') + ' واضغط زر إعادة التحميل الخاص بهذه الإضافة.',
    'onboarding.back': 'رجوع',
    'onboarding.next': 'التالي',
    'onboarding.saveNext': 'حفظ ومتابعة',
    'onboarding.finish': 'إنهاء وفتح ملفي الشخصي'
  };

  const DICT = { en: EN, ar: AR };
  const LANGS = ['en', 'ar'];
  const RTL = ['ar'];
  const SETTINGS = ['auto'].concat(LANGS);
  const KEY = 'uiLang';           // chrome.storage.local key
  const HINT = 'formfill.uiLang'; // localStorage mirror so pages can pick the language before storage answers

  // "Own page" = an extension page, the service worker or Node. A web page that merely received our content scripts is not:
  // there we never read chrome.storage, never save, and never touch the page's DOM (the injector passes the language in).
  const hasDoc = typeof document !== 'undefined' && !!document.documentElement;
  const ownPage = !hasDoc || location.protocol === 'chrome-extension:' || !!document.querySelector('[data-i18n],[data-i18n-page]');
  const hasStorage = () => { try { return !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local); } catch { return false; } };
  const noop = () => {};

  const state = { setting: 'auto', lang: 'en' };
  const listeners = [];
  const rules = {};

  function systemLang() {
    try { return String(chrome.i18n.getUILanguage()).toLowerCase().startsWith('ar') ? 'ar' : 'en'; } catch { return 'en'; }
  }
  const resolve = (setting) => (LANGS.includes(setting) ? setting : systemLang());
  const isRtl = (lang) => RTL.includes(lang || state.lang);

  function lookup(lang, key) {
    const d = DICT[lang];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : null;
  }
  function pluralForm(lang, n) {
    try { return (rules[lang] || (rules[lang] = new Intl.PluralRules(lang))).select(Number(n)); } catch { return Number(n) === 1 ? 'one' : 'other'; }
  }
  function pick(entry, lang, vars) {
    if (typeof entry !== 'object' || entry === null) return String(entry);
    const form = vars && vars.n != null ? pluralForm(lang, vars.n) : 'other';
    return String(entry[form] != null ? entry[form] : entry.other);
  }

  // t('popup.filled', { n: 3 }): {name} placeholders are replaced from vars; objects are plural forms chosen by vars.n.
  function t(key, vars, lang) {
    const l = lang || state.lang;
    const entry = lookup(l, key);
    if (entry === null) return key;
    return pick(entry, l, vars).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  }
  // Like t(), but vars may be DOM nodes: returns an array of strings and nodes for el.append(...).
  function nodes(key, vars, lang) {
    const l = lang || state.lang;
    const entry = lookup(l, key);
    const text = entry === null ? key : pick(entry, l, vars);
    return text.split(/(\{\w+\})/).filter(Boolean).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      return m && vars && vars[m[1]] != null ? vars[m[1]] : part;
    });
  }

  function remember(setting) { try { localStorage.setItem(HINT, setting); } catch { /* storage may be blocked */ } }

  function emit() {
    if (autoDom) applyDom(document);
    for (const fn of listeners.slice()) { try { fn(state.lang, state.setting); } catch { /* one bad listener must not stop the rest */ } }
  }

  // setLang('ar' | 'en' | 'auto'). The in-memory language changes at once (synchronously); the returned promise
  // resolves when the choice is saved. { persist: false } = in-memory only (content scripts, tests).
  function setLang(value, opts) {
    const setting = SETTINGS.includes(value) ? value : 'auto';
    const before = state.lang + '/' + state.setting;
    state.setting = setting; state.lang = resolve(setting);
    let saved = Promise.resolve();
    if (!opts || opts.persist !== false) {
      remember(setting);
      if (hasStorage() && ownPage) { try { saved = Promise.resolve(chrome.storage.local.set({ [KEY]: setting })).catch(noop); } catch { /* ignore */ } }
    }
    if (before !== state.lang + '/' + state.setting) emit();
    return saved;
  }

  function dirOf(lang) { return isRtl(lang) ? 'rtl' : 'ltr'; }

  const ATTRS = [['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-title', 'title']];
  function applyDom(rootEl) {
    const el = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!el) return;
    const doc = el.nodeType === 9 ? el : el.ownerDocument;
    if (el.nodeType === 9) { doc.documentElement.lang = state.lang; doc.documentElement.dir = dirOf(); }
    el.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.getAttribute('data-i18n')); });
    for (const [attr, target] of ATTRS) el.querySelectorAll('[' + attr + ']').forEach((n) => { n.setAttribute(target, t(n.getAttribute(attr))); });
  }

  // Small switcher (label "Language / اللغة" + select) for the popup and Options. { reload: true } reloads the page
  // after a change (popup); otherwise listeners re-render in place.
  function mountSwitcher(container, opts) {
    const doc = container.ownerDocument;
    const label = doc.createElement('label'); label.className = 'ff-lang';
    const text = doc.createElement('span'); text.setAttribute('data-i18n', 'lang.label');
    const select = doc.createElement('select'); select.id = 'uiLang';
    for (const v of SETTINGS) { const o = doc.createElement('option'); o.value = v; o.setAttribute('data-i18n', 'lang.' + v); select.appendChild(o); }
    label.append(text, select); container.appendChild(label);
    applyDom(label);
    select.value = state.setting;
    select.onchange = async () => {
      if (opts && opts.reload) { try { sessionStorage.setItem('ffLangFocus', '1'); } catch { /* ignore */ } }
      await setLang(select.value);
      if (opts && opts.reload) location.reload();
    };
    listeners.push(() => { select.value = state.setting; });
    try { if (sessionStorage.getItem('ffLangFocus')) { sessionStorage.removeItem('ffLangFocus'); select.focus(); } } catch { /* ignore */ }
    return label;
  }

  const api = {
    en: EN, ar: AR, LANGS, SETTINGS, KEY,
    t, nodes, getLang: () => state.lang, getSetting: () => state.setting, setLang, isRtl, dirOf, applyDom, mountSwitcher,
    onChange: (fn) => { listeners.push(fn); },
    ready: Promise.resolve()
  };
  root.FORMFILL_I18N = api;
  root.FormFillI18n = api;
  // Extension pages and the worker get a short global `t`; web pages (content scripts) do not.
  if (ownPage) root.t = t;

  // Extension pages and the service worker follow the saved setting and keep in sync with other pages.
  let autoDom = false;
  if (ownPage) {
    autoDom = hasDoc;
    if (typeof localStorage !== 'undefined') {
      try { const h = localStorage.getItem(HINT); if (SETTINGS.includes(h)) { state.setting = h; state.lang = resolve(h); } } catch { /* ignore */ }
    }
    if (autoDom) {
      const first = () => applyDom(document);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first); else first();
    }
    if (hasStorage()) {
      try {
        api.ready = Promise.resolve(chrome.storage.local.get({ [KEY]: 'auto' })).then((r) => {
          const s = r && SETTINGS.includes(r[KEY]) ? r[KEY] : 'auto';
          remember(s);
          setLang(s, { persist: false });
        }).catch(noop);
        if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[KEY]) setLang(SETTINGS.includes(changes[KEY].newValue) ? changes[KEY].newValue : 'auto', { persist: false });
          });
        }
      } catch { /* no storage in this context: stay with the default */ }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
