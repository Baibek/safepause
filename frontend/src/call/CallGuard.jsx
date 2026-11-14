import React, { useEffect, useRef, useState } from "react";
import rulesJson from "../../../shared/call_rules.json";
import scamCalls from "../../../shared/demo_calls_scam.json";
import legitCalls from "../../../shared/demo_calls_legit.json";
import replies from "../../../shared/demo_replies.json";
import { ScamDetector, loadRules } from "./detector.js";
import { startListening, speak, stopSpeaking, preparePiper, piperAudio } from "./speech.js";
import { askClaude, merge } from "./analyst.js";

const RULES = loadRules(rulesJson);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** The call as a dialog: the caller's lines with the client's replies in between. */
const turnsOf = (c) => c.lines.flatMap((text, i) => [
  { who: "caller", text },
  ...(replies[c.id]?.[i] ? [{ who: "client", text: replies[c.id][i] }] : []),
]);
const asScenario = (label) => (c) => ({ ...c, label, kind: "phone", turns: turnsOf(c) });
const SCAM = [
  { ...scamCalls[1], id: "x02-video", label: "scam", kind: "whatsapp", caller: "WhatsApp · " + scamCalls[1].caller, title: "WhatsApp видео: " + scamCalls[1].title, turns: turnsOf(scamCalls[1]) },
  ...scamCalls.map(asScenario("scam")),
];
const LEGIT = legitCalls.map(asScenario("legit"));
const LIVE = { id: "live", label: null, kind: "phone", caller: "Нақты қоңырау / Реальный звонок", turns: null };

const T = {
  kk: {
    pick: "Қоңырау сценарийі", pickHint: "Алаяқ қоңырауын таңдаңыз — телефон оны дауыстап оқиды. Немесе микрофонмен тірі тексеріңіз.",
    groups: { scam: "Алаяқтар", legit: "Шын қызметкерлер" }, random: "Кездейсоқ қоңырау", live: "Микрофон: нақты сөйлеу",
    truth: { scam: "Шындығында: алаяқ", legit: "Шындығында: шын қызметкер" }, verdictOk: "SafePause дұрыс тапты", verdictBad: "SafePause қателесті",
    liveLang: "Сөйлеу тілі", incoming: "Кіріс қоңырау", accept: "Қабылдау", decline: "Қабылдамау",
    bubble: "SafePause: тыңдайын ба?", listening: "SafePause тыңдап тұр", partialHint: "Сөйлеңіз…",
    lv: { LOW: "Қауіп белгісі жоқ", SUSPICIOUS: "Күдікті", HIGH: "АЛАЯҚТЫҚ БЕЛГІЛЕРІ" },
    warnTitle: "Бұл алаяқ болуы әбден мүмкін",
    advice: "Тұтқаны қойыңыз. Ешқандай кодты айтпаңыз, ақша аудармаңыз. Банкке картаның артындағы нөмірмен өзіңіз қоңырау шалыңыз.",
    who: { caller: "Қоңырау шалушы", client: "Клиент" },
    voiceLoading: "Нейрон дауыстар жүктелуде (бір рет)",
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
    groups: { scam: "Мошенники", legit: "Настоящие сотрудники" }, random: "Случайный звонок", live: "Микрофон: живая речь",
    truth: { scam: "На самом деле: мошенник", legit: "На самом деле: настоящий сотрудник" }, verdictOk: "SafePause не ошибся", verdictBad: "SafePause ошибся",
    liveLang: "Язык речи", incoming: "Входящий звонок", accept: "Принять", decline: "Отклонить",
    bubble: "SafePause: слушать?", listening: "SafePause слушает", partialHint: "Говорите…",
    lv: { LOW: "Признаков опасности нет", SUSPICIOUS: "Подозрительно", HIGH: "ПРИЗНАКИ МОШЕННИЧЕСТВА" },
    warnTitle: "Очень похоже на мошенника",
    advice: "Положите трубку. Не называйте никаких кодов и не переводите деньги. Сами позвоните в банк по номеру на обороте карты.",
    who: { caller: "Звонящий", client: "Клиент" },
    voiceLoading: "Загружаются нейронные голоса (один раз)",
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
  const [group, setGroup] = useState("scam");
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
  const linesText = lines.map((l) => l.text);
  useEffect(() => { onState?.({ screen, assessment, llm, level, lines: linesText, scenario: sc }); }, [screen, assessment, llm, level, lines, sc]);
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

  const feed = (text, source, who = "caller") => {
    if (!text) return;
    // the microphone hears both people, so the detector reads the whole conversation
    const a = det.current.add({ text, atMs: Date.now(), source });
    setLines((l) => {
      const next = [...l, { who, text }];
      if (a.stages.size > stagesAsked.current) {           // a new stage: ask Claude once more
        stagesAsked.current = a.stages.size;
        askClaude(next.slice(-30).map((x) => x.text), lang).then((v) => v && setLlm(v));
      }
      return next;
    });
    setAssessment({ ...a, stages: new Set(a.stages) });
  };

  const stopAll = () => { run.current++; mic.current?.stop(); mic.current = null; stopSpeaking(); };

  const choose = (s) => { setSc(s); setScreen("ringing"); setError(""); };
  const accept = () => {
    det.current = new ScamDetector(RULES); stagesAsked.current = 0;
    setLines([]); setAssessment(null); setLlm(null); setWarn(false); setWarnedAt(0); setPartial(""); setSecs(0);
    setManual(null); setVideoResult(null); setListening(false); setScreen("call");
  };

  const listen = async () => {
    setListening(true);
    if (sc.turns) {                                            // scripted dialog read aloud, two voices
      const my = ++run.current;
      setPartial(t.voiceLoading + "…");
      const neural = await preparePiper(sc.lang, (p) => run.current === my && setPartial(`${t.voiceLoading} ${Math.round(p * 100)}%`));
      setPartial("");
      // synthesise the next line while the current one plays, so the dialog has no gaps
      let next = neural ? piperAudio(sc.turns[0].text, sc.lang, sc.turns[0].who) : null;
      for (const [i, turn] of sc.turns.entries()) {
        if (run.current !== my) return;
        setPartial(turn);
        const blob = next;
        const following = sc.turns[i + 1];
        next = neural && following ? piperAudio(following.text, sc.lang, following.who) : null;
        await speak(turn.text, sc.lang, turn.who, blob);
        if (run.current !== my) return;
        setPartial("");
        feed(turn.text, sc.lang, turn.who);
        await new Promise((r) => setTimeout(r, 500));
      }
    } else {                                                   // live microphone
      const handle = await startListening(liveLang, {
        onPartial: setPartial,
        onFinal: (text) => { setPartial(""); feed(text, liveLang, "caller"); },
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
      <div className="seg">
        {["scam", "legit"].map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{t.groups[g]} · {(g === "scam" ? scamCalls : legitCalls).length}</button>)}
      </div>
      <button className="primary small-btn" onClick={() => { const list = group === "scam" ? SCAM : LEGIT; choose(list[Math.floor(Math.random() * list.length)]); }}>{t.random}</button>
      <div className="recips scroll">
        {(group === "scam" ? SCAM : LEGIT).map((c) => (
          <button key={c.id} onClick={() => choose(c)}>
            <b>{c.title}</b><small>{c.lang === "kk" ? "ҚАЗ" : "РУС"} · {c.caller}</small>
          </button>
        ))}
      </div>
      <button className="live-btn" onClick={() => choose(LIVE)}>🎙 {t.live}</button>
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
      {sc.label && (
        <p className={"truth " + ((sc.label === "scam") === (level === "HIGH") ? "ok" : "bad")}>
          {t.truth[sc.label]} · {(sc.label === "scam") === (level === "HIGH") ? t.verdictOk : t.verdictBad}
        </p>
      )}
      {reasons.length > 0 && <><span className="lbl">{t.why}</span><ul className="why">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {llm && <p className="hint">{t.claude}: {llm.reasons.join("; ")}</p>}
      <span className="lbl">{t.transcript}</span>
      <div className="chat small">{lines.length ? lines.map((l, i) => <div key={i} className={"msg " + (l.who === "client" ? "client" : "bot") + (flagged.has(l.text) ? " hot" : "")}>{cap(l.text)}</div>) : <p className="hint">—</p>}</div>
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
          {lines.slice(-4).map((l, i) => <span key={i} className={"turn " + l.who}><i>{t.who[l.who]}</i>{cap(l.text)}</span>)}
          {partial && typeof partial === "object"
            ? <span className={"turn speaking " + partial.who}><i>{t.who[partial.who]} 🔊</i>{partial.text}</span>
            : <em>{partial || (sc.turns ? "" : t.partialHint)}</em>}
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
