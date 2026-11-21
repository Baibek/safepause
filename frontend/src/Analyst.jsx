import React, { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { api, fmt } from "./i18n.js";
import { Factors, RiskBadge } from "./Client.jsx";

const ROLE_COLOR = { drop: "#c8372d", cashout: "#7a1f3d", victim: "#e0a526", normal: "#b9c0cc" };

function Graph({ data, showAll, onPick }) {
  const el = useRef(null);
  useEffect(() => {
    if (!data || !el.current) return;
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#14213d";
    const keep = new Set(data.nodes.filter((n) => showAll || n.role !== "normal").map((n) => n.id));
    const nodes = new DataSet(data.nodes.filter((n) => keep.has(n.id)).map((n) => ({
      id: n.id, label: n.role === "normal" ? "" : n.id.slice(-4),
      color: { background: ROLE_COLOR[n.role], border: "#fff", highlight: { background: ROLE_COLOR[n.role], border: ink } },
      size: n.role === "normal" ? 6 : n.role === "victim" ? 10 : 12 + n.score * 14,
      font: { color: ink, size: 11, face: "Golos Text" },
    })));
    const edges = new DataSet(data.edges.filter((e) => keep.has(e.from) && keep.has(e.to) && (showAll || e.suspicious)).map((e, i) => ({
      id: i, from: e.from, to: e.to, arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      width: e.suspicious ? 1 + Math.min(e.amount / 600000, 4) : 0.5,
      color: { color: e.suspicious ? "rgba(200,55,45,.55)" : "rgba(120,130,150,.25)" },
      title: `${fmt(e.amount)} ₸`,
    })));
    const net = new Network(el.current, { nodes, edges }, {
      nodes: { shape: "dot", borderWidth: 1.5 },
      physics: { solver: "forceAtlas2Based", forceAtlas2Based: { gravitationalConstant: -38, springLength: 70 }, stabilization: { iterations: 180 } },
      interaction: { hover: true, tooltipDelay: 100 },
    });
    net.on("click", (p) => onPick(p.nodes[0] ? data.nodes.find((n) => n.id === p.nodes[0]) : null));
    return () => net.destroy();
  }, [data, showAll]);
  return <div className="graph" ref={el} />;
}

export default function Analyst({ lang, t }) {
  const [dash, setDash] = useState(null);
  const [graph, setGraph] = useState(null);
  const [sel, setSel] = useState(null);
  const [node, setNode] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () => api("/api/dashboard").then(setDash).catch(() => {});
    load(); api("/api/graph").then(setGraph);
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, []);

  const tx = useMemo(() => dash?.transactions.find((x) => x.id === sel) || dash?.transactions.find((x) => x.paused), [dash, sel]);
  if (!dash) return null;
  const s = dash.summary, m = dash.metrics;

  return (
    <main className="analyst">
      <section className="kpis">
        <div className="kpi"><span>{t.kChecked}</span><b>{s.checked}</b></div>
        <div className="kpi"><span>{t.kPaused}</span><b>{s.paused}</b></div>
        <div className="kpi"><span>{t.kStopped}</span><b>{s.cancelled} / {s.delayed}</b></div>
        <div className="kpi accent"><span>{t.kProtected}</span><b>{fmt(s.protected_amount)} ₸</b></div>
        <div className="kpi wide">
          <span>{t.kModel} · {t.synthetic}</span>
          <div className="mrow">
            <div><b>{m.roc_auc.toFixed(3)}</b><small>ROC-AUC</small></div>
            <div><b>{Math.round(m.recall_at_pause * 100)}%</b><small>{t.recallNote}</small></div>
            <div><b>{(m.false_pause_share * 100).toFixed(2)}%</b><small>{t.falseNote}</small></div>
          </div>
        </div>
      </section>

      <section className="grid2">
        <div className="panel feed">
          <h2>{t.feed}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.time}</th><th>{t.client}</th><th className="num">₸</th><th>{t.recipient}</th><th>{t.risk}</th><th>{t.status}</th></tr></thead>
              <tbody>
                {dash.transactions.map((x) => (
                  <tr key={x.id} className={(tx && tx.id === x.id ? "sel " : "") + (x.live ? "live" : "")} onClick={() => setSel(x.id)}>
                    <td>{x.time.slice(11, 16)}</td>
                    <td>{x.client}{x.live && <span className="tag">{t.live}</span>}{x.scam_call && <span className="tag hot">☎ {t.callTag}</span>}</td>
                    <td className="num">{fmt(x.amount)}</td>
                    <td>{x.recipient}</td>
                    <td><span className="mini"><i className={x.level} style={{ width: `${Math.max(x.risk * 100, 3)}%` }} /></span>{Math.round(x.risk * 100)}%</td>
                    <td><span className={"st " + x.status}>{t.st[x.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>{t.why}</h2>
          {tx ? (
            <>
              <p className="hint">{t.whyHint}</p>
              <div className="risk-row">
                <span>{tx.id} · {tx.client}, {tx.age} · {fmt(tx.amount)} ₸</span>
                <RiskBadge risk={tx.risk} level={tx.level} t={t} />
              </div>
              <Factors factors={tx.factors} lang={lang} t={t} />
              {tx.guardian && <p><span className="tag">{t.guardianBadge}: {tx.guardian.name}</span></p>}
              {tx.transcript.length > 0 && (
                <>
                  <h3>{t.transcript}</h3>
                  <div className="chat small">
                    {tx.transcript.map((mm, i) => <div key={i} className={"msg " + mm.from}>{mm.text}</div>)}
                  </div>
                </>
              )}
            </>
          ) : <p className="hint">{t.pick}</p>}
        </div>
      </section>

      <section className="grid2 graph-row">
        <div className="panel">
          <div className="head-row">
            <div><h2>{t.graph}</h2><p className="hint">{t.graphHint}</p></div>
            <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{t.showAll}</label>
          </div>
          <Graph data={graph} showAll={showAll} onPick={setNode} />
          <div className="legend">
            {Object.keys(ROLE_COLOR).map((r) => <span key={r}><i style={{ background: ROLE_COLOR[r] }} />{t.role[r]}</span>)}
          </div>
        </div>
        <div className="panel">
          <h2>{t.networks}</h2>
          {graph?.networks.map((n) => (
            <div key={n.id} className="netcard">
              <b>{t.net} №{n.id}</b>
              <span>{n.size} {t.accounts} · {n.victims} {t.victims}</span>
              <span>{t.volume}: <b>{fmt(n.volume)} ₸</b></span>
              <span>{t.hold}: ~{Math.round(n.avg_hold_min)} {t.min}</span>
            </div>
          ))}
          <h3>{t.node}</h3>
          {node ? (
            <dl className="node">
              <dt>{node.id}</dt><dd><span className={"st " + (node.role === "normal" ? "approved" : node.role === "victim" ? "delayed" : "cancelled")}>{t.role[node.role]}</span></dd>
              <dt>{t.score}</dt><dd>{node.score.toFixed(2)}</dd>
              <dt>{t.passthrough}</dt><dd>{Math.round(node.passthrough * 100)}%</dd>
              <dt>{t.hold}</dt><dd>{node.hold_min == null ? "—" : `${Math.round(node.hold_min)} ${t.min}`}</dd>
              <dt>{t.ageDays}</dt><dd>{node.age_days}</dd>
              <dt>{t.fanIn}</dt><dd>{node.fan_in}</dd>
            </dl>
          ) : <p className="hint">{t.nodePick}</p>}
        </div>
      </section>
    </main>
  );
}
