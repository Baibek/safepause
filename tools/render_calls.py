"""Renders every demo call to audio files with Piper voices (rhasspy/piper, MIT; voices trained on recordings
of real speakers: ISSAI KazakhTTS for Kazakh, CC-BY-4.0). Output: one file per call,
frontend/public/calls/<id>.mp3, and frontend/public/calls/manifest.json with each turn's start and end in seconds. Usage: python tools/render_calls.py <voices_dir> [--verify-only]"""
import json, subprocess, sys, wave, zlib
from pathlib import Path
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
VOICES = Path(sys.argv[1])
OUT = ROOT / "frontend/public/calls"

# who speaks: callers get male voices, the client (an older person) female ones, varied per call
KK = "kk_KZ-issai-high"
CAST = {
    "kk": {"caller": [(KK, 0), (KK, 1)], "client": [(KK, 3), (KK, 4), (KK, 5), (KK, 2)]},
    "ru": {"caller": [("ru_RU-dmitri-medium", None), ("ru_RU-ruslan-medium", None), ("ru_RU-denis-medium", None)],
           "client": [("ru_RU-irina-medium", None)]},
}
loaded = {}
def voice(name):
    if name not in loaded:
        loaded[name] = PiperVoice.load(str(VOICES / f"{name}.onnx"))
    return loaded[name]

def pick(lang, who, call_id):
    options = CAST[lang][who]
    return options[zlib.crc32(f"{call_id}:{who}".encode()) % len(options)]

RATE = 22050
GAP = 0.45  # seconds of silence between turns

def render(text, lang, who, call_id):
    """16-bit mono PCM at RATE for one turn."""
    name, speaker = pick(lang, who, call_id)
    cfg = SynthesisConfig(speaker_id=speaker, length_scale=1.12 if who == "client" else 1.0)
    tmp = OUT / "_turn.wav"
    with wave.open(str(tmp), "wb") as w:
        voice(name).synthesize_wav(text, w, syn_config=cfg)
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(tmp), "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    tmp.unlink()
    return pcm, {"voice": name, "speaker": speaker}

BANK = {"kk": (KK, 2), "ru": ("ru_RU-irina-medium", None)}   # the bank's verification robot


def render_verify(manifest):
    """The bank's verification call: shared/verify_call.json script, one file per language (verify-<lang>.mp3)."""
    script = json.loads((ROOT / "shared" / "verify_call.json").read_text())["script"]
    for lang, lines in script.items():
        name, speaker = BANK[lang]
        marks, audio, t = [], bytearray(), 0.0
        for text in lines:
            cfg = SynthesisConfig(speaker_id=speaker, length_scale=1.05)
            tmp = OUT / "_turn.wav"
            with wave.open(str(tmp), "wb") as w:
                voice(name).synthesize_wav(text, w, syn_config=cfg)
            pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(tmp), "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
                                 capture_output=True, check=True).stdout
            tmp.unlink()
            dur = len(pcm) / 2 / RATE
            marks.append([round(t, 3), round(t + dur, 3)])
            audio += pcm + bytes(int(0.35 * RATE) * 2); t += dur + 0.35
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", "-",
                        "-b:a", "40k", str(OUT / f"verify-{lang}.mp3")], input=bytes(audio), check=True)
        manifest[f"verify-{lang}"] = {"turns": marks, "cast": {"bank": {"voice": name, "speaker": speaker}}}
        print("verify", lang, len(lines), flush=True)


def main():
    if "--verify-only" in sys.argv:
        manifest = json.loads((OUT / "manifest.json").read_text())
        render_verify(manifest)
        (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
        return
    shared = ROOT / "shared"
    replies = json.loads((shared / "demo_replies.json").read_text())
    calls = json.loads((shared / "demo_calls_scam.json").read_text()) + json.loads((shared / "demo_calls_legit.json").read_text())
    manifest = {}
    for c in calls:
        turns = []
        for i, line in enumerate(c["lines"]):
            turns.append(("caller", line))
            r = replies.get(c["id"], [])
            if i < len(r) and r[i]:
                turns.append(("client", r[i]))
        OUT.mkdir(parents=True, exist_ok=True)
        cast, marks, audio, t = {}, [], bytearray(), 0.0
        silence = bytes(int(GAP * RATE) * 2)
        for who, text in turns:
            pcm, cast[who] = render(text, c["lang"], who, c["id"])
            dur = len(pcm) / 2 / RATE
            marks.append([round(t, 3), round(t + dur, 3)])
            audio += pcm + silence; t += dur + GAP
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", "-",
                        "-b:a", "40k", str(OUT / f"{c['id']}.mp3")], input=bytes(audio), check=True)
        manifest[c["id"]] = {"turns": marks, "cast": cast}
        print(c["id"], len(turns), flush=True)
    render_verify(manifest)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
