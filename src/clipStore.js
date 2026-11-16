// Whole video clips, kept on this device in IndexedDB (the browser's store for large files).
// Never synced, never uploaded, never in the backup file: the clip leaves the phone only when the coach saves or
// shares it. Each record: { id (the clip's file name), athleteId, blob, mime, size, durationS, recordedAt, savedOut }.
const DB = "era-lab-clips", STORE = "clips";
let dbp = null;

const open = () => (dbp ||= new Promise((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => { dbp = null; reject(r.error); };
}));

const run = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Clip storage refused the write (the device may be full)"));
  });
};

export const hasClipStore = () => typeof indexedDB !== "undefined";
export const putClip = (clip) => run("readwrite", (s) => s.put(clip));
export const getClip = (id) => run("readonly", (s) => s.get(id));
// Snapshots (a frame with the coach's drawings) live here too, marked kind "snap": { id, kind, athleteId, clipId, blob,
// takenAt, inReport }. The clip library lists only clips.
const all = () => run("readonly", (s) => s.getAll());
export const listClips = async () => (await all()).filter((c) => c.kind !== "snap");
export const listSnaps = async (athleteId) => (await all()).filter((c) => c.kind === "snap" && (!athleteId || c.athleteId === athleteId));
export const deleteClip = (id) => run("readwrite", (s) => s.delete(id));
export const updateClip = async (id, change) => { const c = await getClip(id); if (c) await putClip({ ...c, ...change }); };

// Deleting an archer deletes their video too.
export const deleteClipsOf = async (athleteId) => {
  if (!hasClipStore()) return;
  for (const c of await all()) if (c.athleteId === athleteId) await deleteClip(c.id);
};
export const clearClips = () => (hasClipStore() ? run("readwrite", (s) => s.clear()) : Promise.resolve());
