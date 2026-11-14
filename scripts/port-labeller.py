"""Ports the stand-alone RACM Labeller (one HTML file) into this app as the Review stage.

Usage:  py scripts/port-labeller.py "<path to RACM Labeller.html>"
Writes: src/review/engine.js, src/review/markup.js, src/review/review.css

The Labeller's script is kept as it is and wrapped in one function, so its behaviour stays the tested behaviour.
Only what touches the whole page is adapted, and every adaptation below must match exactly once or the port stops.
"""
import re, sys, os

src = open(sys.argv[1], encoding="utf-8").read()
out = os.path.join(os.path.dirname(__file__), "..", "src", "review")
os.makedirs(out, exist_ok=True)

css = src[src.index("<style>") + 7 : src.index("</style>")]
body = src[src.index('<div class="app">') : src.index("<script>")]
js = src[src.index("<script>") + 8 : src.rindex("</script>")]


def once(text, old, new, what):
    assert text.count(old) == 1, f"{what}: expected once, found {text.count(old)}"
    return text.replace(old, new)


# ── script ──────────────────────────────────────────────────────────────────
js = once(js, "'use strict';\n", "", "strict directive")
js = once(js, "getComputedStyle(document.documentElement)", "getComputedStyle(host)", "colour lookup")
# Session sheets recorded in the app join the ones found as files in the opened folder.
js = once(js, "  sessions=[];\n", "  sessions=[];\n  const appSessions=env.sessions();\n", "session list")
m = re.search(r"\n  const labelMap=\{\};", js)
assert m, "label map anchor"
js = js[: m.start()] + "\n  for(const se of appSessions) if(!sessions.some(x=>x.session_id===se.session_id)) sessions.push(se);" + js[m.start():]
# A saved review also goes into the app's own records.
js = once(js, "c.labelsBad=false; c.labelled=true; if(c===cur) dirty=false;",
          "c.labelsBad=false; c.labelled=true; if(c===cur) dirty=false; env.onSaved(JSON.parse(json));", "save hook")
# Keys must not hijack the rest of the app: typing anywhere, or pressing Space or Enter on a button.
js = once(js, "if(!L || e.target.tagName==='INPUT'&&e.target.type==='text' || e.target.tagName==='TEXTAREA') return;",
          "if(!L || e.target.closest?.('input,select,textarea')) return;\n  if((e.key===' '||e.key==='Enter') && e.target.closest?.('button,a,summary')) return;", "key guard")
js = once(js, "'❚❚ Pause'", "'Pause'", "pause label")
js = once(js, "'▶ Play'", "'Play'", "play label")
js = js.replace("⚠ The saved labels file", "The saved labels file")
assert "localStorage" not in js and "location." not in js

# ERA Lab: every message goes through env.t (Arabic), fault chips through env.fault, phases show the coach's language.
js = once(js, "function toast(t){const el=$('toast');el.textContent=t;", "function toast(t){const el=$('toast');el.textContent=env.t(t);", "toast text")
js = once(js, "function status(t){$('status').textContent=t||''}", "function status(t){$('status').textContent=env.t(t||'')}", "status text")
js = once(js, "c.className='chip'+(L.faults.includes(t)?' on':'');c.textContent=t;", "c.className='chip'+(L.faults.includes(t)?' on':'');c.textContent=env.fault(t);", "fault chips")
js = once(js, "$('playBtn').textContent='Pause'", "$('playBtn').textContent=env.t('Pause')", "pause text")
js = once(js, "$('playBtn').textContent='Play'", "$('playBtn').textContent=env.t('Play')", "play text")
js = once(js, "$('ptMode').textContent='Place points: '+(ptMode?'on':'off');", "$('ptMode').textContent=env.t('Place points: '+(ptMode?'on':'off'));", "points mode text")
js = once(js, "$('trackBtn').textContent='Stop tracking'", "$('trackBtn').textContent=env.t('Stop tracking')", "stop tracking text")
js = once(js, "$('trackBtn').textContent='Track forward'", "$('trackBtn').textContent=env.t('Track forward')", "track text")
js = once(js, "$('athleteLbl').textContent = (rootName?rootName+' · ':'')+clips.length+' clips'+(canWrite?'':' · read-only (labels download)');",
          "$('athleteLbl').textContent = env.t((rootName?rootName+' · ':'')+clips.length+' clips'+(canWrite?'':' · read-only (labels download)'));", "clip count text")
js = once(js, "'No session sheet covers this clip':exact.length?'— not linked —':`— pick the arrow (end ${esc(c[0].e.end)}) —`",
          "env.t('No session sheet covers this clip'):exact.length?env.t('— not linked —'):esc(env.t(`— pick the arrow (end ${c[0].e.end}) —`))", "arrow list heading")
js = once(js, ">End ${esc(x.e.end)} · arrow ${esc(x.ar.arrow)} · ${esc(x.ar.score??'?')}${x.exact?' · '+new Date(x.ar.shot_ms).toLocaleTimeString():''}</option>",
          ">${esc(env.t(`End ${x.e.end} · arrow ${x.ar.arrow} · ${x.ar.score??'?'}${x.exact?' · '+new Date(x.ar.shot_ms).toLocaleTimeString():''}`))}</option>", "arrow options")
js = once(js, "<div>End ${esc(s.end)} · arrow ${esc(s.arrow)} · <b", "<div>${esc(env.t(`End ${s.end} · arrow ${s.arrow}`))} · <b", "arrow info")
js = once(js, "<div>feel ${esc(s.feel??'–')}/5 · routine ${esc(s.routine??'–')} · end focus ${esc(s.end_focus??'–')}/5</div>",
          "<div>${env.t('feel')} ${esc(s.feel??'–')}/5 · ${env.t('routine')} ${esc(s.routine??'–')} · ${env.t('end focus')} ${esc(s.end_focus??'–')}/5</div>", "arrow details")
js = once(js, " m · wind ${", " m · ${env.t('wind')} ${", "wind label")
js = once(js, "${s.linked_by==='auto'?'auto-linked by time — check it':'linked by coach'}",
          "${env.t(s.linked_by==='auto'?'auto-linked by time — check it':s.linked_by==='phone'?'linked on the phone':'linked by coach')}", "link source")
js = once(js, "${p.en}</span>`).join('')", "${env.lang==='ar'?p.ar:p.en}</span>`).join('')", "phase legend")
js = once(js, "></i>motion</span>'", "></i>'+env.t('motion')+'</span>'", "motion legend")
js = once(js, "<span>${p.en}</span><span class=\"c\">", "<span>${env.t(p.en)}</span><span class=\"c\">", "body point names")
js = once(js, "·  frame ${frameOf(t)}", "·  ${env.t('frame')} ${frameOf(t)}", "frame word")
# ERA Lab: a clip filmed on the phone and copied here opens with the phone's quick tags and arrow, until labels are saved.
js = once(js, "  if(seq!==loadSeq) return;\n  L.playback_fps=fps;",
          "  const phone=!c.labelsEntry && env.review(c.name);\n"
          "  if(phone){ if(phone.verdict) L.verdict=phone.verdict; L.faults=[...(phone.faults||[])]; if(phone.notes) L.notes=phone.notes;\n"
          "    const se=phone.shot&&sessions.find(x=>x.session_id===phone.shot.session_id), e=se?.ends?.find(x=>x.end===phone.shot.end), ar=e?.arrows?.find(x=>x.arrow===phone.shot.arrow);\n"
          "    if(ar) linkArrow({se,e,ar},'phone'); dirty=false }\n"
          "  if(seq!==loadSeq) return;\n  L.playback_fps=fps;", "phone tags")
js = once(js, "or tap along with M.'));\n}", "or tap along with M.'));\n  if(phone) status('Quick tags from the phone are filled in. Check them, then save.');\n}", "phone tags message")
# The linked arrow stays in the list even when the clip's time does not point to it (a phone link, or another camera's clock).
js = once(js, "  sel.value=cur_; showArrow();\n}",
          "  if(cur_&&!c.some(x=>key(x)===cur_)) sel.insertAdjacentHTML('beforeend',`<option value=\"${esc(cur_)}\">${esc(env.t(`End ${L.shot.end} · arrow ${L.shot.arrow} · ${L.shot.score??'?'}`))}</option>`);\n"
          "  sel.value=cur_; showArrow();\n}", "keep linked arrow")

engine = f"""/* eslint-disable */
// Generated by scripts/port-labeller.py from the stand-alone RACM Labeller. Do not edit by hand: change the
// Labeller or the port script and run it again. The code is the Labeller's own, wrapped so it can live in one screen.
//
// host: the element holding the Review markup. env.sessions(): range sessions recorded in the app.
// env.onSaved(labels): called after labels are saved. env.review(clipName): the app's record of that clip (phone tags).
// env.t(text), env.fault(tag), env.lang: the coach's language. Returns {{ isDirty, destroy }}.
export function mountLabeller(host, env) {{
  const ac = new AbortController();
  // Page-level listeners end with this screen.
  const addEventListener = (type, fn, opts) => window.addEventListener(type, fn, {{ ...(typeof opts === "object" ? opts : {{}}), signal: ac.signal }});
  document.body.dataset.pane = "video";

{js}
  return {{
    isDirty: () => dirty,
    destroy() {{
      ac.abort(); _ro.disconnect(); tracking = false;
      vid.pause(); if (vidURL) URL.revokeObjectURL(vidURL);
      delete document.body.dataset.pane;
    }},
  }};
}}
"""
open(os.path.join(out, "engine.js"), "w", encoding="utf-8", newline="").write(engine)

# ── markup ──────────────────────────────────────────────────────────────────
body = once(body, '<div class="app">', '<div class="lab">', "root")
body = re.sub(r'\s*<div class="brand">.*?</div>\n', "\n", body, count=1, flags=re.S)
assert "RACM LABELLER" not in body
body = once(body, ">☰ Clips</button>", ">Clips</button>", "clips button")
body = once(body, ">▶ Play</button>", ">Play</button>", "play button")
body = once(body, ">◀ 1 fr</button>", ' aria-label="Back one frame">−1 frame</button>', "back button")
body = once(body, ">1 fr ▶</button>", ' aria-label="Forward one frame">+1 frame</button>', "forward button")
body = once(body, 'class="tabs" id="tabs"', 'class="lab-tabs" id="tabs"', "tabs")
body = once(body, 'class="toast" id="toast"', 'class="lab-toast" id="toast"', "toast")
body, n = re.subn(r"\(e\.g\. <b>01 Athletes / [^<]*</b>\)", "", body); assert n == 1, "example name"  # no real names in the app
body, n = re.subn(r"e\.g\. <b>Desktop › Archery Coaching Service › 01 Athletes › [^<]*</b>, ", "", body); assert n == 1, "example path"
# The dimmer and the message bar move inside the root, so the scoped styles reach them.
body = once(body, '</div>\n<div class="scrim" id="scrim"></div>', '<div class="scrim" id="scrim"></div>', "scrim").rstrip() + "\n</div>\n"
body = body.replace("`", "\\`").replace("${", "\\${")
open(os.path.join(out, "markup.js"), "w", encoding="utf-8", newline="").write(
    "// Generated by scripts/port-labeller.py: the Labeller's own layout. Static and written by us, so safe to inject.\n"
    f"export const MARKUP = `{body.strip()}`;\n")

# ── styles: every rule scoped to .lab so nothing leaks into or out of the Review stage ──
css = re.sub(r":root\{.*?\}\n", "", css, count=1, flags=re.S)                       # colours come from review.css's own block
css = re.sub(r"html,body\{[^}]*\}\n", "", css, count=1)
css = re.sub(r"body\{background:.*?var\(--ink\)\}\n", "", css, count=1, flags=re.S)
css = css.replace(".toast", ".lab-toast").replace(".tabs", ".lab-tabs")
css = css.replace("header .sp,.brand small,#athleteLbl{display:none}", "header .sp,#athleteLbl{display:none}")  # before the general removal below
css = re.sub(r"\.brand[^{,]*\{[^}]*\}\n?", "", css)


def scope(sel):
    sel = sel.strip()
    if sel in ("[hidden]",):
        return sel
    if sel.startswith("body["):
        head, _, rest = sel.partition(" ")
        return f"{head} .lab {rest}" if rest else f"{head} .lab"
    if sel == ".app":
        return ".lab"
    if sel in ("html", "body"):
        return ".lab"
    return f".lab {sel}"


def scope_block(text):
    res, i = "", 0
    while i < len(text):
        j = text.find("{", i)
        if j < 0:
            res += text[i:]; break
        prelude = text[i:j]
        depth, k = 1, j + 1
        while depth:                                    # find the matching brace
            depth += {"{": 1, "}": -1}.get(text[k], 0); k += 1
        inner = text[j + 1 : k - 1]
        lead = prelude[: len(prelude) - len(prelude.lstrip())]
        comment = ""
        p = prelude.strip()
        while p.startswith("/*"):                       # keep comments in front of a rule
            e = p.index("*/") + 2; comment += p[:e] + "\n"; p = p[e:].strip()
        if p.startswith("@"):
            res += f"{lead}{comment}{p}{{{scope_block(inner)}}}"
        else:
            res += f"{lead}{comment}{','.join(scope(s) for s in p.split(','))}{{{inner}}}"
        i = k
    return res


scoped = scope_block(css)
assert ".lab .app" not in scoped and "RACM" not in scoped
head = """/* Review stage. Generated by scripts/port-labeller.py from the Labeller's styles, scoped to .lab.
   Video review is a dark room: black ground, white text, and the brand's yellow, which may only sit on black. */
.lab-host { flex: 1; min-height: 0; display: flex; }
.lab {
  --ink: #000000; --ink-2: #0D0D0D; --ink-3: #1A1A1A; --line: #404040;
  --bone: #FFFFFF; --muted: #C0C0C0; --nile: #6496FF; --nile-soft: #0004FF;
  --gold: #FFFF00; --red: #FF0000; --good: #00E676;
  --mono: var(--font-body); --sans: var(--font-body); --ar: 'Noto Kufi Arabic', sans-serif;
  --p1: #5b6b8c; --p2: #7a6aa8; --p3: #3f8fb0; --p4: #2bb3a3; --p5: #7fb85b; --p6: #c9a227; --p7: #f2c40c; --p8: #d06b4a;
  flex: 1; min-width: 0; height: auto !important;
  background: var(--ink); color: var(--bone); font: 14px/1.4 var(--sans); font-variant-numeric: tabular-nums;
}
/* The app's own form, row and chip rules must not reach in here. */
.lab input, .lab select, .lab textarea { width: auto; min-height: 0; padding: 6px 8px; background: var(--ink-2); border: 1px solid var(--line); border-radius: 8px; color: inherit; font: inherit; }
.lab input:focus, .lab select:focus, .lab textarea:focus { outline: 3px solid var(--gold); border-color: var(--gold); }
.lab input[type=checkbox] { width: 18px; min-height: 18px; padding: 0; accent-color: var(--nile); }
.lab label { flex-direction: row; font-size: inherit; font-weight: inherit; color: inherit; }
.lab h2, .lab h3 { font-family: var(--font-head); line-height: 1.2; }
.lab p { color: inherit; max-width: none; }
.lab .row, .lab .chip, .lab .empty { all: unset; box-sizing: border-box; }
.lab :focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.lab button { font-family: var(--font-body); }
"""
tail = """
/* Inside the app: messages clear the stage bar. */
.lab .lab-toast { bottom: calc(var(--nav-h) + 18px); z-index: 50; }
@media (max-width:759px),(max-height:520px) { .lab .lab-toast { bottom: calc(var(--nav-h) + 76px); } }
@media (min-width: 900px) { .lab .lab-toast { bottom: 84px; } } /* above the Save button */
/* In Arabic the panels read right to left; the video, its controls and the timeline keep time running left to right. */
.lab .viewer, .lab .transport, .lab .timeline, .lab .legend, .lab #miniT { direction: ltr; }
"""
open(os.path.join(out, "review.css"), "w", encoding="utf-8", newline="").write(head + scoped + tail)
print("ported:", len(engine.splitlines()), "lines of script,", len(body.splitlines()), "of markup,", len(scoped.splitlines()), "of styles")
