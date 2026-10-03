# Release

Run these checks from the repository root before packaging:

```powershell
npm ci
npm run check
npm test
npm run test:app
npm run build:win
```

The Windows build creates an NSIS installer and unpacked application in `dist/`. Run Electron acceptance against the unpacked executable before installing it on a reference device:

```powershell
$env:AURA_EXECUTABLE = (Resolve-Path 'dist\win-unpacked\AuraScript.exe').Path
npm run test:app
Remove-Item Env:\AURA_EXECUTABLE
```

The test runner uses a unique copied public workspace and separate profile for every run. A packaged acceptance result does not imply that the installer is signed or that real microphone, notifications, or cloud providers have been verified.

macOS uses `npm run build:mac`; Linux uses `npm run build:linux`. Build and smoke-test on their native platforms. Signing identities, notarization, and platform-specific permission prompts require the release owner's configuration. Windows-only checks do not establish macOS or Linux acceptance.

Release source includes the main process, preload, renderer, offline Monaco bundle/workers, original icons, and declared production dependencies. Private profiles, test artifacts, model weights, provider credentials, generated environments, and normal user workspaces must remain outside the packaged application.

Record the final artifact filename, size, SHA-256, code-signing status, and matching test run in [VERIFICATION.md](VERIFICATION.md). Use the exact tested build; changing application source afterward requires a new build and rerun.

For a portfolio demonstration, use the labeled public fixture and describe what was actually measured. Good evidence includes real file saves, revision conflicts, process cancellation, Git history, persisted local records, provider failures, and a separately recorded real inference. Do not describe synthetic fixture output as provider inference or native hardware verification.
