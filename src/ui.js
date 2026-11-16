// Small things the app remembers between visits on this device: language, who uses it (coach or archer), and the
// coach's place in the app. Not records: never synced, never in the backup.
const KEY = "racm_ui";
export const getUi = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
export const setUi = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...getUi(), ...patch })); } catch { /* storage full: forget it */ } };

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
// "coach" | "archer" | "" (show the sign-in page). A signed-in account decides which app opens. Signed out, the sign-in
// page shows, unless the coach chose to use ERA Lab on this device alone; with no cloud copy there is nothing to sign
// in to, so a device holding a coach's archers just opens.
export const appRole = (cloud = true) => {
  if (read("racm_auth")) return read("racm_auth").role || "coach";
  if (getUi().local || (!cloud && read("racm_athletes")?.length)) return "coach";
  return "";
};
