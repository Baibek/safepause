// Live speech → text in the browser. Chrome's Web Speech API on a normal page (GitHub Pages);
// inside a claude.ai artifact the page's microphone is blocked, so the artifact's `dictation`
// capability is used instead. Returns null when neither is available.
const LOCALE = { kk: "kk-KZ", ru: "ru-RU" };

export function speechSupport() {
  return { web: typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition) };
}

export async function startListening(lang, { onPartial, onFinal, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const inArtifact = window.self !== window.top;
  if (SR && !inArtifact) {
    const r = new SR();
    r.lang = LOCALE[lang]; r.continuous = true; r.interimResults = true;
    let active = true;
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onFinal(res[0].transcript.trim()); else partial += res[0].transcript;
      }
      onPartial(partial);
    };
    r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") { active = false; onError(e.error); } };
    r.onend = () => { if (active) { try { r.start(); } catch { /* already restarting */ } } };
    r.start();
    return { kind: "web", stop: () => { active = false; r.stop(); } };
  }
  const dictation = window.claude?.use ? await window.claude.use("dictation").catch(() => null) : null;
  if (!dictation) return null;
  const offs = [
    dictation.onPartial(({ text }) => onPartial(text)),
    dictation.onFinal(({ text }) => onFinal(text.trim())),
  ];
  try { await dictation.start({ language: lang }); }
  catch (e) {
    try { await dictation.start(); } catch (e2) { offs.forEach((f) => f()); onError(e2?.code || "not_granted"); return null; }
  }
  return { kind: "dictation", stop: () => { offs.forEach((f) => f()); dictation.stop().catch(() => {}); } };
}

export function speak(text, lang) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const fallback = () => setTimeout(resolve, Math.min(6000, 600 + text.length * 55));
    if (!synth) return fallback();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALE[lang];
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(lang));
    if (!voice) return fallback();            // no voice for this language (often Kazakh): show the line, read silently
    u.voice = voice;
    u.rate = 0.95;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    setTimeout(finish, 1500 + text.length * 120);    // some browsers never fire onend
    synth.speak(u);
  });
}
