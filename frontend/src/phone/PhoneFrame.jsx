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
