# Demonstration provenance

The workflow videos and screenshots are actual captures of the new standalone AuraScript desktop application. They use only the checked-in public fixture copied to a temporary Git repository and a separate test profile.

`source-workflow.mp4` is produced by `tests/electron-acceptance.cjs` during the source acceptance journey. `packaged-workflow.mp4`, when present, comes from the same runner launching the built release executable. Frames come from the running Electron window's `webContents.capturePage()`; FFmpeg encodes those native frames. Frame timestamps and target sampling rate are recorded in each run's `test-results/electron-*/recording.json`.

The demonstration verifies real file saves, diagnostics, reviewed changes, terminal/Git behavior, local records, and appearance. Its provider failure is intentionally triggered using an unreachable loopback endpoint. It is not a prerecorded successful AI answer. Separate Ollama inference evidence is summarized in [verification](../VERIFICATION.md).

The headless runner denies microphone permission and native notification display. Physical audio and operating-system notifications require the manual device checks in [the testing guide](../MANUAL-TESTING.md).

October 5 source and packaged recordings are regenerated from the expanded19-group actual desktop journey. Exact frame counts and capture wall time are in `test-results/electron-source/acceptance.json` and `test-results/electron-packaged/acceptance.json`. They establish visual/functional evidence rather than a rendering performance benchmark.
