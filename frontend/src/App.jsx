import React, { useEffect, useState } from "react";
import { STR, api, VIRTUAL } from "./i18n.js";
import Client from "./Client.jsx";
import Analyst from "./Analyst.jsx";

export default function App() {
  const [lang, setLang] = useState("kk");
  const [tab, setTab] = useState("client");
  const [boot, setBoot] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const t = STR[lang];

  useEffect(() => { api("/api/bootstrap").then(setBoot).catch(() => setBoot(false)); }, [epoch]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const reset = async () => { await api("/api/demo/reset", {}); setEpoch((e) => e + 1); };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true"><i /><i /></span>
          <div>
            <strong>Senim</strong>
            <small>{t.tagline}</small>
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === "client" ? "on" : ""} onClick={() => setTab("client")}>{t.tabClient}</button>
          <button className={tab === "analyst" ? "on" : ""} onClick={() => setTab("analyst")}>{t.tabAnalyst}</button>
        </nav>
        <div className="top-right">
          {boot && <span className={"pill " + (boot.llm ? "ok" : "")}>{boot.llm ? t.llmOn : t.llmOff}</span>}
          {VIRTUAL && <span className="pill">{t.virtualNote}</span>}
          <button className="ghost" onClick={reset}>{t.reset}</button>
          <div className="lang">
            {["kk", "ru"].map((l) => (
              <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "kk" ? "ҚАЗ" : "РУС"}</button>
            ))}
          </div>
        </div>
      </header>
      {boot === false && <p className="error">API қолжетімсіз · API недоступен (backend: uvicorn main:app --port 8000)</p>}
      {boot && (tab === "client"
        ? <Client key={epoch} boot={boot} lang={lang} t={t} />
        : <Analyst key={epoch} lang={lang} t={t} />)}
    </div>
  );
}
