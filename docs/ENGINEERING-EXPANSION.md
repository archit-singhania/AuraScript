# Engineering expansion acceptance — October 31, 2026

Four additions now have implemented main-process services, validated IPC, renderer workspaces and persisted records. They are not yet a verified packaged release.

## Manual checks and expected results

1. **Dependency intelligence:** open a saved workspace, choose Dependency intelligence, inspect `package-lock.json` (version 2/3), `npm-shrinkwrap.json` or pinned requirements. Expect package versions, declared licenses, relationships where available and a timestamped snapshot. Change a saved version and inspect again to see its diff. Reload retains snapshots. Advisory lookup requires explicit consent; unavailable or old results never mean safe. No install scripts run during inspection.
2. **Environment:** save an environment manifest with runtime requirements, selected Python interpreter and optional setup steps. Saving executes nothing. Approve diagnostics to see measured versions, mismatches and a fingerprint. Review and approve each exact setup command; receipts expose real output and cancellation. Do not put secrets in the manifest. Test/profile runs record the last observed environment fingerprint, which is not a fresh probe on every run.
3. **Change impact:** index Architecture and discover tests first. Enter changed saved paths, analyze, and inspect the reason for each suggested test. Approve selected tests or the full discovered suite; inspect results in Tests & coverage. Changing source after analysis rejects the old proposal. Aggregate coverage cannot prove individual-test attribution; stale, missing and dynamic dependency information is explicitly limited.
4. **Refactoring:** start the appropriate trusted language server, save buffers, enter the source file and one-based symbol position, then preview rename or request code actions. Inspect affected files and stage the reviewed proposal. Open Transactional changes for full diffs, separately approved checks and explicit apply. Dirty buffers, stale revisions, escaping paths and overlapping edits are rejected. Command-bearing actions and file create/delete/rename operations are currently unsupported and shown as unavailable. Hidden/generated source directories are excluded from snapshot capture.

## Recorded verification

- Full service regression suite: **67 passed, zero failed, zero skipped**, including actual Python, TypeScript language-server rename, Vitest selection, transaction rollback and process cancellation.
- Source syntax validation: 70 maintained files passed before the additional UI acceptance script was added.
- Source Electron acceptance passed: dependency inspection/persistence, environment save/reload, impact/refactoring empty states, no renderer errors, light/dark screenshots.
- Test command: set `AURA_PYTHON_TEST` and `AURASCRIPT_TEST_PYTHON` to the installed test interpreter, then run `node --test tests/*.test.cjs`.
- UI command: `node tests/engineering-acceptance.cjs`.

Evidence: `docs/screenshots/engineering-2026-10-31/acceptance.json`. The UI smoke test does not replace complete pointer/keyboard journeys through every feature. OSV is tested with fixtures; no live advisory query was performed. Windows directory-package smoke acceptance passed October 31; 14 source files matched the packaged archive. The executable is unsigned. Evidence is in `docs/screenshots/engineering-2026-10-31-packaged/`. Complete interactive feature journeys, updated installer, broader accessibility and performance measurement remain pending. Earlier profiling package receipts certify their historical source only.

Generated packages were moved outside the Git repository to D:/remaining-4-git-projs/.tooling/aurascript-release-packages/. The engineering package remains under engineering-release-20261031/win-unpacked/. This removes generated Electron runtime files from Source Control without modifying .gitignore. Future standard builds use the existing ignored dist directory. Historical hash receipts remain unchanged.
