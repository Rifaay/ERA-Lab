import { useState } from "react";
import Account from "./Account";
import Notifications from "./Notifications";
import { LockSettings } from "../DeviceLock";
import { hasPin } from "../lock";
import { configured, signedIn } from "../sync";
import { getErrors, clearErrors, downloadErrors } from "../errors";
import { getSettings, saveSettings, exportBackup, importBackup, storageUsageKB, clearAllData } from "../storage";

export default function Settings({ tr, onDataCleared, onGo }) {
  const s = tr.settings;
  const [settings, setSettings] = useState(getSettings);
  const [saved, setSaved] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [usageKB, setUsageKB] = useState(storageUsageKB);
  const [confirmText, setConfirmText] = useState("");
  const [errorCount, setErrorCount] = useState(() => getErrors().length);
  const daysSinceBackup = () => { const t = localStorage.getItem("racm_last_backup"); return t ? Math.floor((Date.now() - new Date(t)) / 864e5) : null; };
  const [backupDays, setBackupDays] = useState(daysSinceBackup);

  const [, setTick] = useState(0); // the status chips re-read the lock and sign-in after a change below
  const changed = () => setTick((n) => n + 1);
  const initials = (settings.coachName || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const set = (k, v) => setSettings((x) => ({ ...x, [k]: v }));

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRestore = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { importBackup(ev.target.result); setSettings(getSettings()); setRestoreMsg(s.restoreSuccess); setUsageKB(storageUsageKB()); onDataCleared && onDataCleared(); }
      catch { setRestoreMsg(s.restoreError); }
      setTimeout(() => setRestoreMsg(""), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearAll = () => {
    if (confirmText !== s.confirmWord) return;
    clearAllData();
    setConfirmText("");
    setUsageKB(0);
    onDataCleared && onDataCleared();
  };

  const pct = Math.min(100, Math.round(usageKB / 50)); // ~5MB quota

  return (
    <div className="screen">
      <h2>{s.title}</h2>

      <div className="card coach-head">
        <span className="coach-avatar" aria-hidden="true">{initials || "?"}</span>
        <div>
          <div className="coach-name">{settings.coachName || s.noName}</div>
          {settings.club && <div className="muted">{settings.club}</div>}
          <div className="coach-chips">
            <span className={`badge ${hasPin() ? "teal" : "amber"}`}>{hasPin() ? s.lockOn : s.lockOff}</span>
            {configured && <span className={`badge ${signedIn() ? "teal" : "gray"}`}>{signedIn() ? s.cloudOn : s.cloudOff}</span>}
          </div>
        </div>
      </div>

      <div className="card settings-section">
        <div className="settings-label">{s.profile}</div>
        <div className="form">
          <label>{s.coachName}
            <input value={settings.coachName || ""} autoComplete="name" onChange={(e) => set("coachName", e.target.value)} />
          </label>
          <label>{s.club}
            <input value={settings.club || ""} autoComplete="organization" onChange={(e) => set("club", e.target.value)} />
          </label>
          <button className="btn-primary small" style={{ alignSelf: "flex-start" }} onClick={handleSave}>{s.save}</button>
          {saved && <p className="success-msg">{s.saved}</p>}
        </div>
      </div>

      <div className="card settings-section">
        <div className="settings-label">{s.security}</div>
        <h3 className="settings-sub">{tr.lock.title}</h3>
        <LockSettings tr={tr} onChange={changed} />
        {configured && <>
          <h3 className="settings-sub">{tr.sync.title}</h3>
          <Account tr={tr} as="coach" onChange={changed} />
          {signedIn() && <><h3 className="settings-sub">{tr.push.title}</h3><Notifications tr={tr} /></>}
        </>}
      </div>

      <h3 className="settings-group">{s.data}</h3>
      {/* Backup / Restore */}
      <div className="card settings-section">
        <div className="settings-label">{s.backup}</div>
        <div className="btn-row">
          <button className="btn-ghost" onClick={() => { exportBackup(); setBackupDays(daysSinceBackup()); }}>{s.backupBtn}</button>
          <label className="btn-ghost" style={{ cursor: "pointer" }}>
            {s.restoreBtn}
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleRestore} />
          </label>
        </div>
        {restoreMsg && <p className="success-msg" style={{ marginTop: 6 }}>{restoreMsg}</p>}
        <p className="muted" style={{ marginTop: 8 }}>{s.backupNote}</p>
        <p className={backupDays == null || backupDays > 7 ? "error-msg" : "muted"} style={{ marginTop: 8 }}>
          {backupDays == null ? s.noBackup : s.lastBackup.replace("{days}", backupDays)}
        </p>
      </div>

      {/* Problems: the device's own error log, no outside service */}
      <div className="card settings-section">
        <div className="settings-label">{s.errors}</div>
        <p className="muted" style={{ marginBottom: 10 }}>{errorCount ? s.errorsSome.replace("{n}", errorCount) : s.errorsNone}</p>
        {errorCount > 0 && <div className="btn-row">
          <button className="btn-ghost small" onClick={downloadErrors}>{s.errorsDownload}</button>
          <button className="btn-ghost small" onClick={() => { clearErrors(); setErrorCount(0); }}>{s.errorsClear}</button>
        </div>}
      </div>

      <div className="card settings-section">
        <div className="settings-label">{s.legal}</div>
        <button className="btn-ghost small" onClick={() => onGo("legal")}>{s.legalOpen}</button>
      </div>

      {/* Storage */}
      <div className="card settings-section">
        <div className="settings-label">{s.storage}</div>
        <div className="storage-bar-wrap">
          <div className="storage-info">
            <span>{usageKB} {s.kb} {s.storageUsed}</span>
            <span>{s.storageOf.replace("{pct}", pct)}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct > 80 ? "var(--r)" : "var(--p)" }} />
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card settings-section" style={{ borderColor: "var(--rl)" }}>
        <div className="settings-label" style={{ color: "var(--r)" }}>{s.danger}</div>
        <p className="muted" style={{ marginBottom: 10 }}>{s.confirmClear}</p>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: 2 }}>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={s.confirmWord}
              style={{ borderColor: "var(--rl)" }}
            />
          </label>
          <button
            className="btn-primary danger"
            style={{ marginBottom: 0, height: 36 }}
            disabled={confirmText !== s.confirmWord}
            onClick={handleClearAll}
          >{s.clearAll}</button>
        </div>
      </div>
    </div>
  );
}
