# AuraScript motion and design collections · October 6, 2026

AuraScript now has three coordinated, persisted collections: **Amethyst · editorial**, **Lagoon · mineral**, and **Copper · atelier**. Each works in light/dark/system appearance and retains the locally bundled Manrope interface face, clear code typography and opaque editor canvas. Controls, focus rings, glass rims, the orb and selected states use the same collection roles.

Navigation reveals a new pane in 240 ms. Dialogs rise into place in 260 ms, selected-file toolbars settle in 160 ms, and actual notifications appear in 220 ms. These finite transitions use opacity/transform and leave models, scroll positions, focus, terminal processes and data intact. Steady code editing has no page entrance animation. The assistant retains message rows while streaming; incoming rows receive one short entrance and existing text avoids repeated fades. Scrolled-back transcripts remain where you are reading.

Reduce motion cancels current transitions and makes future changes immediate. Operating-system reduced motion also controls Monaco scrolling/caret behavior. High contrast selects Monaco's actual accessible themes; reduced transparency keeps the interaction layer solid. Explorer controls remain attached while file rows refresh, preserving clicks and focus during asynchronous filesystem updates. Reviewed disk-change actions return focus to the editor. Switching between terminal and diagnostics opens the requested pane consistently.

## Manual inspection

1. Launch the current source with `npm start`, or the rebuilt Windows executable/installer. Open a disposable project using the native folder picker.
2. Open Preferences and choose each Design collection. Compare light and dark. Expect mint/mineral Lagoon, warm metal Copper, and lavender Amethyst across controls and the assistant orb. Reload/relaunch: your selected collection should remain active.
3. Visit History, Knowledge, Memory and Workflows. Panels should settle quickly, without resetting saved work. Open a create/edit dialog and dismiss it with Escape. Focus should return to a useful control or editor.
4. Open two files, edit/save with Ctrl+S, switch terminal/diagnostics, stop a long process, and inspect a Git checkpoint. Actual disk bytes/output/diffs remain the functional result. Create, rename, trash and restore a test file; explorer actions remain usable as rows update.
5. Enable Reduce motion, Reduce transparency and High contrast. Repeat navigation/dialogs, enlarge editor text and use the compact layout. Motion should stop, glass should become opaque, and source-code contrast should strengthen. Also test the operating-system reduced-motion preference.

The [complete manual guide](MANUAL-TESTING.md) covers provider consent, physical audio, reminders and every capability. Current source/package counts, screenshots, exact artifacts and cleanup are recorded in [release checksums](../dist/release-checksums.json) and the workspace motion report. Packages are unsigned; reference-device frame rate and physical hardware remain separate acceptance gates.
