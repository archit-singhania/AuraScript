# Manual testing and expected results

Use a new test folder rather than a personal project for your first run. The checked-in `test-fixtures/workspace` is public, invented data that can be copied for this purpose. Save all normal work before exercising interruption or external-file conflicts.

## Start and prepare

From the repository root, run `npm ci`, `npm run doctor`, and `npm start`. The editor opens without a Wednesday or Jarvis server. On first use, there are no invented workspaces, assistant conversations, memories, or Git commits.

Copy `test-fixtures/workspace` into a separate writable directory and initialize Git there:

```powershell
git init
git config user.name "Public Acceptance Fixture"
git config user.email "fixture@example.invalid"
git add .
git commit -m "Public fixture baseline"
```

Run those Git commands inside the copied fixture directory. They configure only that test repository. Open the copy with **Open a workspace** in AuraScript's top bar.

Expected: the Explorer shows real fixture folders and files, the status bar says the workspace is connected, and the selected folder appears among recent workspaces. Cancelling the native picker leaves the previous workspace intact.

## Files, editor, and recovery

1. Expand `src` and open `main.py`. Open `settings.json` as a second tab. Switch between them.
2. Change the printed text in `main.py`, then press **Ctrl+S** or click **Save changes**. Read the actual file in another application.
3. Use **Create file or folder** in the Explorer. Create `scratch.txt`, edit it, and save. Try creating `scratch.txt` again.
4. Change `settings.json` to invalid JSON such as `{"enabled": }`. Open **Problems** from the bottom panel and select the diagnostic.
5. Restore valid JSON and save. For Python, temporarily type `def broken(:` into `main.py`, observe the syntax diagnostic, then restore the valid code.
6. Edit a file without saving, close its tab, and choose **Keep editing**. Try closing the native window and choose **Keep editing** again.
7. With `main.py` open, modify it from a second application. Attempt to save the old editor buffer. Choose **Compare** in the conflict banner.
8. Inspect **Editor buffer** and **Current disk version**. Choose the disk version, or explicitly keep the buffer on the latest revision and save after review.
9. Use the file's action menu to rename a saved scratch file. Move it to recoverable trash, then open **Restore deleted files** and restore it.
10. Close and relaunch AuraScript after saving. Reopen the workspace if necessary.

Expected: tabs preserve independent buffers; saved bytes match the editor; duplicate creation never truncates an existing file; real diagnostics point at the current text; Keep editing preserves both the window and backend operations. External changes block a stale save until reviewed. Restoring trash refuses to replace an existing destination. Recent workspaces, saved tabs, and persistent settings survive relaunch.

Missing Python produces an explicit unavailable-diagnostics message. Unsupported binary or oversized files fail visibly. A failed save does not show a success notification.

## Search, replace, and commands

Open **Find in workspace** and search for `AURA_FIXTURE_TOKEN`. Inspect the result's source location. Enter a replacement, select the intended matches, and choose **Replace selected**. Review the affected files before confirming.

Expected: the actual source text changes only after confirmation. A concurrent external edit rejects the outdated replacement. Ignored generated folders and binary files are excluded; bounded searches state when results are truncated.

Open **Search commands** in the top bar or use **Ctrl+K** / **Ctrl+Shift+P**. Search for Preferences, Terminal, or a file action. Choose a command with the keyboard, then dismiss the palette with Escape.

Expected: the command activates its real interface, keyboard focus remains visible, and Escape closes the palette without running an action.

## Terminal and workflows

Open **Terminal** in the bottom panel. Run `git --version`; inspect and confirm the exact command and working directory.

Expected: output arrives from the actual process, followed by its exit code. A process launch error or nonzero exit remains failed rather than successful.

Run `node scripts/long-process.cjs` from the copied fixture and press **Stop**. Expected: its heartbeat stops and its saved status becomes cancelled. Starting another command still works.

Open **Workflows**, create a workflow containing `git --version`, save, and relaunch. Review and run it. Expected: the saved command remains visible, execution requires explicit confirmation, actual terminal output appears, and the activity receipt records the result. Deleting a workflow requires an explicit action and does not run its command.

Terminal commands run with your account's ordinary operating-system permissions. Use only commands you understand and intend to execute.

## Git

Open **Source control** after saving a fixture edit. Inspect its actual diff, stage the changed file, and create a checkpoint with a clear commit message. Inspect the new entry in history and its diff.

Expected: `git log -1` in the copied fixture shows the same commit. Stage and unstage affect actual Git index state. An empty staging area cannot create a fake checkpoint. Opening a non-Git folder or a repository subfolder reports that the repository root is required.

## Local assistant records

Open **Memory & reminders** and create a clearly labeled test memory. Edit its value, relaunch, and inspect the saved text. Disable or delete it when finished.

Create a reminder for a few minutes in the future in an explicit IANA timezone, such as `Asia/Kolkata`. Check the displayed due instant. When due, inspect its actual due state, then complete or cancel it. Invalid timezone names and nonexistent local daylight-saving times must fail clearly.

Expected: memories and reminders survive restart, and only enabled memories become assistant context. Native notification delivery depends on operating-system settings and is a separate device check; the persisted due state can be inspected without claiming a notification was displayed.

Open **Knowledge**, import a supported text file or paste labeled fixture text, then search for a distinctive phrase. Inspect the source excerpt, and delete the test document.

Expected: retrieval points to the actual saved source and states its lexical method. Deletion removes it from results. An empty query or unsupported upload does not become a fabricated source.

## Real assistant, review, and patches

Open **Preferences** and select an installed local Ollama model and endpoint. Use **Provider health** to verify it. Send a short prompt. Observe streamed text, then ask a longer question and press **Stop**.

Expected: provider text arrives incrementally; Stop interrupts the active request; the conversation stores its completed, failed, or cancelled status. Missing models, invalid endpoints, unavailable servers, and missing cloud keys produce readable errors. There is no timer-based success or canned substitute response.

Open a file and select code. Choose **Attach selected code or current file**, switch assistant mode to **Code review**, and submit a focused question. Expected: the visible context identifies the selected source; the review cites it and does not execute commands.

Switch to **Propose a patch**. Request a small change to a selected file. Review each proposal's before/after text and target. Preview it and approve only a change you want. Modify the target externally between preview and apply to test rejection.

Expected: generating or previewing a proposal does not modify disk. Applying a reviewed matching proposal changes the real file. A stale revision, missing original text, duplicate ambiguous original text, or path outside the workspace is rejected. If a model returns no valid proposal, the UI states that rather than claiming a patch was applied.

Open **Conversations**, search for the test prompt, reopen it, rename it, and delete it after stopping any active response. Expected: the stored transcript matches actual provider events and local actions.

The automated runner deliberately uses an unreachable loopback provider for its failure check. A separate real Ollama verification record is available in [VERIFICATION.md](VERIFICATION.md). This does not establish cloud, voice, or vision acceptance.

## Voice and selected images

Configure a supported transcription provider before recording. Choose **Record speech**, approve microphone access, say a short sentence, stop, and inspect the transcript. Test denied microphone permission. If spoken playback is available, play the response and interrupt it.

Expected: the input meter reflects actual microphone activity; captured audio is finalized before transcription; permissions and missing engines produce clear errors. Playback is actual speech, and Stop cancels queued playback. These checks require physical devices; a headless test cannot prove them.

Configure a vision-capable model, choose **Analyze a selected image**, select a public test image in the native picker, and ask about it. Cancel the picker and try an invalid file separately.

Expected: only the explicitly selected image is submitted; unsupported models, invalid images, oversized data, or absent keys fail visibly. AuraScript does not automatically capture your display or other applications.

## Export, import, and appearance

In **Preferences**, export the local data and inspect the downloaded JSON. It is labeled `format: "aurascript"` with `version: 1`. Preview importing that export, inspect counts and warnings, then confirm.

Expected: existing records and settings remain intact, imported records receive new identifiers, imported reminders begin cancelled, and workflows still require confirmation. Provider keys, unrestricted workspace paths, terminal processes, and retained files are excluded. Unsupported versions and malformed files are rejected.

Switch among light, dark, and system themes. Change editor font size and motion/transparency preferences. Relaunch. Use keyboard navigation, enlarge text, and resize the window to its minimum supported size.

Expected: settings persist; the editor stays readable; important content and controls remain available; reduced motion removes decorative transitions and reduced transparency removes blur. The assistant can be toggled in compact layouts. Actual screenshots are linked from [VERIFICATION.md](VERIFICATION.md).

## Record your result

For each tested path, record the platform, app version, provider/model if any, expected result, actual result, and whether it passed. Include a screenshot or structured receipt when useful. Keep keys, normal account data, and private source out of portfolio evidence.

All twenty capabilities map to [CAPABILITIES.md](CAPABILITIES.md). A successful source test does not replace a packaged relaunch, install check, native permission check, or live-provider check.
