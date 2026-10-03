# Portfolio evidence

AuraScript 3.0 is a standalone Electron and Monaco application with an original visual identity, offline editor workers, and twenty connected capabilities. Its local services manage real files, processes, Git, assistant history, documents, memory, reminders, and approved workflows. Cloud voice and vision use explicit provider configuration.

The Windows source and packaged applications each passed eighteen end-to-end acceptance groups with zero renderer exceptions. Thirty-five automated tests cover actual file concurrency and conflicts, recoverable deletion, Git commits, process cancellation, provider protocols, context isolation, timezones, imports, and microphone acquisition boundaries. The locked dependency audit reported zero advisories on 2026-10-03.

Actual local Qwen3 inference was checked separately: streamed text, interruption after a real text delta, and completed/cancelled messages surviving restart. The automated demonstration uses an explicitly unavailable provider for its failure path. It does not pretend that fixture responses are model inference.

CV wording supported by the recorded evidence:

- Built a standalone Electron/Monaco coding workspace with twenty integrated capabilities, original branding, adaptive themes, and offline language workers.
- Implemented revision-checked atomic saves, recoverable file deletion, reviewed AI patches, genuine Git checkpoints, and cancellable terminal processes.
- Verified thirty-five automated tests and eighteen end-to-end groups on both source and packaged Windows applications; tested live local-model streaming, interruption, and persistent sessions.

Show a save/reload, an external-edit conflict, a reviewed replacement, a real Git diff, and a cancelled process in a recruiter demonstration. Use the actual [packaged workflow recording](demo/packaged-workflow.mp4) and [screenshots](screenshots/packaged-desktop-dark.png). The [manual guide](MANUAL-TESTING.md) contains exact steps and expected outcomes; [verification](VERIFICATION.md) records artifacts and remaining gates.

Do not claim measured frame rate, production adoption, model accuracy, signed distribution, cloud transcription/vision, physical-device performance, or macOS/Linux acceptance without those checks. Public hosting remains deferred.
