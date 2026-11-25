import React, { useEffect, useState } from "react";
import { STR, api, VIRTUAL } from "./i18n.js";
import { SH } from "./shell.js";
import Client from "./Client.jsx";
import Analyst from "./Analyst.jsx";

export default function App() {
  const [lang, setLang] = useState("kk");
  const [tab, setTab] = useState("client");
  const [boot, setBoot] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [scenOpen, setScenOpen] = useState(false);
  const t = STR[lang], S = SH[lang];

  useEffect(() => { api("/api/bootstrap").then(setBoot).catch(() => setBoot(false)); }, [epoch]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // the analyst's situation centre is dark, the client side follows the system theme
  useEffect(() => {
    if (tab === "analyst") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
  }, [tab]);

  const reset = async () => { await api("/api/demo/reset", {}); setEpoch((e) => e + 1); };

  return (
    <div className={"app mode-" + tab}>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true"><i /><i /></span>
          <div>
            <strong>Senim</strong>
            <small>{t.tagline}</small>
          </div>
        </div>
        <div className="top-right">
          <nav className="mode-switch" aria-label="Senim">
            <button className={tab === "client" ? "on" : ""} aria-pressed={tab === "client"} onClick={() => setTab("client")}>{S.modeClient}</button>
            <button className={tab === "analyst" ? "on" : ""} aria-pressed={tab === "analyst"} onClick={() => setTab("analyst")}>{S.modeAnalyst}</button>
          </nav>
          {boot && <span className={"pill " + (boot.llm ? "ok" : "")} title={VIRTUAL ? t.virtualNote : undefined}>{boot.llm ? t.llmOn : t.llmOff}</span>}
          <div className="lang">
            {["kk", "ru"].map((l) => (
              <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "kk" ? "ҚАЗ" : "РУС"}</button>
            ))}
          </div>
          <button className="ghost" onClick={reset}>{S.reset}</button>
          {tab === "client" && (
            <button className="scen-btn" onClick={() => setScenOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.8v10.4L12 7z" fill="currentColor" /></svg>
              {S.scenarios}
            </button>
          )}
        </div>
      </header>
      {boot === false && <p className="error">API қолжетімсіз · API недоступен (backend: uvicorn main:app --port 8000)</p>}
      {boot && (tab === "client"
        ? <Client key={epoch} boot={boot} lang={lang} t={t} scenOpen={scenOpen} setScenOpen={setScenOpen} />
        : <Analyst key={epoch} lang={lang} t={t} boot={boot} />)}
    </div>
  );
}
