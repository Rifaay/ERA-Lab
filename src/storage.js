const KEY = {
  athletes:      "racm_athletes",
  sessions:      "racm_sessions",
  assessments:   "racm_assessments",
  plans:         "racm_plans",
  goals:         "racm_goals",
  progressLogs:  "racm_progress_logs",
  checkIns:      "racm_checkins",
  exercises:     "racm_exercises",
  goalTemplates: "racm_goal_templates",
  settings:      "racm_settings",
  range:         "racm_range", // {live: the session being shot, setups: {athleteId: last setup}}
};

const load = (k, def) => {
  const raw = localStorage.getItem(k);
  const fallback = JSON.parse(def);
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v) !== Array.isArray(fallback)) throw new Error("wrong shape");
    return v;
  } catch (e) {
    // Move the bad value aside so the next save can't overwrite it. Remove first: a copy could exceed the quota.
    localStorage.removeItem(k);
    localStorage.setItem(`${k}_corrupt`, raw);
    console.error(`Unreadable data in ${k}, moved to ${k}_corrupt`, e);
    window.alert(`Some saved data could not be read and was set aside (${k}).\nتعذّرت قراءة بعض البيانات المحفوظة وتم عزلها.`);
    return fallback;
  }
};

const store = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    window.alert("Could not save: device storage is full. Download a backup and free up space.\nتعذّر الحفظ: مساحة التخزين ممتلئة. نزّل نسخة احتياطية ثم أفرغ مساحة.");
    throw e; // stop the caller from reporting a successful save
  }
};

const upsert = (k, item) => {
  const list = load(k, "[]");
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item; else list.push(item);
  store(k, list);
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

// ── Athletes ──────────────────────────────────────────────────────────────
export const getAthletes  = () => load(KEY.athletes, "[]");
export const saveAthlete  = (a) => upsert(KEY.athletes, a);
// Removes everything recorded about the athlete, as the confirm prompt promises.
// A backup downloads first: that file is the only undo, and must itself be deleted for a real erasure request.
export const deleteAthlete = (id) => {
  exportBackup();
  const goalIds = new Set(getGoals().filter((g) => g.athleteId === id).map((g) => g.id));
  const theirs = (x) => x.athleteId === id || goalIds.has(x.goalId);
  for (const k of ["sessions", "assessments", "plans", "goals", "progressLogs", "checkIns"]) {
    store(KEY[k], load(KEY[k], "[]").filter((x) => !theirs(x)));
  }
  const range = getRange();
  if (range.live?.athlete_id === id) range.live = null;
  delete range.setups?.[id];
  saveRange(range);
  store(KEY.athletes, getAthletes().filter((a) => a.id !== id)); // last: if a step fails, the athlete is still there to retry
};

// ── Range (live session and each athlete's last setup) ─────────────────────
export const getRange  = () => load(KEY.range, "{}");
export const saveRange = (r) => store(KEY.range, r);

// ── Sessions ─────────────────────────────────────────────────────────────
export const getSessions = () => load(KEY.sessions, "[]");
export const saveSession = (s) => { const list = getSessions(); list.push(s); store(KEY.sessions, list); };
export const deleteSession = (id) => store(KEY.sessions, getSessions().filter((s) => s.id !== id));

// ── Assessments ──────────────────────────────────────────────────────────
export const getAssessments  = () => load(KEY.assessments, "[]");
export const saveAssessment  = (a) => { const list = getAssessments(); list.push(a); store(KEY.assessments, list); };
export const deleteAssessment = (id) => store(KEY.assessments, getAssessments().filter((a) => a.id !== id));

// ── Plans ─────────────────────────────────────────────────────────────────
export const getPlans = () => load(KEY.plans, "[]");
export const getPlan  = (athleteId, year) => {
  return getPlans().find((p) => p.athleteId === athleteId && p.year === year)
    || { id: `${athleteId}-${year}`, athleteId, year, weeks: {}, tournaments: [] };
};
export const savePlan = (plan) => upsert(KEY.plans, plan);

// ── Goals ──────────────────────────────────────────────────────────────────
export const getGoals    = () => load(KEY.goals, "[]");
export const saveGoal    = (g) => upsert(KEY.goals, g);
export const deleteGoal  = (id) => {
  store(KEY.goals,        getGoals().filter((g) => g.id !== id));
  store(KEY.progressLogs, getProgressLogs().filter((l) => l.goalId !== id));
  store(KEY.checkIns,     getCheckIns().filter((c) => c.goalId !== id));
};

// ── Progress Logs ──────────────────────────────────────────────────────────
export const getProgressLogs    = () => load(KEY.progressLogs, "[]");
export const saveProgressLog    = (l) => { const list = getProgressLogs(); list.push({ ...l, id: uid() }); store(KEY.progressLogs, list); };
export const deleteProgressLog  = (id) => store(KEY.progressLogs, getProgressLogs().filter((l) => l.id !== id));

// ── Check-ins ─────────────────────────────────────────────────────────────
export const getCheckIns    = () => load(KEY.checkIns, "[]");
export const saveCheckIn    = (c) => { const list = getCheckIns(); list.push({ ...c, id: uid() }); store(KEY.checkIns, list); };
export const deleteCheckIn  = (id) => store(KEY.checkIns, getCheckIns().filter((c) => c.id !== id));

// ── Exercises ─────────────────────────────────────────────────────────────
export const getExercises    = () => load(KEY.exercises, "[]");
export const saveExercise    = (ex) => upsert(KEY.exercises, ex);
export const deleteExercise  = (id) => store(KEY.exercises, getExercises().filter((ex) => ex.id !== id));

// ── Goal Templates (Goal Library) ─────────────────────────────────────────
export const getGoalTemplates   = () => load(KEY.goalTemplates, "[]");
export const saveGoalTemplate   = (t) => upsert(KEY.goalTemplates, t);
export const deleteGoalTemplate = (id) => store(KEY.goalTemplates, getGoalTemplates().filter((t) => t.id !== id));

// ── Settings ──────────────────────────────────────────────────────────────
export const getSettings  = () => load(KEY.settings, '{"coachName":"","club":""}');
export const saveSettings = (s) => store(KEY.settings, s);

// ── Helpers ───────────────────────────────────────────────────────────────
export const calcAgeBand = (dob) => {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age <= 13) return "youth";
  if (age <= 17) return "junior";
  if (age <= 39) return "adult";
  return "master";
};

export const calcWACategory = (discipline, gender, ageBand) => {
  if (!discipline || !gender || !ageBand) return null;
  const disc = discipline === "barebow" ? "BB" : "RC";
  const g = gender === "female" ? "W" : "M";
  const band = { youth: "U18", junior: "U21", adult: "SR", master: "MS" }[ageBand] || "SR";
  return `${g}${disc} ${band}`;
};

export const storageUsageKB = () => {
  let total = 0;
  for (const k of Object.values(KEY)) {
    total += (localStorage.getItem(k) || "").length;
  }
  return Math.round(total / 1024 * 10) / 10;
};

// ── Backup / Restore ──────────────────────────────────────────────────────
export const exportBackup = () => {
  const data = {
    version: 2, exported: new Date().toISOString(),
    athletes:      getAthletes(),
    sessions:      getSessions(),
    assessments:   getAssessments(),
    plans:         getPlans(),
    goals:         getGoals(),
    progressLogs:  getProgressLogs(),
    checkIns:      getCheckIns(),
    exercises:     getExercises(),
    goalTemplates: getGoalTemplates(),
    settings:      getSettings(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `racm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const BACKUP_LISTS = ["athletes", "sessions", "assessments", "plans", "goals", "progressLogs", "checkIns", "exercises", "goalTemplates"];
const isRecords = (a) => Array.isArray(a) && a.every((x) => x && typeof x === "object" && !Array.isArray(x));

export const importBackup = (jsonString) => {
  const d = JSON.parse(jsonString);
  // Validate everything before touching stored data.
  if (!d || d.version > 2) throw new Error("Unsupported backup");
  if (!isRecords(d.athletes) || !d.athletes.every((a) => typeof a.id === "string" && typeof a.name === "string")) throw new Error("Invalid backup");
  if (BACKUP_LISTS.some((k) => d[k] !== undefined && !isRecords(d[k]))) throw new Error("Invalid backup");
  if (d.settings !== undefined && !isRecords([d.settings])) throw new Error("Invalid backup");

  if (getAthletes().length) exportBackup(); // safety copy: restoring replaces everything

  const before = Object.values(KEY).map((k) => [k, localStorage.getItem(k)]);
  try {
    for (const k of BACKUP_LISTS) store(KEY[k], d[k] || []);
    if (d.settings) store(KEY.settings, d.settings);
  } catch (e) {
    for (const [k, v] of before) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    throw e;
  }
};

// Only RACM's keys: localStorage is shared with anything else on this origin.
export const clearAllData = () =>
  Object.keys(localStorage).filter((k) => k.startsWith("racm_")).forEach((k) => localStorage.removeItem(k));
