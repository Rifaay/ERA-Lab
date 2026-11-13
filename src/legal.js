// Privacy policy, terms of use and cookie policy, in both languages. Written from what the code does (see
// "PRIVACY - data map.md" in the Coaching Service folder); update both together when the app starts keeping something new.
export const UPDATED = "2026-11-14";

export const legal = {
  en: {
    title: "Privacy and terms",
    updated: "Last updated {date}",
    sections: [
      { h: "Who runs ERA Lab", p: [
        "ERA Lab is an archery coaching tool made by Ahmed Rifaay (Egyptian Recurve Archery). It is used by coaches to plan training, record range sessions, review video and assess their archers.",
        "Questions about your data go to the coach who uses ERA Lab with you, or to Ahmed Rifaay through github.com/Rifaay.",
      ]},
      { h: "What is kept", p: [
        "Archer profiles (name, birth date, gender, discipline, stage, coach notes), training sessions with arrow scores and positions, assessments, plans, goals, check-ins and short video review records (clip name, verdict, faults, hold time).",
        "Video files are never uploaded by ERA Lab. They stay in the coach's own folders.",
      ]},
      { h: "Where it is kept", p: [
        "On the coach's device, in the browser's own storage. Nothing leaves the device unless the coach downloads a backup file or turns on the cloud copy.",
        "Cloud copy (optional): when a coach signs in, records are copied to that coach's private database on Supabase (servers in the European Union) so the coach's phone and computer stay in step. Only that coach can read them. Sign-in codes are emailed through Resend.",
        "Archers under 18, or with no birth date entered, and everything recorded about them, are never copied to the cloud. They stay on the coach's device.",
      ]},
      { h: "Who else receives something", p: [
        "GitHub Pages hosts the app's code. It receives the visitor's internet address, as every website host does, and no archer data.",
        "Google Fonts provides the typefaces. It receives the device's internet address and which font is requested, and no archer data.",
        "Supabase and Resend, only when the cloud copy is on, as described above.",
        "There is no advertising, no analytics and no selling or sharing of data with anyone else.",
      ]},
      { h: "Your rights", p: [
        "You can ask the coach to show you, correct or delete what is kept about you. Deleting an archer in ERA Lab removes their profile and every record about them from the device and, at the next sync, from the cloud copy.",
        "A coach can delete their whole cloud copy at any time in Settings → Cloud copy.",
        "For archers under 18, a parent or guardian exercises these rights and must give written consent before the coach records their data.",
      ]},
      { h: "How long it is kept", p: [
        "Until the coach deletes it. Nothing is deleted automatically. Backup files the coach downloads must be deleted separately.",
      ]},
      { h: "Cookies", p: [
        "ERA Lab sets no cookies and uses no tracking. It uses the browser's storage only to keep the coach's own data and settings on the device, and, when the cloud copy is on, the sign-in session. This storage is necessary for the app to work and is never used to follow anyone across websites.",
      ]},
      { h: "Terms of use", p: [
        "ERA Lab is provided free, as it is, without any guarantee. The coach is responsible for the data they record, for having permission to record it, and for keeping backups.",
        "Training advice in ERA Lab supports a qualified coach's judgement. It is not medical advice.",
        "Do not use ERA Lab to record anyone without their permission, or a guardian's permission for a child.",
        "These terms are governed by the laws of the Arab Republic of Egypt, including Personal Data Protection Law No. 151 of 2020.",
      ]},
    ],
  },
  ar: {
    title: "الخصوصية والشروط",
    updated: "آخر تحديث {date}",
    sections: [
      { h: "من يدير ERA Lab", p: [
        "ERA Lab أداة لتدريب الرماية من إعداد أحمد رفاعي (الرماية المصرية بالقوس المنحني). يستخدمها المدربون لتخطيط التدريب وتسجيل جلسات الميدان ومراجعة الفيديو وتقييم الرماة.",
        "للاستفسار عن بياناتك تواصل مع المدرب الذي يستخدم ERA Lab معك، أو مع أحمد رفاعي عبر github.com/Rifaay.",
      ]},
      { h: "ما الذي يُحفظ", p: [
        "ملفات الرماة (الاسم، تاريخ الميلاد، الجنس، التخصص، المرحلة، ملاحظات المدرب)، وجلسات التدريب بنتائج الأسهم ومواضعها، والتقييمات والخطط والأهداف والمتابعات، وسجلات مختصرة لمراجعة الفيديو (اسم المقطع، الحكم، الأخطاء، زمن الثبات).",
        "لا يرفع ERA Lab ملفات الفيديو أبداً؛ تبقى في مجلدات المدرب.",
      ]},
      { h: "أين تُحفظ", p: [
        "على جهاز المدرب، في مساحة التخزين الخاصة بالمتصفح. لا يخرج شيء من الجهاز إلا إذا نزّل المدرب نسخة احتياطية أو فعّل النسخة السحابية.",
        "النسخة السحابية (اختيارية): عند تسجيل دخول المدرب تُنسخ السجلات إلى قاعدة بيانات خاصة به على Supabase (خوادم في الاتحاد الأوروبي) ليبقى هاتفه وحاسوبه متطابقين. لا يقرؤها غيره. تُرسل رموز الدخول بالبريد عبر Resend.",
        "الرماة تحت ١٨ سنة، أو من لم يُدخل تاريخ ميلادهم، وكل ما سُجّل عنهم، لا يُنسخون إلى السحابة أبداً ويبقون على جهاز المدرب.",
      ]},
      { h: "من يتلقى شيئاً آخر", p: [
        "تستضيف GitHub Pages شيفرة التطبيق، وتتلقى عنوان الإنترنت للزائر كأي استضافة، ولا تتلقى بيانات الرماة.",
        "توفر Google Fonts الخطوط، وتتلقى عنوان الإنترنت للجهاز والخط المطلوب، ولا تتلقى بيانات الرماة.",
        "Supabase وResend فقط عند تفعيل النسخة السحابية كما سبق.",
        "لا إعلانات ولا تحليلات، ولا بيع أو مشاركة للبيانات مع أي جهة أخرى.",
      ]},
      { h: "حقوقك", p: [
        "يمكنك أن تطلب من المدرب أن يريك ما يُحفظ عنك أو يصححه أو يحذفه. حذف رامٍ في ERA Lab يزيل ملفه وكل سجلاته من الجهاز، ومن النسخة السحابية عند المزامنة التالية.",
        "يمكن للمدرب حذف نسخته السحابية كاملة في أي وقت من الإعدادات ← النسخة السحابية.",
        "للرماة تحت ١٨ سنة يمارس ولي الأمر هذه الحقوق، ويجب أن يوافق كتابةً قبل أن يسجل المدرب بياناتهم.",
      ]},
      { h: "مدة الحفظ", p: [
        "حتى يحذفها المدرب. لا يُحذف شيء تلقائياً. ملفات النسخ الاحتياطية التي ينزّلها المدرب تُحذف بشكل منفصل.",
      ]},
      { h: "ملفات تعريف الارتباط (الكوكيز)", p: [
        "لا يضع ERA Lab أي ملفات تعريف ارتباط ولا يستخدم أي تتبع. يستخدم مساحة تخزين المتصفح فقط لحفظ بيانات المدرب وإعداداته على الجهاز، وجلسة الدخول عند تفعيل النسخة السحابية. هذا التخزين ضروري لعمل التطبيق ولا يُستخدم أبداً لتتبع أي شخص عبر المواقع.",
      ]},
      { h: "شروط الاستخدام", p: [
        "يُقدَّم ERA Lab مجاناً كما هو دون أي ضمان. المدرب مسؤول عن البيانات التي يسجلها، وعن الحصول على الإذن بتسجيلها، وعن الاحتفاظ بنسخ احتياطية.",
        "توصيات التدريب في ERA Lab تدعم تقدير مدرب مؤهل، وليست نصيحة طبية.",
        "لا تستخدم ERA Lab لتسجيل أي شخص دون إذنه، أو إذن ولي الأمر للطفل.",
        "تخضع هذه الشروط لقوانين جمهورية مصر العربية، ومنها قانون حماية البيانات الشخصية رقم ١٥١ لسنة ٢٠٢٠.",
      ]},
    ],
  },
};
