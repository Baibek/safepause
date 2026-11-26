import React from "react";
import PhoneFrame, { Icon } from "./phone/PhoneFrame.jsx";

// "How Senim plugs into a bank's app": a neutral bank-app wireframe (no bank's brand) with the four places
// Senim adds itself, then what the bank's side changes and the pilot steps.
const IN = {
  kk: {
    title: "Senim банк қосымшасына қалай қосылады",
    lead: "Senim — жеке қосымша емес, банктің бар мобильді қосымшасына енетін модуль және антифрод серверіне бір өріс. Сұлба кез келген банк қосымшасына сай келеді; банктің логотипі мен фирмалық стилі әдейі қолданылмайды.",
    phoneCap: "Банк қосымшасының сұлбасы", phoneHint: "Сандар — Senim қосылатын төрт орын.",
    spots: [
      ["Басты бет", "«Бұл шынымен банк пе?» батырмасы және қорғаныс индексі. Банк шынымен қоңырау шалса, қызметкердің аты мен ID-і шығады (Call Status)."],
      ["Аударымды растау", "Аудару батырмасынан кейін Senim тексерісі: тәуекел 0–100, себептері, кідіріс, банктің растау қоңырауы және passkey арқылы операцияға қол қою."],
      ["Кіріс қоңырау", "Android-та Call Guard: сөйлеу телефонның ішінде танылады, алаяқ сценарийі анықталса — ескерту. Банкке тек бір сан барады."],
      ["Баптаулар → Қорғаныс", "Сенімді адам, сейф (ақшаны құлыптау), passkey, «Тексеріп бер» (күдікті SMS және скриншот)."],
    ],
    bankSide: "Банк жағында не өзгереді",
    bankCards: [
      ["Мобильді қосымша", "Senim SDK модулі (Android: Kotlin). Аударым алдында бір функцияны шақырады.", "val signals = SafePauseSdk\n  .transferSignals(context)\n// scam_call_minutes: 4.0\n// remote_app: false\n// rooted: false"],
      ["Аударым API", "Сұрауға бір өріс қосылады; жауапта шешім мен себептер келеді.", "POST /api/transfer/check\n{ ...,\n  \"signals\": {\n    \"scam_call_minutes\": 4.0 } }\n→ { \"tier\": \"escalate\",\n    \"risk\": 0.86, ... }"],
      ["Антифрод ережелері", "Балдар мен шектер бір JSON файлында: банк кодты өзгертпей баптайды. Аналитикке кезек, түсіндірме және дроп-граф.", "shared/risk_policy.json\n\"thresholds\": {\n  \"warn\": 30,\n  \"cool\": 60,\n  \"escalate\": 80 }"],
    ],
    steps: "Пилот қадамдары",
    stepList: [
      "SDK-ны банктің Android қосымшасына қосу, тыңдау тек клиенттің келісімімен.",
      "Аударым API-ына scam_call_minutes өрісін және RASP белгілерін қосу.",
      "Тәуекел саясатын банктің тарихи деректерімен баптау және модельді қайта үйрету.",
      "Аналитиктерге консольді ашу: кезек, дроп-тізім, ҰБ Антифрод-орталығына есеп.",
      "Шағын топпен пилот (мысалы, 60 жастан асқан Android клиенттері): тоқтатылған аударымдар мен жалған кідірістерді өлшеу.",
    ],
    privacy: "Дыбыс пен әңгіме мәтіні телефоннан шықпайды. Банкке алаяқ қоңырауы неше минут бұрын болғаны ғана барады.",
  },
  ru: {
    title: "Как Senim встраивается в приложение банка",
    lead: "Senim — не отдельное приложение, а модуль внутри существующего мобильного приложения банка и одно поле в антифрод-сервере. Схема подходит любому банковскому приложению; логотип и фирменный стиль банка намеренно не используются.",
    phoneCap: "Схема приложения банка", phoneHint: "Цифры — четыре места, куда встраивается Senim.",
    spots: [
      ["Главная", "Кнопка «Это правда банк?» и индекс защиты. Если банк действительно звонит, видно имя и ID сотрудника (Call Status)."],
      ["Подтверждение перевода", "После кнопки «Перевести» — проверка Senim: риск 0–100, причины, пауза, звонок банка для подтверждения и подпись операции passkey."],
      ["Входящий звонок", "Call Guard на Android: речь распознаётся в телефоне, при сценарии мошенника — предупреждение. В банк уходит одно число."],
      ["Настройки → Защита", "Доверенное лицо, сейф (блокировка денег), passkey, «Проверить» (подозрительные SMS и скриншоты)."],
    ],
    bankSide: "Что меняется на стороне банка",
    bankCards: [
      ["Мобильное приложение", "Модуль Senim SDK (Android: Kotlin). Перед переводом вызывается одна функция.", "val signals = SafePauseSdk\n  .transferSignals(context)\n// scam_call_minutes: 4.0\n// remote_app: false\n// rooted: false"],
      ["API перевода", "В запрос добавляется одно поле; в ответе — решение и причины.", "POST /api/transfer/check\n{ ...,\n  \"signals\": {\n    \"scam_call_minutes\": 4.0 } }\n→ { \"tier\": \"escalate\",\n    \"risk\": 0.86, ... }"],
      ["Антифрод-правила", "Баллы и пороги в одном JSON-файле: банк настраивает без изменения кода. Аналитику — очередь, объяснения и дроп-граф.", "shared/risk_policy.json\n\"thresholds\": {\n  \"warn\": 30,\n  \"cool\": 60,\n  \"escalate\": 80 }"],
    ],
    steps: "Шаги пилота",
    stepList: [
      "Подключить SDK к Android-приложению банка; прослушивание только с согласия клиента.",
      "Добавить в API перевода поле scam_call_minutes и признаки RASP.",
      "Настроить риск-политику на исторических данных банка и переобучить модель.",
      "Открыть аналитикам консоль: очередь, список дропперов, отчёт в Антифрод-центр НБ.",
      "Пилот на небольшой группе (например, клиенты на Android старше 60 лет): измерить остановленные переводы и ложные паузы.",
    ],
    privacy: "Аудио и текст разговора не покидают телефон. В банк уходит только то, сколько минут назад был звонок мошенника.",
  },
};

function Wireframe() {
  // a generic bank app: grey blocks, no logo, no brand colours; the numbered pins mark Senim's places
  return (
    <div className="wf">
      <div className="wf-head"><i className="wf-av" /><span><i className="wf-l w60" /><i className="wf-l w40" /></span></div>
      <div className="wf-row">{[0, 1, 2, 3].map((k) => <i key={k} className="wf-story" />)}</div>
      <div className="wf-card"><i className="wf-l w40 light" /><i className="wf-l w70 light big" /></div>
      <div className="wf-pin-wrap"><div className="wf-senim s1"><Icon name="shield" size={16} stroke={2.2} /><span>Senim · 65</span><b>?</b></div><em className="pin">1</em></div>
      <div className="wf-row">{[0, 1, 2, 3].map((k) => <i key={k} className="wf-btn" />)}</div>
      <div className="wf-pin-wrap"><div className="wf-senim s2"><Icon name="pause" size={16} stroke={2.4} /><span>1 800 000 ₸ · 86/100</span></div><em className="pin">2</em></div>
      <div className="wf-pin-wrap"><div className="wf-senim s3"><Icon name="phone" size={16} stroke={2.2} /><span>+7 7•• ••• · ⚠</span></div><em className="pin">3</em></div>
      <div className="wf-list">{[0, 1, 2].map((k) => <span key={k}><i className="wf-dot" /><i className="wf-l w60" /></span>)}</div>
      <div className="wf-tabs">{[0, 1, 2, 3].map((k) => <i key={k} />)}<span className="wf-pin-wrap tab"><Icon name="shield" size={18} stroke={2.2} /><em className="pin">4</em></span></div>
    </div>
  );
}

export default function Integration({ lang }) {
  const T = IN[lang];
  return (
    <div className="shell analyst-shell integ">
      <main className="board">
        <header className="an-head"><h1>{T.title}</h1><p>{T.lead}</p></header>
        <section className="bcard">
          <ol className="spots">
            {T.spots.map(([h, d], i) => <li key={h}><em className="pin">{i + 1}</em><span><b>{h}</b><small>{d}</small></span></li>)}
          </ol>
        </section>
        <h2 className="integ-h2">{T.bankSide}</h2>
        <div className="board-grid three">
          {T.bankCards.map(([h, d, code]) => (
            <section key={h} className="bcard"><h2>{h}</h2><p className="hint">{d}</p><pre className="code-x">{code}</pre></section>
          ))}
        </div>
        <section className="bcard">
          <h2>{T.steps}</h2>
          <ol className="steps-x">{T.stepList.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="hint privacy-x"><Icon name="shield" size={16} stroke={2} />{T.privacy}</p>
        </section>
      </main>
      <section className="sphone" aria-label={T.phoneCap}>
        <div className="sphone-cap"><b>{T.phoneCap}</b><small>{T.phoneHint}</small></div>
        <PhoneFrame tone="dark"><Wireframe /></PhoneFrame>
      </section>
    </div>
  );
}
