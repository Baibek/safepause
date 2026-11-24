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
    console: "Банк қызметкерінің пульті", consoleHint: "Демо: банк жағындағы әрекеттерді осы жерден жасаңыз.",
    client: "Клиент", staff: "Қызметкер", startCall: "Клиентке қоңырау шалу (Call Status)", endCall: "Қоңырауды аяқтау",
    inCall: (n, id, c) => `${n} (ID ${id}) қазір ${c} клиентпен сөйлесіп тұр`,
    atm: "Банкомат: сейфті биометриямен ашу", atmDone: (a) => `Сейф ашылды, ${a} ₸ қолжетімді болды`, atmEmpty: "Сейф бос",
    clock: "Уақытты 24 сағатқа жылжыту", clockDone: "Уақыт жылжыды: жауап бермеген сенімді адамның сұраулары жабылды",
  },
  ru: {
    title: "Что видит аналитик",
    lead: "Сотрудник антифрода проверяет каждый остановленный перевод с телефона: почему модель насторожилась, что клиент ответил в диалоге и в какую сеть уходили деньги.",
    steps: ["Сделайте подозрительный перевод в разделе «Приложение клиента».", "Через несколько секунд он появится во вкладке «Очередь».", "Откройте перевод и посмотрите, какие признаки подняли риск.", "Во вкладке «Сеть» нажмите на дроп-счёт, чтобы увидеть его данные."],
    synth: "Переводы, счета и граф синтетические. Качество модели посчитано на тестовой выборке.",
    netTitle: "Найденные дроп-сети",
    netLead: "Граф связывает в цепочки счета, через которые деньги проходят меньше чем за полчаса.",
    total: (v) => `Общий оборот: ${v} ₸`,
    console: "Пульт сотрудника банка", consoleHint: "Демо: действия на стороне банка выполняются здесь.",
    client: "Клиент", staff: "Сотрудник", startCall: "Позвонить клиенту (Call Status)", endCall: "Завершить звонок",
    inCall: (n, id, c) => `${n} (ID ${id}) сейчас разговаривает с клиентом ${c}`,
    atm: "Банкомат: открыть сейф по биометрии", atmDone: (a) => `Сейф открыт, доступно ${a} ₸`, atmEmpty: "Сейф пуст",
    clock: "Сдвинуть время на 24 часа", clockDone: "Время сдвинуто: неотвеченные запросы доверенному лицу закрыты",
  },
};

function StaffConsole({ boot, G }) {
  const personas = boot?.personas || [];
  const [pid, setPid] = useState(personas[0]?.id || "aigul");
  const [sid, setSid] = useState("BK-2041");
  const [call, setCall] = useState(null);
  const [note, setNote] = useState("");
  const staffList = boot?.staff || [];
  const refresh = () => api(`/api/callstatus/${pid}`).then(setCall).catch(() => {});
  useEffect(() => { refresh(); setNote(""); }, [pid]);
  const who = personas.find((p) => p.id === pid)?.name || pid;
  return (
    <div className="panel staff-console">
      <h2>{G.console}</h2>
      <p className="hint">{G.consoleHint}</p>
      <label className="field">{G.client}
        <select value={pid} onChange={(e) => setPid(e.target.value)}>{personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </label>
      <label className="field">{G.staff}
        <select value={sid} onChange={(e) => setSid(e.target.value)}>{staffList.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.id}</option>)}</select>
      </label>
      {call?.active ? (
        <>
          <p className="console-live">{G.inCall(call.staff.name, call.staff.id, who)}</p>
          <button className="ghost" onClick={async () => { await api("/api/callstatus/end", { persona: pid }); refresh(); }}>{G.endCall}</button>
        </>
      ) : <button className="primary" onClick={async () => { await api("/api/callstatus/start", { persona: pid, staff_id: sid }); refresh(); }}>{G.startCall}</button>}
      <button className="ghost" onClick={async () => {
        const st = await api(`/api/protect/${pid}`);
        if (!st.locked) return setNote(G.atmEmpty);
        const r = await api("/api/protect/unlock", { persona: pid, amount: st.locked, channel: "atm", biometric: true });
        setNote(G.atmDone(fmt(r.available)));
      }}>{G.atm}</button>
      <button className="ghost" onClick={async () => { await api("/api/demo/clock", { hours: 24 }); setNote(G.clockDone); }}>{G.clock}</button>
      {note && <p className="hint" role="status">{note}</p>}
    </div>
  );
}

export default function Analyst({ lang, t, boot }) {
  const [dash, setDash] = useState(null);
  const [graph, setGraph] = useState(null);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const A = AN[lang], G = PAGE[lang];

  const load = () => {
    api("/api/dashboard").then(setDash).catch(() => {});
    api("/api/audit").then(setAudit).catch(() => {});
  };
  useEffect(() => {
    load(); api("/api/graph").then(setGraph).catch(() => {});
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, []);
  const decide = async (tx_id, action) => {
    setNotice("");
    try { await api("/api/analyst/decide", { tx_id, action, analyst: "Аналитик" }); setNotice(A.decided); }
    catch (e) { setNotice(String(e.message)); }
    load();
  };
  const report = async (tx_id) => { const r = await api("/api/analyst/report", { tx_id, analyst: "Аналитик" }); load(); return r; };
  const drop = async (account) => { await api("/api/analyst/droplist", { account, reason: A.dropReason, analyst: "Аналитик" }); load(); };

  const tabs = [
    { id: "overview", icon: "shield", label: A.tabs.overview },
    { id: "queue", icon: "clock", label: A.tabs.queue },
    { id: "network", icon: "bank", label: A.tabs.network },
    { id: "audit", icon: "message", label: A.tabs.audit },
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
            <AnalystApp tab={tab} dash={dash} graph={graph} lang={lang} t={t} A={A} audit={audit} onDecide={decide} onDrop={drop} notice={notice} onReport={report} />
          </div>
        </PhoneFrame>
      </section>

      <aside className="side">
        <StaffConsole boot={boot} G={G} />
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
