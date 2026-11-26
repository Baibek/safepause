import React, { useEffect, useState } from "react";

const PATHS = {
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></>,
  send: <><path d="M4 12h13" /><path d="m12 6 6 6-6 6" /></>,
  phone: <path d="M7 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 5 5.5a2 2 0 0 1 2-2Z" />,
  message: <><path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z" /><path d="M8.5 10h7" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  alert: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17v.5" /></>,
  guardian: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M16 5.5 20 7v3c0 2.4-1.6 4.2-4 5" /></>,
  back: <path d="M15 5 8 12l7 7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  pause: <><path d="M9 6v12M15 6v12" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10h18" /></>,
  bank: <><path d="M4 9.5 12 4l8 5.5" /><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3.5 20h17" /></>,
  // everyday banking categories
  cart: <><path d="M3.5 4.5h2l2.2 10.2h10.1l1.9-7.2H6.6" /><circle cx="9.5" cy="18.8" r="1.4" /><circle cx="16.5" cy="18.8" r="1.4" /></>,
  coffee: <><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8.5 3.5v2.5M11.5 3.5v2.5" /></>,
  pill: <><rect x="3.8" y="8.6" width="16.4" height="6.8" rx="3.4" transform="rotate(-45 12 12)" /><path d="m9.6 9.6 4.8 4.8" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></>,
  car: <><path d="M5 16.5V12l2-5h10l2 5v4.5" /><path d="M4 12h16v4.5H4z" /><circle cx="8" cy="18" r="1.3" /><circle cx="16" cy="18" r="1.3" /></>,
  bolt: <path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" />,
  mobile: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>,
  wifi: <><path d="M3.5 9.5a12 12 0 0 1 17 0" /><path d="M6.5 12.8a7.6 7.6 0 0 1 11 0" /><path d="M9.5 16a3.2 3.2 0 0 1 5 0" /><circle cx="12" cy="19" r=".6" /></>,
  ticket: <><path d="M4 7.5h16v3a1.8 1.8 0 0 0 0 3.5v3H4v-3a1.8 1.8 0 0 0 0-3.5z" /><path d="M14 7.5v10" strokeDasharray="1.6 2" /></>,
  book: <><path d="M4.5 5.5c2.5-1 5-1 7.5.5 2.5-1.5 5-1.5 7.5-.5v13c-2.5-1-5-1-7.5.5-2.5-1.5-5-1.5-7.5-.5z" /><path d="M12 6v13" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10.5 5 5 5-5" /><path d="M5 20h14" /></>,
  briefcase: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V5.8A1.3 1.3 0 0 1 10.3 4.5h3.4A1.3 1.3 0 0 1 15 5.8v1.7" /><path d="M3.5 12.5h17" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11" /><path d="M12 9C10.5 5 7 5 7 7.2 7 9 12 9 12 9zM12 9c1.5-4 5-4 5-1.8C17 9 12 9 12 9z" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM18 18h2M20 14v2M14 19.5h2" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="7.5" width="16.5" height="12" rx="2.5" /><path d="M16 13.5h1.5" /></>,
  chart: <><path d="M4.5 19.5h15" /><path d="M7 16v-4M11 16V8M15 16v-6M19 16V6" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
};

export function Icon({ name, size = 22, stroke = 1.8 }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

function clockNow() {
  // Almaty time, like the phone of a client in Kazakhstan
  const d = new Date(Date.now() + 5 * 3600_000);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function StatusIcons() {
  return (
    <span className="sb-icons" aria-hidden="true">
      <svg width="18" height="11" viewBox="0 0 18 11"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="6" rx="1" /><rect x="10" y="2.5" width="3" height="8.5" rx="1" /><rect x="15" y="0" width="3" height="11" rx="1" /></svg>
      <svg width="16" height="11" viewBox="0 0 16 11"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4a6.7 6.7 0 0 0-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.6c.4 0 .8.2 1.1.4L8 11 6.9 9.8c.3-.2.7-.4 1.1-.4Z" /></svg>
      <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="17" height="9" rx="2.5" /><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" opacity=".5" /></svg>
    </span>
  );
}

/**
 * An iPhone-proportioned device: Dynamic Island, status bar, the app viewport, an optional tab bar and the home
 * indicator. `call` turns the island into the green in-call pill, because these frauds happen during a phone call.
 */
export default function PhoneFrame({ tone = "dark", call = null, tabBar = null, children }) {
  const [time, setTime] = useState(clockNow());
  const [secs, setSecs] = useState(0);
  useEffect(() => { const i = setInterval(() => setTime(clockNow()), 10_000); return () => clearInterval(i); }, []);
  useEffect(() => {
    setSecs(0);
    if (!call) return;
    const i = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [call?.key]);
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="iphone">
      <span className="hw hw-action" /><span className="hw hw-vol1" /><span className="hw hw-vol2" /><span className="hw hw-power" />
      <div className={"iphone-screen tone-" + tone}>
        <div className="status-bar">
          <span className="sb-time">{time}</span>
          <StatusIcons />
        </div>
        <div className={"island" + (call ? " in-call" : "")} role={call ? "status" : undefined}>
          {call && <><span className="island-call"><Icon name="phone" size={14} stroke={2.2} /></span><span className="island-label">{call.label}</span><span className="island-time">{mm}</span></>}
        </div>
        <div className="app-viewport">{children}</div>
        {tabBar}
        <div className="home-indicator" />
      </div>
    </div>
  );
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <nav className="tab-bar" aria-label="Senim">
      {tabs.map((tb) => (
        <button key={tb.id} className={active === tb.id ? "on" : ""} aria-current={active === tb.id ? "page" : undefined} onClick={() => onChange(tb.id)}>
          <Icon name={tb.icon} size={24} stroke={active === tb.id ? 2.1 : 1.7} />
          <span>{tb.label}</span>
        </button>
      ))}
    </nav>
  );
}
