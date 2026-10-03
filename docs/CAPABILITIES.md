# Capability and acceptance matrix

Themes, typography, responsive placement, motion preferences, keyboard access, and private local settings are foundations. They are additional to the twenty capabilities below. A capability is accepted only when its actual operation and failure behavior pass; a visible button alone is insufficient.

| # | Capability | Acceptance result to demonstrate |
|---|---|---|
| 1 | Project workspace and file explorer | Select a folder, navigate its real tree, and reopen the selected workspace after restart. Denied paths fail visibly. |
| 2 | File creation, rename, and safe saving | Create and save text files; duplicate creation preserves the existing file; workspace escape is rejected. |
| 3 | Persistent multi-file tabs | Open several files, switch without losing edits, and restore saved tabs on relaunch. Unsaved closing requires a decision. |
| 4 | Revision-aware edits | An external file change causes a save conflict; inspect the new disk content before deciding to reload or retry. |
| 5 | Workspace search and reviewed replacement | Search real file contents; inspect affected locations; replace selected matches with revision checks. |
| 6 | Real language diagnostics | Monaco reports supported language errors, and installed Python produces syntax diagnostics with source locations. Missing Python is stated. |
| 7 | Editor navigation and command palette | Use keyboard shortcuts, find text, select a diagnostic, and invoke palette actions without leaving the editor. |
| 8 | Streaming terminal with cancellation | Launch an explicit command in the workspace, see stdout/stderr and exit status, stop a long-running process, and preserve its receipt. |
| 9 | Git status, staging, commits, and history | Inspect actual changes, stage selected files, create a real commit, and inspect its diff. A non-Git folder does not show invented history. |
| 10 | Streaming local/cloud assistant | Select a configured provider and stream a real response. Stop cancels the request; missing model/key/network produces an error. |
| 11 | Contextual code review | Attach explicitly selected file context and ask for a review tied to the visible source. Context limits and file scope remain visible. |
| 12 | Reviewed assistant patches | Preview proposed changes with their target files and original revisions; apply only after user approval; reject stale or invalid paths. |
| 13 | Searchable assistant sessions | Create, reload, search, rename, and delete persisted sessions; failed turns remain distinguishable from successful responses. |
| 14 | Local document ingestion and retrieval | Import a selected supported text document; search stored chunks and inspect the source; delete the document and its chunks. |
| 15 | Editable memory | Create, edit, search, and delete memories, with values surviving restart. Export includes only the selected local data. |
| 16 | Timezone-aware reminders | Save a dated reminder, observe due state, complete or delete it, and reload it after restart. Invalid times/zones fail explicitly. |
| 17 | Reusable workflows and execution receipts | Save explicit workflow steps, inspect them before execution, run permitted steps, and read their persisted result or error. |
| 18 | Voice input and spoken playback | Grant microphone access, capture real speech, transcribe with an available engine, play actual speech, and interrupt it. Missing devices/providers are stated. |
| 19 | Selected image analysis | Attach an explicitly chosen valid image to a vision-capable provider and inspect its response. Invalid/oversized images and unsupported providers fail visibly. |
| 20 | Versioned data export/import | Export local sessions, memories, documents, reminders, workflows, and settings; review/import compatible data without importing secrets or replacing unrelated files. |

[Verification](VERIFICATION.md) records what has run. [Manual testing](MANUAL-TESTING.md) provides the user journey for each capability. Provider-dependent paths require the selected engine and are not advertised as successful when it is absent.
