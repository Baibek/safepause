# SafePause Call Guard — Android app design

Date: 2026-11-14. Status: draft for approval.

## Intent and why

The team is entering the Bank CenterCredit FINTECH CASE hackathon with **SafePause**: stop
social-engineering fraud *before* the money leaves. The existing web MVP (`backend/`, `frontend/`)
covers the bank side: transfer risk scoring, an AI dialog when a transfer is paused, a guardian mode
and a money-mule graph. Its weakest point is that "a phone call is in progress" is only a simulated
checkbox.

This project makes that part real: an **Android app that listens to a live call and tells the
client, while the call is still going, that the caller is very likely a scammer**. It must work on a
real phone in front of the judges, not as a mock-up. It also helps with **fake WhatsApp video calls**
(a scammer showing a face that is not theirs).

The user who will see it: a client of a Kazakh bank, often elderly, on the phone with someone
claiming to be the bank's security service, police, the National Bank, or a relative in trouble.
Languages: Kazakh and Russian, often mixed in one sentence.

## Goals

1. During a regular cellular call **and** a WhatsApp audio/video call, on speakerphone, the app
   transcribes both sides' speech on the phone itself (Kazakh + Russian) and shows the live text.
2. It recognises the scam script (who they claim to be + pressure + what they ask for) and, when the
   risk is high, interrupts with a full-screen-width warning over the call screen plus vibration:
   what was said, why it is dangerous, what to do ("Hang up. Call the bank on the number on your
   card.").
3. When a Claude API key is configured, the transcript is also analysed by Claude for a second
   opinion and a plain-language explanation. Without a key the app still works on rules alone.
4. For a WhatsApp video call, a **"Check the face"** mode: the app captures the screen, guides the
   client through a liveness challenge (ask the caller to turn their head to each side, pass a hand
   in front of the face), measures what the caller actually did with on-device face detection, sends
   a few frames to Claude vision for visual artifacts, and shows the signals found.
5. After the call: a summary screen (risk, reasons, transcript), and, if the client has set one, a
   text message to a trusted person ("guardian") when a high-risk call happened. The SMS is sent
   automatically (`SEND_SMS`, asked during onboarding only if a guardian is set) and contains only
   the client's name, the time and "a call with signs of fraud" plus the caller's number for
   cellular calls — never transcript text. *(Builder-check call.)*
6. A repeatable evaluation of the detector on a written set of scam and normal call transcripts.

## Non-goals

- iPhone. iOS gives no app access to call audio.
- Reading WhatsApp's audio or video stream directly. No API exists; Android blocks capturing
  VoIP playback audio. We only use the microphone (speakerphone) and the screen image.
- Automatic synthetic-voice (voice-clone) detection. No pre-trained anti-spoofing model can be
  downloaded in the build environment, and training one is out of scope. The app judges *what is
  said*, which also catches the far more common human scammer.
- Play Store publication. The app is installed as an APK; its use of the accessibility service and
  SMS would not pass Play review as is.
- A server. Everything runs on the phone except the optional Claude API calls.
- Integration with the real bank app. The web MVP stays the bank-side demo.

## Anti-goals (failure even if it "works")

- Recording without the client's explicit action. Listening starts only after the client taps
  "Listen" for that call. Nothing is stored after the call unless the client keeps it.
- Sending call audio anywhere. Audio never leaves the phone; only transcript text (to Claude, when
  a key is set) and a few video frames (only in "Check the face", after the client starts it).
- False alarms on genuine calls. A real bank employee also says "bank" and "card". A warning needs a
  combination of signals (see Detector), never a single keyword. A demo where a normal call turns
  red is worse than no app.
- A verdict the app cannot back up. The video check reports signals ("did not turn head",
  "face edge flickered on hand pass"), never "100% deepfake".

## Constraints

- Android 10 (API 29) minimum, target API 35. Kotlin, Jetpack Compose for the app screens,
  classic Views for the overlay window.
- From Android 10, while a call is active, ordinary apps get silence from the microphone. Apps with an
  enabled **AccessibilityService** may capture concurrently. So the app ships an accessibility
  service, and onboarding walks the client through enabling it. Without it, listening during a call
  is impossible; the app must detect this and say so instead of showing an empty transcript.
- The call must be on **speakerphone** for the other side's voice to reach the microphone. The
  overlay reminds the client and the app checks `AudioManager.isSpeakerphoneOn` for cellular calls.
- Speech recognition: **Vosk** (`com.alphacephei:vosk-android`), offline. Models
  `vosk-model-small-kz-0.15` and `vosk-model-small-ru-0.22` are downloaded by the app on first run
  from alphacephei.com (they cannot be bundled from this build environment). Both recognisers run on
  the same audio stream, because speakers switch language mid-sentence.
- The APK is built in a Linux cloud container (Android SDK + Gradle available, no emulator, no
  device). Everything that can be tested on the JVM must be (detector, scoring, parsing). On-device
  behaviour is verified by the team on their own Android phone, following a written test script.
- Claude API: official Anthropic Java SDK, model `claude-opus-5-5`, low effort, with the server-side
  refusal fallback in its default form (`fallbacks: "default"`), so a declined request is retried
  on another model automatically. The key is entered by the client in Settings and stored with `EncryptedSharedPreferences`.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | On-device speech recognition (Vosk) + on-device rules; Claude as an optional second opinion and for video frames | Private (audio stays on the phone), works offline and without a key, free. Recognition quality is moderate, enough for the key phrases of scam scripts. ~90 MB of models downloaded once. |
| B | Cloud speech recognition (e.g. Google Cloud Speech) | Better accuracy, but needs a paid key and a stable connection, and sends call audio off the phone — weak for a bank pitch. |
| C | Phone streams audio to our own server for recognition and analysis | Server must be hosted and up during the hackathon; single point of failure; same privacy problem as B. |

The team picked **A**: it works in any demo condition, and privacy becomes a selling point.

## Decided parts of the how

### Flow during a call

1. **Call detected.** Cellular: `TelephonyCallback` call-state changes (needs `READ_PHONE_STATE`).
   WhatsApp: the accessibility service sees a window from `com.whatsapp` / `com.whatsapp.w4b`
   whose content matches the in-call screen, and `AudioManager.mode == MODE_IN_COMMUNICATION`.
2. **Bubble.** A small overlay button appears over the call screen: "SafePause: listen?"
   (`SYSTEM_ALERT_WINDOW`). Tapping it is the consent for this call and is the user interaction that
   allows starting a foreground service of type `microphone` from the overlay.
3. **Listening.** The foreground service captures 16 kHz mono PCM with `AudioRecord`
   (`MediaRecorder.AudioSource.VOICE_RECOGNITION`), feeds both Vosk recognisers, and pushes final
   phrases into the detector. The overlay expands to a strip with the last lines of transcript and a
   risk meter. If the first ~5 seconds of audio are pure silence during a call, it shows
   "Accessibility is off or the phone blocks the microphone" with a button to the setting.
4. **Warning.** When risk crosses the high threshold: the strip turns into a large red card with the
   matched reasons in the client's language, the advice, a "Hang up" hint and vibration. Shown once
   per escalation, not repeatedly.
5. **Call ends.** Listening stops, the summary screen opens, guardian SMS is sent if configured and
   the call was high risk.

### Detector (pure Kotlin module, no Android dependencies)

- Input: a stream of transcript phrases (text + timestamp + which recogniser). Output after each
  phrase: risk 0–1, level (low / suspicious / high), the reasons that fired, the phrases that
  triggered them.
- Signals are grouped into **stages of a scam script**:
  - *Authority*: claims to be bank security, police, investigator, National Bank, eGov, prosecutor,
    a bank by name; or a relative in trouble ("mama, it's me").
  - *Threat / urgency*: account blocked, suspicious operation, loan taken in your name, criminal
    case, "right now", "within N minutes".
  - *Request*: move money to a "safe" / reserve account, tell the SMS code / CVV / PIN, install
    AnyDesk / RustDesk / "a bank app", take a loan, withdraw cash, transfer to a card.
  - *Isolation*: "don't tell anyone", "don't hang up", "don't go to the branch", "this is secret".
- Risk grows with how many **different stages** fired, not how many keywords. One stage alone stays
  "low" or "suspicious"; *request* + any other stage, or three stages, is "high". *Request* of a code
  or a "safe account" is "high" on its own (no legitimate caller asks that).
- Patterns cover Kazakh and Russian, tolerate recognition errors (word stems, common Vosk
  misspellings), and live in a **new** file `shared/call_rules.json` with stage fields. The existing
  `shared/message_rules.json` (SMS checker, used by the backend and the browser) is left untouched.
  *(Builder-check call: a separate file avoids breaking the web MVP.)*
- Claude second opinion: every ~30 s of new speech, or immediately when a stage fires, the last
  ~3 minutes of transcript go to Claude with a request for JSON `{verdict, stages, reasons, advice}`.
  Rules are a floor: Claude can never lower a rule-based level. Claude can raise the level **by one
  step at most**: low → suspicious, or suspicious → high. A red warning therefore always needs at
  least one rule-based stage. Claude's reasons and advice are shown in the warning text.
  *(Builder-check call: keeps false alarms bounded and the evaluation a deterministic JVM test.)*

### Video check (WhatsApp video call)

- Started from the overlay's "Check the face" button. Requires the `MediaProjection` consent dialog
  each time (Android rule).
- A ~20 s guided sequence shown on the overlay: "Ask them to turn their head left" → "right" →
  "pass a hand in front of the face" → "move closer to the camera".
- During it, frames at ~4 fps go to **ML Kit face detection** (bundled model, offline): head yaw
  range reached, face lost/re-found during hand pass, landmark jitter. 6–8 frames (peaks of each
  step) go to Claude vision with a prompt asking for face-swap artifacts (blurred or shifting face
  edge, mismatched skin tone at the jaw, hand passing *behind* the face, frozen expression).
- Result card: a list of signals with plain-language meaning, and an overall "looks normal /
  suspicious / did not cooperate". Never a percentage of "deepfake".
- If captured frames are black (the calling app blocks screen capture), say so plainly.

### Screens

1. **Onboarding**: what the app does; permissions one by one with why (microphone, phone state,
   overlay, accessibility, notifications); model download with progress.
2. **Home**: protection status (each permission green/red), "Test with a sample call" button that
   plays a recorded scam conversation through the speaker so the app can be shown without a real
   scammer, last calls.
3. **Call summary**: risk, reasons, transcript with triggering phrases highlighted, delete button.
4. **Settings**: language of the interface (kk/ru), Claude API key, guardian name + number, keep
   transcripts on/off.

Storage *(builder-check call)*: for every listened call the app keeps a small record (time, caller
number if known, risk level, reasons). The transcript is kept only when "keep transcripts" is on;
it is **off** by default. The summary screen right after a call always shows the transcript from
memory; with the setting off it is gone once that screen is closed. Records stay in a local Room
database; "delete" removes the record.

### Evaluation

- A file of ~40 call transcripts written for this project, **written separately from the
  pattern tuning** (the test set is fixed first and not edited to make patterns pass) (scam scripts of the common Kazakh types
  and normal calls: real bank reminder, delivery, relative, doctor), in both languages, some with
  recognition-style errors. Marked as synthetic.
- A JVM test runs the detector over them and reports detection rate, false alarms and how many
  phrases into the call the warning came. Target: every scam reaches "high"; no normal call reaches
  "high".

### First milestone: microphone probe *(builder-check call)*

Before the full app, a small probe APK: enable the accessibility service, start a call on
speakerphone, tap "probe", and the app shows a live audio level and a 10 s Vosk transcript. The team
runs it on their phone for a cellular call and a WhatsApp call. If the other side's voice does not
reach the microphone, the plan is re-ordered before more is built.

## Left to the builder

- Module layout, class names, Gradle setup, Compose design details (follow the web MVP's palette:
  navy / amber / teal).
- Exact pattern lists and weights, within the stage rules above, tuned on the evaluation set.
- The sample-call audio for the home-screen demo (e.g. generated with Android TextToSpeech at runtime
  from a scam script, so no audio file is needed).
- How the Claude client is wired (Java SDK on Android; if it proves unusable on Android, raw HTTPS
  with OkHttp is the fallback — note it in the README).
- Retry / timeout behaviour for model download and Claude calls.
