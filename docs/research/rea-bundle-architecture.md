# REA bundle-graph analysis — the reference client's module structure

**Date:** 2026-10-18
**Surface:** `https://servicedesk-simulator.com/` shipped client assets, analysed
as a local directory rather than in a browser (`PhoneCallSimulation.js`,
`auth-shell.js`, `it-support-simulator.js`, `sim-data.js`, `workflow-suite.js`).
**Run:** `rea analyze-javascript-application` — static reconstruction, graph
schema `JavaScriptApplicationGraph`, **818** semantic nodes (module nodes plus
bound import/export relationships).
**Evidence:** `ev_c4e1e4d9029bc1a051e544ec769789ff948a4596dd6b6c5bdae1188c710725ee`,
target digest `c1bc32f8ac500cc0976492e396ece90b2499dcd27d08d207a20f00a3877273ab`,
graph manifest `agm_fb5f9fcf464d79b15af44306f11a3966b451a0725ab11c0df3db4551fe6e535c`.
Companion to [rea-session-observation.md](rea-session-observation.md) (what one
ticket actually does) and [rea-gap-analysis.md](rea-gap-analysis.md) (what to
build). This note is about **structure only**.

---

## 1. Method and what this can and cannot prove

The analysis is static: it reconstructs modules and the imports and exports bound
between them. It executes nothing, renders nothing, and opens no network
connection.

| It can establish | It cannot establish |
|---|---|
| Which module declares a given binding | Whether that code path is ever reached |
| Which modules import from which | What the learner sees, in what order |
| That two features share a module (or do not) | How scoring, gating, or pricing behave |
| The data a fixture module carries | Whether that data is what the live app uses |

Two retention facts, because they decide how much weight the IDs above carry:

- The REA provider connected to this workspace reports **0 retained records** —
  its complete bundle is empty, so `get_evidence_bundle` cannot re-inspect the
  evidence id, and no `agm_*` manifest was found in this workspace, the home
  directory, or the temp tree. The findings below are transcribed from the run
  output; the IDs and digest are recorded so a later run can be matched against
  them rather than trusted by description.
- Nothing here replaces a rendered observation. Where the earlier session
  observation and this graph disagree, the rendered one wins.

---

## 2. What the graph places in each module

| Module | Bindings the graph puts there | Class |
|---|---|---|
| `workflow-suite.js` | The **module hub**: the Active Directory controller (minified `To` / `No`), the speech-synthesis dispatchers (`wn`, `Qo`, `Zo`), and the notification and ticket state managers | In graph |
| `auth-shell.js` | The fake Windows 11 desktop (`sx`): the window manager (`windowPositions`, `win11ActiveApp`, `win11OpenApps`), the CMD prompt handler, the Wi-Fi tray, the printer installer, and the BitLocker recovery interface | In graph |
| `PhoneCallSimulation.js` | The dual-engine speech coordinator: `SpeechRecognition` plus a VAD `MediaRecorder`, feeding Cloud Functions `callDialogue` and `transcribeAudio` | In graph |
| `sim-data.js` | The fixed fixture set: 88 domain users with group memberships and OU paths, plus fallback ticket dialogue | In graph |
| `it-support-simulator.js` | App entry and the surfaces around the tools; no tool logic was attributed to it by this run | In graph (placement only) |

The structural point is the first row. In the reference, the directory controller
does not live in a directory module: it shares a chunk with speech synthesis and
the notification and ticket-state managers. Tool logic is not separated by
domain, it is bundled by when it was written.

---

## 3. What this changes for our build

1. **Calls are cloud-backed speech, not a local prompt engine.**
   `callDialogue` and `transcribeAudio` are Cloud Functions behind
   `SpeechRecognition` and a VAD recorder. Our planned call mode is a text,
   turn-based exchange with no service and no keys; that non-goal
   (`docs/architecture.md` §1) now has a concrete contrast to name instead of a
   guess, and we should not describe our call mode as voice parity. Whether
   `callDialogue` generates turns or only transcribes them is **not** established
   by this run — do not design against either reading.
2. **One hub is not a design to adopt.** Our consoles are domain projections
   rendered by one shared pane (`domain/environment/console.ts`). The reference's
   single workflow chunk is what a growing app looks like when nothing is
   separated; copying it would buy us nothing and cost the boundary tests we
   already have.
3. **The fake desktop is a real window manager.** Per-window positions and an
   open-app set live in their bundle, which matches what our `FakeDesktop`
   already keeps in component state, and our workspace split ratio is the same
   idea applied to panes. No change.
4. **Their directory is a fixture; ours is generated.** 88 fixed users with
   group memberships and OUs sit in `sim-data.js`, which is why their account
   list never varies between attempts. Our directory is projected from the
   seeded world, and its fixture in tests is small on purpose. This is a
   deliberate difference, not a gap.
5. **Still no copying.** Chunk contents, minified binding names, fixture data,
   and UI copy remain off-limits; this note records structure only.

---

## 4. The outstanding steps, and the commands that actually run them

The run left four follow-ups. One of them is paired with the wrong artifact:

| Step | As reported | What it needs |
|---|---|---|
| Trace module imports | `trace-web-module-imports <manifestPath> <index>` against the `agm_…` graph manifest | The command takes an **`export-web-scripts` manifest**, not the graph manifest. Per-script import tracing starts with `rea export-web-scripts` (which needs the retained capture), then the script index. Projecting the existing graph is `rea inspect-analysis-view <analyze-json>` instead. |
| Observe a live session | `observe-web-session http://127.0.0.1:9222 …` | Chrome relaunched with `--remote-debugging-port=9222` and a signed-in session; the target id comes from `rea list-browser-targets` |
| Capture network during a ticket | `observe-web-execution …` | The same CDP attachment |
| Read inline script sources | `inspect-web-page --include-script-sources` | The same CDP attachment, with script ids |

At the time of the reported run none of the four could run from this repository:
`rea doctor` reported no clients or providers attached and the connected REA
provider retained no capture, and there was no export manifest here to trace
against. The CLI is installed locally (`rea` 6.5.0), and §5 records the CDP
window started afterwards — so what remains is a sign-in, not a setup step.

---

## 5. The session armed here (2026-10-18)

Following this run, a CDP-attached browser was started on this machine and one
capture was taken from it. Both are recorded because they change the class of one
earlier claim.

| Step | Evidence | Result |
|---|---|---|
| `list-browser-targets http://127.0.0.1:9222` | `ev_a30585e67d14ebef380909cc90982318aca50d8158795495c11cb02b82730c57` | Chrome 155.0.8059.80, one page target on `https://servicedesk-simulator.com/login` |
| `observe-web-execution … --observation-ms 8000` | `ev_350bf98547268545dc549ef846520fa54de29a035a5470aa9d3a01875b5ed620` | 10 scripts with block coverage, captured |

The browser runs on a **dedicated profile** (`%LOCALAPPDATA%\Temp\rea-chrome`)
with `--remote-debugging-port=9222`, not the learner's default profile: since
Chrome 136 the flag is refused on the default profile (the browser's behaviour,
not a test of this machine), so an attachable Chrome is necessarily a second one.
The trade is that it starts signed out, which is why this window sits on `/login`.

The execution capture served exactly the modules the static run described, with
content-hashed names — `workflow-suite-BK3ih94Q.js`, `auth-shell-C0TuiFOS.js`,
`sim-data-gFt7-uKU.js`, `it-support-simulator-BNK14u_Q.js` — alongside
`app-shell`, `react-vendor`, `firebase-app`, `firebase-auth`, and
`sentry-vendor`. It also fetched `browser.sentry-cdn.com/10.63.0/replay.min.js`
at runtime.

That last line **upgrades** a claim from [rea-gap-analysis.md](rea-gap-analysis.md)
§3.7: Sentry replay was previously inferred from a vendor bundle's name. It is
now observed loading in production. It still does not prove a replay is recorded
or uploaded for a given session, only that the library is shipped and requested.

The full platform spec that followed this analysis is checked claim by claim in
[reference-spec-verification.md](reference-spec-verification.md): its file
registry matches the served bytes exactly, most subsystem details are supported
by literals in those files, and six details (SPF/DKIM/DMARC inspection, SMTP NDR
codes, the `SD-CORP` naming rule, STAR, `ap-lobby`, the 88-account count) are
not in the bytes anywhere.

---

## 6. What is still unobserved

- Whether `callDialogue` authors caller turns or only transcribes speech.
- Which module scores an attempt: this run's summary named no evaluator or
  scoring binding, so the scoring path is not identified here at all.
- Whether the directory controller's actions are gated or priced — the earlier
  ticket observation says priced, this graph says only where the code lives.
- Anything about the rendered call UI, voicemail, or the interview mode.

Each needs a signed-in session in the attachable window. Until one exists, these
stay questions rather than design inputs.
