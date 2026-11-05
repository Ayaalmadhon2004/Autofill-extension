// Single source of truth for "common questions": ready-made custom-rule templates for questions that repeat
// across applications. The user sets ONE answer per question per profile (Options -> Common questions,
// stored in profile.answers[key]); filler.js turns each into a rule. `re` is tested against the field's
// normalised signature (lowercase). English and Arabic triggers live side by side.
// kind: 'yesno' (Yes/No picker), 'text' (free text; `suggestions` offered as hints).
(function (root) {
  const Q = (key, label, kind, re, extra) => Object.assign({ key, label, kind, re }, extra);
  root.FORMFILL_QUESTIONS = [
    Q('authorizedToWork', 'Legally authorized to work in the country?', 'yesno',
      ['legally (authori[sz]ed|eligible|permitted)', '(authori[sz]ed|eligible|permitted|right) to work', 'work authori[sz]ation', 'employment eligibility',
        'مصرح (لك )?بالعمل', 'مصرح لك قانون', 'يحق لك العمل', 'تصريح العمل', 'الأهلية للعمل']),
    Q('needsSponsorship', 'Require visa sponsorship?', 'yesno',
      ['sponsorship', '\\bsponsor', 'require.*visa', 'visa.*(require|need)', 'كفالة', 'كفيل', 'تأشيرة', 'فيزا']),
    Q('willingToRelocate', 'Willing to relocate?', 'yesno',
      ['relocat', 'willing to move', 'انتقال', 'نقل (السكن|الإقامة)', 'إعادة التوطين']),
    Q('veteranStatus', 'Veteran / military service status', 'text',
      ['veteran', 'military', 'armed forces', 'محارب', 'المحاربين القدامى', 'الخدمة العسكرية', 'خدمة العلم'],
      { suggestions: ['No', 'Yes', 'I am not a protected veteran', 'I do not wish to answer'] }),
    Q('disabilityStatus', 'Disability status', 'text',
      ['disabilit', '\\bdisabled\\b', 'إعاقة', 'ذوي الاحتياجات', 'ذوي الهمم', 'احتياجات خاصة'],
      { suggestions: ['No', 'Yes', 'I do not wish to answer'] }),
    Q('howHeard', 'How did you hear about us?', 'text',
      ['how did you (hear|find|learn)', 'hear(d)? about (us|this|the)', 'where did you (hear|find|learn)', 'referral source', 'كيف (سمعت|عرفت|علمت)', 'كيف تعرفت', 'من أين (سمعت|عرفت)'],
      { suggestions: ['LinkedIn', 'Company website', 'Friend or colleague', 'Job board'] }),
    Q('is18Plus', 'Are you 18 or older?', 'yesno',
      ['(over|at least|older than|above|least) (18|eighteen)', '\\b18 ?\\+', '18 (years|yrs|or)', 'are you (18|eighteen)', 'age of majority', 'legal age',
        '(فوق|أكبر من|اكبر من|بلغت|عمرك|سن).{0,15}(18|١٨)', '(18|١٨) (عام|سنة)']),
    Q('criminalRecord', 'Criminal record / convictions?', 'yesno',
      ['criminal', 'convict', 'felony', 'misdemeanou?r', 'سجل جنائي', 'سجل إجرامي', 'سوابق', 'محكوم', 'جناية']),
    Q('earliestStart', 'Earliest start date', 'text',
      ['earliest (start|date)', 'start date', 'when can you start', 'date available', 'availability date', 'تاريخ البدء', 'موعد الالتحاق', 'متى يمكنك البدء', 'أقرب موعد', 'تاريخ المباشرة'],
      { suggestions: ['Immediately', '2 weeks', '1 month'] }),
    Q('salaryExpectations', 'Salary expectations', 'text',
      ['salary expectation', 'expected (salary|compensation|pay)', 'desired (salary|compensation|pay)', 'salary requirement', 'compensation expectation', 'الراتب المتوقع', 'توقعات الراتب', 'الراتب المطلوب']),
    Q('workPreference', 'Remote / hybrid / on-site preference', 'text',
      ['\\bremote', 'on ?site', 'hybrid', 'work (arrangement|mode|setting)', 'عن بعد', 'حضوري', 'نمط العمل', 'مقر العمل'],
      { suggestions: ['Remote', 'Hybrid', 'On-site'] }),
    Q('languagesSpoken', 'Languages spoken', 'text',
      ['\\blanguages\\b', 'languages? (spoken|you speak|proficien)', 'اللغات', 'لغات'],
      { suggestions: ['English, Arabic'], exclude: ['programming', 'coding', 'code ', 'برمجة'] })
  ];
})(typeof window !== 'undefined' ? window : self);
