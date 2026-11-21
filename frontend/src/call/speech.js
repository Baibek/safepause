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
  current?.pause();
  window.speechSynthesis?.cancel();
  ttsPromise?.then((t) => t?.stop?.()).catch(() => {});
}

/**
 * Reads one line aloud. Inside a claude.ai artifact: Claude's own voice (tts capability).
 * Otherwise the browser's voices; a Kazakh line without a Kazakh voice is read by a Russian voice
 * (same alphabet), and only a browser with no speech at all shows the line silently.
 */
// Piper neural voices (rhasspy/piper, MIT; models downloaded once by the viewer's browser and kept in OPFS).
// Used on a normal website such as GitHub Pages. A claude.ai artifact may not fetch the models, so there
// Claude's own voices are used instead.
export const PIPER_VOICES = {
  ru: { caller: "ru_RU-dmitri-medium", client: "ru_RU-irina-medium" },
  kk: { caller: "kk_KZ-issai-high", client: "kk_KZ-raya-x_low" },
};
const inArtifact = () => typeof window !== "undefined" && (window.self !== window.top || !!window.claude);
let piperModule = null;
function piper() {
  if (inArtifact() || typeof navigator === "undefined" || !navigator.storage?.getDirectory) return Promise.resolve(null);
  piperModule ??= import("@mintplex-labs/piper-tts-web").catch(() => null);
  return piperModule;
}
let piperBroken = false;

/** Downloads both voices of a call once (progress 0..1). Resolves false when Piper cannot be used here. */
export async function preparePiper(lang, onProgress) {
  const tts = await piper();
  if (!tts || piperBroken) return false;
  const ids = Object.values(PIPER_VOICES[lang]);
  try {
    const stored = await tts.stored().catch(() => []);
    const missing = ids.filter((id) => !stored.includes(id));
    const share = {};
    await Promise.all(missing.map((id) => tts.download(id, (p) => {
      share[id] = p.total ? p.loaded / p.total : 0;
      onProgress?.(Object.values(share).reduce((a, b) => a + b, 0) / missing.length);
    })));
    return true;
  } catch { piperBroken = true; return false; }
}

/** Synthesises one line to a WAV blob (null when Piper is unavailable). Start it early to hide the latency. */
export async function piperAudio(text, lang, who) {
  const tts = await piper();
  if (!tts || piperBroken) return null;
  try { return await tts.predict({ text, voiceId: PIPER_VOICES[lang][who] }); }
  catch { piperBroken = true; return null; }
}

let current = null;
function playBlob(blob) {
  return new Promise((resolve) => {
    const a = new Audio(URL.createObjectURL(blob));
    current = a;
    const done = () => { URL.revokeObjectURL(a.src); if (current === a) current = null; resolve(); };
    a.onended = done; a.onerror = done; a.onpause = done;
    a.play().catch(done);
  });
}

// Two people on the line: the caller and the client (an older person) get different voices.
const CLAUDE_VOICE = { caller: "glassy", client: "airy" };
const BROWSER_STYLE = { caller: { pitch: 1.0, rate: 1.0 }, client: { pitch: 1.15, rate: 0.88 } };

export async function speak(text, lang, who = "caller", piperBlob = null) {
  const blob = piperBlob ? await piperBlob : await piperAudio(text, lang, who);
  if (blob) return playBlob(blob);
  const tts = await claudeTts();
  if (tts) {
    try { await tts.speak(text, { language: lang, voice: CLAUDE_VOICE[who] }); return; }
    catch (e) {
      if (e?.code === "viewer_stopped") return;
      try { await tts.speak(text, { voice: CLAUDE_VOICE[who] }); return; } catch { /* fall back to the browser */ }
    }
  }
  const synth = window.speechSynthesis;
  const voices = await browserVoices();
  if (!synth || !voices.length) return sleep(Math.min(6000, 600 + text.length * 55));
  const of = (p) => voices.filter((v) => v.lang?.toLowerCase().replace("_", "-").startsWith(p));
  const pool = of(lang).length ? of(lang) : of("ru").length ? of("ru") : voices;
  // prefer natural-sounding voices (Chrome's "Google …", Edge's "… Online (Natural)") over robotic ones
  const natural = pool.filter((v) => /natural|online|google|neural|premium|enhanced/i.test(v.name));
  const ranked = [...natural, ...pool.filter((v) => !natural.includes(v))];
  const voice = who === "client" && ranked.length > 1 ? ranked[1] : ranked[0];
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice; u.lang = voice.lang;
  u.pitch = BROWSER_STYLE[who].pitch; u.rate = BROWSER_STYLE[who].rate;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    setTimeout(finish, 2000 + text.length * 110);   // some browsers never fire onend
    synth.speak(u);
  });
}
