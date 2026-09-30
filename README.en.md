# Codex Ambient

[繁體中文](README.md) | **English**

Animated backgrounds for the Codex desktop app on Windows. Preview aurora, ocean and starfield animations, or use local videos, GIFs and images. Adjust background strength, blur and speed, pause playback, and restore the original appearance with one click.

This is an unofficial, experimental appearance tool. It is not affiliated with OpenAI. The current application interface is in Traditional Chinese; this page provides English instructions and translations of the relevant controls.

![Codex Ambient control panel preview](docs/preview.png)

## Download and use

Download `CodexAmbient.exe` from [Releases](https://github.com/firzenfu/codex-ambient/releases). The executable is approximately 34 MB and includes Node.js. No separate Node.js installation, npm packages or administrator privileges are required.

1. Double-click the EXE to open the live preview. It uses a standalone Microsoft Edge app window, falling back to your default browser if Edge is unavailable.
2. Finish your current work and fully exit Codex, including its system tray process.
3. Right-click the Ambient tray icon and choose **啟動 Codex（背景模式）** (Start Codex in background mode). The launcher does not force-close a running Codex instance.
4. In the control panel, click **重新偵測** (Detect again), select the correct Codex window, adjust the effect, and click **套用至 Codex** (Apply to Codex).

You can also open `http://127.0.0.1:43127/` in Codex's built-in browser to use the same preview in the side panel. Sliders update the preview first; the app background changes when you apply it.

Closing the preview window leaves Ambient in the system tray. Right-click its icon to reopen the preview or choose **離開工具** (Quit). Quitting stops only the control-panel server started by the tool; it does not terminate Codex.

## Restore and data locations

- Click **還原 Codex** (Restore Codex) to remove the selected window's background layer, styles, animations and event listeners.
- Reloading the Codex page or fully exiting the app also clears the background. Apply it again afterward if desired.
- To close the debugging interface, fully exit Codex and reopen it using its original shortcut.
- The EXE extracts its runtime to `%LOCALAPPDATA%/CodexAmbient/engine-…` and stores settings in `%LOCALAPPDATA%/CodexAmbient/settings/`.
- When running from source, settings are stored in the project's `data/settings.json`.
- Media is processed in memory and is not uploaded. Select it again when you next open the control panel.
- The tool does not modify `app.asar`, Codex configuration files, conversations or sign-in data.

## Compatibility and limitations

- Requires Windows x64 and .NET Framework 4.5 or later, normally included with Windows 10/11. The EXE launcher automatically locates the Microsoft Store version of Codex.
- Uses Electron's [local debugging connection](https://www.electronjs.org/docs/latest/api/command-line-switches#--remote-debugging-portport), rather than an official background API. The debugging interface can control the app: use it only on your own computer and do not forward port 9223 to the network.
- The control panel listens only on `127.0.0.1`. Requests that change state require origin validation and a fresh token generated at each startup.
- The main window and an installed media background were successfully detected in Codex `26.928.1915.0`. Visual behavior has not been fully verified across all versions and pages; app updates may affect compatibility.
- Only the main `app://-/` or `app://-/index.html` windows are eligible. Ordinary webpages, sign-in pages and embedded browsers are excluded.
- Some code blocks, menus and side panels keep their original background colors. A background strength of 20–40% is suggested; reapply after switching between light and dark themes.
- Media files are limited to 20 MB. Supported formats are MP4, WebM, GIF, PNG, JPG and WebP. Video codecs must also be supported by the app.
- GIFs can be paused but cannot have their speed changed. Speed controls apply to generated animations and videos. The tool respects the system's reduced-motion setting and pauses animations when the page is hidden.
- No automatic startup or automatic injection. The EXE is not code-signed; releases include a SHA-256 checksum file.

## Run from source

Requires Node.js 22 or later. No `npm install` is needed:

```powershell
node server.mjs
```

Open `http://127.0.0.1:43127/`, or double-click `Open-Ambient.cmd` to start the tool.

Use `Start-Codex.ps1` or `Open-Codex-With-Ambient.cmd` to launch Codex in background mode. For another installation location, specify its executable:

```powershell
.\Start-Codex.ps1 -CodexPath 'Full path to the Codex executable'
```

If your organization's policy prohibits PowerShell scripts, follow that policy. You can use the EXE or manually launch Codex with `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9223`.

## Test and build

```powershell
npm test
npm run build:exe
```

Building the EXE requires Windows x64 and Node.js **v24.18.0**. It uses Windows' .NET Framework C# compiler; the .NET SDK is not required. The executable and SHA-256 checksum are written to `dist/`.

Optional browser integration checks require Playwright and Edge:

```powershell
npm install --no-save --package-lock=false playwright
node tests/browser-check.mjs
```

Browser checks use an isolated control panel and a mock debugging service, without modifying a running Codex instance. They cover presets, pause, light/dark themes, image/GIF/WebM loading, narrow layouts, CDP transport, and applying, switching and restoring backgrounds in an isolated page. Unit and HTTP tests also cover target selection, media limits, origin checks, saving settings and recovery from corrupted settings.

Run a standalone, headless EXE startup smoke test with the following command. Results are written to the specified directory:

```powershell
.\dist\CodexAmbient.exe --smoke-test --data-dir "$PWD\test-results\exe-smoke"
```

## Project structure

| Path | Purpose |
| --- | --- |
| `server.mjs` | Local control panel, settings storage and apply API |
| `lib/` | Input validation and local-only CDP connection |
| `public/` | Traditional Chinese interface, shared background renderer and icons |
| `packaging/` | Windows EXE launcher and build script |
| `tests/` | Unit, HTTP and browser integration checks |

The complete license text for the bundled Node.js runtime is preserved in `packaging/NODE-LICENSE.txt`, sourced from [Node.js v24.18.0](https://github.com/nodejs/node/blob/v24.18.0/LICENSE), and extracted with the EXE. Update this license file when updating the runtime.
