// Small things the app remembers between visits on this device: language, who uses it (coach or archer), and the
// coach's place in the app. Not records: never synced, never in the backup.
const KEY = "racm_ui";
export const getUi = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
export const setUi = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...getUi(), ...patch })); } catch { /* storage full: forget it */ } };

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
// "coach" | "archer" | "" (not chosen yet). A signed-in account says whose app this is; a device already holding a
// coach's archers is a coach's.
export const appRole = () => getUi().role || (read("racm_auth") ? read("racm_auth").role || "coach" : read("racm_athletes")?.length ? "coach" : "");
