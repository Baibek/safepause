import React, { useEffect, useRef, useState } from "react";
import rulesJson from "../../../shared/call_rules.json";
import evalCalls from "../../../android/detector/src/test/resources/eval/calls.json";
import { ScamDetector, loadRules } from "./detector.js";
import { startListening, speak } from "./speech.js";
import { askClaude, merge } from "./analyst.js";

const RULES = loadRules(rulesJson);
const byId = Object.fromEntries(evalCalls.map((c) => [c.id, c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const SCENARIOS = [
  { id: "bank", call: "s01-safe-account-ru", lang: "ru", kind: "phone", caller: "+7 727 ••• •• 14" },
  { id: "loan", call: "s06-loan-kk", lang: "kk", kind: "phone", caller: "+7 700 ••• •• 52" },
  { id: "relative", call: "s12-relative-ru", lang: "ru", kind: "phone", caller: "+7 777 ••• •• 08" },
  { id: "video", call: "s02-safe-account-kk", lang: "kk", kind: "whatsapp", caller: "WhatsApp · +7 705 ••• •• 31" },
  { id: "normal", call: "n01-bank-reminder-ru", lang: "ru", kind: "phone", caller: "Банк ЦентрКредит" },
  { id: "live", call: null, lang: null, kind: "phone", caller: "Нақты қоңырау / Реальный звонок" },
];

const T = {
  kk: {
    pick: "Қоңырау сценарийі", pickHint: "Алаяқ қоңырауын таңдаңыз — телефон оны дауыстап оқиды. Немесе микрофонмен тірі тексеріңіз.",
    sc: { bank: "«Банк қауіпсіздік қызметі» (орысша)", loan: "«Атыңызға несие» (қазақша)", relative: "«Мама, бұл мен» (орысша)",
      video: "WhatsApp видео: «қауіпсіз шот» (қазақша)", normal: "Шынайы банк ескертуі (қалыпты)", live: "Микрофон: нақты сөйлеу" },
    liveLang: "Сөйлеу тілі", incoming: "Кіріс қоңырау", accept: "Қабылдау", decline: "Қабылдамау",
    bubble: "SafePause: тыңдайын ба?", listening: "SafePause тыңдап тұр", partialHint: "Сөйлеңіз…",
    lv: { LOW: "Қауіп белгісі жоқ", SUSPICIOUS: "Күдікті", HIGH: "АЛАЯҚТЫҚ БЕЛГІЛЕРІ" },
    warnTitle: "Бұл алаяқ болуы әбден мүмкін",
    advice: "Тұтқаны қойыңыз. Ешқандай кодты айтпаңыз, ақша аудармаңыз. Банкке картаның артындағы нөмірмен өзіңіз қоңырау шалыңыз.",
    ok: "Түсіндім", end: "Аяқтау", summary: "Қоңырау қорытындысы", why: "Неге", transcript: "Әңгіме мәтіні", back: "Басқа сценарий",
    micError: "Микрофон қолжетімсіз. Chrome-да ашып, микрофонға рұқсат беріңіз (немесе демо сценарийді таңдаңыз).",
    claude: "Claude пікірі", manual: "Бетті қолмен тексеру", next: "Келесі", yes: "Иә", no: "Жоқ",
    steps: ["Одан басын СОЛҒА толық бұруды сұраңыз", "Енді ОҢҒА бұруды сұраңыз", "Қолын бетінің алдынан баяу өткізуді сұраңыз", "Камераға жақындауды сұраңыз"],
    qs: ["Ол мұны істеуден бас тартты ма?", "Басын бұрғанда беті бұлыңғырланды не шеті жыпылықтады ма?", "Қолы өткенде беті қолдың «үстінде» көрінді ме?", "Ерні сөзіне сай қозғалмай ма?"],
    vr: { LOOKS_NORMAL: "Жасанды бет белгілері табылмады", SUSPICIOUS: "Күдікті: жасанды бет белгілері бар", DID_NOT_COOPERATE: "Тексеруден бас тартты — сақ болыңыз" },
    noSpeech: "Тыңдауды бастау үшін жоғарыдағы батырманы басыңыз — келісімсіз тыңдамаймыз.",
  },
  ru: {
    pick: "Сценарий звонка", pickHint: "Выберите звонок мошенника — телефон прочитает его вслух. Или проверьте вживую через микрофон.",
    sc: { bank: "«Служба безопасности банка» (рус.)", loan: "«Кредит на ваше имя» (каз.)", relative: "«Мама, это я» (рус.)",
      video: "Видео WhatsApp: «безопасный счёт» (каз.)", normal: "Настоящее напоминание банка (обычный)", live: "Микрофон: живая речь" },
    liveLang: "Язык речи", incoming: "Входящий звонок", accept: "Принять", decline: "Отклонить",
    bubble: "SafePause: слушать?", listening: "SafePause слушает", partialHint: "Говорите…",
    lv: { LOW: "Признаков опасности нет", SUSPICIOUS: "Подозрительно", HIGH: "ПРИЗНАКИ МОШЕННИЧЕСТВА" },
    warnTitle: "Очень похоже на мошенника",
    advice: "Положите трубку. Не называйте никаких кодов и не переводите деньги. Сами позвоните в банк по номеру на обороте карты.",
    ok: "Понятно", end: "Завершить", summary: "Итог звонка", why: "Почему", transcript: "Текст разговора", back: "Другой сценарий",
    micError: "Микрофон недоступен. Откройте в Chrome и разрешите микрофон (или выберите демо-сценарий).",
    claude: "Мнение Claude", manual: "Проверить лицо вручную", next: "Далее", yes: "Да", no: "Нет",
    steps: ["Попросите его полностью повернуть голову ВЛЕВО", "Теперь ВПРАВО", "Попросите медленно провести рукой перед лицом", "Попросите подойти ближе к камере"],
    qs: ["Он отказался это делать?", "При повороте лицо размывалось или мерцал край?", "Когда рука проходила, лицо было видно «поверх» руки?", "Губы не совпадают с речью?"],
    vr: { LOOKS_NORMAL: "Признаков подменённого лица не найдено", SUSPICIOUS: "Подозрительно: есть признаки подмены лица", DID_NOT_COOPERATE: "Отказался от проверки — будьте осторожны" },
    noSpeech: "Чтобы начать, нажмите кнопку сверху — без согласия мы не слушаем.",
  },
};

function judgeManual(a) {
  const suspicious = a[1] || a[2] || a[3];
  return suspicious ? "SUSPICIOUS" : a[0] ? "DID_NOT_COOPERATE" : "LOOKS_NORMAL";
}

/** The call part of the phone emulator. Reports its state to the side panel through onState. */
export default function CallGuard({ lang, onState }) {
  const t = T[lang];
  const [screen, setScreen] = useState("pick");      // pick | ringing | call | summary
  const [sc, setSc] = useState(null);
  const [liveLang, setLiveLang] = useState("ru");
  const [listening, setListening] = useState(false);
  const [lines, setLines] = useState([]);
  const [partial, setPartial] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [llm, setLlm] = useState(null);
  const [warn, setWarn] = useState(false);
  const [warnedAt, setWarnedAt] = useState(0);
  const [error, setError] = useState("");
  const [secs, setSecs] = useState(0);
  const [manual, setManual] = useState(null);         // {i, answers} while the face check runs
  const [videoResult, setVideoResult] = useState(null);
  const det = useRef(null), mic = useRef(null), run = useRef(0), stagesAsked = useRef(0);

  const level = assessment ? merge(assessment.level, llm?.level) : "LOW";
  useEffect(() => { onState?.({ screen, assessment, llm, level, lines, scenario: sc }); }, [screen, assessment, llm, level, lines, sc]);
  useEffect(() => {
    if (screen !== "call") return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [screen]);
  useEffect(() => {
    if (level === "HIGH" && assessment && assessment.hits.length > warnedAt && !warn) {
      setWarn(true); navigator.vibrate?.([0, 400, 200, 400]);
    }
  }, [level, assessment]);
  useEffect(() => () => stopAll(), []);

  const feed = (text, source) => {
    if (!text) return;
    const a = det.current.add({ text, atMs: Date.now(), source });
    setLines((l) => {
      const next = [...l, text];
      if (a.stages.size > stagesAsked.current) {           // a new stage: ask Claude once more
        stagesAsked.current = a.stages.size;
        askClaude(next.slice(-30), lang).then((v) => v && setLlm(v));
      }
      return next;
    });
    setAssessment({ ...a, stages: new Set(a.stages) });
  };

  const stopAll = () => { run.current++; mic.current?.stop(); mic.current = null; window.speechSynthesis?.cancel(); };

  const choose = (s) => { setSc(s); setScreen("ringing"); setError(""); };
  const accept = () => {
    det.current = new ScamDetector(RULES); stagesAsked.current = 0;
    setLines([]); setAssessment(null); setLlm(null); setWarn(false); setWarnedAt(0); setPartial(""); setSecs(0);
    setManual(null); setVideoResult(null); setListening(false); setScreen("call");
  };

  const listen = async () => {
    setListening(true);
    if (sc.call) {                                             // scripted call read aloud
      const my = ++run.current;
      const phrases = byId[sc.call].phrases;
      for (const p of phrases) {
        if (run.current !== my) return;
        setPartial(cap(p));
        await speak(cap(p), sc.lang);
        if (run.current !== my) return;
        setPartial("");
        feed(p, sc.lang);
        await new Promise((r) => setTimeout(r, 500));
      }
    } else {                                                   // live microphone
      const handle = await startListening(liveLang, {
        onPartial: setPartial,
        onFinal: (text) => { setPartial(""); feed(text, liveLang); },
        onError: () => { setError(t.micError); setListening(false); },
      });
      if (!handle) { setError(t.micError); setListening(false); return; }
      mic.current = handle;
    }
  };

  const hangUp = () => { stopAll(); setListening(false); setScreen("summary"); };
  const reset = () => { stopAll(); setScreen("pick"); setSc(null); setListening(false); };
  const flagged = new Set(assessment?.hits.map((h) => h.phrase.text) || []);
  const reasons = assessment?.hits.map((h) => h.rule[lang]) || [];
  const mm = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  if (screen === "pick") return (
    <div className="screen">
      <h4 className="first">{t.pick}</h4>
      <p className="hint">{t.pickHint}</p>
      <div className="recips">
        {SCENARIOS.map((s) => (
          <button key={s.id} onClick={() => choose(s)}>
            <b>{t.sc[s.id]}</b><small>{s.id === "normal" ? "✓" : s.id === "live" ? "🎙" : "⚠"} {s.caller}</small>
          </button>
        ))}
      </div>
      <label className="lbl" htmlFor="live-lang">{t.liveLang}</label>
      <div className="seg">
        {["kk", "ru"].map((l) => <button key={l} id={l === "kk" ? "live-lang" : undefined} className={liveLang === l ? "on" : ""} onClick={() => setLiveLang(l)}>{l === "kk" ? "Қазақша" : "Русский"}</button>)}
      </div>
    </div>
  );

  if (screen === "ringing") return (
    <div className="screen dialer center">
      <small>{t.incoming}</small>
      <div className="avatar">{sc.kind === "whatsapp" ? "WA" : "☎"}</div>
      <h4>{sc.caller}</h4>
      <div className="dial-buttons">
        <button className="round red" onClick={reset} aria-label={t.decline}>✕</button>
        <button className="round green ring" onClick={accept} aria-label={t.accept}>✆</button>
      </div>
    </div>
  );

  if (screen === "summary") return (
    <div className="screen">
      <h4 className="first">{t.summary}</h4>
      <span className={"risk " + level.toLowerCase()}>{t.lv[level]}</span>
      {reasons.length > 0 && <><span className="lbl">{t.why}</span><ul className="why">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {llm && <p className="hint">{t.claude}: {llm.reasons.join("; ")}</p>}
      <span className="lbl">{t.transcript}</span>
      <div className="chat small">{lines.length ? lines.map((l, i) => <div key={i} className={"msg bot" + (flagged.has(l) ? " hot" : "")}>{cap(l)}</div>) : <p className="hint">—</p>}</div>
      <button className="primary" onClick={reset}>{t.back}</button>
    </div>
  );

  // in-call screen
  const steps = t.steps.length;
  return (
    <div className={"screen dialer" + (warn ? " shake" : "")}>
      <div className="call-head">
        <b>{sc.caller}</b><small>{mm}</small>
      </div>
      {sc.kind === "whatsapp" && <div className="video-tile"><span>📹</span></div>}

      {!listening && <button className="bubble" onClick={listen}>{t.bubble}</button>}
      {listening && !warn && !manual && (
        <div className={"strip " + level.toLowerCase()}>
          <b>{t.listening} · {t.lv[level]}</b>
          {lines.slice(-3).map((l, i) => <span key={i}>{cap(l)}</span>)}
          <em>{partial || (sc.call ? "" : t.partialHint)}</em>
        </div>
      )}
      {!listening && <p className="hint light">{t.noSpeech}</p>}
      {error && <p className="error">{error}</p>}

      {warn && (
        <div className="warn-card" role="alert">
          <b>{t.warnTitle}</b>
          <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {llm && llm.reasons.length > 0 && <ul className="llm">{llm.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <strong>{t.advice}</strong>
          <button onClick={() => { setWarn(false); setWarnedAt(assessment.hits.length); }}>{t.ok}</button>
        </div>
      )}

      {manual && (
        <div className="manual-card">
          {manual.i < steps
            ? <><b>{t.steps[manual.i]}</b><button onClick={() => setManual({ ...manual, i: manual.i + 1 })}>{t.next}</button></>
            : <><b>{t.qs[manual.i - steps]}</b>
                <div className="yn">{[true, false].map((v) => (
                  <button key={String(v)} onClick={() => {
                    const answers = [...manual.answers, v];
                    if (answers.length < t.qs.length) setManual({ i: manual.i + 1, answers });
                    else { setManual(null); setVideoResult(judgeManual(answers)); }
                  }}>{v ? t.yes : t.no}</button>))}</div></>}
        </div>
      )}
      {videoResult && <div className={"strip " + (videoResult === "LOOKS_NORMAL" ? "low" : "high")}><b>{t.vr[videoResult]}</b><button className="link" onClick={() => setVideoResult(null)}>{t.ok}</button></div>}

      <div className="dial-buttons bottom">
        {sc.kind === "whatsapp" && !manual && <button className="pill-btn" onClick={() => { setVideoResult(null); setManual({ i: 0, answers: [] }); }}>{t.manual}</button>}
        <button className="round red" onClick={hangUp} aria-label={t.end}>✆</button>
      </div>
    </div>
  );
}

export const CALL_T = T;
