import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../phone/PhoneFrame.jsx";
import rulesJson from "../../../shared/call_rules.json";
import scamCalls from "../../../shared/demo_calls_scam.json";
import legitCalls from "../../../shared/demo_calls_legit.json";
import replies from "../../../shared/demo_replies.json";
import { ScamDetector, loadRules } from "./detector.js";
import { startListening, speak, stopSpeaking, preparePiper, piperAudio, loadCall, playTurn } from "./speech.js";
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
    truth: { scam: "Шындығында: алаяқ", legit: "Шындығында: шын қызметкер" }, verdictOk: "Senim дұрыс тапты", verdictBad: "Senim қателесті",
    liveLang: "Сөйлеу тілі", incoming: "Кіріс қоңырау", accept: "Қабылдау", decline: "Қабылдамау",
    bubble: "Senim: тыңдайын ба?", listening: "Senim тыңдап тұр", partialHint: "Сөйлеңіз…",
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
    title: "Қоңыраулар", liveTitle: "Микрофонмен тексеру",
    liveSub: "Өзіңіз сөйлеңіз немесе нақты қоңырауды динамикке қойып, телефонды жақын ұстаңыз.",
    start: "Бастау", demoCalls: "Демо қоңыраулар", whatsapp: "WhatsApp видео", phoneCall: "Ұялы байланыс",
    consentTitle: "Senim бұл қоңырауды тексерсін бе?",
    consentSub: "Сөйлеу телефонның ішінде мәтінге айналады. Келісімсіз тыңдамаймыз.",
    startListen: "Тыңдауды бастау", stages: ["Таныстыру", "Қорқыту", "Сұрау", "Оқшаулау"],
    micLevel: "Микрофон естіп тұр", hangUp: "Тұтқаны қою", retry: "Қайта көру",
    micErr: {
      denied: ["Микрофонға рұқсат берілмеген", "Адрес жолындағы құлып белгішесін басыңыз → «Микрофон» → «Рұқсат ету». Содан кейін «Қайта көру» басыңыз."],
      nomic: ["Микрофон табылмады", "Микрофон қосулы екенін және оны басқа бағдарлама (Zoom, Teams) пайдаланып тұрмағанын тексеріңіз."],
      network: ["Сөйлеуді тану серверіне қосылу мүмкін болмады", "Chrome сөйлеуді Google серверінде таниды. Интернетті тексеріп, «Қайта көру» басыңыз."],
      unsupported: ["Бұл браузер сөйлеуді танымайды", "Сайтты компьютерде Google Chrome немесе Microsoft Edge арқылы ашыңыз. Safari мен Firefox бұл мүмкіндікті бермейді."],
      lang: ["Қазақ тілі бұл браузерде танылмайды", "Орыс тілінде тыңдап тұрмыз."],
      generic: ["Тыңдау басталмады", "Бетті жаңартып, қайта көріңіз. Немесе демо қоңырауды таңдаңыз."],
      model: ["Тану моделі жүктелмеді", "Орнына браузердің өз тануын қолданып тұрмыз."],
    },
    modelLoading: (p) => `Сөйлеу моделі жүктелуде (бір рет): ${p}%`,
    callLoading: "Қоңырау жазбасы жүктелуде…",
    verdict: { HIGH: "Алаяқтық белгілері табылды", SUSPICIOUS: "Күдікті белгілер бар", LOW: "Қауіп белгісі табылмады" },
    androidNote: "Нақты қоңырауды автоматты түрде тыңдау тек Android қосымшасында жұмыс істейді. Браузер телефон қоңырауына қол жеткізе алмайды.",
    credits: "Сөйлеу браузердің ішінде Vosk арқылы танылады, интернетке жіберілмейді. Демо дауыстар: Piper, қазақ дауыстары ISSAI KazakhTTS (CC-BY-4.0).",
    checks: { mic: "Микрофон дыбыс береді", svc: "Сөйлеуді тану қосылды", txt: "Сөз мәтінге айналды" },
    diag: {
      silent: ["Микрофон дыбыс бермей тұр", "Mac-та: Жүйелік баптаулар → Құпиялылық және қауіпсіздік → Микрофон → Google Chrome-ды қосып, Chrome-ды қайта ашыңыз. Windows-та: Баптаулар → Құпиялылық → Микрофон. Бірнеше микрофон болса, адрес жолындағы белгішеден дұрысын таңдаңыз."],
      nosvc: ["Сөйлеуді тану қосылмады", "Интернетті тексеріп, бетті жаңартыңыз. Сайтты Google Chrome-да ашып көріңіз."],
      notext: ["Дауыс естіліп тұр, бірақ мәтін келмей тұр", "Жақынырақ әрі анығырақ сөйлеңіз. Қазақша танылмаса, тілді «Русский» деп ауыстырып көріңіз. VPN қосулы болса, өшіріп көріңіз."],
    },
  },
  ru: {
    pick: "Сценарий звонка", pickHint: "Выберите звонок мошенника — телефон прочитает его вслух. Или проверьте вживую через микрофон.",
    groups: { scam: "Мошенники", legit: "Настоящие сотрудники" }, random: "Случайный звонок", live: "Микрофон: живая речь",
    truth: { scam: "На самом деле: мошенник", legit: "На самом деле: настоящий сотрудник" }, verdictOk: "Senim не ошибся", verdictBad: "Senim ошибся",
    liveLang: "Язык речи", incoming: "Входящий звонок", accept: "Принять", decline: "Отклонить",
    bubble: "Senim: слушать?", listening: "Senim слушает", partialHint: "Говорите…",
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
    title: "Звонки", liveTitle: "Проверка через микрофон",
    liveSub: "Говорите сами или включите настоящий звонок на громкую связь и держите телефон рядом.",
    start: "Начать", demoCalls: "Демо-звонки", whatsapp: "Видео WhatsApp", phoneCall: "Сотовая связь",
    consentTitle: "Проверить этот звонок с Senim?",
    consentSub: "Речь превращается в текст прямо на телефоне. Без согласия мы не слушаем.",
    startListen: "Начать слушать", stages: ["Представился", "Угроза", "Просьба", "Изоляция"],
    micLevel: "Микрофон слышит", hangUp: "Положить трубку", retry: "Попробовать снова",
    micErr: {
      denied: ["Нет доступа к микрофону", "Нажмите на значок замка в адресной строке → «Микрофон» → «Разрешить». Затем нажмите «Попробовать снова»."],
      nomic: ["Микрофон не найден", "Проверьте, что микрофон подключён и не занят другой программой (Zoom, Teams)."],
      network: ["Нет связи с сервером распознавания", "Chrome распознаёт речь на серверах Google. Проверьте интернет и нажмите «Попробовать снова»."],
      unsupported: ["Этот браузер не распознаёт речь", "Откройте сайт на компьютере в Google Chrome или Microsoft Edge. Safari и Firefox этого не умеют."],
      lang: ["Казахский язык в этом браузере не распознаётся", "Слушаем на русском."],
      generic: ["Не удалось начать", "Обновите страницу и попробуйте снова. Или выберите демо-звонок."],
      model: ["Модель распознавания не загрузилась", "Вместо неё используем распознавание браузера."],
    },
    modelLoading: (p) => `Загружается модель речи (один раз): ${p}%`,
    callLoading: "Загружается запись звонка…",
    verdict: { HIGH: "Найдены признаки мошенничества", SUSPICIOUS: "Есть подозрительные признаки", LOW: "Признаков опасности нет" },
    androidNote: "Автоматически слушать настоящий звонок умеет только приложение для Android. Браузер не имеет доступа к телефонным звонкам.",
    credits: "Речь распознаётся прямо в браузере через Vosk и никуда не отправляется. Голоса демо: Piper, казахские голоса ISSAI KazakhTTS (CC-BY-4.0).",
    checks: { mic: "Микрофон даёт звук", svc: "Распознавание запущено", txt: "Речь превращается в текст" },
    diag: {
      silent: ["Микрофон не даёт звука", "На Mac: Системные настройки → Конфиденциальность и безопасность → Микрофон → включите Google Chrome и перезапустите его. В Windows: Параметры → Конфиденциальность → Микрофон. Если микрофонов несколько, выберите нужный через значок в адресной строке."],
      nosvc: ["Распознавание не запустилось", "Проверьте интернет и обновите страницу. Попробуйте открыть сайт в Google Chrome."],
      notext: ["Голос слышен, но текст не приходит", "Говорите ближе и чётче. Если казахский не распознаётся, переключите язык на «Русский». Если включён VPN, попробуйте его отключить."],
    },
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
  const [error, setError] = useState("");            // a key of t.micErr
  const [notice, setNotice] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [diag, setDiag] = useState(null);             // live mode checks: { at, peak, started, sound, text }
  const [diagHint, setDiagHint] = useState("");
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
  // live mode: after a few seconds, say which step is failing (silent mic, no recogniser, sound but no text)
  useEffect(() => {
    if (!listening || !diag) return;
    const id = setInterval(() => {
      const el = (Date.now() - diag.at) / 1000;
      setDiagHint(diag.text || diag.loading ? "" : el > 5 && diag.peak < 0.05 ? "silent" : el > 5 && !diag.started ? "nosvc" : el > 9 && (diag.sound || diag.peak >= 0.05) ? "notext" : "");
    }, 1000);
    return () => clearInterval(id);
  }, [listening, diag]);

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
      setPartial(t.callLoading);
      const rec = await loadCall(sc.id);                       // recorded with Piper voices, one file per call
      if (run.current !== my) return;
      if (rec && rec.turns.length === sc.turns.length) {
        setPartial("");
        for (const [i, turn] of sc.turns.entries()) {
          if (run.current !== my) return;
          setPartial(turn);
          await playTurn(rec, i);
          if (run.current !== my) return;
          setPartial("");
          feed(turn.text, sc.lang, turn.who);
        }
        return;
      }
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
      setError(""); setNotice(""); setDiagHint("");
      setDiag({ at: Date.now(), peak: 0, started: false, loading: false, sound: false, text: false });
      const handle = await startListening(liveLang, {
        onPartial: setPartial,
        onFinal: (text) => { setPartial(""); feed(text, liveLang, "caller"); },
        onError: (code) => { setError(code); setListening(false); setMicLevel(0); mic.current = null; },
        onLevel: (v) => { setMicLevel(v); if (v >= 0.05) setDiag((d) => (d && d.peak < 0.05 ? { ...d, peak: v } : d)); },
        onNotice: setNotice,
        onProgress: (p) => setPartial(t.modelLoading(Math.round(p * 100))),
        onStatus: (st) => setDiag((d) => {
          if (!d) return d;
          const n = {
            ...d, loading: st === "loading" ? true : st === "started" ? false : d.loading,
            started: d.started || ["started", "speech", "text"].includes(st) || (st === "sound" && !d.loading),
            sound: d.sound || ["sound", "speech", "text"].includes(st), text: d.text || st === "text",
            at: st === "started" && !d.started ? Date.now() : d.at,
          };
          if (st === "started") setPartial("");
          return n.loading === d.loading && n.started === d.started && n.sound === d.sound && n.text === d.text ? d : n;
        }),
      });
      if (!handle) { setListening(false); return; }
      mic.current = handle;
    }
  };

  const hangUp = () => { stopAll(); setListening(false); setMicLevel(0); setDiag(null); setDiagHint(""); setScreen("summary"); };
  const reset = () => { stopAll(); setScreen("pick"); setSc(null); setListening(false); setError(""); setMicLevel(0); };
  const flagged = new Set(assessment?.hits.map((h) => h.phrase.text) || []);
  const reasons = assessment?.hits.map((h) => h.rule[lang]) || [];
  const mm = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const STAGES = ["AUTHORITY", "THREAT", "REQUEST", "ISOLATION"];
  const initials = (c) => (c.kind === "whatsapp" ? "WA" : "");
  const Transcript = ({ list }) => (
    <div className="cg-thread">
      {list.map((l, i) => (
        <p key={i} className={(l.who === "client" ? "me" : "them") + (flagged.has(l.text) ? " hot" : "")}>{cap(l.text)}</p>
      ))}
    </div>
  );

  if (screen === "pick") {
    const list = group === "scam" ? SCAM : LEGIT;
    return (
      <div className="app-screen cg-pick">
        <h1 className="large-title">{t.title}</h1>
        <section className="cg-live">
          <span className="cg-live-ic"><Icon name="phone" size={22} stroke={2} /></span>
          <div className="cg-live-txt"><b>{t.liveTitle}</b><small>{t.liveSub}</small></div>
          <div className="cg-live-row">
            <div className="cg-seg" role="radiogroup" aria-label={t.liveLang}>
              {["kk", "ru"].map((l) => <button key={l} role="radio" aria-checked={liveLang === l} className={liveLang === l ? "on" : ""} onClick={() => setLiveLang(l)}>{l === "kk" ? "Қазақша" : "Русский"}</button>)}
            </div>
            <button className="cg-start" onClick={() => { setSc(LIVE); setError(""); accept(); }}>{t.start}</button>
          </div>
        </section>
        <div className="cg-list-head">
          <h3 className="sec-title">{t.demoCalls}</h3>
          <button className="link-btn" onClick={() => choose(list[Math.floor(Math.random() * list.length)])}>{t.random}</button>
        </div>
        <div className="cg-seg wide">
          {["scam", "legit"].map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{t.groups[g]}</button>)}
        </div>
        <ul className="group cg-calls">
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => choose(c)}>
                <span className={"cg-ava" + (c.kind === "whatsapp" ? " wa" : "")}>{c.kind === "whatsapp" ? "WA" : <Icon name="phone" size={16} stroke={2} />}</span>
                <span className="g-txt"><b>{c.title}</b><small>{c.lang === "kk" ? "ҚАЗ" : "РУС"} · {c.caller}</small></span>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          ))}
        </ul>
        <p className="cg-note">{t.androidNote}</p>
        <p className="cg-note">{t.credits}</p>
      </div>
    );
  }

  if (screen === "ringing") return (
    <div className="app-screen cg-dark cg-ring">
      <div className="cg-ring-top">
        <small>{sc.kind === "whatsapp" ? t.whatsapp : sc.id === "live" ? t.liveTitle : t.incoming}</small>
        <h2>{sc.id === "live" ? (liveLang === "kk" ? "Қазақша" : "Русский") : sc.caller}</h2>
        {sc.id !== "live" && <span>{sc.kind === "whatsapp" ? "WhatsApp" : t.phoneCall}</span>}
      </div>
      <span className={"cg-big-ava" + (sc.kind === "whatsapp" ? " wa" : "")}>{initials(sc) || <Icon name="phone" size={40} stroke={1.8} />}</span>
      <div className="cg-actions">
        <span><button className="cg-round red" onClick={reset} aria-label={t.decline}><Icon name="close" size={30} stroke={2.4} /></button><small>{t.decline}</small></span>
        <span><button className="cg-round green" onClick={accept} aria-label={t.accept}><Icon name="phone" size={30} stroke={2.2} /></button><small>{t.accept}</small></span>
      </div>
    </div>
  );

  if (screen === "summary") {
    const right = sc.label ? (sc.label === "scam") === (level === "HIGH") : null;
    return (
      <div className={"app-screen result cg-summary " + (level === "HIGH" ? "cancelled" : level === "SUSPICIOUS" ? "delayed" : "approved")}>
        <span className="res-ic"><Icon name={level === "LOW" ? "check" : "alert"} size={38} stroke={2.4} /></span>
        <h2>{t.verdict[level]}</h2>
        <p className="res-sub">{sc.id === "live" ? t.liveTitle : sc.title} · {mm}</p>
        {right != null && <p className={"cg-truth " + (right ? "ok" : "bad")}>{t.truth[sc.label]}. {right ? t.verdictOk : t.verdictBad}</p>}
        {reasons.length > 0 && <><h3 className="sec-title">{t.why}</h3><ul className="cg-reasons">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
        {llm && <p className="cg-note">{t.claude}: {llm.reasons.join("; ")}</p>}
        <h3 className="sec-title">{t.transcript}</h3>
        {lines.length ? <Transcript list={lines} /> : <p className="cg-note">—</p>}
        <div className="cta-stack"><button className="btn primary-blue" onClick={reset}>{t.back}</button></div>
      </div>
    );
  }

  // in-call screen
  const steps = t.steps.length;
  const err = error && t.micErr[error];
  return (
    <div className={"app-screen cg-dark cg-call" + (warn ? " shake" : "")}>
      <header className="cg-call-head">
        <b>{sc.id === "live" ? t.liveTitle : sc.caller}</b>
        <small>{listening ? t.listening : sc.kind === "whatsapp" ? t.whatsapp : t.phoneCall} · {mm}</small>
      </header>
      {sc.kind === "whatsapp" && <div className="cg-video" aria-hidden="true"><span className="cg-big-ava wa">WA</span></div>}

      {!listening && !err && (
        <section className="cg-consent">
          <span className="cg-shield"><Icon name="shield" size={24} stroke={2} /></span>
          <b>{t.consentTitle}</b>
          <small>{t.consentSub}</small>
          <button className="btn primary-blue" onClick={listen}>{t.startListen}</button>
        </section>
      )}

      {err && (
        <section className="cg-error" role="alert">
          <b>{err[0]}</b><small>{err[1]}</small>
          <button className="btn outline" onClick={listen}>{t.retry}</button>
        </section>
      )}

      {listening && !manual && (
        <section className={"cg-live-card " + level.toLowerCase()}>
          <div className="cg-level"><span className={"cg-chip " + level.toLowerCase()}>{t.lv[level]}</span></div>
          <div className="cg-stages">{STAGES.map((st, i) => <span key={st} className={assessment?.stages.has(st) ? "on" : ""}>{t.stages[i]}</span>)}</div>
          {!sc.turns && (
            <div className="cg-meter" aria-label={t.micLevel}>
              {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ height: `${Math.max(12, Math.min(100, micLevel * 100 * (0.55 + ((i * 7) % 5) / 6)))}%` }} />)}
              <small>{t.micLevel}</small>
            </div>
          )}
          {!sc.turns && diag && (
            <ul className="cg-checks">
              {[["mic", diag.peak >= 0.05], ["svc", diag.started], ["txt", diag.text]].map(([k, ok]) => (
                <li key={k} className={ok ? "ok" : ""}><i aria-hidden="true">{ok ? "✓" : "…"}</i>{t.checks[k]}</li>
              ))}
            </ul>
          )}
          {diagHint && <div className="cg-diag" role="status"><b>{t.diag[diagHint][0]}</b><small>{t.diag[diagHint][1]}</small></div>}
          {notice && <p className="cg-notice">{t.micErr[notice][0]}. {t.micErr[notice][1]}</p>}
          <Transcript list={lines.slice(-4)} />
          {partial && typeof partial === "object"
            ? <p className={"cg-speaking " + partial.who}>{partial.text}</p>
            : <p className="cg-partial">{partial || (sc.turns ? "" : t.partialHint)}</p>}
        </section>
      )}

      {warn && (
        <div className="cg-warn" role="alert">
          <span className="cg-warn-ic"><Icon name="alert" size={30} stroke={2.2} /></span>
          <b>{t.warnTitle}</b>
          <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {llm && llm.reasons.length > 0 && <ul className="llm">{llm.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <p>{t.advice}</p>
          <button className="btn white" onClick={hangUp}>{t.hangUp}</button>
          <button className="btn ghost-white" onClick={() => { setWarn(false); setWarnedAt(assessment.hits.length); }}>{t.ok}</button>
        </div>
      )}

      {manual && (
        <section className="cg-consent">
          {manual.i < steps
            ? <><b>{t.steps[manual.i]}</b><button className="btn primary-blue" onClick={() => setManual({ ...manual, i: manual.i + 1 })}>{t.next}</button></>
            : <><b>{t.qs[manual.i - steps]}</b>
                <div className="yn-x">{[true, false].map((v) => (
                  <button key={String(v)} onClick={() => {
                    const answers = [...manual.answers, v];
                    if (answers.length < t.qs.length) setManual({ i: manual.i + 1, answers });
                    else { setManual(null); setVideoResult(judgeManual(answers)); }
                  }}>{v ? t.yes : t.no}</button>))}</div></>}
        </section>
      )}
      {videoResult && (
        <section className={"cg-video-result " + (videoResult === "LOOKS_NORMAL" ? "low" : "high")}>
          <b>{t.vr[videoResult]}</b><button className="link-btn" onClick={() => setVideoResult(null)}>{t.ok}</button>
        </section>
      )}

      <div className="cg-controls">
        {sc.kind === "whatsapp" && !manual && (
          <span><button className="cg-round glass" onClick={() => { setVideoResult(null); setManual({ i: 0, answers: [] }); }} aria-label={t.manual}><Icon name="guardian" size={26} stroke={2} /></button><small>{t.manual}</small></span>
        )}
        <span><button className="cg-round red" onClick={hangUp} aria-label={t.end}><Icon name="phone" size={28} stroke={2.2} /></button><small>{t.end}</small></span>
      </div>
    </div>
  );
}

export const CALL_T = T;
