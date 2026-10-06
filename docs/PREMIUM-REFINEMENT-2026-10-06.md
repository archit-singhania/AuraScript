# AuraScript appearance refinement · October 6, 2026

The standalone coding workspace now uses warm pearl, plum graphite, amethyst and mint. Licensed Manrope is bundled in `src/renderer/assets/fonts/` and loads through the application's own asset protocol, with system fallbacks. The font and its SIL Open Font License are included in the Windows package.

The shared interface theme refines headings, selected tabs, tree states, badges, tonal cards, button depth and focus styling. Toolbars, navigation, dialogs and the assistant composer keep a restrained specular glass material. Monaco and terminal surfaces remain opaque. The assistant orb has a pearl highlight and deeper amethyst shading. Light/dark syntax colors align with the surrounding panels, with more readable comments and line numbers.

Reduced motion, reduced transparency, high contrast, scaling and saved appearance continue to work. A typography change does not reset existing workspaces, conversations, memory or preferences.

## Check the appearance

Launch `npm start` from this repository or the refreshed Windows package, then open a disposable project. Compare light/dark in Preferences. Expect warm near-white code content, pearl/violet chrome and a deep amethyst action in light mode; plum-graphite panels, pale labels and lavender selected states in dark mode. The assistant orb and toolbar should have coherent depth without making the editor transparent.

Open a second file, edit and use Ctrl+S; inspect the actual saved bytes. Use the command palette, file search, terminal, Git diff, memory and knowledge views to see the shared typography. At a compact window size, open and close the assistant and inspect Preferences. Enable reduced transparency, reduced motion and high contrast, then relaunch to confirm persistence. Full functional steps and provider limitations remain in [the manual guide](MANUAL-TESTING.md).

Actual package captures: [dark desktop](screenshots/packaged-desktop-dark.png), [light desktop](screenshots/packaged-desktop-light.png), [compact assistant](screenshots/packaged-compact-assistant.png), [compact preferences](screenshots/packaged-compact-preferences.png) and [accessible preferences](screenshots/packaged-accessible-preferences.png). These use explicitly labelled public acceptance fixtures.

## Verification

- **37 Node tests passed**, covering storage, revisions, IPC, providers, cancellation, jobs, Git and audio boundaries.
- **19 source acceptance groups passed**, with zero renderer exceptions.
- **19 packaged acceptance groups passed**, including actual offline Manrope loading, two-tab saves, stale-save protection, real terminal cancellation, real Git diffs, persistence, themes and relaunch.
- Windows NSIS build passed. **29 packaged runtime/asset files match source**, with zero mismatches or private entries.

The acceptance harness now focuses the selected Monaco editor before keyboard saves and establishes an actual dirty buffer before an external-write conflict. It checks real saved bytes and real Git diffs; no operation is replaced by a simulated success. This removed timing/focus ambiguity without changing application save logic.

Current installer/source archive sizes and hashes are in `dist/release-checksums.json`. The installer remains unsigned. Physical audio devices, actual OS notifications, live model/provider consent and other operating-system releases retain their manual gates. Packaged guides are a build-time snapshot; current verification is in this repository.
