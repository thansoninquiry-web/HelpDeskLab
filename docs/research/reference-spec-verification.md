# Reference platform spec — what survives a check

**Date:** 2026-10-18
**Source checked:** the platform architecture summary produced by
`rea analyze-javascript-application` (global evidence
`ev_1674adc8af2854535eaaee4b0768d05fbb8ad7321c24f592670792e3cdc2c161`,
root digest `ebb91200e4bf838db4df3b221fd1a5a6f86e5d158fae2c94dd6fbb173803d304`).
**Method:** fetch every file the spec names from the public deployment, then grep
the served bytes for each claimed identifier. No execution, no sign-in, nothing
changed on the target.
**Companions:** [rea-bundle-architecture.md](rea-bundle-architecture.md) (module
graph and the live CDP session), [rea-gap-analysis.md](rea-gap-analysis.md) (what
to build), [rea-session-observation.md](rea-session-observation.md) (behaviour).

The spec arrived as a finished document; this note is the check on it. The short
version: **the file registry is real and exact, most subsystem claims are
supported by literals in those files, and six details are not in the bytes
anywhere.** None of the unsupported details changes a decision, but they should
not be repeated as fact.

---

## 1. The registry holds up

Every JavaScript file the spec lists resolves on the public deployment, and every
byte count matches its table (the `package.json` row was not fetched):

| File | Claimed | Served | Result |
|---|---|---|---|
| `ServerRoomPanel-BnsE39qI.js` | 32.7 KB | 32,787 B | match |
| `DeploymentModule-Bq3M-9Lf.js` | 170.7 KB | 170,779 B | match |
| `MailAdminPanel-2Xlwm7BA.js` | 25.7 KB | 25,735 B | match |
| `MailSecurityPanel-CHq8I0Ez.js` | 6.1 KB | 6,133 B | match |
| `ShipManagerPanel-Nf-rjEZQ.js` | 20.7 KB | 20,742 B | match |
| `MockInterviewPanel-D50THp5B.js` | 86.4 KB | 86,414 B | match |
| `VoicemailModal-D7aPL8cE.js` | 11.9 KB | 11,975 B | match |
| `TeacherDashboardModal-CnDZTRy8.js` | 17.4 KB | 17,436 B | match |
| `LiveMode-BsyAIAbY.js` | 16.0 KB | 16,014 B | match |
| `PhoneCallSimulation-DXZmpZtL.js` | 53.3 KB | 53,309 B | match |
| `it-support-simulator-BNK14u_Q.js` | 616.1 KB | 616,166 B | match |
| `workflow-suite-BK3ih94Q.js` | 366.1 KB | 366,146 B | match |

The 15 script tags in the served entry HTML are the 15 "core bundles" the spec
claims to have covered, so the scope statement is accurate for the entry set:
`animation-vendor`, `app-services`, `app-shell`, `auth-shell`, `firebase-app`,
`firebase-auth`, `firebase-core`, `firebase-rest`, `icon-vendor`, `index`,
`react-vendor`, `sentry-vendor`, `sim-data`, `vendor`, `workflow-suite`.

Reproduce:

```bash
curl -s https://servicedesk-simulator.com/ | grep -o 'assets/[A-Za-z0-9_.-]*\.js'
curl -s -o chunk.js -w '%{http_code} %{size_download}\n' \
  https://servicedesk-simulator.com/assets/ServerRoomPanel-BnsE39qI.js
```

---

## 2. Supported by literals in the served files

| Claim | Literal found | Where |
|---|---|---|
| Rogue AP in the server room | `Gridpoint`, `GP-R4` | `ServerRoomPanel` |
| Named switch, router, DC, APs | `switch-floor1..3`, `router-main`, `dc01`, `ap-cafe`, `ap-0..3` | `ServerRoomPanel` |
| Equipment reboot action and timers | `rebootEquipment` | `ServerRoomPanel`, `it-support-simulator` |
| PXE refuses wireless | `PXE does not run over WiFi` | `DeploymentModule` |
| Asset tag doubles as machine name | `The asset tag … is the machine name AND its asset tag` | `DeploymentModule` |
| Message trace delivery states | `DELIVERED`, `FAILED`, `QUARANTINED` | `MailAdminPanel` |
| Quarantine list and sender blocklist | `mailSecurity.quarantineTitle`, `remove_blocklist` | `MailSecurityPanel` |
| Prepaid return logistics | `4400 Logistics` | `ShipManagerPanel` |
| Interview persona | `Morgan` | `MockInterviewPanel` |
| One question per turn | `Never stack questions.` | `MockInterviewPanel` |
| Fish Audio TTS with browser fallback | `speakWithFishAudio`, `isFishAudioEnabled`, `[TTS] Fish Audio module failed to load, falling back to browser TTS`, `VITE_FISH_AUDIO_API_KEY`, `ttsProxy` | `workflow-suite`, `MockInterviewPanel` |
| Cloud dialogue and transcription | `callDialogue`, `transcribeAudio` | `PhoneCallSimulation`, `workflow-suite` |
| Browser speech capture | `SpeechRecognition`, `MediaRecorder` | `PhoneCallSimulation`, `workflow-suite` |
| Voicemail → ticket | `createTicket`, `translateVoicemailTranscript` | `VoicemailModal` |
| Live competition ordering | `lastAnsweredAt` | `LiveMode` |
| Gradebook CSV export | `classroomCsv` module import, `modals.teacher.exportCsv` | `TeacherDashboardModal` |

The Fish Audio finding is worth its own line: the reference runs **paid TTS
through a `ttsProxy` Cloud Function with a daily limit and a 429 cooldown**, and
falls back to browser speech when the module fails. That is a real operating cost
and a real failure mode, and it is the clearest evidence yet that their call
practice is a cloud feature rather than a local engine.

---

## 3. Not supported by the served bytes

| Claim | What the bytes show | Reading |
|---|---|---|
| Quarantine inspects **SPF / DKIM / DMARC** headers | No `spf`, `dkim`, or `dmarc` string anywhere in the 6.1 KB panel; its strings are the quarantine list, the blocklist, and the blocked-sender toggle | **Contradicted as described.** Do not repeat it. |
| Message trace shows **`550 5.1.1 User unknown`** NDR codes | No `smtp`, `bounce`, `unknown user`, or `5.1.1` string; only the three delivery states and a failure label | Unsupported detail |
| Machine names follow **`SD-CORP-XXXX`** | No `SD-CORP`; the validation copy names a `D####` asset-tag format | Unsupported format |
| Interview scoring uses **STAR** | No `STAR method` or situation/task/action wording; the prompt strings and persona are real, the framework name is not present | Unsupported label |
| Access points include **`ap-lobby`** | `ap-cafe` and `ap-0..3` exist; `ap-lobby` does not | Partly wrong inventory |
| **88 users** in `sim-data` | The file is 302,007 B with 156 `username` keys; the count is reported by two analyses but was not counted here | Unverified number |

One scope caveat on the spec's own framing: "100% of application runtime" is a
claim about what the analysis covered, not something the bundles demonstrate.
Lazy chunks that only load behind a route would not appear in the entry manifest.

---

## 4. What changes for us

1. **Their depth is breadth, not simulation.** Twelve named consoles — racks,
   deployment bench, mail trace and quarantine, shipping, voicemail, interview,
   classroom, live competition — each a scripted panel with its own state. None of
   them models a discoverable fault the way our seeded world does. The conclusion
   in the gap analysis stands: borrow shapes, not depth.
2. **Our differentiator is unchanged and now better evidenced.** Their directory,
   network, and deployment state all live in fixtures and local component state;
   our faults are injected into a world and scored from the action log.
3. **Two shapes are cheap and worth a look** (neither is a copy):
   - **Delivery states + blocklist** — we already model `delivered`,
     `quarantined`, `blocked`, and `deferred` in
     `domain/environment/mailAdmin.ts` and `mailSecurity.ts`, so this is parity
     rather than a gap: what we lack is the *message trace query* surface around
     those states (their `FAILED` is our `blocked`/`deferred` split).
   - **One question per turn** — the interview prompt rule is a free constraint
     for our own mock interview: cap each interviewer turn at one question and
     score the drill on whether the learner answered before the next one.
4. **Nothing here is a licence to copy.** No chunk text, no panel layout, no
   prompt wording, no fixtures.

---

## 5. What this check proves, and what it does not

- **Proves:** those files ship at those exact hashes and sizes; those literals are
  present in the shipped code, which is stronger than "a chunk with that name
  exists".
- **Does not prove:** that any screen renders them, in what order, or under what
  gating. String presence is code, not behaviour — the same rule as everywhere
  else in this folder. A missing string is therefore "not supported by the
  bundle", not proof the feature is absent: minification, i18n keys, or
  data-driven labels could hide it. It is weakest for prose (STAR), strongest for
  a panel whose own strings show what it does instead (SPF/DKIM/DMARC).
- **Could not check:** the evidence id itself — the REA provider attached to this
  workspace retains **0 records**, rechecked for this run, so the spec cannot be
  re-inspected from here and rests on its own output plus these checks.
