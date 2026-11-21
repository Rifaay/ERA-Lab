// The Labeller in Arabic. Its layout (markup.js) and code (engine.js) are generated from the stand-alone Labeller in
// English; the port script routes every message through env.t, and the layout is translated here before it is shown.
// i18n.test.js checks that every English piece below still exists, so a re-port that changes a text fails loudly.
import { FAULTS } from "../clips.js";

// Exact pieces of the layout, English → Arabic. Longer pieces first, so a short one never splits a long one.
export const MARKUP_AR = [
  [`Open an athlete's folder  so clips and session sheets load together. Labels are saved as <span class="kbd">clip.labels.json</span> next to each clip.`,
    `افتح مجلد الرامي لتُحمَّل المقاطع وأوراق الجلسات معاً. تُحفظ العلامات في ملف <span class="kbd">clip.labels.json</span> بجوار كل مقطع.`],
  [`<h2>Drag a folder or videos here</h2>`, `<h2>اسحب مجلداً أو مقاطع فيديو إلى هنا</h2>`],
  [`Or click <b>Open athlete folder</b> and choose the folder itself, then <b>Select folder</b>. The folder picker never shows the videos inside — that's normal.<br>Or click <b>Open video files</b> to pick clips one by one.<br><span style="opacity:.7">Works best in Chrome or Edge. Nothing is uploaded; clips stay on this PC.</span>`,
    `أو اضغط <b>افتح مجلد الرامي</b> واختر المجلد نفسه، ثم <b>اختيار المجلد</b>. نافذة اختيار المجلد لا تُظهر المقاطع بداخله، وهذا طبيعي.<br>أو اضغط <b>افتح ملفات فيديو</b> لاختيار المقاطع واحداً تلو الآخر.<br><span style="opacity:.7">يعمل بأفضل شكل في Chrome أو Edge. لا يُرفع أي شيء؛ تبقى المقاطع على هذا الحاسوب.</span>`],
  [`Pick a point, turn on <b>Place points</b>, click it on the video. <span class="kbd">Shift</span>+click removes it on this frame. <span class="kbd">T</span> tracks all points placed on this frame forward.`,
    `اختر نقطة، وفعّل <b>وضع النقاط</b>، ثم اضغط عليها في الفيديو. <span class="kbd">Shift</span>+نقرة تحذفها من هذا الإطار. <span class="kbd">T</span> تتبّع كل النقاط الموضوعة في هذا الإطار إلى الأمام.`],
  [`<span class="kbd">Space</span> play/pause · <span class="kbd">←</span><span class="kbd">→</span> 1 frame · <span class="kbd">Shift</span>+arrows 10 frames · <span class="kbd">M</span> mark next phase · <span class="kbd">Backspace</span> undo last mark · <span class="kbd">1</span>–<span class="kbd">8</span> select phase · <span class="kbd">A</span> analyse · <span class="kbd">S</span> suggest · <span class="kbd">Ctrl</span>+<span class="kbd">S</span> save · <span class="kbd">N</span> next clip`,
    `<span class="kbd">Space</span> تشغيل/إيقاف · <span class="kbd">←</span><span class="kbd">→</span> إطار واحد · <span class="kbd">Shift</span>+الأسهم ١٠ إطارات · <span class="kbd">M</span> حدّد المرحلة التالية · <span class="kbd">Backspace</span> تراجع عن آخر تحديد · <span class="kbd">1</span>–<span class="kbd">8</span> اختر مرحلة · <span class="kbd">A</span> حلّل · <span class="kbd">S</span> اقترح · <span class="kbd">Ctrl</span>+<span class="kbd">S</span> احفظ · <span class="kbd">N</span> المقطع التالي`],
  [`<h3>Body points <span style="text-transform:none;letter-spacing:0">(manual + tracking)</span></h3>`, `<h3>نقاط الجسم <span style="text-transform:none;letter-spacing:0">(يدوي + تتبّع)</span></h3>`],
  [`title="Pick the athlete folder — the folder picker shows folders only, that's normal"`, `title="اختر مجلد الرامي؛ نافذة الاختيار تُظهر المجلدات فقط، وهذا طبيعي"`],
  [`<span class="keys">s, if the phone and camera clocks differ</span>`, `<span class="keys">ث، إن اختلفت ساعة الهاتف عن الكاميرا</span>`],
  [`<input type="checkbox" id="snapChk" checked> Snap taps to motion events`, `<input type="checkbox" id="snapChk" checked> اربط النقرات بأحداث الحركة`],
  [`<option value="">No session sheet for this clip</option>`, `<option value="">لا توجد ورقة جلسة لهذا المقطع</option>`],
  [`placeholder="Add a fault tag + Enter"`, `placeholder="أضف وسم خطأ ثم Enter"`],
  [`placeholder="What you saw in this shot"`, `placeholder="ما لاحظته في هذه الرمية"`],
  [`aria-label="Show clips">Clips</button>`, `aria-label="أظهر المقاطع">المقاطع</button>`],
  [`>Open athlete folder</button>`, `>افتح مجلد الرامي</button>`],
  [`>Open video files</button>`, `>افتح ملفات فيديو</button>`],
  [`>Export labels CSV</button>`, `>صدّر العلامات CSV</button>`],
  [`<span class="dl">Play</span>`, `<span class="dl">تشغيل</span>`],
  [`<span class="dl">Phases</span>`, `<span class="dl">المراحل</span>`],
  [`<span class="dl">Points</span>`, `<span class="dl">النقاط</span>`],
  [`<span class="dl">Draw</span>`, `<span class="dl">الرسم</span>`],
  [`<span class="dl">More</span>`, `<span class="dl">المزيد</span>`],
  [`>Verdict, faults and notes</button>`, `>الحكم والأخطاء والملاحظات</button>`],
  [`>Add video files</button>`, `>أضف ملفات فيديو</button>`],
  [`aria-label="Video tools"`, `aria-label="أدوات الفيديو"`],
  [`<h3>Clips</h3>`, `<h3>المقاطع</h3>`],
  [`title="Space">Play</button>`, `title="Space">تشغيل</button>`],
  [`aria-label="Back one frame">−1 frame</button>`, `aria-label="إطار للخلف">إطار سابق</button>`],
  [`aria-label="Forward one frame">+1 frame</button>`, `aria-label="إطار للأمام">إطار تالٍ</button>`],
  [`title="Playback speed"`, `title="سرعة التشغيل"`],
  [`>Analyse motion</button>`, `>حلّل الحركة</button>`],
  [`>Suggest phases</button>`, `>اقترح المراحل</button>`],
  [`>Mark next phase</button>`, `>حدّد المرحلة التالية</button>`],
  [`aria-label="Sections"`, `aria-label="الأقسام"`],
  [`aria-current="false">Clips</button>`, `aria-current="false">المقاطع</button>`],
  [`aria-current="page">Video</button>`, `aria-current="page">الفيديو</button>`],
  [`aria-current="false">Phases &amp; notes</button>`, `aria-current="false">المراحل والملاحظات</button>`],
  [`<h3>Phases</h3>`, `<h3>المراحل</h3>`],
  [`>Place points: off</button>`, `>وضع النقاط: متوقف</button>`],
  [`>Track forward</button>`, `>تتبّع للأمام</button>`],
  [`>AI track body</button>`, `>تتبّع الجسم بالذكاء الاصطناعي</button>`],
  [`<h3>Arrow (from session sheet)</h3>`, `<h3>السهم (من ورقة الجلسة)</h3>`],
  [`<span class="keys">Clock offset</span>`, `<span class="keys">فرق الساعة</span>`],
  [`<h3>Coach verdict</h3>`, `<h3>حكم المدرب</h3>`],
  [`>Good shot</button>`, `>رمية جيدة</button>`],
  [`>Fault</button>`, `>خطأ</button>`],
  [`<h3>Fault tags</h3>`, `<h3>وسوم الأخطاء</h3>`],
  [`<h3>Notes</h3>`, `<h3>ملاحظات</h3>`],
  [`<h3>Clip</h3>`, `<h3>المقطع</h3>`],
  [`<h3>Keys</h3>`, `<h3>المفاتيح</h3>`],
  [`>Save labels (Ctrl+S)</button>`, `>احفظ العلامات (Ctrl+S)</button>`],
];

export const translateMarkup = (markup, lang) => (lang !== "ar" ? markup : MARKUP_AR.reduce((m, [en, ar]) => m.split(en).join(ar), markup));

// Messages and short texts the Labeller writes while working.
const EXACT = {
  "Analyse motion first (A).": "حلّل الحركة أولاً (A).",
  "Analysing motion… the clip plays through once (fast, muted).": "جارٍ تحليل الحركة… يُشغَّل المقطع مرة واحدة (بسرعة ودون صوت).",
  "No clear hold (still period) found in this clip. Tap along with M instead.": "لم يُعثر على ثبات واضح في هذا المقطع. حدّد المراحل يدوياً بالضغط على M.",
  "Place at least one point on this frame first, then press T.": "ضع نقطة واحدة على الأقل في هذا الإطار أولاً، ثم اضغط T.",
  "Reading folder…": "جارٍ قراءة المجلد…",
  "Suggested phases shown. Release has the highest confidence. Check each boundary, drag it on the timeline, or re-tap with M.": "ظهرت المراحل المقترحة. الإطلاق هو الأدق. تحقّق من كل حد، واسحبه على الشريط الزمني، أو أعد التحديد بـ M.",
  "This browser cannot read frames; use Chrome or Edge.": "هذا المتصفح لا يقرأ الإطارات؛ استخدم Chrome أو Edge.",
  "Pick a clip on the left.": "اختر مقطعاً من القائمة.",
  "No video files in that folder.": "لا توجد ملفات فيديو في ذلك المجلد.",
  "Wait for motion analysis to finish": "انتظر انتهاء تحليل الحركة",
  "Motion data loaded from saved labels.": "حُمّلت بيانات الحركة من العلامات المحفوظة.",
  "The saved labels file for this clip could not be read. Starting blank; the file is untouched unless you save.": "تعذّرت قراءة ملف العلامات المحفوظ لهذا المقطع. البدء من جديد؛ لن يتغيّر الملف ما لم تحفظ.",
  "Tip: tap Analyse motion first, then Suggest phases, or tap Mark next phase along the clip.": "نصيحة: اضغط «حلّل الحركة» أولاً ثم «اقترح المراحل»، أو اضغط «حدّد المرحلة التالية» أثناء المقطع.",
  "Tip: press A to analyse motion first, then S for suggested phases, or tap along with M.": "نصيحة: اضغط A لتحليل الحركة أولاً، ثم S للمراحل المقترحة، أو حدّد يدوياً بـ M.",
  "Tracking points… tap Stop tracking to stop.": "جارٍ تتبّع النقاط… اضغط «أوقف التتبّع» للإيقاف.",
  "Tracking points… (Esc stops)": "جارٍ تتبّع النقاط… (Esc للإيقاف)",
  "The file could not be read from disk.": "تعذّرت قراءة الملف من القرص.",
  "The video could not be loaded.": "تعذّر تحميل الفيديو.",
  "The video data could not be decoded. The file may be damaged.": "تعذّر فك بيانات الفيديو. قد يكون الملف تالفاً.",
  "The video took too long to load.": "استغرق تحميل الفيديو وقتاً طويلاً.",
  "Quick tags from the phone are filled in. Check them, then save.": "مُلئت الوسوم السريعة من الهاتف. تحقّق منها ثم احفظ.",
  Pause: "إيقاف", Play: "تشغيل", "Stop tracking": "أوقف التتبّع", "Track forward": "تتبّع للأمام",
  "AI track body": "تتبّع الجسم بالذكاء الاصطناعي", "Stop AI tracking": "أوقف تتبّع الذكاء الاصطناعي",
  "Getting the AI body tracker ready…": "جارٍ تجهيز متتبّع الجسم بالذكاء الاصطناعي…",
  "AI tracking could not start. The first time it needs the internet to fetch the model.": "تعذّر بدء التتبّع بالذكاء الاصطناعي. يحتاج إلى الإنترنت في المرة الأولى لتنزيل النموذج.",
  "Bow-side hip": "ورك جهة القوس", "Draw-side hip": "ورك جهة السحب", "Bow-side knee": "ركبة جهة القوس", "Draw-side knee": "ركبة جهة السحب",
  "Bow-side ankle": "كاحل جهة القوس", "Draw-side ankle": "كاحل جهة السحب",
  "Place points: on": "وضع النقاط: يعمل", "Place points: off": "وضع النقاط: متوقف",
  "No session sheet covers this clip": "لا توجد ورقة جلسة تغطي هذا المقطع", "— not linked —": "— غير مرتبط —",
  "auto-linked by time — check it": "رُبط تلقائياً بالوقت — تحقّق منه", "linked by coach": "ربطه المدرب", "linked on the phone": "رُبط على الهاتف",
  End: "الجولة", arrow: "السهم", frame: "إطار", feel: "الإحساس", routine: "الروتين", "end focus": "تركيز الجولة", wind: "الرياح", motion: "الحركة",
  "Bow elbow": "مرفق القوس", "Bow shoulder": "كتف القوس", "Bow wrist": "رسغ القوس", "Draw elbow": "مرفق السحب", "Draw shoulder": "كتف السحب",
  "Draw wrist": "رسغ السحب", "Draw hand (string-finger knuckles)": "يد السحب (مفاصل أصابع الوتر)", "Head (temple / cap mark)": "الرأس (الصدغ / علامة القبعة)",
};
const PATTERNS = [
  [/^Loading (.+)…$/, "جارٍ تحميل $1…"],
  [/^Saved (.+)$/, "حُفظ $1"],
  [/^Save failed: (.*)$/, "فشل الحفظ: $1"],
  [/^Could not open (.*)$/, "تعذّر فتح $1"],
  [/^Folder access failed: (.*)$/, "فشل الوصول إلى المجلد: $1"],
  [/^Tracking… (\d+) frames$/, "جارٍ التتبّع… $1 إطاراً"],
  [/^AI tracking… (\d+) \/ (\d+) frames$/, "تتبّع بالذكاء الاصطناعي… $1 / $2 إطاراً"],
  [/^AI tracked (\d+) body points\..*$/, "تتبّع الذكاء الاصطناعي $1 نقطة من الجسم. تنقّل بين الإطارات للتحقق؛ انقر أي نقطة لتصحيحها."],
  [/^Motion analysed: (\d+) frames, (\d+) movement events found\. Press S for suggested phases\.$/, "حُلّلت الحركة: $1 إطاراً، و$2 أحداث حركة. اضغط S للمراحل المقترحة."],
  [/^Tracked (\d+) point\(s\) over (\d+) frames\..*$/, "تُتُبّعت $1 نقطة عبر $2 إطاراً. تحقّق منها إطاراً بإطار، وصحّح أي انحراف بنقرة جديدة (تصبح نقطة ارتكاز)."],
  [/^Analysis stopped\..*$/, "توقّف التحليل."],
  [/^Analysis is running\..*$/, "التحليل جارٍ. أوقفه أولاً."],
  [/^Tracking is running\..*$/, "التتبّع جارٍ. أوقفه أولاً."],
  [/^— pick the arrow \(end (\d+)\) —$/, "— اختر السهم (الجولة $1) —"],
  [/^End (\S+) · arrow (\S+)(.*)$/, "الجولة $1 · السهم $2$3"],
  [/^(.*?)(\d+) clips( · read-only \(labels download\))?$/, (m, a, n, ro) => `${a}${n} مقاطع${ro ? " · للقراءة فقط (تُنزَّل العلامات)" : ""}`],
  [/^(.+) → (.+) \(frame (\d+)\)(.*)$/, (m, ph, t, f, snap) => `${PHASE_AR[ph] || ph} ← ${t} (الإطار ${f})${snap ? " · رُبط بحدث حركة" : ""}`],
];
const PHASE_AR = { "Stance & set-up": "الوقفة والتجهيز", "Hook & grip set": "وضع الأصابع والقبضة", "Raise (pre-draw)": "رفع القوس", Draw: "السحب",
  Anchor: "الارتكاز", "Transfer & hold": "النقل والتثبيت", Release: "الإطلاق", "Follow-through": "المتابعة" };

export const reviewText = (lang) => (s) => {
  if (lang !== "ar" || !s) return s;
  if (s in EXACT) return EXACT[s];
  for (const [re, to] of PATTERNS) if (re.test(s)) return s.replace(re, to);
  return s;
};

// Fault tags stay in English in the records (the computer and phone share them); the chips show them in the coach's language.
export const faultText = (lang, arNames) => (f) => (lang === "ar" ? arNames[FAULTS.indexOf(f)] || f : f);
