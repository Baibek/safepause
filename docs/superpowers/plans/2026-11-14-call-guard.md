# SafePause Call Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android APK that, on speakerphone, transcribes a live cellular or WhatsApp call on the phone (Kazakh + Russian), recognises a scam script and warns the client over the call screen; plus a guided face check for WhatsApp video calls.

**Architecture:** Two Gradle modules under `android/`. `:detector` is pure Kotlin/JVM (rules, scoring, LLM-verdict parsing and merging, evaluation) and is fully unit-tested in the build container. `:app` is the Android shell: accessibility service + overlay + microphone foreground service + Vosk recognisers + Claude client + screens + video check; it is compiled here and verified by the team on their phone with `android/DEVICE_TEST.md`.

**Tech Stack:** Kotlin 2.4.21, AGP 9.4.1, Gradle wrapper 9.9.1, JDK 21, compileSdk/targetSdk 35, minSdk 29, Jetpack Compose (BOM 2026.08.00), kotlinx-serialization-json 1.12.0, `com.alphacephei:vosk-android:0.3.75` + `net.java.dev.jna:jna:5.19.1@aar`, `com.google.mlkit:face-detection:16.1.7`, `com.anthropic:anthropic-java:3.8.0`, `androidx.security:security-crypto:1.1.0`, JUnit 5 for `:detector`.

**Spec:** `docs/superpowers/specs/2026-11-14-call-guard-design.md`

## Global Constraints

- minSdk 29 (Android 10), targetSdk 35. Kotlin only. Compose for app screens, classic Views for the overlay window.
- Listening starts only after the client taps the overlay bubble for that call. Never auto-start.
- Call audio never leaves the phone. Only transcript text (to Claude, when a key is set) and 6–8 frames (video check, after the client starts it).
- Detector levels: one stage alone → LOW, except REQUEST alone → SUSPICIOUS; two stages without REQUEST → SUSPICIOUS; REQUEST + any other stage → HIGH; three or more stages → HIGH; any `critical` rule (SMS code / CVV / PIN, "safe account", remote-access app) → HIGH on its own.
- Claude may raise the level by **one step at most** and never lower it. A HIGH warning always has at least one rule hit.
- Claude: model `claude-opus-5-5`, `output_config.effort = "low"`, beta `server-side-fallback-2026-07-01` with `fallbacks: "default"`; key stored with `EncryptedSharedPreferences`.
- Vosk models `vosk-model-small-kz-0.15` and `vosk-model-small-ru-0.22`, downloaded by the phone from `https://alphacephei.com/vosk/models/<name>.zip` on first run; both recognisers run on the same 16 kHz mono stream.
- Guardian SMS: sent automatically with `SEND_SMS`; contains only client name, time, "a call with signs of fraud", and the caller number for cellular calls. Never transcript text.
- Transcripts are kept only when "keep transcripts" is on (default **off**); a small record (time, number, level, reasons) is always kept. Storage: a JSON file via kotlinx.serialization (the spec says Room; a JSON file avoids KSP setup and is enough for tens of records — deviation noted in README).
- Patterns live in `shared/call_rules.json`. `shared/message_rules.json` is not modified.
- The evaluation set is written before the patterns and is not edited to make patterns pass.
- UI strings exist in Kazakh and Russian; palette follows the web MVP (navy `#14213d`, amber `#e0a526`, teal `#0f4c4a`, red `#c8372d`).
- Video check never shows a "deepfake %"; it reports signals and one of: looks normal / suspicious / did not cooperate.

## Review Focus

- A genuine bank call that says "никому не сообщайте код" / "кодты ешкімге айтпаңыз" must not reach HIGH (negated request) — tested in Task 3.
- The same phrase recognised by both the kk and ru recogniser must not double-count — tested in Task 3.
- Listening tapped before the models finished downloading must show "models not ready" with progress, not crash — tested in Task 4 (`ModelManagerTest`).
- Claude unreachable, slow (>10 s) or returning non-JSON must leave the rule-based level and warning working — tested in Task 6.
- Microphone returns only silence during a call (accessibility off / OEM block) must be reported within ~5 s — tested in Task 4 (`SilenceWatchTest`).

---

### Task 1: Toolchain, project skeleton and microphone probe APK

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/libs.versions.toml`, Gradle wrapper files
- Create: `android/detector/build.gradle.kts` (Kotlin JVM library, JUnit 5, kotlinx-serialization)
- Create: `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/kz/safepause/guard/probe/ProbeActivity.kt`
- Create: `android/app/src/main/java/kz/safepause/guard/access/GuardAccessibilityService.kt`
- Create: `android/app/src/main/res/xml/accessibility_service.xml`
- Create: `android/tools/setup-sdk.sh`
- Modify: `.gitignore` (add `android/.gradle/`, `android/**/build/`, `android/local.properties`)

**Interfaces:**
- Produces: package root `kz.safepause.guard`; module names `:detector`, `:app`; `GuardAccessibilityService` (declared in manifest, `canRetrieveWindowContent=true`, event types `typeWindowStateChanged|typeWindowContentChanged`, package filter none).

- [ ] **Step 1:** Write `android/tools/setup-sdk.sh`: downloads `commandlinetools-linux-16111833_latest.zip` from `dl.google.com/android/repository/` into `$HOME/android-sdk`, accepts licences, installs `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`, writes `android/local.properties`. Run it. Expected: `sdkmanager --list_installed` shows the three packages.
- [ ] **Step 2:** Create the Gradle project with the versions in Tech Stack. If AGP 9 refuses the `org.jetbrains.kotlin.android` plugin, use AGP's built-in Kotlin support instead. Run `cd android && ./gradlew :detector:test :app:assembleDebug`. Expected: BUILD SUCCESSFUL, `app/build/outputs/apk/debug/app-debug.apk` exists.
- [ ] **Step 3:** `ProbeActivity`: buttons "Open accessibility settings", "Probe 10 s". Probe starts `AudioRecord` (VOICE_RECOGNITION, 16000 Hz, mono, PCM16) for 10 s and shows a live RMS level bar and the max RMS. (Vosk transcript is added to the probe in Task 4.) Requests `RECORD_AUDIO` at runtime.
- [ ] **Step 4:** Build. Expected: `assembleDebug` succeeds. Copy APK to `android/dist/safepause-probe.apk`.
- [ ] **Step 5:** Commit: `git add android .gitignore && git commit -m "feat(android): project skeleton and microphone probe"`.

---

### Task 2: Evaluation set and harness (written before any pattern)

**Files:**
- Create: `android/detector/src/test/resources/eval/calls.json`
- Create: `android/detector/src/test/kotlin/kz/safepause/detector/EvaluationTest.kt`

**Interfaces:**
- Consumes: nothing yet (test references `ScamDetector`, `RuleSet`, `Phrase`, `Level` from Task 3; it fails to compile until then).
- Produces: eval file format `[{ "id": String, "lang": "kk"|"ru"|"mixed", "label": "scam"|"normal", "type": String, "phrases": [String] }]`.

- [ ] **Step 1:** Write `calls.json`: 40 calls, lower-case, no punctuation (as Vosk prints them). 22 scam: bank security "safe account", police/investigator, National Bank, loan in your name, eGov/"ЦОН" data update asking SMS code, AnyDesk install, relative in trouble ("мама это я"), courier/"доставка" asking code, prize/compensation, OLX/Kolesa buyer asking card details. 18 normal: real bank reminder of payment date including "никому не сообщайте код", bank card delivery, doctor, relative, taxi, work, shop, utility company, a call about a loan the client applied for. Mix kk/ru; at least 6 calls with recognition-style errors (dropped endings, split words). Each phrase is one utterance; 4–12 phrases per call.
- [ ] **Step 2:** `EvaluationTest.everyScamReachesHigh()` and `noNormalCallReachesHigh()`: feed each call's phrases in order into a fresh `ScamDetector(RuleSet.load())`, assert levels; `report()` prints a table `id | label | final level | phrase index of first HIGH` to stdout.
- [ ] **Step 3:** Run `./gradlew :detector:test`. Expected: FAIL (unresolved `ScamDetector`).
- [ ] **Step 4:** Commit: `git commit -m "test(detector): evaluation set of scam and normal calls"`.

---

### Task 3: Rules file and detector engine

**Files:**
- Create: `shared/call_rules.json`
- Create: `android/detector/src/main/kotlin/kz/safepause/detector/Model.kt`, `RuleSet.kt`, `ScamDetector.kt`, `Normalize.kt`
- Modify: `android/detector/build.gradle.kts` (copy `../../shared/call_rules.json` into main resources as `call_rules.json`)
- Test: `android/detector/src/test/kotlin/kz/safepause/detector/ScamDetectorTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  enum class Stage { AUTHORITY, THREAT, REQUEST, ISOLATION }
  enum class Level { LOW, SUSPICIOUS, HIGH }
  data class Phrase(val text: String, val atMs: Long, val source: String /* "kk" | "ru" */)
  data class Rule(val id: String, val stage: Stage, val critical: Boolean, val patterns: List<Regex>, val exclude: List<Regex>, val kk: String, val ru: String)
  data class Hit(val rule: Rule, val phrase: Phrase)
  data class Assessment(val level: Level, val risk: Double, val stages: Set<Stage>, val hits: List<Hit>)
  class RuleSet(val rules: List<Rule>) { companion object { fun load(): RuleSet; fun fromJson(json: String): RuleSet } }
  class ScamDetector(rules: RuleSet) { fun add(p: Phrase): Assessment; fun current(): Assessment; fun reset() }
  fun normalize(text: String): String
  ```
- JSON format: `{ "rules": [ { "id", "stage", "critical", "patterns": [regex], "exclude": [regex], "kk", "ru" } ] }`.

- [ ] **Step 1: Failing tests** in `ScamDetectorTest`:
  - `authorityAloneIsLow()`: "здравствуйте вас беспокоит служба безопасности банка" → LOW, stages = {AUTHORITY}.
  - `safeAccountIsHighAlone()`: "переведите деньги на безопасный счет" → HIGH.
  - `smsCodeKazakhIsHigh()`: "смс кодты айтыңызшы" → HIGH.
  - `negatedCodeIsNotHit()`: "никому не сообщайте код из смс" and "кодты ешкімге айтпаңыз" → LOW, no hits.
  - `requestPlusThreatIsHigh()`: "на вас оформили кредит" then "нужно перевести деньги" → HIGH.
  - `twoStagesWithoutRequestIsSuspicious()`: "это полиция" then "срочно никому не говорите" → SUSPICIOUS.
  - `sameRuleTwiceFromBothRecognisersCountsOnce()`: same text with source "kk" and "ru" → `hits.map{it.rule.id}.distinct().size == hits.size`.
  - `normalizeLowercasesAndFoldsYo()`: `normalize("Счёт  БЛОКИРОВАН!") == "счет блокирован"`.
- [ ] **Step 2:** Run `./gradlew :detector:test --tests '*ScamDetectorTest*'`. Expected: FAIL (unresolved references).
- [ ] **Step 3:** Implement. `normalize`: lower-case, `ё→е`, strip punctuation, collapse spaces. A rule hits a phrase when any pattern matches the normalised text and no `exclude` matches. Each rule id is counted once per call. `risk`: LOW 0.15 / SUSPICIOUS 0.5 / HIGH 0.9, +0.03 per extra distinct hit, capped at 1.0. Level per Global Constraints. Write `call_rules.json` from the spec's four stages, Kazakh and Russian stems, tolerant to dropped endings.
- [ ] **Step 4:** Run `./gradlew :detector:test`. Expected: `ScamDetectorTest` and `EvaluationTest` PASS. Tune patterns only, never `calls.json`. If a call cannot pass without overfitting, leave it failing, mark the test `@Disabled("known miss: <id>")` with the reason, and list it in the README.
- [ ] **Step 5:** Commit: `git commit -m "feat(detector): stage-based scam detector and call rules"`.

---

### Task 4: On-device speech pipeline (models, recognisers, silence watch)

**Files:**
- Create: `android/app/src/main/java/kz/safepause/guard/speech/ModelManager.kt`, `DualRecognizer.kt`, `AudioCapture.kt`, `SilenceWatch.kt`
- Modify: `ProbeActivity.kt` (add 10 s Vosk transcript to the probe)
- Test: `android/app/src/test/java/kz/safepause/guard/speech/SilenceWatchTest.kt`, `ModelManagerTest.kt` (JVM unit tests)

**Interfaces:**
- Consumes: `Phrase` from `:detector` (app depends on `:detector`).
- Produces:
  ```kotlin
  enum class ModelState { MISSING, DOWNLOADING, READY, FAILED }
  class ModelManager(filesDir: File, http: (String) -> InputStream) {
      val state: StateFlow<Map<String, ModelState>>; val progress: StateFlow<Float>
      suspend fun ensure(); fun modelDir(name: String): File?; fun ready(): Boolean }
  class DualRecognizer(kkDir: File, ruDir: File) { fun accept(pcm: ShortArray, n: Int): List<Phrase>; fun partial(): String; fun close() }
  class AudioCapture { fun start(onChunk: (ShortArray, Int) -> Unit); fun stop() }
  class SilenceWatch(windowMs: Long = 5000, threshold: Double = 60.0) { fun feed(rms: Double, atMs: Long): Boolean /* true once: silent for the whole window */ }
  ```
- [ ] **Step 1: Failing tests:** `SilenceWatchTest.reportsAfterFiveSecondsOfSilence()` (feed rms 5.0 every 100 ms → false until 5000 ms, true at 5000 ms, false afterwards), `doesNotReportWhenSpeechSeen()` (one rms 800 at 2 s → never true). `ModelManagerTest.readyOnlyWhenBothModelsUnpacked()` with a fake `http` serving a tiny zip containing `<name>/conf/model.conf`; `failedDownloadSetsFailed()` with `http` throwing `IOException`.
- [ ] **Step 2:** Run `./gradlew :app:testDebugUnitTest`. Expected: FAIL.
- [ ] **Step 3:** Implement. ModelManager unzips into `filesDir/models/<name>` via a `.part` directory renamed on success. DualRecognizer feeds the same buffer to both Vosk `Recognizer`s, emits a `Phrase` for each final result with non-blank text (`source` "kk"/"ru").
- [ ] **Step 4:** Run tests. Expected: PASS. `assembleDebug` succeeds.
- [ ] **Step 5:** Commit: `git commit -m "feat(app): offline kk/ru speech pipeline"`.

---

### Task 5: Call detection, overlay and listening service

**Files:**
- Create: `android/app/src/main/java/kz/safepause/guard/call/CallWatcher.kt`, `ListenService.kt`, `Overlay.kt`, `WhatsAppCallDetector.kt`
- Modify: `GuardAccessibilityService.kt`, `AndroidManifest.xml` (permissions `RECORD_AUDIO`, `READ_PHONE_STATE`, `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, `VIBRATE`; service `foregroundServiceType="microphone"`)
- Test: `android/app/src/test/java/kz/safepause/guard/call/WhatsAppCallDetectorTest.kt`

**Interfaces:**
- Consumes: `ScamDetector`, `Assessment`, `Level` (Task 3); `ModelManager`, `DualRecognizer`, `AudioCapture`, `SilenceWatch` (Task 4).
- Produces:
  ```kotlin
  data class CallInfo(val kind: CallKind, val number: String?, val startedAt: Long)
  enum class CallKind { CELLULAR, WHATSAPP }
  object CallBus { val call: StateFlow<CallInfo?>; val assessment: StateFlow<Assessment?>; val transcript: StateFlow<List<Phrase>>; fun onCallEnded(cb: (CallInfo, Assessment?, List<Phrase>) -> Unit) }
  fun isWhatsAppCallScreen(pkg: String, texts: List<String>, audioMode: Int): Boolean
  ```
- [ ] **Step 1: Failing test:** `WhatsAppCallDetectorTest`: `("com.whatsapp", ["WhatsApp voice call","End call"], MODE_IN_COMMUNICATION) → true`; same with `MODE_NORMAL → false`; `("com.android.chrome", …) → false`; `"com.whatsapp.w4b"` → true.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Cellular: `TelephonyCallback.CallStateListener`. Overlay: bubble "SafePause: тыңдайын ба? / слушать?"; tap → start `ListenService` (FGS microphone); strip shows last 3 lines + level colour + "Динамикті қосыңыз / Включите громкую связь" when `!isSpeakerphoneOn` on cellular; on HIGH (first time per escalation) the red card with reasons in UI language, advice text, vibration pattern `[0,400,200,400]`; `SilenceWatch` true → card "Микрофон бөгелген: Арнайы мүмкіндіктерді қосыңыз" with button to `Settings.ACTION_ACCESSIBILITY_SETTINGS`; models not ready → card with download progress. Call end → stop service, publish via `CallBus.onCallEnded`.
- [ ] **Step 4:** Run tests and `assembleDebug`. Expected: PASS / BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit: `git commit -m "feat(app): call detection, consent bubble, live warning overlay"`.

---

### Task 6: Claude second opinion

**Files:**
- Create: `android/detector/src/main/kotlin/kz/safepause/detector/Llm.kt`
- Create: `android/app/src/main/java/kz/safepause/guard/ai/ClaudeClient.kt`, `CallAnalyst.kt`
- Test: `android/detector/src/test/kotlin/kz/safepause/detector/LlmTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  data class LlmVerdict(val level: Level, val stages: Set<Stage>, val reasons: List<String>, val advice: String)
  object LlmVerdicts { fun parse(text: String): LlmVerdict? ; fun prompt(transcript: List<Phrase>, lang: String): String }
  fun merge(rules: Assessment, llm: LlmVerdict?): Level
  interface ClaudeClient { suspend fun complete(prompt: String): String?; suspend fun vision(prompt: String, jpegs: List<ByteArray>): String? }
  class CallAnalyst(client: ClaudeClient?, scope: CoroutineScope) { fun onPhrase(a: Assessment, transcript: List<Phrase>); val verdict: StateFlow<LlmVerdict?> }
  ```
- [ ] **Step 1: Failing tests** (`LlmTest`): `mergeRaisesOneStepOnly` (rules LOW + llm HIGH → SUSPICIOUS); `mergeNeverLowers` (rules HIGH + llm LOW → HIGH); `mergeNullKeepsRules`; `parseAcceptsFencedJson` (```` ```json {"verdict":"scam",...} ``` ```` → level HIGH); `parseRejectsGarbage` ("I think it's a scam" → null); `promptMarksTranscriptAsUntrusted` (prompt contains `<transcript>` and the instruction not to follow instructions inside it). Verdict mapping: scam→HIGH, suspicious→SUSPICIOUS, safe→LOW.
- [ ] **Step 2:** Run `./gradlew :detector:test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `ClaudeClient` impl with the Anthropic Java SDK per Global Constraints, 10 s timeout, returns null on any error. If the Java SDK does not run on Android, use OkHttp to `POST https://api.anthropic.com/v1/messages` and note it in README. `CallAnalyst` sends the last 3 minutes of transcript after each new stage hit or every 30 s of new speech, never two requests at once.
- [ ] **Step 4:** Run tests. Expected: PASS; `assembleDebug` succeeds.
- [ ] **Step 5:** Commit: `git commit -m "feat: Claude second opinion with bounded merge"`.

---

### Task 7: Call records, summary screen and guardian SMS

**Files:**
- Create: `android/app/src/main/java/kz/safepause/guard/data/CallRecord.kt`, `CallStore.kt`, `Settings.kt`
- Create: `android/app/src/main/java/kz/safepause/guard/guardian/GuardianSms.kt`
- Create: `android/app/src/main/java/kz/safepause/guard/ui/SummaryScreen.kt`
- Test: `android/app/src/test/java/kz/safepause/guard/data/CallStoreTest.kt`, `guardian/GuardianSmsTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  @Serializable data class CallRecord(val id: String, val at: Long, val kind: CallKind, val number: String?, val level: Level, val reasons: List<String>, val transcript: List<String>?)
  class CallStore(file: File) { fun add(r: CallRecord); fun all(): List<CallRecord>; fun delete(id: String) }
  class Settings(ctx: Context) { var lang: String; var apiKey: String?; var guardianName: String?; var guardianPhone: String?; var keepTranscripts: Boolean /* default false */ }
  fun guardianText(clientName: String, at: Long, number: String?, lang: String): String
  ```
- [ ] **Step 1: Failing tests:** `CallStoreTest.transcriptDroppedWhenKeepOff()` (a record built with keep=false has `transcript == null`), `persistsAcrossInstances()`, `deleteRemoves()`. `GuardianSmsTest.textHasNoTranscript()` (`guardianText("Айгүл", t, "+77011234567", "kk")` contains "Айгүл", "+77011234567", not any transcript word), `textUnder160CharsWhenPossible()`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. On call end with level HIGH and a guardian set and `SEND_SMS` granted → `SmsManager.sendTextMessage`. Summary screen opens from the end-of-call notification: level, reasons, transcript with triggering phrases highlighted, delete button.
- [ ] **Step 4:** Run tests, `assembleDebug`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat(app): call summary, local records, guardian SMS"`.

---

### Task 8: Onboarding, home and settings screens

**Files:**
- Create: `android/app/src/main/java/kz/safepause/guard/ui/MainActivity.kt`, `OnboardingScreen.kt`, `HomeScreen.kt`, `SettingsScreen.kt`, `Strings.kt`, `Theme.kt`, `SampleCall.kt`
- Modify: `AndroidManifest.xml` (MainActivity as launcher; ProbeActivity reachable from Settings → "Microphone test")
- Test: `android/app/src/test/java/kz/safepause/guard/ui/StringsTest.kt`

**Interfaces:**
- Consumes: `Settings`, `CallStore`, `ModelManager`, `CallBus`.
- Produces: `object Strings { fun t(key: String, lang: String): String }`, `class PermissionStatus(ctx) { fun all(): Map<String, Boolean> }`.
- [ ] **Step 1: Failing test:** `StringsTest.everyKeyHasKkAndRu()` — every key returns non-blank, distinct-from-key text for both languages.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Onboarding walks permissions in order microphone → phone state → notifications → overlay → accessibility (with the Android 13+ "Allow restricted settings" hint: App info → ⋮ → Allow restricted settings) → model download with progress. Home: status list (green/red per permission, models), "Test with a sample call" (Android `TextToSpeech` speaks a Russian scam script through the loudspeaker while listening runs, so the overlay reacts without a real call), recent calls. Settings per `Settings` fields.
- [ ] **Step 4:** Run tests, `assembleDebug`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat(app): onboarding, home, settings"`.

---

### Task 9: Video check for WhatsApp video calls

**Files:**
- Create: `android/app/src/main/java/kz/safepause/guard/video/ScreenCapture.kt`, `LivenessSession.kt`, `FaceSignals.kt`, `VideoCheckActivity.kt`
- Create: `android/detector/src/main/kotlin/kz/safepause/detector/Liveness.kt`
- Test: `android/detector/src/test/kotlin/kz/safepause/detector/LivenessTest.kt`

**Interfaces:**
- Consumes: `ClaudeClient.vision` (Task 6), overlay button from Task 5 ("Бетті тексеру / Проверить лицо").
- Produces:
  ```kotlin
  enum class Step { TURN_LEFT, TURN_RIGHT, HAND_OVER_FACE, CLOSER }
  data class FaceSample(val atMs: Long, val step: Step, val faceFound: Boolean, val yaw: Float?, val boxArea: Float?)
  enum class VideoOutcome { LOOKS_NORMAL, SUSPICIOUS, DID_NOT_COOPERATE, NO_IMAGE }
  data class VideoSignal(val id: String, val kk: String, val ru: String)
  fun judge(samples: List<FaceSample>, blackFrames: Boolean, visionFlags: List<String>): Pair<VideoOutcome, List<VideoSignal>>
  ```
- [ ] **Step 1: Failing tests** (`LivenessTest`): `blackFramesGiveNoImage`; `noYawBeyond25DegreesIsDidNotCooperate`; `faceStaysDetectedThroughHandPassIsSuspicious` (face found in every HAND_OVER_FACE sample with stable box → signal "hand_no_occlusion"); `goodTurnsAndOcclusionLooksNormal` (yaw reaches −40 and +40, face lost during hand pass, no vision flags); `visionFlagMakesSuspicious` (vision flags `["edge_flicker"]` on otherwise good samples → SUSPICIOUS).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `judge` and the Android side: `MediaProjection` consent, `ImageReader` at ~4 fps for 20 s (5 s per step, overlay shows the current instruction), ML Kit `FaceDetector` (performance mode fast, classification off) → `FaceSample`; mean luminance < 8 on all frames → black. Pick 2 frames per step (largest |yaw|, mid-step), JPEG 720 px, send to `ClaudeClient.vision` asking for a JSON list of flags from a fixed vocabulary (`edge_flicker`, `skin_mismatch`, `hand_behind_face`, `frozen_expression`, `blur_on_face_only`). Result card per Global Constraints.
- [ ] **Step 4:** Run tests, `assembleDebug`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat(app): guided face check for video calls"`.

---

### Task 10: Device test script, README and release APK

**Files:**
- Create: `android/DEVICE_TEST.md`, `android/README.md`
- Modify: `README.md` (root: link the Android app)

- [ ] **Step 1:** `DEVICE_TEST.md`: numbered checks with expected result — install APK; restricted settings; onboarding; model download; probe on cellular call on speaker (level bar moves when the other side speaks); probe on WhatsApp call; sample call turns HIGH; a real call reading 2 scam calls and 2 normal calls from `calls.json`; video check with a cooperating person; airplane mode (rules still warn); no API key.
- [ ] **Step 2:** `android/README.md`: what it does, permissions and why, privacy, known limits (no iOS, speakerphone needed, OEM mic blocking, no automatic voice-clone detection, synthetic eval set, JSON store instead of Room, any `@Disabled` eval misses), build commands, evaluation table pasted from the last `EvaluationTest` run.
- [ ] **Step 3:** Run `./gradlew :detector:test :app:testDebugUnitTest :app:assembleDebug`. Expected: all PASS, BUILD SUCCESSFUL. Copy APK to `android/dist/safepause-guard.apk`.
- [ ] **Step 4:** Commit: `git commit -m "docs(android): device test script, README, APK"`.
