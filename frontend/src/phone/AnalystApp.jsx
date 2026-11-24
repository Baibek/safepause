import React, { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { fmt } from "../i18n.js";
import { Icon } from "./PhoneFrame.jsx";

// Node colours on the dark map: drops and cash-out burn red/orange, victims amber, ordinary accounts recede.
export const ROLE_COLOR = { drop: "#FF5A4E", cashout: "#FF8A3D", victim: "#F4C44E", normal: "#5B6B93" };
const hhmm = (iso) => (iso || "").slice(11, 16);
const pct = (x) => Math.round(x * 100);
const tone = { approved: "ok", delayed: "warn", cancelled: "bad", in_dialog: "warn" };

function RiskMeter({ risk, level }) {
  return <span className={"an-meter " + level} aria-label={`${pct(risk)}%`}><i style={{ width: `${Math.max(pct(risk), 3)}%` }} /></span>;
}

function TxItem({ x, t, A, onOpen }) {
  return (
    <li>
      <button className="an-tx" onClick={() => onOpen(x.id)}>
        <span className="an-tx-top">
          <b>{x.client}</b>
          <b className="an-amt">{fmt(x.amount)} ₸</b>
        </span>
        <span className="an-tx-mid">
          <RiskMeter risk={x.risk} level={x.level} />
          <span className={"an-score " + x.level}>{pct(x.risk)}</span>
          <span className={"an-st " + tone[x.status]}>{t.st[x.status]}</span>
        </span>
        <small>{hhmm(x.time)} · {x.recipient}{x.scam_call ? ` · ${A.afterCall}` : ""}</small>
      </button>
    </li>
  );
}

function Overview({ dash, t, A, onOpen }) {
  const s = dash.summary, m = dash.metrics;
  const stopped = s.cancelled + s.delayed;
  const waiting = dash.transactions.filter((x) => x.paused && x.status !== "approved").slice(0, 4);
  return (
    <div className="an-screen">
      <p className="an-role">{A.role}</p>
      <h1 className="an-headline">{A.headline(stopped, fmt(s.protected_amount))}</h1>
      <p className="an-sub">{A.checked(s.checked, s.paused)}</p>

      <h2 className="an-h">{A.waiting}</h2>
      {waiting.length ? (
        <ul className="an-list">{waiting.map((x) => <TxItem key={x.id} x={x} t={t} A={A} onOpen={onOpen} />)}</ul>
      ) : <p className="an-empty">{A.waitingEmpty}</p>}

      <h2 className="an-h">{A.model}</h2>
      <dl className="an-model">
        <div><dt>{A.auc}</dt><dd>{m.roc_auc.toFixed(3)}</dd></div>
        <div><dt>{A.recall}</dt><dd>{pct(m.recall_at_pause)}%</dd></div>
        <div><dt>{A.falsePause}</dt><dd>{(m.false_pause_share * 100).toFixed(2)}%</dd></div>
      </dl>
      <p className="an-note">{A.modelNote}</p>

      {dash.adoption && (
        <>
          <h2 className="an-h">{A.saqshy}</h2>
          <dl className="an-model four">
            <div><dt>{A.awaiting}</dt><dd>{s.awaiting ?? 0}</dd></div>
            <div><dt>{A.falsePos}</dt><dd>{pct(s.false_positive_share || 0)}%</dd></div>
            <div><dt>{A.adoptTrusted}</dt><dd>{pct(dash.adoption.trusted)}%</dd></div>
            <div><dt>{A.adoptLocked}</dt><dd>{pct(dash.adoption.locked)}%</dd></div>
          </dl>
          <p className="an-note">{A.ofClients(dash.adoption.clients)} · {A.adoptPasskey}: {pct(dash.adoption.passkey)}%</p>
        </>
      )}
    </div>
  );
}

function Queue({ dash, t, A, filter, setFilter, onOpen }) {
  const list = dash.transactions.filter((x) =>
    filter === "all" ? true : filter === "paused" ? x.paused : ["cancelled", "delayed"].includes(x.status));
  return (
    <div className="an-screen">
      <h1 className="an-title">{A.tabs.queue}</h1>
      <div className="an-seg" role="tablist">
        {Object.keys(A.filters).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{A.filters[f]}</button>
        ))}
      </div>
      {list.length ? <ul className="an-list">{list.map((x) => <TxItem key={x.id} x={x} t={t} A={A} onOpen={onOpen} />)}</ul>
        : <p className="an-empty">{A.queueEmpty}</p>}
    </div>
  );
}

const DECIDABLE = ["awaiting_analyst", "awaiting_trusted", "in_dialog", "delayed", "verifying"];

function ReportSheet({ report, A, onClose }) {
  const url = React.useMemo(() => URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })), [report]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="an-report" role="dialog" aria-label={A.reportTitle}>
      <header><b>{A.reportTitle}</b><button onClick={onClose} aria-label={A.close}><Icon name="close" size={18} stroke={2.2} /></button></header>
      <small>{A.reportNote}</small>
      <pre>{JSON.stringify(report, null, 2)}</pre>
      <a className="btn primary-blue" href={url} download={`${report.report_id}.json`}>{A.download}</a>
    </div>
  );
}

function Detail({ tx, lang, t, A, onBack, onDecide, onDrop, dropList, notice, onReport }) {
  const [report, setReport] = useState(null);
  const up = tx.factors.filter((f) => f.contribution > 0);
  const down = tx.factors.filter((f) => f.contribution < 0);
  const max = Math.max(...tx.factors.map((f) => Math.abs(f.contribution)), 0.01);
  const Bars = ({ list, dir }) => (
    <ul className="an-factors">
      {list.map((f) => (
        <li key={f.key}>
          <span>{f[lang]}</span>
          <i className={dir}><b style={{ width: `${(Math.abs(f.contribution) / max) * 100}%` }} /></i>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="an-screen">
      <header className="an-nav">
        <button onClick={onBack} aria-label={A.back}><Icon name="back" size={22} stroke={2.2} /><span>{A.back}</span></button>
      </header>
      <div className="an-hero">
        <span className={"an-big " + tx.level}>{pct(tx.risk)}</span>
        <div>
          <b>{tx.client}, {tx.age}</b>
          <span>{fmt(tx.amount)} ₸ · {tx.recipient}</span>
          <span className={"an-st " + tone[tx.status]}>{t.st[tx.status]}</span>
        </div>
      </div>
      {tx.scam_call && <p className="an-flag">{A.afterCall}</p>}
      {tx.guardian && <p className="an-flag soft">{A.guardian(tx.guardian.name)}</p>}
      {tx.signals?.length > 0 && (
        <>
          <h2 className="an-h">{A.signalsTitle}</h2>
          <ul className="an-signals">{tx.signals.map((x) => <li key={x.key}><span>{x[lang]}</span><b>+{x.points}</b></li>)}</ul>
        </>
      )}
      {DECIDABLE.includes(tx.status) && tx.live && (
        <div className="an-actions">
          {["approve", "reject", "to_trusted"].map((a) => <button key={a} className={"an-act " + a} onClick={() => onDecide(tx.id, a)}>{A.decide[a]}</button>)}
        </div>
      )}
      {notice && <p className="an-note" role="status">{notice}</p>}
      {tx.reported ? <p className="an-flag soft">{A.reported(tx.reported)}</p>
        : <button className="an-report-btn" onClick={async () => setReport(await onReport(tx.id))}>{A.report}</button>}
      {report && <ReportSheet report={report} A={A} onClose={() => setReport(null)} />}
      {dropList.includes(tx.recipient)
        ? <p className="an-flag">{A.onDrop}: {tx.recipient}</p>
        : <button className="an-drop" onClick={() => onDrop(tx.recipient)}>{A.addDrop}: {tx.recipient}</button>}
      {(up.length > 0 || down.length > 0) && tx.signals?.length > 0 && <h2 className="an-h">{A.modelTitle}</h2>}
      {up.length > 0 && <><h2 className="an-h">{A.why}</h2><Bars list={up} dir="up" /></>}
      {down.length > 0 && <><h2 className="an-h">{A.lowers}</h2><Bars list={down} dir="down" /></>}
      <h2 className="an-h">{A.dialog}</h2>
      {tx.transcript.length ? (
        <div className="an-chat">
          {tx.transcript.map((mm, i) => <p key={i} className={mm.from === "client" ? "me" : "bot"}>{mm.text}</p>)}
        </div>
      ) : <p className="an-empty">{A.noDialog}</p>}
      <p className="an-note">{tx.id} · {hhmm(tx.time)}</p>
    </div>
  );
}

function NetMap({ graph, showAll, onPick }) {
  const el = useRef(null);
  useEffect(() => {
    if (!graph || !el.current) return;
    const keep = new Set(graph.nodes.filter((n) => showAll || n.role !== "normal").map((n) => n.id));
    const nodes = new DataSet(graph.nodes.filter((n) => keep.has(n.id)).map((n) => ({
      id: n.id, label: n.role === "normal" ? "" : n.id.slice(-4),
      color: { background: ROLE_COLOR[n.role], border: "#0F1B3D", highlight: { background: ROLE_COLOR[n.role], border: "#FFFFFF" } },
      size: n.role === "normal" ? 5 : n.role === "victim" ? 9 : 10 + n.score * 12,
      shadow: n.role === "drop" || n.role === "cashout" ? { enabled: true, color: "rgba(255,90,78,.55)", size: 14, x: 0, y: 0 } : false,
      font: { color: "#C9D3EE", size: 10, face: "Golos Text" },
    })));
    const edges = new DataSet(graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to) && (showAll || e.suspicious)).map((e, i) => ({
      id: i, from: e.from, to: e.to, arrows: { to: { enabled: true, scaleFactor: 0.4 } },
      width: e.suspicious ? 1 + Math.min(e.amount / 700000, 3) : 0.5,
      color: { color: e.suspicious ? "rgba(255,110,90,.55)" : "rgba(140,155,195,.22)" },
    })));
    const net = new Network(el.current, { nodes, edges }, {
      nodes: { shape: "dot", borderWidth: 1.5 },
      physics: { solver: "forceAtlas2Based", forceAtlas2Based: { gravitationalConstant: -30, springLength: 55 }, stabilization: { iterations: 160 } },
      interaction: { hover: false, zoomView: true, dragView: true },
    });
    net.on("click", (p) => onPick(p.nodes[0] ? graph.nodes.find((n) => n.id === p.nodes[0]) : null));
    return () => net.destroy();
  }, [graph, showAll]);
  return <div className="an-map" ref={el} />;
}

function Network_({ graph, t, A, onDrop, dropList }) {
  const [showAll, setShowAll] = useState(false);
  const [node, setNode] = useState(null);
  if (!graph) return null;
  return (
    <div className="an-screen an-net">
      <div className="an-net-head">
        <h1 className="an-title">{A.netTitle}</h1>
        <div className="an-seg small">
          <button className={!showAll ? "on" : ""} onClick={() => setShowAll(false)}>{A.netOnly}</button>
          <button className={showAll ? "on" : ""} onClick={() => setShowAll(true)}>{A.netAll}</button>
        </div>
      </div>
      <NetMap graph={graph} showAll={showAll} onPick={setNode} />
      <div className="an-legend">{Object.keys(ROLE_COLOR).map((r) => <span key={r}><i style={{ background: ROLE_COLOR[r] }} />{t.role[r]}</span>)}</div>
      <ul className="an-nets">
        {graph.networks.map((n) => (
          <li key={n.id}>
            <b>{t.net} {n.id}</b>
            <span>{fmt(n.volume)} ₸</span>
            <small>{n.size} {t.accounts} · {n.victims} {t.victims} · ~{Math.round(n.avg_hold_min)} {t.min}</small>
          </li>
        ))}
      </ul>
      {!node && <p className="an-note pad">{A.netHint}</p>}
      {node && (
        <div className="an-sheet" role="dialog" aria-label={node.id}>
          <header><b>{node.id}</b><span className={"an-role-chip " + node.role}>{t.role[node.role]}</span>
            <button onClick={() => setNode(null)} aria-label={A.nodeClose}><Icon name="close" size={18} stroke={2.2} /></button></header>
          <dl>
            <div><dt>{t.score}</dt><dd>{node.score.toFixed(2)}</dd></div>
            <div><dt>{t.passthrough}</dt><dd>{pct(node.passthrough)}%</dd></div>
            <div><dt>{t.hold}</dt><dd>{node.hold_min == null ? "—" : `${Math.round(node.hold_min)} ${t.min}`}</dd></div>
            <div><dt>{t.ageDays}</dt><dd>{node.age_days}</dd></div>
            <div><dt>{t.fanIn}</dt><dd>{node.fan_in}</dd></div>
          </dl>
          {dropList.includes(node.id)
            ? <p className="an-sheet-note">{A.onDrop}</p>
            : <button className="btn danger an-sheet-btn" onClick={() => onDrop(node.id)}>{A.addDrop}</button>}
        </div>
      )}
    </div>
  );
}

function Audit({ audit, A }) {
  return (
    <div className="an-screen">
      <h1 className="an-title">{A.tabs.audit}</h1>
      {audit.length ? (
        <ul className="an-audit">
          {audit.map((e, i) => (
            <li key={i}><small>{e.time.slice(11, 16)} · {A.role[e.role] || e.role}</small>
              <b>{e.actor}: {A.act[e.action] || e.action}</b><span>{e.target}{e.reason ? ` · ${e.reason}` : ""}</span></li>
          ))}
        </ul>
      ) : <p className="an-empty">{A.auditEmpty}</p>}
    </div>
  );
}

/** The analyst's phone: overview, the live queue with each decision explained, and the drop-network map. */
export default function AnalystApp({ tab, dash, graph, lang, t, A, audit = [], onDecide, onDrop, notice, onReport }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => setOpen(null), [tab]);
  const tx = useMemo(() => dash?.transactions.find((x) => x.id === open), [dash, open]);
  if (!dash) return null;
  const dropList = (dash?.drop_list || []).map((d) => d.account);
  if (tx) return <Detail tx={tx} lang={lang} t={t} A={A} onBack={() => setOpen(null)} onDecide={onDecide} onDrop={onDrop} dropList={dropList} notice={notice} onReport={onReport} />;
  if (tab === "audit") return <Audit audit={audit} A={A} />;
  if (tab === "queue") return <Queue dash={dash} t={t} A={A} filter={filter} setFilter={setFilter} onOpen={setOpen} />;
  if (tab === "network") return <Network_ graph={graph} t={t} A={A} onDrop={onDrop} dropList={dropList} />;
  return <Overview dash={dash} t={t} A={A} onOpen={setOpen} />;
}
