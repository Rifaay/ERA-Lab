import { useState } from "react";
import Account from "./Account";
import { configured } from "../sync";
import { getSettings, saveSettings, exportBackup, importBackup, storageUsageKB, clearAllData } from "../storage";

export default function Settings({ lang, tr, onDataCleared }) {
  const s = tr.settings;
  const [settings, setSettings] = useState(getSettings);
  const [saved, setSaved] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [usageKB, setUsageKB] = useState(storageUsageKB);
  const [confirmText, setConfirmText] = useState("");

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

      {/* Coach info */}
      <div className="card settings-section">
        <div className="settings-label">Coach Info</div>
        <div className="form">
          <label>{s.coachName}
            <input value={settings.coachName || ""} onChange={(e) => set("coachName", e.target.value)} />
          </label>
          <label>{s.club}
            <input value={settings.club || ""} onChange={(e) => set("club", e.target.value)} />
          </label>
          <button className="btn-primary small" style={{ alignSelf: "flex-start" }} onClick={handleSave}>{s.save}</button>
          {saved && <p className="success-msg">{s.saved}</p>}
        </div>
      </div>

      {configured && <Account tr={tr} />}

      {/* Backup / Restore */}
      <div className="card settings-section">
        <div className="settings-label">{s.backup}</div>
        <div className="btn-row">
          <button className="btn-ghost" onClick={exportBackup}>{s.backupBtn}</button>
          <label className="btn-ghost" style={{ cursor: "pointer" }}>
            {s.restoreBtn}
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleRestore} />
          </label>
        </div>
        {restoreMsg && <p className="success-msg" style={{ marginTop: 6 }}>{restoreMsg}</p>}
      </div>

      {/* Storage */}
      <div className="card settings-section">
        <div className="settings-label">{s.storage}</div>
        <div className="storage-bar-wrap">
          <div className="storage-info">
            <span>{usageKB} KB {s.storageUsed}</span>
            <span>{pct}% of ~5 MB</span>
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
              placeholder="Type CONFIRM"
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
