# Codex Ambient plugin / 個人外掛

This Windows x64 plugin adds **Codex Ambient** to Codex's local plugin directory, with an icon and five MCP tools. It bundles Node.js; no npm install or separate Ambient EXE is needed for the plugin helper.

這是可安裝的 Windows 個人外掛，含圖示與五個控制指令。外掛工作階段載入時會在背景啟動本機服務，不用每次手動開 Ambient EXE。這不是 OpenAI 官方外掛，也尚未提交到公開外掛目錄。

## Install / 安裝

Extract the whole plugin ZIP, then run **Install-Plugin.ps1** with PowerShell. The installer uses `codex plugin marketplace add` and `codex plugin add`; it copies the package to `%LOCALAPPDATA%/CodexAmbient/plugins/<version>/`. It does not require administrator privileges or overwrite other plugins.

解壓縮整個 ZIP，以 PowerShell 執行 **Install-Plugin.ps1**。完成工作後重開 Codex，在外掛頁面找到 **Codex Ambient**；來源名稱為 **Codex Ambient · 本機外掛**。目前開啟的對話可能需要新工作階段才能載入工具。

## Background mode is still required / 背景模式仍然必要

Codex plugins do not provide a documented main-window background API. Ambient continues to use the existing local debugging connection on `127.0.0.1:9223`. Installing the plugin cannot enable it inside an already-running Codex. Finish your work and fully exit Codex once, then launch it with **Start-Codex.ps1** from this package or the existing **Codex + Ambient** shortcut. Use that launcher for later background sessions too.

外掛仍需本機偵錯連線才能改 Codex 主視窗。請完成工作並完全退出 Codex，再透過套件的 **Start-Codex.ps1** 或既有 **Codex + Ambient** 捷徑啟動；之後也使用此啟動方式。外掛不會強制關閉 Codex，也不會修改 App 安裝檔、對話或登入資料。

The helper starts when Codex loads the plugin MCP session, which may be later than opening the app. This is not a Windows login service. In ordinary Codex mode you can still preview backgrounds, but cannot apply them. The plugin and EXE share saved preferences at `%LOCALAPPDATA%/CodexAmbient/settings/` and reuse a compatible running helper. Local media stays on the computer.

背景服務是在 Codex 載入外掛 MCP 工作階段時啟動，未保證在 App 開啟瞬間載入。一般模式仍能預覽，但不能套用。外掛與 EXE 共用本機設定，包含影片與圖片；同時使用時會沿用相容的既有服務。

## Use / 使用

- 「開啟 Ambient 背景預覽」 / “Open Ambient preview” — opens the local URL in the Codex browser panel; pick videos, GIFs or images there.
- 「把 Codex 背景換成極光」 / “Set an aurora background” — presets: aurora, ocean, stars; strength, blur, speed and pause are adjustable.
- 「檢查 Ambient 連線」 / “Check Ambient status” — lists connected windows and automatic restore state.
- 「還原 Codex 背景」 / “Restore Codex background” — removes the chosen window's layer and disables saved automatic restore.
- 「Ambient 切換成英文」 / “Switch Ambient to English” — updates the saved preview language; refresh an already-open preview to see it.

Use the preview's **Restore Codex** before uninstalling if you want the current layer removed immediately. Then disable/uninstall the plugin in Codex, or run `codex plugin remove codex-ambient@codex-ambient-local`. Plugin-managed helpers stop when their MCP process exits. An independently running EXE keeps its own service alive. Saved local preferences remain for reinstalling.

停用或解除安裝前，可先按「還原 Codex」立即清掉背景。外掛自己啟動的服務會隨其 MCP 程序結束，獨立 EXE 的服務則仍由系統匣管理。設定會保留供重新安裝使用。

Public directory publication is a separate review process. This package is for local Windows installation; a local debugging helper must not be exposed as a public internet service.
