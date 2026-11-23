import React, { useEffect, useState } from "react";
import { api, fmt } from "./i18n.js";
import PhoneFrame, { TabBar } from "./phone/PhoneFrame.jsx";
import AnalystApp, { ROLE_COLOR } from "./phone/AnalystApp.jsx";
import { AN } from "./phone/analystStrings.js";

const PAGE = {
  kk: {
    title: "Аналитик не көреді",
    lead: "Банктің антифрод қызметкері әр тоқтатылған аударымды телефонынан тексереді: модель неге күдіктенді, клиент диалогта не деді, ақша қай желіге кетпек болды.",
    steps: ["«Клиент қосымшасы» бөлімінде күдікті аударым жасаңыз.", "«Кезек» табында ол бірнеше секундта пайда болады.", "Аударымды ашып, тәуекелді көтерген белгілерді қараңыз.", "«Желі» табында дроп-шоттарды басып, деректерін көріңіз."],
    synth: "Аударымдар, шоттар және граф синтетикалық. Модель сапасы тест жинағында есептелген.",
    netTitle: "Табылған дроп-желілер",
    netLead: "Граф ақша кіріп, жарты сағатқа жетпей шығып кететін шоттарды тізбекке біріктіреді.",
    total: (v) => `Жалпы айналым: ${v} ₸`,
  },
  ru: {
    title: "Что видит аналитик",
    lead: "Сотрудник антифрода проверяет каждый остановленный перевод с телефона: почему модель насторожилась, что клиент ответил в диалоге и в какую сеть уходили деньги.",
    steps: ["Сделайте подозрительный перевод в разделе «Приложение клиента».", "Через несколько секунд он появится во вкладке «Очередь».", "Откройте перевод и посмотрите, какие признаки подняли риск.", "Во вкладке «Сеть» нажмите на дроп-счёт, чтобы увидеть его данные."],
    synth: "Переводы, счета и граф синтетические. Качество модели посчитано на тестовой выборке.",
    netTitle: "Найденные дроп-сети",
    netLead: "Граф связывает в цепочки счета, через которые деньги проходят меньше чем за полчаса.",
    total: (v) => `Общий оборот: ${v} ₸`,
  },
};

export default function Analyst({ lang, t }) {
  const [dash, setDash] = useState(null);
  const [graph, setGraph] = useState(null);
  const [tab, setTab] = useState("overview");
  const A = AN[lang], G = PAGE[lang];

  useEffect(() => {
    const load = () => api("/api/dashboard").then(setDash).catch(() => {});
    load(); api("/api/graph").then(setGraph).catch(() => {});
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, []);

  const tabs = [
    { id: "overview", icon: "shield", label: A.tabs.overview },
    { id: "queue", icon: "clock", label: A.tabs.queue },
    { id: "network", icon: "bank", label: A.tabs.network },
  ];
  const volume = graph ? graph.networks.reduce((a, n) => a + n.volume, 0) : 0;

  return (
    <main className="client-view analyst-view">
      <section className="panel scenario">
        <h2>{G.title}</h2>
        <p className="hint">{G.lead}</p>
        <ol className="how">{G.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <p className="hint small">{G.synth}</p>
      </section>

      <section className="phone-wrap">
        <PhoneFrame tone="light" tabBar={<TabBar tabs={tabs} active={tab} onChange={setTab} />}>
          <div className="analyst-app" key={tab}>
            <AnalystApp tab={tab} dash={dash} graph={graph} lang={lang} t={t} A={A} />
          </div>
        </PhoneFrame>
      </section>

      <aside className="side">
        <div className="panel">
          <h2>{G.netTitle}</h2>
          <p className="hint">{G.netLead}</p>
          {graph && (
            <>
              <ul className="net-sum">
                {graph.networks.map((n) => (
                  <li key={n.id}><b>{t.net} {n.id}</b><span>{n.size} {t.accounts}, {n.victims} {t.victims}</span><b className="num">{fmt(n.volume)} ₸</b></li>
                ))}
              </ul>
              <p className="hint">{G.total(fmt(volume))}</p>
              <div className="legend">{Object.keys(ROLE_COLOR).map((r) => <span key={r}><i style={{ background: ROLE_COLOR[r] }} />{t.role[r]}</span>)}</div>
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
