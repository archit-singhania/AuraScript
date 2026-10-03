# AuraScript

AuraScript is a standalone desktop coding workspace built with Electron, Monaco, and a local persistence layer. Its glass navigation, focused editor, searchable project files, streaming terminal, Git tools, and assistant share one application. It does not require the Wednesday or Jarvis backend.

Install Node.js 22.12 or later and Git. Python 3 is optional for Python syntax checks. To enable local AI, install Ollama separately, start it, and download a model that fits your machine. Cloud models require your own provider key; unavailable providers return a visible error.

```powershell
npm ci
npm run prepare:editor
npm start
```

Open a folder, select a file, edit it, and save with Ctrl+S. The workspace owns the permission boundary: file operations are constrained to that folder, terminal processes run there only after an explicit user action, and assistant suggestions require review before changing files or running commands.

```powershell
npm test
npm run test:electron
npm run build:win
```

The Electron acceptance test uses an isolated application profile and a labeled temporary Git repository. It never opens your normal workspace or calls a paid AI provider. Release artifacts are generated in `dist/`; inspect [the verification record](docs/VERIFICATION.md) for the builds actually tested.

- [Manual testing: steps, expected results, and failure cases](docs/MANUAL-TESTING.md)
- [Twenty capabilities and acceptance criteria](docs/CAPABILITIES.md)
- [Architecture and local data boundaries](docs/ARCHITECTURE.md)
- [Provider and desktop setup](docs/SETUP.md)
- [Release instructions](docs/RELEASE.md)

AI, voice, vision, operating-system notifications, and native device behavior have explicit runtime requirements. The verification record distinguishes automated local checks from provider and hardware checks that still require a real device or account.
