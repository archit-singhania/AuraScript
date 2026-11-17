# Profiling workspace

Open a saved workspace, then choose **Profiling workspace** in the navigation rail. Opening it runs no project code. Select a profiler, a saved relative entry path, JSON script arguments and a time limit. Python uses your explicitly selected installed interpreter; Node uses the application runtime. Tick workspace trust and press **Launch approved profile** to execute the program. Nothing installs dependencies automatically.

Supported measurements:

- Python CPU: standard-library `cProfile`, own/cumulative milliseconds and aggregated caller/callee relationships.
- Python memory: `tracemalloc` allocation snapshot at program exit. This measures retained traced Python allocations, not every native allocation or allocations freed earlier.
- Node CPU: native CPU samples and call tree. Durations are sampling estimates.
- Node heap: sampled V8 allocation sizes, not complete native-process memory.

For TypeScript, compile to JavaScript with a local source-map file, then profile that JavaScript entry. Supported local maps resolve hotspots to original workspace files. Missing, external or unsupported maps retain generated locations. Profiling does not compile or execute setup commands automatically.

The report provides sortable hotspots, a keyboard-expandable call view, program output and source buttons. Navigation rejects files changed since the recorded source hash. External/runtime frames have no workspace navigation. Reports retain entry/configuration hashes, runtime identification and launch settings. They survive application restart and remain isolated to the selected workspace. Opening another workspace stops its active profiler first.

Stop terminates the launched process tree. Time limits are 0.1–120 seconds; the default is 30 seconds. Cancelled runs are labelled cancelled, with the reason recorded, rather than successful. Interrupted runs become interrupted after restart. Missing interpreters and malformed reports fail visibly. Console history is capped at 256 KiB; report parsing accepts at most 32 MiB and 20,000 nodes. The UI shows the top 100 hotspots and bounds the call view to 300 frames/12 levels. Raw results are stored in the application's private profiles directory. Profiling executes trusted program code with the user's normal permissions, not in a sandbox.

## Manual acceptance

1. Save a Python file containing a named CPU-heavy function and retained allocations. Run `python-cpu` and `python-memory` using an installed interpreter. Expect measured time/bytes and source links, not simulated data.
2. Save a JavaScript program with a named slow function. Run `node-cpu`; sort own/inclusive cost, expand the call relationships and open a hotspot. Run `node-heap` with retained objects.
3. Compile a TypeScript fixture with source maps and run the generated JavaScript. Expect mapped TypeScript locations where the profile and map provide them.
4. Start a long-running program and press Stop, then repeat with a short time limit. Expect cancellation and no active registered process.
5. Reload the application. Saved results remain available, but trust must be selected again for another launch. Change a profiled source and try its old navigation link: expect a stale-source error.

## Evidence, October 29, 2026

Five profiling tests passed with real Node/Python launches: malformed input, ownership boundaries, CPU/heap measurements, TypeScript maps, stale navigation, cancellation, timeout, missing interpreter and restart recovery. The existing suite passed 55 tests with four Python checks initially skipped; the affected Python/adapter suites were then run with an explicitly selected interpreter and all 12 tests passed. Source syntax checks passed for 58 maintained files.

The source Electron UI journey passed real Node CPU launch, hotspots, saved report after reload and light/dark captures. Screenshots/receipt are under `docs/screenshots/profiling-2026-10-29`. The Windows directory package also passed the UI journey and a real Python launch through its unpacked helper; evidence is under `docs/screenshots/profiling-2026-10-29-packaged`. The package is `D:/remaining-4-git-projs/.tooling/aurascript-release-packages/profiling-release-20261029/win-unpacked/AuraScript.exe`; Authenticode reports NotSigned. Keep the complete directory together. Broader performance benchmarking, accessibility/device review and installer verification remain pending. No signing or public deployment is claimed.

Implementation references: [Python profiling](https://docs.python.org/3/library/profile.html), [tracemalloc](https://docs.python.org/3/library/tracemalloc.html), [Node profiling flags](https://nodejs.org/api/cli.html).
