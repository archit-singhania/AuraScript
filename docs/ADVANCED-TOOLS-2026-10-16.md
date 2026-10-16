# Advanced developer tools — manual acceptance

## Setup and boundaries

Use Node 22.22.2 or later for development. The Windows package bundles JavaScript tooling, Pyright, TypeScript language server, Vitest and Microsoft's MIT-licensed JavaScript debug adapter. Adapter provenance is in `src/adapters/JS-DEBUG-LOCK.json`; upstream licenses remain alongside their distributions. External helpers are unpacked into physical files so Python and adapter processes can read them.

For Python, choose an explicit interpreter in the relevant tool panel. Provision dependencies yourself in a private environment: `python -m pip install debugpy pytest coverage`. Tool startup never installs dependencies. Approve workspace trust only for code you intend to execute. Language analysis does not execute Python source; test runners and debugging do execute selected workspace code. Git must be installed for transactions.

## Five acceptance journeys

1. **Debugger:** Open a Python file containing `value = 41` and a following print statement. In Debugger choose Python, set the interpreter, save a launch configuration and a source breakpoint, then approve launch. Expect a real paused state, stack frame, variables and a watch of `value + 1` showing 42. Step, continue and terminate. Repeat with Node JavaScript. For TypeScript compile with a local source map, select the generated entry program and a TypeScript source breakpoint. Browser debugging is outside this version.
2. **Language services:** Start the Python or TypeScript service after reviewing its trust prompt. Edit a buffer without saving. Expect diagnostics for its current version, completion, hover, definition and references. Rename a symbol spanning files: changes enter editor buffers for review and explicit save. Stopping a server clears its markers and restores lightweight diagnostics. Missing interpreters/servers expose setup errors.
3. **Tests and coverage:** Select pytest or Vitest, approve trust and Discover. Select individual cases and Run; expect actual streamed outcomes and failure navigation. Python coverage requires coverage.py. Import supported coverage.py JSON or Istanbul JSON for owned files and inspect line decorations. Editing a buffer clears potentially stale decorations. Cancellation must terminate the test process, not report a pass. Unsupported runner configurations remain visible errors.
4. **Transactional changes:** Select text files and stage proposed edits, or use Stage all proposals in worktree on an assistant response. Review every diff: your main files remain unchanged. Approve a specific check command separately. Apply requires explicit approval, unchanged original revisions, clean target buffers and successful selected checks. A concurrent edit rejects application. Discard removes only the registered scratch worktree; recovery journals preserve rollback evidence. Scratch checks contain selected current edits and repository HEAD, not all unrelated uncommitted edits.
5. **Architecture:** Index the saved workspace. Python AST parsing requires explicit interpreter approval. Inspect graph or accessible list, inbound/outbound references, coupling and strongly connected cycles. Select a node to open source. Dynamic/unresolved imports are labeled; this is static analysis. Unsaved buffers are preserved and not indexed. Owned TypeScript path configuration and local inherited configuration are supported. Package references outside the scanned workspace and dynamic imports remain unresolved rather than invented.

## Visual expectations

The established glass navigation and toolbars surround readable code, variables, test output and diff surfaces. Empty, unavailable and failed operations show explicit status. Graph/list alternatives and named controls support keyboard use. Existing light/dark, contrast, reduced transparency and reduced motion preferences remain available.

## Recorded results — October 16, 2026

All 54 source regression tests passed with no skips, including inherited configuration support, using an explicitly provisioned local Python interpreter. All five new journeys passed in the unpacked Windows executable; existing packaged application regression also passed with no renderer exceptions. The package-source check matched all 104 inspected source/assets and found no private runtime entries. Individual real screenshots/receipts are in `architecture-2026-10-16`, `languages-2026-10-16`, `tests-2026-10-16`, `debugger-2026-10-16` and `transactions-2026-10-16`.

These checks cover synthetic private fixtures, real local adapters and actual process/file operations. They do not establish physical microphone, live provider, signed installer, macOS/Linux or distribution-device acceptance. The unsigned Windows installer was rebuilt successfully. Artifact SHA-256 hashes and source matching are recorded in `ADVANCED-TOOLS-2026-10-16.json`; installation on another device remains unverified.
