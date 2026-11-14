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

let ttsPromise = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function claudeTts() {
  if (!window.claude?.use) return null;
  ttsPromise ??= window.claude.use("tts").catch(() => null);
  return Promise.race([ttsPromise, sleep(1500).then(() => null)]);
}

async function browserVoices() {
  const synth = window.speechSynthesis;
  if (!synth) return [];
  if (synth.getVoices().length) return synth.getVoices();
  // voices load asynchronously in Chrome: wait for them once
  await Promise.race([new Promise((r) => synth.addEventListener("voiceschanged", r, { once: true })), sleep(2000)]);
  return synth.getVoices();
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
  ttsPromise?.then((t) => t?.stop?.()).catch(() => {});
}

/**
 * Reads one line aloud. Inside a claude.ai artifact: Claude's own voice (tts capability).
 * Otherwise the browser's voices; a Kazakh line without a Kazakh voice is read by a Russian voice
 * (same alphabet), and only a browser with no speech at all shows the line silently.
 */
export async function speak(text, lang) {
  const tts = await claudeTts();
  if (tts) {
    try { await tts.speak(text, { language: lang }); return; }
    catch (e) {
      if (e?.code === "viewer_stopped") return;
      try { await tts.speak(text); return; } catch { /* fall back to the browser */ }
    }
  }
  const synth = window.speechSynthesis;
  const voices = await browserVoices();
  if (!synth || !voices.length) return sleep(Math.min(6000, 600 + text.length * 55));
  const pick = (p) => voices.find((v) => v.lang?.toLowerCase().replace("_", "-").startsWith(p));
  const voice = pick(lang) || pick("ru") || voices[0];
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice; u.lang = voice.lang; u.rate = 0.95;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    setTimeout(finish, 2000 + text.length * 110);   // some browsers never fire onend
    synth.speak(u);
  });
}
