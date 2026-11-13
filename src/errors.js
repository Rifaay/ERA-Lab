// Error tracking without a third party: the last 20 crashes are kept on the device with the screen and app version,
// never any athlete data, and the coach can download them from Settings to send to whoever maintains the app.
const KEY = "racm_errors";

export const getErrors = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

export const recordError = (e, where = "") => {
  try {
    const err = e?.reason ?? e?.error ?? e;
    const entry = {
      at: new Date().toISOString(),
      where,
      message: String(err?.message ?? err).slice(0, 300),
      stack: String(err?.stack ?? "").split("\n").slice(0, 6).join("\n").slice(0, 1200),
      page: location.hash || location.pathname.split("/").pop(),
      agent: navigator.userAgent.slice(0, 160),
    };
    localStorage.setItem(KEY, JSON.stringify([...getErrors(), entry].slice(-20)));
  } catch { /* storage full or blocked: never let error logging cause an error */ }
};

export const clearErrors = () => localStorage.removeItem(KEY);

export const downloadErrors = () => {
  const blob = new Blob([JSON.stringify({ app: "ERA Lab", errors: getErrors() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `era-lab-errors-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
