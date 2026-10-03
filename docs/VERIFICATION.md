# Verification record

This file records executed checks for the new standalone repository. It does not reuse acceptance results from the earlier editor under JarvisAI.

## Recorded on 2026-10-03

| Check | Result | Evidence |
|---|---|---|
| Clean locked dependency installation | Passed, as reported by the root implementation agent | Pinned runtime and offline editor installed in this repository |
| Full dependency advisory audit | Passed: zero advisories | `test-results/dependency-audit.json` |
| Source Electron acceptance | Passed: 18 acceptance groups, zero renderer exceptions | `test-results/electron-source/acceptance.json`; final run 2026-10-03T11:06:45.762Z |
| Packaged Electron acceptance | Passed: 18 acceptance groups, zero renderer exceptions | `test-results/electron-packaged/acceptance.json`; final run 2026-10-03T11:12:27.638Z, real release executable, native Keep editing and full relaunch |
| Node service, provider, security, stream, and voice lifecycle tests | Passed: 35 tests, zero failures/errors/skips | `test-results/unit-summary.json` and `test-results/unit-tests.xml`; 19 service and 16 boundary/provider/stream/voice tests |
| Real local Ollama inference | Passed: qwen3:8b, 16 streamed deltas, 29,870 ms | `test-results/local-model.json`; actual 34 input / 17 output tokens, no model download |
| Real assistant session, interruption, and restart | Passed with qwen3:8b | `test-results/local-session.json`; 27 completed deltas, 4 persisted messages, 85 input / 28 output tokens |
| Windows release build and package inspection | Passed: final NSIS build; 27 runtime/asset files match source | `test-results/package-source-match.json`; zero mismatches and private entries; installer is unsigned |
| Physical microphone/speakers and notification delivery | Manual gate | Native devices and permissions require an actual device |
| Live paid/cloud models and cloud voice/vision | Manual gate | No paid provider calls are included in automated acceptance |
| macOS and Linux packages | Platform gate | Native build, install, and permissions still require those systems |

Automated acceptance creates a uniquely named temporary directory beneath the configured temporary directory, initializes a fixture Git repository, and uses a separate `AURA_TEST_DATA` profile. Every source or packaged run produces its own structured result and real application screenshots. Fixture text and commits are labeled public test data.

The final source journey uses visible controls for selected search/replacement, terminal launch/cancellation, staging/committing, memory creation/editing, document import/search, reminder scheduling, workflow creation/run, and provider preferences. Assertions read actual files, process exits, Git history, and saved application state. It deliberately triggers filesystem events while typing to verify that search values and Git commit drafts survive the watcher. It also verifies native **Keep editing**, reviewed stale saves/patches, import confirmation, compact layouts, accessibility preferences, and full application relaunch.

## Actual visual evidence

- [Pearl desktop](screenshots/source-desktop-light.png) and [graphite desktop](screenshots/source-desktop-dark.png)
- [Memory and reminders](screenshots/source-memory-and-reminders.png), [knowledge](screenshots/source-knowledge.png), and [workflows](screenshots/source-workflows.png)
- [Compact assistant](screenshots/source-compact-assistant.png), [compact preferences](screenshots/source-compact-preferences.png), and [accessible preferences](screenshots/source-accessible-preferences.png)
- [Actual source workflow video](demo/source-workflow.mp4)

The video consists of 108 actual Electron `capturePage` frames sampled at a target 5 fps. Its encoded duration is approximately 21.6 seconds; capture wall time was 21.997 seconds. It demonstrates labeled public fixture operations and an actual unavailable-provider error. The separately recorded Ollama tests establish live inference. No screenshot or fixture is presented as a paid provider, microphone, or operating-system notification acceptance result.

The corresponding final [packaged workflow video](demo/packaged-workflow.mp4) and [packaged pearl desktop](screenshots/packaged-desktop-light.png), [graphite desktop](screenshots/packaged-desktop-dark.png), [compact preferences](screenshots/packaged-compact-preferences.png), and [accessible preferences](screenshots/packaged-accessible-preferences.png) come from the built executable. The installed Markdown guides are a build-time snapshot; this repository contains the final release verification and visual evidence.

The packaged recording contains 91 native frames sampled at the target 5 fps, with an encoded duration of about 18.2 seconds and capture wall time of 22.258 seconds. Sampling delays can compress replay time; these videos are visual evidence, not rendering-performance benchmarks.

## Windows artifact

| Field | Recorded value |
|---|---|
| Installer | `dist/AuraScript Setup 3.0.0.exe` |
| Size | 113,930,984 bytes |
| SHA-256 | `BD19F6AA2930B14E650783DF557B85985E7FDCEB2264CC2C3A4B8301AF79D833` |
| Authenticode | `NotSigned` |
| Tested executable | `dist/win-unpacked/AuraScript.exe` |
| Artifact manifest | `dist/release-checksums.json` |

The unpacked executable passed the complete desktop journey and relaunch. Interactive installer installation/uninstallation, signing, native hardware, and other operating-system packages remain explicit manual/platform checks. These are not inferred from the packaged application result.
