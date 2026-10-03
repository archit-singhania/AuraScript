# Setup

## Development

Use Node.js 22.12 or later, npm, and Git. The repository pins Electron, Monaco, the build tools, and transitive security overrides in its lockfile.

```powershell
npm ci
npm run doctor
npm start
```

`npm ci` installs the Electron runtime and bundles Monaco and its workers locally. If installation scripts were intentionally skipped, run `node node_modules/electron/install.js` followed by `npm run prepare:editor`. The editor does not fetch a CDN at startup.

Python is optional and is used for real Python syntax diagnostics. Set `PYTHON_BIN` to the absolute interpreter path when `python` is unavailable on `PATH`. Git must be on `PATH` for source-control operations.

On machines with little free space on the system drive, choose a writable development cache directory before installing or building:

```powershell
$env:TEMP = 'D:\AuraScriptCache\temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'D:\AuraScriptCache\npm'
$env:ELECTRON_CACHE = 'D:\AuraScriptCache\electron'
$env:ELECTRON_BUILDER_CACHE = 'D:\AuraScriptCache\builder'
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
npm ci
```

Use paths appropriate to your machine. Do not point the cache at a folder containing existing project or personal data.

## Local intelligence

Install and start Ollama separately. Download a compatible model using Ollama's own tools, then select its exact model name and endpoint in Preferences. The default endpoint is `http://127.0.0.1:11434`. A model that is listed by the server may still require enough memory to run.

Use provider health to inspect availability before sending a request. AuraScript does not download model weights automatically and does not substitute an invented response when the server is unavailable.

## Cloud providers, voice, and vision

Configure only the provider you intend to use. Preferences stores a supplied key through encrypted operating-system storage when available. Environment-variable configuration remains outside exported local data. Never add a real key to the repository, a test fixture, a screenshot, or a issue report.

The application also reads `OPENAI_API_KEY` or `GROQ_API_KEY` from its launch process when no encrypted key is stored for that provider. Set these through your usual secret manager or local process environment; relaunch the application after changing them. The local Ollama path requires no cloud key.

Voice requires a real microphone and a configured speech transcription/playback capability. Vision requires a supported model and an explicitly selected valid image. A plain text-only model cannot analyze images. The interface states unavailable capabilities and reports failed operations.

Cloud requests can incur charges according to your provider account. Automated tests do not make paid provider requests.

## Application data and backups

AuraScript uses its own `AuraScriptStudio` profile and does not share the old Wednesday editor profile. Quit the application before copying `state.json` and the profile's retained-file directories. Keep backups private because they may include source excerpts and personal assistant history.

Use the versioned export/import interface for portable application data. Exports exclude provider secrets and unrestricted absolute workspace paths. A preview identifies the data that will be imported before applying it.

`AURA_TEST_DATA` and `AURA_HEADLESS=1` are used by isolated automated tests. Do not set `AURA_TEST_DATA` to your normal profile when running tests.
